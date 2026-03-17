"""
ReAct 智能体 - 纯对话模式（无 RAG 知识库）
"""
from typing import Optional, Dict, Any
from agentscope.agent import AgentBase
from agentscope.message import Msg
from agentscope.model import DashScopeChatModel, OpenAIChatModel
from agentscope.agent import ReActAgent
from agentscope.formatter import OpenAIChatFormatter


class SimpleRAGAgent(AgentBase):
    """
    ReAct 智能体 - 纯对话模式，无知识库检索功能
    """

    def __init__(
        self,
        name: str,
        model_name: str = "qwen-max",
        api_key: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
    ):
        """
        初始化 ReAct 智能体（纯对话模式）

        Args:
            name: 智能体名称
            model_name: 使用的语言模型名称
            api_key: API 密钥
            llm_config: 语言模型配置字典，包含 provider, model_id, api_key, base_url
        """
        super().__init__()
        self.name = name

        # 使用 llm_config 或回退到旧参数
        if llm_config:
            self.provider = llm_config.get("provider", "dashscope")
            self.model_name = llm_config.get("model_id", model_name)
            self.api_key = llm_config.get("api_key") or api_key
            # 对于 DashScope，不使用 base_url
            raw_base_url = llm_config.get("base_url")
            self.base_url = raw_base_url if self.provider != "dashscope" else None
            print(f"[DEBUG] Provider: {self.provider}, model: {self.model_name}, base_url: {repr(self.base_url)}")
        else:
            self.provider = "dashscope"
            self.model_name = model_name
            self.api_key = api_key
            self.base_url = None

        # 初始化语言模型
        if not self.api_key:
            raise ValueError("API key is required for agent")

        self.model = self._create_model()

        # 创建 formatter
        formatter = self._create_formatter()

        # 创建 ReAct 智能体（无知识库，无检索工具）
        sys_prompt = f"你是{self.name}，一个智能对话助手。请直接回答用户的问题，不需要使用工具检索信息。"
        self.react_agent = ReActAgent(
            name=name,
            sys_prompt=sys_prompt,
            model=self.model,
            formatter=formatter,
            max_iters=10,
        )

    def _create_model(self):
        """根据配置创建对应的模型实例"""
        if self.provider == "dashscope":
            # 使用 OpenAI 兼容模式，支持更多模型
            return OpenAIChatModel(
                model_name=self.model_name,
                api_key=self.api_key,
                client_kwargs={"base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
                stream=True,
            )
        elif self.provider in ["openai", "anthropic", "custom"]:
            # 使用 OpenAI 兼容格式
            client_kwargs = {}
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            return OpenAIChatModel(
                model_name=self.model_name,
                api_key=self.api_key,
                client_kwargs=client_kwargs if client_kwargs else None,
                stream=True,
            )
        else:
            # 默认使用 DashScope
            return DashScopeChatModel(
                model_name=self.model_name,
                api_key=self.api_key
            )

    def _create_formatter(self):
        """根据配置创建对应的 formatter"""
        # 所有供应商都使用 OpenAI 格式
        return OpenAIChatFormatter()

    async def reply(self, msg: Msg) -> Msg:
        """
        处理用户查询并生成回答

        Args:
            msg: 用户消息

        Returns:
            智能体的回复消息
        """
        # 转发给 ReActAgent 进行处理
        return await self.react_agent.reply(msg)


# 保持兼容性
SpecializedRAGAgent = SimpleRAGAgent
