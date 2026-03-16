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
from fastapi.responses import FileResponse
from pydantic import BaseModel
import subprocess
import argparse

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Agent 系统
from agents import ChatAgent
from agentscope.message import Msg
from agentscope.pipeline import MsgHub
from agents_config import agents_config_manager, AgentConfig
from agents_api import router as agents_router
from providers_api import router as providers_router

# ============== 全局状态 ==============
system_state = {
    "initialized": False,
    "agents": [],  # Agent 实例列表
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


# ============== 前端构建 ==============

def build_frontend():
    """构建前端静态文件"""
    frontend_dir = os.path.join(os.path.dirname(__file__), "rpg-frontend")
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


async def init_system():
    """初始化多 Agent 系统 - 每个 Agent 使用独立配置"""
    print("🚀 Initializing multi-agent system...")

    if system_state["initialized"]:
        print("   System already initialized, skipping...")
        return

    # 获取所有启用的 Agent 配置
    agent_configs = agents_config_manager.get_active_agents()
    print(f"   Found {len(agent_configs)} active agent configs")

    if not agent_configs:
        print("⚠️ 未配置任何 Agent，请先配置")
        system_state["initialized"] = True
        return

    agents = []
    for config in agent_configs:
        # 通过 provider_id 获取 Provider 配置
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
            )
            agents.append(agent)
        except Exception as e:
            print(f"⚠️ 创建 Agent {config.name} 失败: {e}")
            continue

    system_state["agents"] = agents

    print(f"✅ 已创建 {len(agents)} 个 Agent:")
    for agent in agents:
        print(f"   - {agent.name} ({agent.role})")

    system_state["initialized"] = True
    print("✅ 多 Agent 系统初始化完成")


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


# ============== API 端点 ==============

@app.get("/api/agents", response_model=AgentListResponse)
async def list_agents():
    """获取所有启用的 Agent 信息"""
    agents = agents_config_manager.get_active_agents()
    return AgentListResponse(
        agents=[
            AgentInfo(
                id=a.id,
                name=a.name,
                role=a.role,
                personality=a.personality,
                avatar_type=a.avatar_type
            )
            for a in agents
        ]
    )


@app.post("/api/system/reinitialize")
async def reinitialize():
    """重新初始化系统"""
    try:
        print("🔄 Reinitializing system...")
        system_state["initialized"] = False
        system_state["agents"] = []

        # 重新加载 Provider 和 Agent 配置
        print("📋 Reloading configs...")
        from providers import provider_manager
        provider_manager._load_config()
        agents_config_manager._load_config()

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
    """聊天接口 - MsgHub 多 Agent 协作"""
    if not system_state["initialized"]:
        raise HTTPException(status_code=503, detail="系统未初始化")

    agents = system_state["agents"]
    if not agents:
        raise HTTPException(status_code=400, detail="未配置任何可用的 Agent")

    try:
        # 使用 MsgHub 让多个 Agent 协作处理消息
        responses = []

        async with MsgHub(participants=agents, enable_auto_broadcast=True):
            # 让第一个 Agent 主导对话
            primary_agent = agents[0]
            user_msg = Msg(name="User", content=request.message, role="user")
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

    except Exception as e:
        error_detail = f"对话失败: {str(e)}\n\n详细错误:\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "initialized": system_state["initialized"],
        "agent_count": len(system_state.get("agents", [])),
    }


# ============== 静态文件服务 ==============

def setup_static_files():
    """配置静态文件服务"""
    dist_dir = os.path.join(os.path.dirname(__file__), "rpg-frontend", "dist")

    if os.path.exists(dist_dir):
        app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")

        @app.get("/")
        async def serve_index():
            return FileResponse(os.path.join(dist_dir, "index.html"))

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/"):
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
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
