import axios from 'axios'
import type {
  ChatResponse,
  AgentInfo,
  AgentResponse,
  AgentConfig,
  CreateAgentRequest,
  UpdateAgentRequest,
  TestConnectionResponse,
  ProviderType,
  AvatarType,
} from '../types'

// 自动检测环境：开发模式使用代理，生产模式使用相对路径
const isDev = import.meta.env.DEV
const baseURL = isDev ? '/api' : '/api'

const client = axios.create({
  baseURL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const api = {
  // ========== 聊天 API ==========

  // 聊天 - 返回多 Agent 响应
  async chat(message: string): Promise<AgentResponse[]> {
    const response = await client.post<ChatResponse>('/chat', { message })
    return response.data.responses
  },

  // 获取 Agent 列表（用于聊天）
  async getAgents(): Promise<AgentInfo[]> {
    const response = await client.get<{ agents: AgentInfo[] }>('/agents')
    return response.data.agents
  },

  // ========== Agent 配置 API（每个 Agent 独立配置） ==========

  // 获取所有 Agent 配置
  async getAgentConfigs(includeInactive: boolean = false): Promise<AgentConfig[]> {
    const response = await client.get<{ agents: AgentConfig[] }>('/agents-config', {
      params: { include_inactive: includeInactive }
    })
    return response.data.agents
  },

  // 获取单个 Agent 配置
  async getAgentConfig(agentId: string): Promise<AgentConfig> {
    const response = await client.get<AgentConfig>(`/agents-config/${agentId}`)
    return response.data
  },

  // 创建新 Agent
  async createAgentConfig(data: CreateAgentRequest): Promise<AgentConfig> {
    const response = await client.post<AgentConfig>('/agents-config', data)
    return response.data
  },

  // 更新 Agent 配置
  async updateAgentConfig(agentId: string, data: UpdateAgentRequest): Promise<AgentConfig> {
    const response = await client.put<AgentConfig>(`/agents-config/${agentId}`, data)
    return response.data
  },

  // 删除 Agent
  async deleteAgentConfig(agentId: string): Promise<{ success: boolean }> {
    const response = await client.delete<{ success: boolean }>(`/agents-config/${agentId}`)
    return response.data
  },

  // 测试 Agent 模型连接
  async testAgentConnection(agentId: string): Promise<TestConnectionResponse> {
    const response = await client.post<TestConnectionResponse>(`/agents-config/${agentId}/test`)
    return response.data
  },

  // 临时测试连接（不保存）
  async testConnectionTemp(data: {
    provider_type: ProviderType
    api_key: string
    model_id: string
    base_url?: string
  }): Promise<TestConnectionResponse> {
    const response = await client.post<TestConnectionResponse>('/agents-config/test-connection', {
      ...data,
      name: 'Test',
      role: 'Test',
      personality: 'Test',
      avatar_type: 'aiden',
      model_name: data.model_id,
    })
    return response.data
  },

  // 获取提供商类型列表
  async getProviderTypes(): Promise<{ types: ProviderTypeInfo[] }> {
    const response = await client.get('/agents-config/provider-types')
    return response.data
  },

  // 获取推荐模型列表
  async getProviderModels(): Promise<{ models: Record<string, ProviderModel[]> }> {
    const response = await client.get('/agents-config/provider-models')
    return response.data
  },

  // ========== 系统 API ==========

  // 重新初始化系统（在 Agent 变更后调用）
  async reinitializeSystem(): Promise<{ success: boolean; message: string; agent_count: number }> {
    const response = await client.post('/system/reinitialize')
    return response.data
  },
}

// Provider 类型信息
export interface ProviderTypeInfo {
  id: ProviderType
  name: string
  description: string
  required_fields: string[]
  optional_fields?: string[]
  default_base_url?: string
}

// 提供商模型
export interface ProviderModel {
  id: string
  name: string
  description: string
}
