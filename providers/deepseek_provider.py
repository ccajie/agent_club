# -*- coding: utf-8 -*-
"""DeepSeek provider implementation."""

from typing import Any, ClassVar
import openai
from .provider import Provider


class DeepSeekProvider(Provider):
    """DeepSeek provider for DeepSeek AI models."""

    DEEPSEEK_BASE_URL: ClassVar[str] = "https://api.deepseek.com"

    def __init__(self, **data: Any):
        """Initialize DeepSeek provider."""
        data["provider_type"] = "deepseek"
        super().__init__(**data)

    async def check_connection(self) -> tuple[bool, str]:
        """Check if DeepSeek connection works."""
        if not self.api_key:
            return False, "API Key is required"
        if not self.model_id:
            return False, "Model ID is required"

        try:
            client = openai.AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.DEEPSEEK_BASE_URL
            )
            response = await client.chat.completions.create(
                model=self.model_id,
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=5
            )
            return True, "Connection successful"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    def get_chat_model_config(self) -> dict:
        """Get chat model configuration for agentscope."""
        return {
            "model_type": "deepseek",
            "model_name": self.model_id,
            "api_key": self.api_key,
            "base_url": self.DEEPSEEK_BASE_URL,
        }
