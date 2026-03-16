"""
Agent 配置管理模块
支持每个 Agent 独立配置模型、API、角色和性格
"""
import json
import os
import random
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

# 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agents_config.json")


class AgentConfig(BaseModel):
    """Agent 完整配置模型"""
    id: str = Field(..., description="Agent 唯一标识")
    name: str = Field(..., description="Agent 名称")
    role: str = Field(..., description="Agent 角色")
    personality: str = Field(..., description="Agent 性格描述")
    avatar_type: str = Field(default="aiden", description="头像类型: aiden 或 wrench")

    # 模型配置
    provider_type: str = Field(..., description="模型提供商: dashscope, openai, anthropic, custom")
    model_id: str = Field(..., description="模型ID")
    model_name: str = Field(default="", description="模型显示名称")
    api_key: str = Field(..., description="API密钥")
    base_url: str = Field(default="", description="自定义API基础URL")

    # 元数据
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    is_active: bool = Field(default=True, description="是否启用")

    def to_info(self, mask_secret: bool = True) -> Dict[str, Any]:
        """转换为信息字典"""
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "personality": self.personality,
            "avatar_type": self.avatar_type,
            "provider_type": self.provider_type,
            "model_id": self.model_id,
            "model_name": self.model_name,
            "base_url": self.base_url,
            "api_key": "***" if mask_secret and self.api_key else self.api_key,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_active": self.is_active,
        }

    def to_llm_config(self) -> Dict[str, Any]:
        """转换为 LLM 配置字典"""
        return {
            "provider": self.provider_type,
            "model_id": self.model_id,
            "api_key": self.api_key,
            "base_url": self.base_url if self.base_url else None,
        }


class AgentsConfigManager:
    """Agent 配置管理器"""

    def __init__(self):
        self.agents: Dict[str, AgentConfig] = {}
        self._load_config()

    def _load_config(self):
        """从文件加载配置"""
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for agent_data in data.get("agents", []):
                        agent = AgentConfig(**agent_data)
                        self.agents[agent.id] = agent
                print(f"✅ 已加载 {len(self.agents)} 个 Agent 配置")
            except Exception as e:
                print(f"⚠️ 加载 Agent 配置失败: {e}")
                # 加载失败时创建空配置
                self._create_empty_config()
        else:
            print("📄 Agent 配置文件不存在，创建空配置")
            self._create_empty_config()

    def _save_config(self):
        """保存配置到文件"""
        try:
            data = {
                "agents": [agent.model_dump() for agent in self.agents.values()]
            }
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"⚠️ 保存 Agent 配置失败: {e}")
            return False

    def _create_empty_config(self):
        """创建空配置（初始状态）"""
        self.agents = {}
        self._save_config()

    # def _create_default_agents(self):
    #     """创建默认 Agent 配置（演示用）"""
    #     default_agents = [
    #         AgentConfig(
    #             id="agent_001",
    #             name="狗哥",
    #             role="技术专家",
    #             personality="专业、冷静、喜欢钻研技术，说话简洁有力。擅长系统安全和网络技术。",
    #             avatar_type="aiden",
    #             provider_type="dashscope",
    #             model_id="qwen-max",
    #             model_name="通义千问 Max",
    #             api_key="",
    #         ),
    #         AgentConfig(
    #             id="agent_002",
    #             name="扳手",
    #             role="创意黑客",
    #             personality="热情、幽默、充满创意，喜欢用有趣的方式解决问题。擅长硬件改造和创意方案。",
    #             avatar_type="wrench",
    #             provider_type="dashscope",
    #             model_id="qwen-max",
    #             model_name="通义千问 Max",
    #             api_key="",
    #         ),
    #     ]
    #     for agent in default_agents:
    #         self.agents[agent.id] = agent
    #     self._save_config()

    def list_agents(self, include_inactive: bool = False) -> List[AgentConfig]:
        """获取所有 Agent 配置"""
        agents = list(self.agents.values())
        if not include_inactive:
            agents = [a for a in agents if a.is_active]
        return agents

    def get_agent(self, agent_id: str) -> Optional[AgentConfig]:
        """获取单个 Agent 配置"""
        return self.agents.get(agent_id)

    def create_agent(self, data: Dict[str, Any]) -> AgentConfig:
        """创建新 Agent"""
        import uuid
        agent_id = data.get("id") or f"agent_{uuid.uuid4().hex[:8]}"

        # 确保ID唯一
        while agent_id in self.agents:
            agent_id = f"agent_{uuid.uuid4().hex[:8]}"

        # 如果没有提供 avatar_type，随机分配
        if not data.get("avatar_type"):
            data["avatar_type"] = random.choice(["aiden", "wrench"])

        agent = AgentConfig(id=agent_id, **{k: v for k, v in data.items() if k != "id"})
        self.agents[agent_id] = agent
        self._save_config()
        return agent

    def update_agent(self, agent_id: str, data: Dict[str, Any]) -> Optional[AgentConfig]:
        """更新 Agent 配置"""
        agent = self.agents.get(agent_id)
        if not agent:
            return None

        # 更新字段
        for field in ["name", "role", "personality", "avatar_type",
                      "provider_type", "model_id", "model_name", "api_key", "base_url", "is_active"]:
            if field in data:
                setattr(agent, field, data[field])

        agent.updated_at = datetime.now().isoformat()
        self._save_config()
        return agent

    def delete_agent(self, agent_id: str) -> bool:
        """删除 Agent"""
        if agent_id in self.agents:
            del self.agents[agent_id]
            self._save_config()
            return True
        return False

    def get_active_agents(self) -> List[AgentConfig]:
        """获取所有启用的 Agent"""
        return [a for a in self.agents.values() if a.is_active]


# 全局配置管理器实例
agents_config_manager = AgentsConfigManager()
