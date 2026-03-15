#!/usr/bin/env python3
"""
模型配置管理模块 - 支持 LLM 和 Embedding 模型配置
"""
import os
import json
from typing import Dict, Optional, Literal
from pathlib import Path
from pydantic import BaseModel, Field
from enum import Enum

# 配置文件路径
CONFIG_DIR = Path.home() / ".rag_agent"
CONFIG_FILE = CONFIG_DIR / "model_config.json"


class ProviderType(str, Enum):
    """供应商类型"""
    DASHSCOPE = "dashscope"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    CUSTOM = "custom"


class ModelType(str, Enum):
    """模型类型"""
    LLM = "llm"
    EMBEDDING = "embedding"


class LLMConfig(BaseModel):
    """语言模型配置"""
    provider: ProviderType = Field(default=ProviderType.DASHSCOPE, description="供应商类型")
    model_id: str = Field(default="qwen-max", description="模型ID")
    model_name: str = Field(default="Qwen Max", description="模型显示名称")
    api_key: str = Field(default="", description="API Key")
    base_url: str = Field(default="", description="自定义API地址")
    api_key_prefix: str = Field(default="sk-", description="API Key前缀提示")

    # DashScope 特定配置
    is_dashscope: bool = Field(default=True, description="是否为DashScope")
    dashscope_model: str = Field(default="qwen-max", description="DashScope模型选择")


class EmbeddingConfig(BaseModel):
    """文本嵌入模型配置"""
    provider: ProviderType = Field(default=ProviderType.DASHSCOPE, description="供应商类型")
    model_id: str = Field(default="text-embedding-v3", description="模型ID")
    model_name: str = Field(default="Text Embedding V3", description="模型显示名称")
    api_key: str = Field(default="", description="API Key")
    base_url: str = Field(default="", description="自定义API地址")
    api_key_prefix: str = Field(default="sk-", description="API Key前缀提示")

    # DashScope 特定配置
    is_dashscope: bool = Field(default=True, description="是否为DashScope")
    dashscope_model: str = Field(default="text-embedding-v3", description="DashScope嵌入模型选择")


class ModelConfig(BaseModel):
    """完整模型配置"""
    llm: LLMConfig = Field(default_factory=LLMConfig, description="语言模型配置")
    embedding: EmbeddingConfig = Field(default_factory=EmbeddingConfig, description="嵌入模型配置")
    version: str = Field(default="1.0", description="配置版本")


class ModelConfigManager:
    """模型配置管理器"""

    _instance = None
    _config: ModelConfig = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load_config()
        return cls._instance

    def _ensure_config_dir(self):
        """确保配置目录存在"""
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(CONFIG_DIR, 0o700)
        except Exception:
            pass

    def _load_config(self):
        """从文件加载配置"""
        self._ensure_config_dir()

        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self._config = ModelConfig.model_validate(data)
                print(f"✅ 已加载模型配置: {CONFIG_FILE}")
            except Exception as e:
                print(f"⚠️ 加载配置失败，使用默认配置: {e}")
                self._config = self._create_default_config()
                self._save_config()
        else:
            print("📝 配置文件不存在，创建默认配置")
            self._config = self._create_default_config()
            self._save_config()

    def _create_default_config(self) -> ModelConfig:
        """创建默认配置"""
        return ModelConfig(
            llm=LLMConfig(
                provider=ProviderType.DASHSCOPE,
                model_id="qwen-max",
                model_name="Qwen Max",
                api_key=os.getenv("DASHSCOPE_API_KEY", ""),
                is_dashscope=True,
                dashscope_model="qwen-max",
            ),
            embedding=EmbeddingConfig(
                provider=ProviderType.DASHSCOPE,
                model_id="text-embedding-v4",
                model_name="Text Embedding V4",
                api_key=os.getenv("DASHSCOPE_API_KEY", ""),
                is_dashscope=True,
                dashscope_model="text-embedding-v4",
            )
        )

    def _save_config(self):
        """保存配置到文件"""
        self._ensure_config_dir()
        try:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(self._config.model_dump(), f, ensure_ascii=False, indent=2)
            os.chmod(CONFIG_FILE, 0o600)
            return True
        except Exception as e:
            print(f"❌ 保存配置失败: {e}")
            return False

    def get_config(self) -> ModelConfig:
        """获取当前配置"""
        return self._config

    def update_llm_config(self, config: LLMConfig) -> bool:
        """更新语言模型配置"""
        self._config.llm = config
        return self._save_config()

    def update_embedding_config(self, config: EmbeddingConfig) -> bool:
        """更新嵌入模型配置"""
        self._config.embedding = config
        return self._save_config()

    def update_config(self, config: ModelConfig) -> bool:
        """更新完整配置"""
        self._config = config
        return self._save_config()

    def get_llm_config(self) -> LLMConfig:
        """获取语言模型配置"""
        return self._config.llm

    def get_embedding_config(self) -> EmbeddingConfig:
        """获取嵌入模型配置"""
        return self._config.embedding

    def test_llm_connection(self) -> tuple[bool, str]:
        """测试语言模型连接"""
        config = self._config.llm
        return self._test_connection(
            provider=config.provider,
            api_key=config.api_key,
            base_url=config.base_url or None,
            model_id=config.model_id,
            is_embedding=False
        )

    def test_embedding_connection(self) -> tuple[bool, str]:
        """测试嵌入模型连接"""
        config = self._config.embedding
        return self._test_connection(
            provider=config.provider,
            api_key=config.api_key,
            base_url=config.base_url or None,
            model_id=config.model_id,
            is_embedding=True
        )

    def _test_connection(
        self,
        provider: ProviderType,
        api_key: str,
        base_url: Optional[str],
        model_id: str,
        is_embedding: bool
    ) -> tuple[bool, str]:
        """测试模型连接"""
        import openai
        import asyncio

        if not api_key:
            return False, "API Key 不能为空"

        if not model_id:
            return False, "模型ID不能为空"

        async def do_test():
            try:
                # 构建客户端
                if provider == ProviderType.DASHSCOPE:
                    client = openai.AsyncOpenAI(
                        api_key=api_key,
                        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    )
                elif provider == ProviderType.ANTHROPIC:
                    client = openai.AsyncOpenAI(
                        api_key=api_key,
                        base_url=base_url or "https://api.anthropic.com/v1"
                    )
                elif provider == ProviderType.OPENAI:
                    client = openai.AsyncOpenAI(
                        api_key=api_key,
                        base_url=base_url or "https://api.openai.com/v1"
                    )
                else:
                    # 自定义供应商，使用 OpenAI 兼容格式
                    client = openai.AsyncOpenAI(
                        api_key=api_key,
                        base_url=base_url or "https://api.openai.com/v1"
                    )

                if is_embedding:
                    # 嵌入模型：尝试获取模型列表
                    models = await client.models.list()
                    return True, f"连接成功，可用模型数量: {len(models.data)}"
                else:
                    # 语言模型：尝试简单的 completion
                    response = await client.chat.completions.create(
                        model=model_id,
                        messages=[{"role": "user", "content": "hi"}],
                        max_tokens=5
                    )
                    return True, f"连接成功，模型响应正常"
            except Exception as e:
                return False, str(e)

        try:
            return asyncio.run(do_test())
        except Exception as e:
            return False, f"连接测试失败: {str(e)}"


# 全局配置管理器实例
config_manager = ModelConfigManager()
