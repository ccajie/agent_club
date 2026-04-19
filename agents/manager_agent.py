"""
管理者智能体 - 负责任务分析、规划和分派
基于 AgentScope 实现 Manager-Worker 协作模式
"""
from typing import Optional, Dict, Any, List, Callable
import json
import asyncio
from agentscope.agent import AgentBase
from agentscope.message import Msg
from agentscope.model import DashScopeChatModel, OpenAIChatModel, AnthropicChatModel
from agentscope.formatter import OpenAIChatFormatter

from tools import get_toolkit


class TaskPlan:
    """任务计划"""
    def __init__(self, task_id: str, description: str, steps: List[Dict]):
        self.task_id = task_id
        self.description = description
        self.steps = steps  # 每个步骤包含: agent_name, action, input
        self.results = {}   # 存储每个步骤的结果
        self.status = "pending"  # pending, running, completed, failed

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "description": self.description,
            "steps": self.steps,
            "results": self.results,
            "status": self.status
        }


class ManagerAgent(AgentBase):
    """
    管理者智能体 - 任务协调中心

    职责:
    1. 分析用户请求，拆解为子任务
    2. 根据Worker能力分派任务
    3. 收集Worker结果，整合回复
    4. 管理任务执行顺序和依赖
    """

    def __init__(
        self,
        name: str = "任务管理器",
        role: str = "项目协调经理",
        personality: str = "专业、有条理、善于规划和协调，能够准确分析需求并合理分配任务",
        model_name: str = "qwen-max",
        api_key: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        skill_names: Optional[List[str]] = None,
        event_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        super().__init__()
        self.name = name
        self.role = role
        self.personality = personality
        self.skill_names = skill_names or []
        self._event_callback = event_callback

        # 初始化模型
        if llm_config:
            self.provider = llm_config.get("provider", "dashscope")
            self.model_name = llm_config.get("model_id", model_name)
            self.api_key = llm_config.get("api_key") or api_key
            raw_base_url = llm_config.get("base_url")
            self.base_url = raw_base_url if self.provider != "dashscope" else None
        else:
            self.provider = "dashscope"
            self.model_name = model_name
            self.api_key = api_key
            self.base_url = None

        self.model = self._create_model()
        self.formatter = OpenAIChatFormatter()

        # Worker注册表
        self._workers: Dict[str, 'WorkerAgent'] = {}

        # 任务历史
        self._task_history: List[TaskPlan] = []

    def _emit(self, event_type: str, **kwargs):
        """发射中间过程事件，供流式展示使用"""
        if self._event_callback:
            try:
                self._event_callback({"type": event_type, **kwargs})
            except Exception:
                pass

    def _create_model(self):
        """创建模型实例 - Manager 不需要流式输出"""
        if self.provider == "dashscope":
            return OpenAIChatModel(
                model_name=self.model_name,
                api_key=self.api_key,
                client_kwargs={"base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
                stream=False,
            )
        elif self.provider == "kimicode":
            client_kwargs = {}
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            return AnthropicChatModel(
                model_name=self.model_name,
                api_key=self.api_key,
                client_kwargs=client_kwargs if client_kwargs else None,
                stream=False,
            )
        elif self.provider in ["openai", "anthropic", "custom"]:
            client_kwargs = {}
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            return OpenAIChatModel(
                model_name=self.model_name,
                api_key=self.api_key,
                client_kwargs=client_kwargs if client_kwargs else None,
                stream=False,
            )
        else:
            return DashScopeChatModel(
                model_name=self.model_name,
                api_key=self.api_key
            )

    def _get_skills_prompt(self) -> str:
        """获取技能说明文本，用于注入 system prompt"""
        from skills import skill_registry
        return skill_registry.get_skills_prompt(self.skill_names)

    def register_worker(self, worker: 'WorkerAgent'):
        """注册Worker Agent"""
        self._workers[worker.name] = worker
        worker.set_manager(self)  # 告诉Worker谁是Manager
        print(f"✅ Manager 注册 Worker: {worker.name} ({worker.specialty})")

    def get_worker_capabilities(self) -> str:
        """获取所有Worker的能力描述"""
        capabilities = []
        for name, worker in self._workers.items():
            capabilities.append(
                f"- {name}: {worker.specialty}\n  专长: {worker.expertise}"
            )
        return "\n".join(capabilities)

    def _extract_text_from_response(self, content) -> str:
        """从模型响应中提取文本内容"""
        if isinstance(content, list):
            # 查找 type='text' 的元素
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    return item.get("text", "")
            # 如果没找到，取第一个字典的 text 字段或字符串表示
            if content:
                first = content[0]
                if isinstance(first, dict):
                    return first.get("text", str(first))
                return str(first)
            return ""
        elif isinstance(content, dict):
            return content.get("text", str(content))
        else:
            return str(content)

    async def reply(self, msg: Msg) -> Msg:
        """
        处理用户请求 - Manager的核心逻辑

        流程:
        1. 分析请求，理解意图
        2. 拆解为子任务
        3. 分派给合适的Worker
        4. 收集结果并整合
        """
        user_content = msg.content
        print(f"\n{'='*60}")
        print(f"🎯 [Manager] 收到用户请求: {user_content[:50]}...")
        print(f"{'='*60}")

        # 步骤1: 分析请求并制定计划
        print(f"\n📋 [Manager] 步骤1: 分析请求并制定计划...")
        self._emit("manager_thinking", agent_name=self.name, role=self.role, content="正在分析任务需求...")
        task_plan = await self._create_task_plan(user_content)

        if not task_plan.steps:
            # 不需要分派，自己处理
            print(f"✅ [Manager] 判断: 不需要分派，直接处理")
            return await self._handle_directly(msg)

        print(f"✅ [Manager] 任务计划创建完成:")
        print(f"   任务ID: {task_plan.task_id}")
        print(f"   步骤数: {len(task_plan.steps)}")
        for i, step in enumerate(task_plan.steps, 1):
            print(f"   步骤{i}: {step.get('agent_name')} -> {step.get('task', '')[:30]}...")

        # 发射计划完成事件
        self._emit("plan_done",
            agent_name=self.name,
            steps=[{"agent_name": s.get("agent_name"), "task": s.get("task", "")} for s in task_plan.steps]
        )

        # 步骤2: 执行计划，分派任务
        print(f"\n🚀 [Manager] 步骤2: 开始分派任务...")
        await self._execute_plan(task_plan)

        # 步骤3: 整合结果
        print(f"\n🔀 [Manager] 步骤3: 整合所有Worker结果...")
        self._emit("manager_integrating", agent_name=self.name, role=self.role, content="正在整合团队成员的结果...")
        final_response = await self._integrate_results(task_plan)

        print(f"\n✅ [Manager] 任务完成，返回最终回复")
        print(f"{'='*60}\n")

        return Msg(
            name=self.name,
            content=final_response,
            role="assistant"
        )

    async def _create_task_plan(self, user_request: str) -> TaskPlan:
        """分析用户请求，创建任务执行计划"""

        skills_text = self._get_skills_prompt()
        system_prompt = f"""你是{self.name}，{self.role}。

你的团队成员及其专长：
{self.get_worker_capabilities()}

{skills_text}

请分析用户的请求，判断是否需要分派给团队成员：
1. 如果请求简单，直接回复 "DIRECT"，不需要分派
2. 如果需要多个步骤或不同专长，制定分派计划

请以JSON格式回复：
{{
    "need_dispatch": true/false,
    "reason": "为什么需要/不需要分派",
    "steps": [
        {{
            "step_id": 1,
            "agent_name": "负责该步骤的Agent名称",
            "task": "具体任务描述",
            "input": "需要传递给Agent的输入",
            "depends_on": []  // 依赖的步骤ID
        }}
    ]
}}
"""

        planning_msg = Msg(name="system", content=system_prompt, role="system")
        user_msg = Msg(name="User", content=user_request, role="user")

        response = await self.model(
            messages=[planning_msg.to_dict(), user_msg.to_dict()]
        )

        try:
            content = self._extract_text_from_response(response.content)
            print(f"\n🤔 [Manager] AI规划思考:\n{content[:500]}...")

            # 提取JSON
            json_str = self._extract_json(content)
            plan_data = json.loads(json_str)

            need_dispatch = plan_data.get("need_dispatch", False)
            reason = plan_data.get("reason", "")
            print(f"\n📊 [Manager] 决策分析:")
            print(f"   需要分派: {need_dispatch}")
            print(f"   原因: {reason[:100]}...")

            if not need_dispatch:
                print(f"   结论: 任务简单，Manager直接处理")
                return TaskPlan(
                    task_id=f"task_{len(self._task_history)}",
                    description=user_request,
                    steps=[]
                )

            steps = plan_data.get("steps", [])
            print(f"   结论: 需要分派给{len(steps)}个Worker执行")

            # 创建任务计划
            task_plan = TaskPlan(
                task_id=f"task_{len(self._task_history)}",
                description=user_request,
                steps=steps
            )
            self._task_history.append(task_plan)

            return task_plan

        except Exception as e:
            print(f"\n⚠️ [Manager] 计划创建失败: {e}, 将直接处理")
            return TaskPlan(
                task_id=f"task_{len(self._task_history)}",
                description=user_request,
                steps=[]
            )

    async def _execute_plan(self, task_plan: TaskPlan):
        """执行任务计划"""
        task_plan.status = "running"

        # 按依赖顺序执行任务
        completed_steps = set()
        print(f"\n📋 [Manager] 开始执行{len(task_plan.steps)}个步骤...")

        while len(completed_steps) < len(task_plan.steps):
            # 找到可以执行的任务（依赖已满足）
            ready_steps = [
                step for step in task_plan.steps
                if step["step_id"] not in completed_steps
                and all(dep in completed_steps for dep in step.get("depends_on", []))
            ]

            if not ready_steps:
                print(f"⚠️ [Manager] 没有可执行的步骤，可能存在循环依赖")
                break

            print(f"\n   🔄 本轮可执行步骤: {[s.get('agent_name') for s in ready_steps]}")

            # 并行执行准备好的任务
            tasks = []
            for step in ready_steps:
                task = self._execute_step(step, task_plan)
                tasks.append(task)

            await asyncio.gather(*tasks)

            for step in ready_steps:
                completed_steps.add(step["step_id"])
                print(f"   ✅ 步骤完成: {step.get('agent_name')} - {step.get('task', '')[:30]}...")

        task_plan.status = "completed"
        print(f"\n✅ [Manager] 所有步骤执行完成")

    async def _execute_step(self, step: Dict, task_plan: TaskPlan):
        """执行单个步骤"""
        agent_name = step.get("agent_name")
        task_description = step.get("task")
        task_input = step.get("input", "")

        print(f"\n   📤 [Manager] 分派任务给 {agent_name}:")
        print(f"      任务: {task_description[:50]}...")

        # 获取Worker
        worker = self._workers.get(agent_name)

        if not worker:
            print(f"      ❌ Worker {agent_name} 未找到")
            task_plan.results[step["step_id"]] = {
                "status": "failed",
                "error": f"Worker {agent_name} 未找到"
            }
            return

        # 发射 Worker 开始事件
        self._emit("worker_start",
            agent_name=agent_name,
            task=task_description,
            role=worker.role
        )

        # 构建任务消息
        task_msg = Msg(
            name=self.name,
            content=f"【任务分派】\n任务: {task_description}\n输入: {task_input}\n请执行此任务并返回结果。",
            role="user"
        )

        try:
            # 调用Worker
            print(f"      ⏳ 等待 {agent_name} 执行...")
            response = await worker.reply(task_msg)

            result_preview = str(response.content)[:100] if response.content else ""
            print(f"      ✅ {agent_name} 完成，结果: {result_preview}...")

            result_content = response.content
            if isinstance(result_content, list):
                texts = [item.get("text", "") if isinstance(item, dict) else str(item) for item in result_content]
                result_text = "\n".join(texts)
            elif isinstance(result_content, dict):
                result_text = result_content.get("text", str(result_content))
            else:
                result_text = str(result_content)

            task_plan.results[step["step_id"]] = {
                "status": "completed",
                "agent": agent_name,
                "result": response.content
            }

            # 发射 Worker 完成事件
            self._emit("worker_done",
                agent_name=agent_name,
                result=result_text,
                task=task_description
            )

        except Exception as e:
            print(f"      ❌ {agent_name} 执行失败: {e}")
            task_plan.results[step["step_id"]] = {
                "status": "failed",
                "agent": agent_name,
                "error": str(e)
            }
            # 发射 Worker 失败事件
            self._emit("worker_done",
                agent_name=agent_name,
                result=f"执行失败: {e}",
                task=task_description,
                failed=True
            )

    async def _integrate_results(self, task_plan: TaskPlan) -> str:
        """整合所有Worker的结果"""

        results_summary = []
        for step in task_plan.steps:
            step_id = step["step_id"]
            result = task_plan.results.get(step_id, {})

            if result.get("status") == "completed":
                results_summary.append(
                    f"步骤 {step_id} ({step.get('agent_name')}):\n"
                    f"{result.get('result', '')}"
                )
            else:
                results_summary.append(
                    f"步骤 {step_id} ({step.get('agent_name')}):\n"
                    f"执行失败: {result.get('error', '未知错误')}"
                )

        all_results = "\n\n---\n\n".join(results_summary)
        print(f"\n   📊 [Manager] 收集到{len(results_summary)}个Worker的结果")

        # 让Manager整合结果
        skills_text = self._get_skills_prompt()
        system_prompt = f"""你是{self.name}，{self.role}。

原始用户请求: {task_plan.description}

{skills_text}

各团队成员的执行结果：
{all_results}

请以你的角色整合以上结果，给用户一个完整、连贯的回复。
保持你的人设，回答应该简洁、专业。
"""

        integrate_msg = Msg(name="system", content=system_prompt, role="system")

        response = await self.model(
            messages=[integrate_msg.to_dict()]
        )

        final_content = self._extract_text_from_response(response.content)
        print(f"   ✅ [Manager] 结果整合完成，生成回复长度: {len(final_content)}字符")

        return final_content

    async def _handle_directly(self, msg: Msg) -> Msg:
        """直接处理请求（不需要分派）"""
        skills_text = self._get_skills_prompt()
        system_prompt = f"""你是{self.name}，{self.role}。

你的性格特点：{self.personality}

{skills_text}

可以直接回答用户的问题，不需要分派给团队成员。"""

        system_msg = Msg(name="system", content=system_prompt, role="system")

        print(f"\n   🧠 [Manager] 直接处理请求（不经过Workers）...")
        response = await self.model(
            messages=[system_msg.to_dict(), msg.to_dict()]
        )

        content = self._extract_text_from_response(response.content)
        print(f"   ✅ [Manager] 直接回复完成，长度: {len(content)}字符")

        return Msg(name=self.name, content=content, role="assistant")

    def _extract_json(self, text: str) -> str:
        """从文本中提取JSON"""
        # 尝试找到JSON块
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return text[start:end+1]
        return text

    async def __call__(self, msg: Msg) -> Msg:
        """使 Agent 可以直接被调用"""
        return await self.reply(msg)


class WorkerAgent:
    """
    Worker Agent 接口 - 被Manager调用的Agent
    """

    def __init__(
        self,
        name: str,
        role: str,
        personality: str,
        specialty: str,  # 专业领域
        expertise: str,  # 具体专长描述
        model_name: str = "qwen-max",
        api_key: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        tools: Optional[List[str]] = None,  # 该Worker可用的工具
        skill_names: Optional[List[str]] = None,
    ):
        self.name = name
        self.role = role
        self.personality = personality
        self.specialty = specialty
        self.expertise = expertise
        self._manager: Optional[ManagerAgent] = None
        self._available_tools = tools or []

        # 初始化底层Agent
        from .chat_agent import ChatAgent

        # 构建带工具限制的llm_config
        worker_llm_config = llm_config or {
            "provider": "dashscope",
            "model_id": model_name,
            "api_key": api_key
        }

        self._agent = ChatAgent(
            name=name,
            role=role,
            personality=personality,
            llm_config=worker_llm_config,
            skill_names=skill_names,
        )

    def set_manager(self, manager: ManagerAgent):
        """设置Manager"""
        self._manager = manager

    async def reply(self, msg: Msg) -> Msg:
        """响应Manager分派的任务"""
        # 添加角色提示
        enhanced_content = f"""{msg.content}

记住你是{self.name}，{self.role}，你的专长是：{self.expertise}
请用符合你人设的方式回复。"""

        enhanced_msg = Msg(
            name=msg.name,
            content=enhanced_content,
            role=msg.role
        )

        return await self._agent.reply(enhanced_msg)

    async def __call__(self, msg: Msg) -> Msg:
        return await self.reply(msg)
