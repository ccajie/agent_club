# -*- coding: utf-8 -*-
"""Provider manager for handling all model providers."""

import os
import json
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

from .provider import Provider, ProviderInfo
from .dashscope_provider import DashScopeProvider
from .anthropic_provider import AnthropicProvider
from .kimicode_provider import KimiCodeProvider
from .deepseek_provider import DeepSeekProvider







CONFIG_DIR = Path.home() / ".rag_agent"
PROVIDERS_FILE = CONFIG_DIR / "providers.json"


class ProviderType(str, Enum):
    """Provider types."""
    DASHSCOPE = "dashscope"
    ANTHROPIC = "anthropic"
    KIMICODE = "kimicode"
    DEEPSEEK = "deepseek"


class ProviderConfig(BaseModel):
    """Provider configuration for serialization."""
    id: str
    name: str = ""
    provider_type: str
    base_url: str = ""
    api_key: str = ""
    model_id: str
    model_name: str = ""
    is_active: bool = False


class ProvidersConfig(BaseModel):
    """All providers configuration."""
    providers: List[ProviderConfig] = []
    active_provider_id: Optional[str] = None
    active_embedding_provider_id: Optional[str] = None
    version: str = "1.0"


class ProviderManager:
    """Manager for all providers."""

    _instance = None

    def __new__(cls, config_file: str = None):
        # 如果指定了自定义路径，不使用单例
        if config_file is not None:
            instance = super().__new__(cls)
            instance._initialized = False
            return instance
        # 默认单例行为
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, config_file: str = None):
        if self._initialized:
            return
        self._initialized = True
        self._config_file = Path(config_file) if config_file else PROVIDERS_FILE
        self._config_dir = self._config_file.parent
        self._providers: Dict[str, Provider] = {}
        self._active_provider_id: Optional[str] = None
        self._active_embedding_provider_id: Optional[str] = None
        self._load_config()

    def _ensure_config_dir(self):
        """Ensure configuration directory exists."""
        self._config_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self._config_dir, 0o700)
        except Exception:
            pass

    def _load_config(self):
        """Load providers from configuration file."""
        self._ensure_config_dir()

        if self._config_file.exists():
            try:
                with open(self._config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                config = ProvidersConfig.model_validate(data)

                # Restore providers
                for p_config in config.providers:
                    provider = self._create_provider_from_config(p_config)
                    if provider:
                        self._providers[provider.id] = provider

                self._active_provider_id = config.active_provider_id
                self._active_embedding_provider_id = config.active_embedding_provider_id
                print(f"✅ Loaded {len(self._providers)} providers from {self._config_file}")
            except Exception as e:
                print(f"⚠️ Failed to load providers config: {e}")
                self._create_default_if_needed()
        else:
            print("📝 No providers config found, creating empty configuration")
            self._save_config()

    def _create_provider_from_config(self, config: ProviderConfig) -> Optional[Provider]:
        """Create a provider instance from configuration."""
        try:
            if config.provider_type == ProviderType.DASHSCOPE:
                return DashScopeProvider(
                    id=config.id,
                    name=config.name,
                    api_key=config.api_key,
                    model_id=config.model_id,
                    model_name=config.model_name,
                    is_active=config.is_active,
                )
            elif config.provider_type == ProviderType.ANTHROPIC:
                return AnthropicProvider(
                    id=config.id,
                    name=config.name,
                    api_key=config.api_key,
                    base_url=config.base_url,
                    model_id=config.model_id,
                    model_name=config.model_name,
                    is_active=config.is_active,
                )
            elif config.provider_type == ProviderType.KIMICODE:
                return KimiCodeProvider(
                    id=config.id,
                    name=config.name,
                    api_key=config.api_key,
                    base_url=config.base_url,
                    model_id=config.model_id,
                    model_name=config.model_name,
                    is_active=config.is_active,
                )
            elif config.provider_type == ProviderType.DEEPSEEK:
                return DeepSeekProvider(
                    id=config.id,
                    name=config.name,
                    api_key=config.api_key,
                    model_id=config.model_id,
                    model_name=config.model_name,
                    is_active=config.is_active,
                )
        except Exception as e:
            print(f"⚠️ Failed to create provider {config.id}: {e}")
        return None

    def _create_default_if_needed(self):
        """Create default configuration if needed."""
        # Don't create any default providers, let users add them manually
        self._save_config()

    def _save_config(self):
        """Save providers to configuration file."""
        self._ensure_config_dir()
        try:
            configs = []
            for provider in self._providers.values():
                configs.append(ProviderConfig(
                    id=provider.id,
                    name=provider.name,
                    provider_type=provider.provider_type,
                    base_url=provider.base_url,
                    api_key=provider.api_key,
                    model_id=provider.model_id,
                    model_name=provider.model_name,
                    is_active=provider.is_active,
                ))

            config = ProvidersConfig(
                providers=configs,
                active_provider_id=self._active_provider_id,
                active_embedding_provider_id=self._active_embedding_provider_id,
            )

            with open(self._config_file, 'w', encoding='utf-8') as f:
                json.dump(config.model_dump(), f, ensure_ascii=False, indent=2)
            os.chmod(self._config_file, 0o600)
            return True
        except Exception as e:
            print(f"❌ Failed to save providers config: {e}")
            return False

    def list_providers(self) -> List[ProviderInfo]:
        """List all providers (with masked secrets)."""
        return [p.to_info(mask_secret=True) for p in self._providers.values()]

    def get_provider(self, provider_id: str) -> Optional[Provider]:
        """Get a provider by ID."""
        return self._providers.get(provider_id)

    def get_active_provider(self) -> Optional[Provider]:
        """Get the currently active provider."""
        if self._active_provider_id:
            return self._providers.get(self._active_provider_id)
        return None

    def add_provider(self, provider_data: dict) -> Provider:
        """Add a new provider."""
        provider_type = provider_data.get("provider_type")
        model_id = provider_data.get("model_id", "")

        # Use model_id as default for name and model_name if not provided
        name = provider_data.get("name") or model_id
        model_name = provider_data.get("model_name") or model_id

        # Generate unique ID
        base_id = provider_data.get("id", "provider")
        provider_id = base_id
        counter = 1
        while provider_id in self._providers:
            provider_id = f"{base_id}-{counter}"
            counter += 1

        if provider_type == ProviderType.DASHSCOPE:
            provider = DashScopeProvider(
                id=provider_id,
                name=name,
                api_key=provider_data.get("api_key", ""),
                model_id=model_id,
                model_name=model_name,
            )
        elif provider_type == ProviderType.ANTHROPIC:
            provider = AnthropicProvider(
                id=provider_id,
                name=name,
                api_key=provider_data.get("api_key", ""),
                base_url=provider_data.get("base_url", ""),
                model_id=model_id,
                model_name=model_name,
            )
        elif provider_type == ProviderType.KIMICODE:
            provider = KimiCodeProvider(
                id=provider_id,
                name=name,
                api_key=provider_data.get("api_key", ""),
                base_url=provider_data.get("base_url", ""),
                model_id=model_id,
                model_name=model_name,
            )
        elif provider_type == ProviderType.DEEPSEEK:
            provider = DeepSeekProvider(
                id=provider_id,
                name=name,
                api_key=provider_data.get("api_key", ""),
                model_id=model_id,
                model_name=model_name,
            )
        else:
            raise ValueError(f"Unknown provider type: {provider_type}")

        self._providers[provider_id] = provider
        self._save_config()
        return provider

    def update_provider(self, provider_id: str, config: dict) -> Optional[Provider]:
        """Update a provider configuration."""
        provider = self._providers.get(provider_id)
        if not provider:
            return None

        provider.update_config(config)
        self._save_config()
        return provider

    def delete_provider(self, provider_id: str) -> bool:
        """Delete a provider."""
        if provider_id not in self._providers:
            return False

        provider = self._providers[provider_id]

        # If this was the active provider, clear it
        if self._active_provider_id == provider_id:
            self._active_provider_id = None
            provider.is_active = False

        del self._providers[provider_id]
        self._save_config()
        return True

    def set_active_provider(self, provider_id: str) -> bool:
        """Set the active provider."""
        if provider_id not in self._providers:
            return False

        # Deactivate all providers
        for p in self._providers.values():
            p.is_active = False

        # Activate the selected one
        self._providers[provider_id].is_active = True
        self._active_provider_id = provider_id

        self._save_config()
        return True

    async def test_provider(self, provider_id: str) -> tuple[bool, str]:
        """Test a provider connection."""
        provider = self._providers.get(provider_id)
        if not provider:
            return False, "Provider not found"
        return await provider.check_connection()

    # ========== Embedding Provider Methods ==========

    def get_embedding_provider(self) -> Optional[Provider]:
        """Get the currently active embedding provider."""
        if self._active_embedding_provider_id:
            return self._providers.get(self._active_embedding_provider_id)
        return None

    def set_embedding_provider(self, provider_id: str) -> bool:
        """Set the active embedding provider."""
        if provider_id not in self._providers:
            return False
        self._active_embedding_provider_id = provider_id
        self._save_config()
        return True

    def list_embedding_providers(self) -> List[ProviderInfo]:
        """List all providers suitable for embedding (currently only DashScope)."""
        # For now, embedding only supports DashScope
        return [p.to_info(mask_secret=True) for p in self._providers.values()
                if p.provider_type == ProviderType.DASHSCOPE]


# Global instance
provider_manager = ProviderManager()
