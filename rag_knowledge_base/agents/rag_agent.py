"""
RAG 智能体 - 从知识库中检索信息并生成回答
"""
from typing import Optional, Dict, Any
from agentscope.agent import AgentBase
from agentscope.message import Msg, TextBlock
from agentscope.model import DashScopeChatModel, OpenAIChatModel
from agentscope.tool import ToolResponse
from agentscope.agent import ReActAgent
from agentscope.tool import Toolkit
from agentscope.formatter import DashScopeChatFormatter, OpenAIChatFormatter
from ..rag_knowledge import RAGKnowledgeBase


class SimpleRAGAgent(AgentBase):
    """
    RAG 智能体 - 从知识库中检索相关文档并生成回答
    """

    def __init__(
        self,
        name: str,
        knowledge_base: RAGKnowledgeBase,
        model_name: str = "qwen-max",
        api_key: Optional[str] = None,
        retrieve_limit: int = 5,
        score_threshold: float = 0.5,
        llm_config: Optional[Dict[str, Any]] = None,
    ):
        """
        初始化 RAG 智能体

        Args:
            name: 智能体名称
            knowledge_base: RAG 知识库实例
            model_name: 使用的语言模型名称
            api_key: API 密钥（如果为 None，将从环境变量读取）
            retrieve_limit: 检索文档的最大数量
            score_threshold: 相似度阈值
            llm_config: 语言模型配置字典，包含 provider, model_id, api_key, base_url
        """
        super().__init__()
        self.name = name
        self.kb = knowledge_base
        self.retrieve_limit = retrieve_limit
        self.score_threshold = score_threshold

        # 使用 llm_config 或回退到旧参数
        if llm_config:
            self.provider = llm_config.get("provider", "dashscope")
            self.model_name = llm_config.get("model_id", model_name)
            self.api_key = llm_config.get("api_key") or api_key or knowledge_base.api_key
            # 对于 DashScope，不使用 base_url
            raw_base_url = llm_config.get("base_url")
            self.base_url = raw_base_url if self.provider != "dashscope" else None
            print(f"[DEBUG] Provider: {self.provider}, model: {self.model_name}, base_url: {repr(self.base_url)}")
        else:
            self.provider = "dashscope"
            self.model_name = model_name
            self.api_key = api_key or knowledge_base.api_key
            self.base_url = None

        # 初始化语言模型
        if not self.api_key:
            raise ValueError("API key is required for RAG agent")

        self.model = self._create_model()

        # 创建 formatter、工具包并注册工具函数
        formatter = self._create_formatter()
        toolkit = Toolkit()
        toolkit.register_tool_function(self.retrieve_from_knowledge_base)

        # 创建 ReAct 智能体（匹配 agentscope.ReActAgent 的构造签名）
        sys_prompt = f"你是{self.name}，一个从知识库检索并回答的助手。"
        self.react_agent = ReActAgent(
            name=name,
            sys_prompt=sys_prompt,
            model=self.model,
            formatter=formatter,
            toolkit=toolkit,
            knowledge=self.kb,  # 与官方案例一致，RAGKnowledgeBase 继承 KnowledgeBase 后会自动转为列表
            max_iters=10,
        )

    def _create_model(self):
        """根据配置创建对应的模型实例"""
        if self.provider == "dashscope":
            # 使用 OpenAI 兼容模式，支持更多模型（如 qwen3.5-flash）
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
        # 所有供应商都使用 OpenAI 格式（包括使用兼容模式的 DashScope）
        return OpenAIChatFormatter()

    async def retrieve_from_knowledge_base(self, query: str, limit: int = 5, score_threshold: float = 0.1) -> ToolResponse:
        """
        从知识库中检索信息的异步工具函数
        
        Args:
            query: 查询字符串
            limit: 返回结果的最大数量
            score_threshold: 相似度阈值
            
        Returns:
            ToolResponse 对象
        """
        try:
            retrieved_docs = await self.kb.retrieve(
                query=query,
                limit=limit,
                score_threshold=score_threshold
            )
            
            if not retrieved_docs:
                return ToolResponse(content=[TextBlock(type="text", text="未找到与查询相关的信息。")])
            
            # 格式化结果（Document 对象）
            formatted_results = []
            for i, doc in enumerate(retrieved_docs, 1):
                source = getattr(doc.metadata, "doc_id", "未知来源")
                content = (
                    doc.metadata.content.get("text", "")
                    if isinstance(doc.metadata.content, dict)
                    else str(getattr(doc.metadata.content, "text", doc.metadata.content))
                )[:500]
                formatted_result = f"[文档 {i}] (来源: {source})\n{content}\n"
                formatted_results.append(formatted_result)
            
            return ToolResponse(content=[TextBlock(type="text", text="\n".join(formatted_results))])
        except Exception as e:
            return ToolResponse(content=[TextBlock(type="text", text=f"检索过程中发生错误: {str(e)}")])

    async def reply(self, msg: Msg) -> Msg:
        """
        处理用户查询，从知识库检索相关信息并生成回答

        Args:
            msg: 用户消息

        Returns:
            智能体的回复消息
        """
        # 转发给 ReActAgent 进行处理（ReActAgent.reply 是异步的）
        return await self.react_agent.reply(msg)


# 保持兼容性
SpecializedRAGAgent = SimpleRAGAgent