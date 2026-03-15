#!/usr/bin/env python3
"""
模型配置 API 路由
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from model_config import (
    ModelConfigManager,
    LLMConfig,
    EmbeddingConfig,
    ProviderType,
    ModelConfig,
)

router = APIRouter(prefix="/api/models", tags=["models"])

# 获取配置管理器
def get_config_manager() -> ModelConfigManager:
    return ModelConfigManager()


class LLMConfigRequest(BaseModel):
    """LLM 配置请求"""
    provider: ProviderType = Field(default=ProviderType.DASHSCOPE)
    model_id: str = Field(default="qwen-max")
    model_name: str = Field(default="Qwen Max")
    api_key: str = Field(default="")
    base_url: str = Field(default="")
    api_key_prefix: str = Field(default="sk-")
    is_dashscope: bool = Field(default=True)
    dashscope_model: str = Field(default="qwen-max")


class EmbeddingConfigRequest(BaseModel):
    """Embedding 配置请求"""
    provider: ProviderType = Field(default=ProviderType.DASHSCOPE)
    model_id: str = Field(default="text-embedding-v4")
    model_name: str = Field(default="Text Embedding V4")
    api_key: str = Field(default="")
    base_url: str = Field(default="")
    api_key_prefix: str = Field(default="sk-")
    is_dashscope: bool = Field(default=True)
    dashscope_model: str = Field(default="text-embedding-v4")


class ModelConfigResponse(BaseModel):
    """完整配置响应"""
    llm: LLMConfig
    embedding: EmbeddingConfig
    version: str


class TestConnectionResponse(BaseModel):
    """连接测试响应"""
    success: bool
    message: str


class TestConnectionRequest(BaseModel):
    """连接测试请求"""
    provider: ProviderType
    api_key: str
    base_url: Optional[str] = None
    model_id: str
    model_type: str = Field(default="llm", description="llm 或 embedding")


@router.get("/config", response_model=ModelConfigResponse)
async def get_model_config():
    """获取当前模型配置"""
    manager = get_config_manager()
    config = manager.get_config()
    return ModelConfigResponse(
        llm=config.llm,
        embedding=config.embedding,
        version=config.version
    )


@router.post("/config/llm", response_model=ModelConfigResponse)
async def update_llm_config(request: LLMConfigRequest):
    """更新语言模型配置"""
    manager = get_config_manager()

    # 根据是否为 DashScope 自动处理
    if request.is_dashscope:
        request.provider = ProviderType.DASHSCOPE
        request.model_id = request.dashscope_model
        request.base_url = ""
        if request.dashscope_model == "qwen-max":
            request.model_name = "Qwen Max"
        elif request.dashscope_model == "qwen-plus":
            request.model_name = "Qwen Plus"
        elif request.dashscope_model == "qwen-turbo":
            request.model_name = "Qwen Turbo"
        elif request.dashscope_model.startswith("qwen-"):
            request.model_name = f"Qwen {request.dashscope_model.replace('qwen-', '').title()}"
    else:
        # 自定义模型
        request.provider = ProviderType.ANTHROPIC

    llm_config = LLMConfig(
        provider=request.provider,
        model_id=request.model_id,
        model_name=request.model_name,
        api_key=request.api_key,
        base_url=request.base_url,
        api_key_prefix=request.api_key_prefix,
        is_dashscope=request.is_dashscope,
        dashscope_model=request.dashscope_model,
    )

    success = manager.update_llm_config(llm_config)
    if not success:
        raise HTTPException(status_code=500, detail="保存配置失败")

    config = manager.get_config()
    return ModelConfigResponse(
        llm=config.llm,
        embedding=config.embedding,
        version=config.version
    )


@router.post("/config/embedding", response_model=ModelConfigResponse)
async def update_embedding_config(request: EmbeddingConfigRequest):
    """更新嵌入模型配置"""
    manager = get_config_manager()

    # 根据是否为 DashScope 自动处理
    if request.is_dashscope:
        request.provider = ProviderType.DASHSCOPE
        request.model_id = request.dashscope_model
        request.base_url = ""
        if request.dashscope_model == "text-embedding-v3":
            request.model_name = "Text Embedding V3"
        elif request.dashscope_model == "text-embedding-v2":
            request.model_name = "Text Embedding V2"
        elif request.dashscope_model == "text-embedding-v1":
            request.model_name = "Text Embedding V1"
    else:
        # 自定义模型
        request.provider = ProviderType.ANTHROPIC

    embedding_config = EmbeddingConfig(
        provider=request.provider,
        model_id=request.model_id,
        model_name=request.model_name,
        api_key=request.api_key,
        base_url=request.base_url,
        api_key_prefix=request.api_key_prefix,
        is_dashscope=request.is_dashscope,
        dashscope_model=request.dashscope_model,
    )

    success = manager.update_embedding_config(embedding_config)
    if not success:
        raise HTTPException(status_code=500, detail="保存配置失败")

    config = manager.get_config()
    return ModelConfigResponse(
        llm=config.llm,
        embedding=config.embedding,
        version=config.version
    )


@router.post("/test/llm", response_model=TestConnectionResponse)
async def test_llm_connection(request: Optional[TestConnectionRequest] = None):
    """测试语言模型连接"""
    manager = get_config_manager()

    if request:
        # 使用传入的参数测试
        is_embedding = request.model_type == "embedding"
        success, message = manager._test_connection(
            provider=request.provider,
            api_key=request.api_key,
            base_url=request.base_url or None,
            model_id=request.model_id,
            is_embedding=is_embedding
        )
    else:
        # 使用当前配置测试
        success, message = manager.test_llm_connection()

    return TestConnectionResponse(success=success, message=message)


@router.post("/test/embedding", response_model=TestConnectionResponse)
async def test_embedding_connection(request: Optional[TestConnectionRequest] = None):
    """测试嵌入模型连接"""
    manager = get_config_manager()

    if request:
        # 使用传入的参数测试
        success, message = manager._test_connection(
            provider=request.provider,
            api_key=request.api_key,
            base_url=request.base_url or None,
            model_id=request.model_id,
            is_embedding=True
        )
    else:
        # 使用当前配置测试
        success, message = manager.test_embedding_connection()

    return TestConnectionResponse(success=success, message=message)


@router.get("/providers")
async def get_supported_providers():
    """获取支持的供应商列表"""
    return {
        "providers": [
            {
                "id": "dashscope",
                "name": "阿里云 DashScope",
                "description": "阿里云大模型服务平台",
                "llm_models": [
                    {"id": "qwen-max", "name": "Qwen Max", "description": "通义千问旗舰模型"},
                    {"id": "qwen-plus", "name": "Qwen Plus", "description": "通义千问增强模型"},
                    {"id": "qwen-turbo", "name": "Qwen Turbo", "description": "通义千问极速模型"},
                ],
                "embedding_models": [
                    {"id": "text-embedding-v4", "name": "Text Embedding V4", "description": "最新版文本嵌入模型"},
                    {"id": "text-embedding-v3", "name": "Text Embedding V3", "description": "文本嵌入模型 V3"},
                    {"id": "text-embedding-v2", "name": "Text Embedding V2", "description": "文本嵌入模型 V2"},
                    {"id": "text-embedding-v1", "name": "Text Embedding V1", "description": "文本嵌入模型 V1"},
                ]
            },
            {
                "id": "anthropic",
                "name": "Anthropic (自定义)",
                "description": "支持 Anthropic Claude API 或兼容接口",
                "requires_url": True,
                "api_key_prefix": "sk-ant-api03-",
                "default_url": "https://api.anthropic.com/v1"
            },
            {
                "id": "openai",
                "name": "OpenAI (自定义)",
                "description": "支持 OpenAI API 或兼容接口",
                "requires_url": True,
                "api_key_prefix": "sk-",
                "default_url": "https://api.openai.com/v1"
            },
            {
                "id": "custom",
                "name": "自定义 OpenAI 兼容",
                "description": "支持任何 OpenAI 兼容格式的 API",
                "requires_url": True,
                "api_key_prefix": "",
                "default_url": "https://api.example.com/v1"
            }
        ]
    }
