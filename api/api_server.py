#!/usr/bin/env python3
"""
FastAPI 后端 - MsgHub 多 Agent RPG 系统
每个 Agent 独立配置模型和 API
"""
import os
import sys
import asyncio
import traceback
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import subprocess
import argparse
import json

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Agent 系统
from agents import ChatAgent, ManagerAgent, WorkerAgent
from agentscope.message import Msg
from agentscope.pipeline import MsgHub
from config.agents_config import agents_config_manager, AgentConfig
from config.manager_config import manager_config_manager
from api.agents_api import router as agents_router
from api.providers_api import router as providers_router
from api.tools_api import router as tools_router
from api.manager_api import router as manager_router
from api.skills_api import router as skills_router
from api.game_config_api import router as game_config_router
from api.html_preview_api import router as html_preview_router
from skills import skill_registry

# ============== 游戏配置路径 ==============
GAME_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "rpg-frontend", "public", "assets", "game-config.json"
)

# ============== 场景描述注入状态 ==============
_scene_inject_state = {
    "last_scene_key": None,
    "last_scene_desc": None,
}

# ============== 全局状态 ==============
system_state = {
    "initialized": False,
    "agents": [],  # Agent 实例列表 (兼容模式)
    "manager": None,  # Manager Agent 实例
    "workers": [],  # Worker Agent 列表
    "use_manager_mode": False,  # 是否使用Manager-Worker模式
    "msghub": None,  # MsgHub 实例
}

# ============== 命令行参数 ==============
parser = argparse.ArgumentParser(description="RPG Chat API Server")
parser.add_argument(
    "--dev",
    action="store_true",
    help="开发模式：不构建前端，仅提供 API 服务"
)
parser.add_argument(
    "--build",
    action="store_true",
    help="构建前端后启动（生产模式）"
)
args = parser.parse_args()

# 默认生产模式（构建前端）
DEV_MODE = args.dev
BUILD_FRONTEND = args.build or not args.dev

# ============== 数据模型 ==============

class ChatRequest(BaseModel):
    message: str


class AgentResponse(BaseModel):
    agent_name: str
    agent_role: str
    content: str


class ChatResponse(BaseModel):
    responses: List[AgentResponse]


class AgentInfo(BaseModel):
    id: str
    name: str
    role: str
    personality: str
    avatar_type: str


class AgentListResponse(BaseModel):
    agents: List[AgentInfo]


class StreamChunk(BaseModel):
    """流式响应数据块"""
    type: str  # start, agent_start, chunk, done, agent_done, all_done, error
    agent_name: Optional[str] = None
    agent_role: Optional[str] = None
    content: Optional[str] = None
    index: Optional[int] = None
    message: Optional[str] = None


# ============== 前端构建 ==============

def build_frontend():
    """构建前端静态文件"""
    frontend_dir = os.path.join(os.path.dirname(__file__), "..", "rpg-frontend")
    dist_dir = os.path.join(frontend_dir, "dist")

    # 如果已经构建过，跳过
    if os.path.exists(dist_dir) and os.path.exists(os.path.join(dist_dir, "index.html")):
        print("📦 前端已构建，跳过构建步骤")
        return dist_dir

    # 检查是否有 node_modules
    if not os.path.exists(os.path.join(frontend_dir, "node_modules")):
        print("📦 安装前端依赖...")
        try:
            subprocess.run(
                ["npm", "install"],
                cwd=frontend_dir,
                check=True,
                capture_output=True,
            )
        except subprocess.CalledProcessError as e:
            print(f"⚠️ 前端依赖安装失败: {e}")
            return None
        except FileNotFoundError:
            print("⚠️ 未找到 npm，请安装 Node.js")
            return None

    print("🔨 构建前端...")
    try:
        subprocess.run(
            ["npm", "run", "build"],
            cwd=frontend_dir,
            check=True,
            capture_output=True,
        )
        print("✅ 前端构建完成")
        return dist_dir
    except subprocess.CalledProcessError as e:
        print(f"⚠️ 前端构建失败: {e}")
        return None


# ============== 生命周期管理 ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化
    print("🚀 正在初始化多 Agent 系统...")
    await init_system()

    # 仅在非开发模式下构建前端
    if BUILD_FRONTEND:
        dist_dir = build_frontend()
        if dist_dir:
            print(f"📦 前端资源路径: {dist_dir}")
            setup_static_files()
    else:
        print("🔧 开发模式：不构建前端，仅提供 API 服务")
        print("   请运行: cd rpg-frontend && npm run dev")

    yield

    # 关闭时清理
    print("🛑 正在关闭系统...")


def _get_scene_description() -> str:
    """读取 game-config.json 获取当前场景描述。

    只在场景切换或描述内容变化时返回描述，避免同一场景下重复注入。
    """
    global _scene_inject_state
    try:
        if not os.path.exists(GAME_CONFIG_PATH):
            _scene_inject_state["last_scene_key"] = None
            _scene_inject_state["last_scene_desc"] = None
            return ""
        with open(GAME_CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
        current_scene_key = config.get("currentScene", "")
        scenes = config.get("scenes", {})
        scene = scenes.get(current_scene_key, {})
        desc = scene.get("description", "")

        last_key = _scene_inject_state["last_scene_key"]
        last_desc = _scene_inject_state["last_scene_desc"]

        # 场景未变化且描述未变化，不需要重新注入
        if current_scene_key == last_key and desc == last_desc:
            return ""

        # 更新记录并返回新描述
        _scene_inject_state["last_scene_key"] = current_scene_key
        _scene_inject_state["last_scene_desc"] = desc
        return desc
    except Exception as e:
        print(f"⚠️ 读取场景描述失败: {e}")
        return ""


def _wrap_message_with_scene(message: str) -> str:
    """将用户消息包装上场景描述前缀。只在场景变化时注入一次。"""
    scene_desc = _get_scene_description()
    if not scene_desc:
        return message
    return f"【场景背景】{scene_desc}\n\n{message}"


async def init_system():
    """初始化多 Agent 系统 - 支持 Manager-Worker 模式"""
    print("🚀 Initializing multi-agent system...")

    if system_state["initialized"]:
        print("   System already initialized, skipping...")
        return

    # 重置状态
    system_state["agents"] = []
    system_state["manager"] = None
    system_state["workers"] = []
    system_state["use_manager_mode"] = False

    # 重置场景注入状态，确保重新初始化后第一次消息会注入场景描述
    global _scene_inject_state
    _scene_inject_state["last_scene_key"] = None
    _scene_inject_state["last_scene_desc"] = None

    # 获取 Manager 配置
    manager_config = manager_config_manager.get_config()

    # 获取 Worker Agent 配置
    worker_configs = agents_config_manager.get_active_agents()
    print(f"   Found {len(worker_configs)} active worker configs")
    print(f"   Manager config: is_active={manager_config.is_active}, provider_id={manager_config.provider_id}")

    # 如果 Manager 已启用且配置了 Provider，使用 Manager-Worker 模式
    if manager_config.is_active and manager_config.provider_id:
        system_state["use_manager_mode"] = True
        await _init_manager_worker_mode(manager_config, worker_configs)
    else:
        # 使用传统 MsgHub 模式
        system_state["use_manager_mode"] = False
        await _init_msghub_mode(worker_configs)

    system_state["initialized"] = True
    print("✅ 多 Agent 系统初始化完成")


async def _init_manager_worker_mode(manager_config: Any, worker_configs: List[AgentConfig]):
    """初始化 Manager-Worker 模式"""
    print("🔧 使用 Manager-Worker 协作模式")

    from providers import provider_manager

    # 创建 Manager
    provider = provider_manager.get_provider(manager_config.provider_id)

    if provider and provider.api_key:
        try:
            llm_config = manager_config.to_llm_config()
            print(f"👔 创建 Manager: {manager_config.name}")

            manager = ManagerAgent(
                name=manager_config.name,
                role=manager_config.role,
                personality=manager_config.personality,
                llm_config=llm_config,
                skill_names=[],  # Manager 暂时不配置 skills，后续可扩展
            )
            system_state["manager"] = manager
        except Exception as e:
            print(f"⚠️ 创建 Manager {manager_config.name} 失败: {e}")

    # 创建 Workers
    workers = []
    for config in worker_configs:
        provider = provider_manager.get_provider(config.provider_id)
        if not provider or not provider.api_key:
            print(f"⚠️ Worker {config.name} 配置不完整，跳过")
            continue

        try:
            llm_config = config.to_llm_config()
            print(f"🛠️  创建 Worker: {config.name} ({config.specialty}), skills={config.skill_ids}")

            worker = WorkerAgent(
                name=config.name,
                role=config.role,
                personality=config.personality,
                specialty=config.specialty or "通用任务",
                expertise=config.expertise or config.role,
                llm_config=llm_config,
                skill_names=config.skill_ids,
            )
            workers.append(worker)
        except Exception as e:
            print(f"⚠️ 创建 Worker {config.name} 失败: {e}")
            continue

    # 注册 Workers 到 Manager
    if system_state["manager"]:
        for worker in workers:
            system_state["manager"].register_worker(worker)

    system_state["workers"] = workers

    # 将 Manager 也放入 agents 列表用于前端显示
    if system_state["manager"]:
        system_state["agents"] = [system_state["manager"]] + workers

    print(f"✅ Manager-Worker 模式就绪: 1 Manager, {len(workers)} Workers")


async def _init_msghub_mode(worker_configs: List[AgentConfig]):
    """初始化传统 MsgHub 模式"""
    print("🔧 使用传统 MsgHub 协作模式")

    agents = []
    for config in worker_configs:
        from providers import provider_manager
        provider = provider_manager.get_provider(config.provider_id)
        if not provider:
            print(f"⚠️ Agent {config.name} 的 Provider {config.provider_id} 不存在，跳过")
            continue

        if not provider.api_key:
            print(f"⚠️ Agent {config.name} 的 Provider 未配置 API Key，跳过")
            continue

        try:
            llm_config = config.to_llm_config()
            print(f"🤖 创建 Agent: {config.name} ({config.role}) - 使用模型 {provider.model_id}")

            agent = ChatAgent(
                name=config.name,
                role=config.role,
                personality=config.personality,
                llm_config=llm_config,
                skill_names=config.skill_ids,
            )
            agents.append(agent)
        except Exception as e:
            print(f"⚠️ 创建 Agent {config.name} 失败: {e}")
            continue

    system_state["agents"] = agents

    print(f"✅ 已创建 {len(agents)} 个 Agent:")
    for agent in agents:
        print(f"   - {agent.name} ({agent.role})")


# ============== FastAPI 应用 ==============

app = FastAPI(
    title="RPG Chat API",
    description="MsgHub 多 Agent RPG 系统 API - 每个 Agent 独立配置",
    version="0.3.0",
    lifespan=lifespan,
)

# CORS 配置
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] if BUILD_FRONTEND else ["*"]
if DEV_MODE:
    ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加 Agent 配置路由
app.include_router(agents_router)

# 添加 Provider 配置路由
app.include_router(providers_router)

# 添加工具管理路由
app.include_router(tools_router)

# 添加 Manager 配置路由
app.include_router(manager_router)

# 添加 Skill 管理路由
app.include_router(skills_router)

# 添加游戏配置路由
app.include_router(game_config_router)

# 添加 HTML 预览路由
app.include_router(html_preview_router)


# ============== API 端点 ==============

@app.get("/api/agents", response_model=AgentListResponse)
async def list_agents():
    """获取所有启用的 Agent 信息（包含 Manager）"""
    from config.manager_config import manager_config_manager

    # 获取 Worker Agents
    worker_agents = agents_config_manager.get_active_agents()

    # 获取 Manager 配置
    manager_config = manager_config_manager.get_config()

    result_agents = []

    # 如果 Manager 已启用，添加到列表
    if manager_config.is_active and manager_config.provider_id:
        result_agents.append(AgentInfo(
            id="manager_default",
            name=manager_config.name,
            role=manager_config.role,
            personality=manager_config.personality,
            avatar_type="manager"
        ))

    # 添加 Worker Agents
    for a in worker_agents:
        result_agents.append(AgentInfo(
            id=a.id,
            name=a.name,
            role=a.role,
            personality=a.personality,
            avatar_type=a.avatar_type
        ))

    return AgentListResponse(agents=result_agents)


@app.post("/api/system/reinitialize")
async def reinitialize():
    """重新初始化系统"""
    try:
        print("🔄 Reinitializing system...")
        # 重置所有系统状态
        system_state["initialized"] = False
        system_state["agents"] = []
        system_state["manager"] = None
        system_state["workers"] = []
        system_state["use_manager_mode"] = False

        # 重新加载 Provider 和 Agent 配置
        print("📋 Reloading configs...")
        from providers import provider_manager
        from config.manager_config import manager_config_manager
        provider_manager._load_config()
        agents_config_manager._load_config()
        manager_config_manager._load_config()

        await init_system()

        agent_count = len(system_state["agents"])
        print(f"✅ System reinitialized with {agent_count} agents")

        return {
            "success": True,
            "message": "系统已重新初始化",
            "agent_count": agent_count,
        }
    except Exception as e:
        print(f"❌ Reinitialization failed: {e}")
        raise HTTPException(status_code=500, detail=f"重新初始化失败: {str(e)}")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """聊天接口 - 支持 Manager-Worker 和 MsgHub 两种模式"""
    if not system_state["initialized"]:
        raise HTTPException(status_code=503, detail="系统未初始化")

    try:
        # 根据模式选择处理方式
        if system_state["use_manager_mode"] and system_state["manager"]:
            return await _chat_with_manager(request)
        else:
            return await _chat_with_msghub(request)

    except Exception as e:
        error_detail = f"对话失败: {str(e)}\n\n详细错误:\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)


async def _chat_with_manager(request: ChatRequest) -> ChatResponse:
    """使用 Manager-Worker 模式处理对话"""
    manager = system_state["manager"]

    # 注入场景描述到用户消息中
    wrapped_message = _wrap_message_with_scene(request.message)
    user_msg = Msg(name="User", content=wrapped_message, role="user")
    print(f"\n👤 [UserMsg → Manager] {wrapped_message[:500]}...")

    # Manager 分析任务并分派给 Workers
    response = await manager.reply(user_msg)

    # 提取响应内容
    content = response.content
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict) and "text" in item:
                texts.append(item["text"])
            elif isinstance(item, str):
                texts.append(item)
        answer = "\n".join(texts)
    elif isinstance(content, dict):
        answer = content.get("text", str(content))
    else:
        answer = str(content)

    # 获取任务执行详情（如果有）
    task_details = []
    if manager._task_history:
        latest_task = manager._task_history[-1]
        if latest_task.status == "completed":
            for step in latest_task.steps:
                result = latest_task.results.get(step["step_id"], {})
                if result.get("status") == "completed":
                    task_details.append(AgentResponse(
                        agent_name=step.get("agent_name", "Unknown"),
                        agent_role=f"执行: {step.get('task', '')[:20]}...",
                        content=str(result.get("result", ""))[:200]
                    ))

    responses = [
        AgentResponse(
            agent_name=manager.name,
            agent_role=manager.role,
            content=answer,
        )
    ]

    # 添加任务执行详情
    responses.extend(task_details)

    return ChatResponse(responses=responses)


async def _chat_with_msghub(request: ChatRequest) -> ChatResponse:
    """使用传统 MsgHub 模式处理对话"""
    agents = system_state["agents"]
    if not agents:
        raise HTTPException(status_code=400, detail="未配置任何可用的 Agent")

    responses = []

    async with MsgHub(participants=agents, enable_auto_broadcast=True):
        # 让第一个 Agent 主导对话
        primary_agent = agents[0]
        # 注入场景描述到用户消息中
        wrapped_message = _wrap_message_with_scene(request.message)
        user_msg = Msg(name="User", content=wrapped_message, role="user")
        print(f"\n👤 [UserMsg → {primary_agent.name}] {wrapped_message[:500]}...")
        response = await primary_agent(user_msg)

        # 提取响应内容
        content = response.content
        if isinstance(content, list):
            texts = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    texts.append(item["text"])
                elif isinstance(item, str):
                    texts.append(item)
            answer = "\n".join(texts)
        elif isinstance(content, dict):
            answer = content.get("text", str(content))
        else:
            answer = str(content)

        responses.append(AgentResponse(
            agent_name=primary_agent.name,
            agent_role=primary_agent.role,
            content=answer,
        ))

        # 其他 Agent 也参与对话
        for agent in agents[1:]:
            agent_msg = Msg(name="User", content=request.message, role="user")
            agent_response = await agent(agent_msg)

            content = agent_response.content
            if isinstance(content, list):
                texts = []
                for item in content:
                    if isinstance(item, dict) and "text" in item:
                        texts.append(item["text"])
                    elif isinstance(item, str):
                        texts.append(item)
                answer = "\n".join(texts)
            elif isinstance(content, dict):
                answer = content.get("text", str(content))
            else:
                answer = str(content)

            responses.append(AgentResponse(
                agent_name=agent.name,
                agent_role=agent.role,
                content=answer,
            ))

    return ChatResponse(responses=responses)


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """流式聊天接口 - 使用 Server-Sent Events"""
    if not system_state["initialized"]:
        raise HTTPException(status_code=503, detail="系统未初始化")

    async def generate_stream():
        """生成流式响应"""
        try:
            if system_state["use_manager_mode"] and system_state["manager"]:
                # Manager-Worker 模式流式输出 - 展示中间过程
                manager = system_state["manager"]
                # 注入场景描述到用户消息中
                wrapped_message = _wrap_message_with_scene(request.message)
                user_msg = Msg(name="User", content=wrapped_message, role="user")
                print(f"\n👤 [UserMsg → Manager] {wrapped_message[:500]}...")

                event_queue = asyncio.Queue()

                def on_manager_event(event):
                    event_queue.put_nowait(("event", event))

                # 临时设置事件回调
                manager._event_callback = on_manager_event

                async def run_manager():
                    """后台运行 Manager 任务"""
                    try:
                        response = await manager.reply(user_msg)
                        # 提取文本内容
                        content = response.content
                        if isinstance(content, list):
                            texts = [item.get("text", "") if isinstance(item, dict) else str(item) for item in content]
                            answer = "\n".join(texts)
                        elif isinstance(content, dict):
                            answer = content.get("text", str(content))
                        else:
                            answer = str(content)
                        await event_queue.put(("final", answer))
                    except Exception as e:
                        await event_queue.put(("error", str(e)))
                    finally:
                        await event_queue.put(("done", None))

                # 启动后台任务
                asyncio.create_task(run_manager())

                # 主循环：从队列取事件并 yield
                final_answer = ""
                while True:
                    kind, data = await event_queue.get()

                    if kind == "done":
                        break

                    elif kind == "event":
                        event_type = data.get("type")

                        if event_type == "worker_start":
                            agent_name = data.get("agent_name", "Worker")
                            task_desc = data.get("task", "")
                            yield f"data: {json.dumps({'type': 'agent_start', 'agent_name': agent_name, 'agent_role': task_desc[:40], 'index': 1})}\n\n"

                        elif event_type == "worker_done":
                            agent_name = data.get("agent_name", "Worker")
                            result = data.get("result", "")
                            if result:
                                yield f"data: {json.dumps({'type': 'chunk', 'content': result, 'agent_name': agent_name, 'index': 1})}\n\n"
                            yield f"data: {json.dumps({'type': 'agent_done', 'agent_name': agent_name, 'index': 1})}\n\n"
                            await asyncio.sleep(0.2)

                        elif event_type == "manager_integrating":
                            # Manager 开始整合，发送开始事件
                            yield f"data: {json.dumps({'type': 'start', 'agent_name': manager.name, 'agent_role': manager.role, 'index': 0})}\n\n"

                    elif kind == "final":
                        final_answer = data
                        # 模拟流式输出最终答案
                        chunk_size = 10
                        for i in range(0, len(final_answer), chunk_size):
                            chunk = final_answer[i:i + chunk_size]
                            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk, 'agent_name': manager.name, 'index': 0})}\n\n"
                            await asyncio.sleep(0.05)

                        yield f"data: {json.dumps({'type': 'done', 'agent_name': manager.name, 'index': 0})}\n\n"
                        yield f"data: {json.dumps({'type': 'all_done'})}\n\n"

                    elif kind == "error":
                        yield f"data: {json.dumps({'type': 'error', 'message': data})}\n\n"

                # 清除回调
                manager._event_callback = None

            else:
                # MsgHub 模式 - 支持多 Agent 流式输出
                agents = system_state["agents"]
                if not agents:
                    yield f"data: {json.dumps({'type': 'error', 'message': '未配置任何可用的 Agent'})}\n\n"
                    return

                async with MsgHub(participants=agents, enable_auto_broadcast=True):
                    for idx, agent in enumerate(agents):
                        # 注入场景描述到用户消息中
                        wrapped_message = _wrap_message_with_scene(request.message)
                        user_msg = Msg(name="User", content=wrapped_message, role="user")
                        print(f"\n👤 [UserMsg → {agent.name}] {wrapped_message[:500]}...")

                        # 发送 Agent 开始事件
                        yield f"data: {json.dumps({'type': 'agent_start', 'agent_name': agent.name, 'agent_role': agent.role, 'index': idx})}\n\n"

                        # 获取响应
                        response = await agent(user_msg)
                        content = response.content
                        if isinstance(content, list):
                            texts = [item.get("text", "") if isinstance(item, dict) else str(item) for item in content]
                            answer = "\n".join(texts)
                        elif isinstance(content, dict):
                            answer = content.get("text", str(content))
                        else:
                            answer = str(content)

                        # 流式输出内容
                        chunk_size = 8
                        for i in range(0, len(answer), chunk_size):
                            chunk = answer[i:i + chunk_size]
                            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk, 'agent_name': agent.name, 'index': idx})}\n\n"
                            await asyncio.sleep(0.03)

                        # 发送 Agent 完成事件
                        yield f"data: {json.dumps({'type': 'agent_done', 'agent_name': agent.name, 'index': idx})}\n\n"

                        # Agent 之间的延迟
                        if idx < len(agents) - 1:
                            await asyncio.sleep(0.5)

                # 发送全部完成事件
                yield f"data: {json.dumps({'type': 'all_done'})}\n\n"

        except Exception as e:
            error_msg = f"流式输出错误: {str(e)}"
            print(f"❌ {error_msg}")
            yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "initialized": system_state["initialized"],
        "agent_count": len(system_state.get("agents", [])),
        "mode": "manager-worker" if system_state.get("use_manager_mode") else "msghub",
        "manager": system_state["manager"].name if system_state.get("manager") else None,
        "worker_count": len(system_state.get("workers", [])),
    }


# ============== 静态文件服务 ==============

def setup_static_files():
    """配置静态文件服务"""
    dist_dir = os.path.join(os.path.dirname(__file__), "..", "rpg-frontend", "dist")

    if os.path.exists(dist_dir):
        app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")

        @app.get("/")
        async def serve_index():
            return FileResponse(os.path.join(dist_dir, "index.html"))

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/") or full_path.startswith("preview/"):
                raise HTTPException(status_code=404, detail="Not Found")

            index_file = os.path.join(dist_dir, "index.html")
            if os.path.exists(index_file):
                return FileResponse(index_file)
            raise HTTPException(status_code=404, detail="Frontend not built")

        print(f"📦 静态文件服务已配置: {dist_dir}")
    else:
        print("⚠️ 前端未构建，运行开发模式")


# ============== 主入口 ==============

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
