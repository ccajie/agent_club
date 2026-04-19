# -*- coding: utf-8 -*-
"""KimiCode provider implementation for Moonshot AI coding models."""

from typing import Any, ClassVar
import anthropic
from .provider import Provider


class KimiCodeProvider(Provider):
    """KimiCode provider for Moonshot AI coding models.

    Uses Anthropic-compatible API with base_url https://api.kimi.com/coding
    """

    KIMICODE_BASE_URL: ClassVar[str] = "https://api.kimi.com/coding"

    def __init__(self, **data: Any):
        """Initialize KimiCode provider."""
        data["provider_type"] = "kimicode"
        # Normalize base_url: strip trailing slash
        base_url = data.get("base_url", "")
        if base_url:
            data["base_url"] = base_url.rstrip("/")
        elif not data.get("base_url"):
            data["base_url"] = self.KIMICODE_BASE_URL
        super().__init__(**data)

    async def check_connection(self) -> tuple[bool, str]:
        """Check if KimiCode connection works via Anthropic SDK."""
        if not self.api_key:
            return False, "API Key is required"
        if not self.model_id:
            return False, "Model ID is required"

        base_url = (self.base_url or self.KIMICODE_BASE_URL).rstrip("/")

        try:
            client = anthropic.AsyncAnthropic(
                api_key=self.api_key,
                base_url=base_url,
            )
            response = await client.messages.create(
                model=self.model_id,
                max_tokens=5,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True, "Connection successful"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    def get_chat_model_config(self) -> dict:
        """Get chat model configuration for agentscope."""
        base_url = (self.base_url or self.KIMICODE_BASE_URL).rstrip("/")
        return {
            "model_type": "kimicode",
            "model_name": self.model_id,
            "api_key": self.api_key,
            "base_url": base_url,
        }
