# -*- coding: utf-8 -*-
"""Providers module for model configuration."""

import openai
import anthropic
from typing import Optional

from .provider import Provider, ModelInfo, ProviderInfo
from .dashscope_provider import DashScopeProvider
from .anthropic_provider import AnthropicProvider
from .kimicode_provider import KimiCodeProvider
from .deepseek_provider import DeepSeekProvider
from .provider_manager import ProviderManager, ProviderType, provider_manager


async def test_model_connection(
    provider_type: str,
    api_key: str,
    model_id: str,
    base_url: Optional[str] = None
) -> tuple[bool, str]:
    """Test model connection without creating a provider.

    Args:
        provider_type: Provider type (dashscope, anthropic, openai, custom, kimicode)
        api_key: API key
        model_id: Model ID
        base_url: Optional base URL

    Returns:
        Tuple of (success, message)
    """
    if not api_key:
        return False, "API Key is required"
    if not model_id:
        return False, "Model ID is required"

    # KimiCode uses Anthropic SDK
    if provider_type == "kimicode":
        if not base_url:
            base_url = "https://api.kimi.com/coding"
        base_url = base_url.rstrip("/")
        try:
            client = anthropic.AsyncAnthropic(
                api_key=api_key,
                base_url=base_url,
            )
            response = await client.messages.create(
                model=model_id,
                max_tokens=5,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True, "Connection successful"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    # Determine base URL based on provider type
    if provider_type == "dashscope":
        base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    elif provider_type == "deepseek":
        base_url = "https://api.deepseek.com"
    elif provider_type in ["anthropic", "custom"] and not base_url:
        return False, "Base URL is required for this provider type"

    # Normalize base_url to avoid double-slash issues
    if base_url:
        base_url = base_url.rstrip("/")

    try:
        client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
        # Try a simple chat completion
        response = await client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5
        )
        return True, "Connection successful"
    except Exception as e:
        return False, f"Connection failed: {str(e)}"


__all__ = [
    "Provider",
    "ModelInfo",
    "ProviderInfo",
    "DashScopeProvider",
    "AnthropicProvider",
    "KimiCodeProvider",
    "DeepSeekProvider",
    "ProviderManager",
    "ProviderType",
    "provider_manager",
    "test_model_connection",
]