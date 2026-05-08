"""
用户级别的配置管理器工厂
根据 user_id 创建或获取用户专属的配置管理器实例
"""
from typing import Dict, Tuple

from .user_data import get_user_data
from config.agents_config import AgentsConfigManager
from config.manager_config import ManagerConfigManager
from providers.provider_manager import ProviderManager


# 缓存：user_id -> (AgentsConfigManager, ManagerConfigManager, ProviderManager)
_user_managers_cache: Dict[str, Tuple[AgentsConfigManager, ManagerConfigManager, ProviderManager]] = {}


def get_user_managers(user_id: str) -> Tuple[AgentsConfigManager, ManagerConfigManager, ProviderManager]:
    """获取用户专属的配置管理器三元组（带缓存）"""
    if user_id not in _user_managers_cache:
        user_data = get_user_data(user_id)
        agents_mgr = AgentsConfigManager(config_file=user_data.agents_config_file)
        manager_mgr = ManagerConfigManager(config_file=user_data.manager_config_file)
        provider_mgr = ProviderManager(config_file=user_data.providers_config_file)
        _user_managers_cache[user_id] = (agents_mgr, manager_mgr, provider_mgr)
    return _user_managers_cache[user_id]


def get_user_agents_manager(user_id: str) -> AgentsConfigManager:
    """获取用户专属的 AgentsConfigManager"""
    return get_user_managers(user_id)[0]


def get_user_manager_config(user_id: str) -> ManagerConfigManager:
    """获取用户专属的 ManagerConfigManager"""
    return get_user_managers(user_id)[1]


def get_user_provider_manager(user_id: str) -> ProviderManager:
    """获取用户专属的 ProviderManager"""
    return get_user_managers(user_id)[2]
