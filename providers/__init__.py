# -*- coding: utf-8 -*-
"""Providers module for model configuration."""

from .provider import Provider, ModelInfo, ProviderInfo
from .dashscope_provider import DashScopeProvider
from .anthropic_provider import AnthropicProvider
from .provider_manager import ProviderManager, ProviderType, provider_manager

__all__ = [
    "Provider",
    "ModelInfo",
    "ProviderInfo",
    "DashScopeProvider",
    "AnthropicProvider",
    "ProviderManager",
    "ProviderType",
    "provider_manager",
]