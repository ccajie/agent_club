import axios from 'axios'
import type {
  ChatResponse,
  // Document,  // RAG 功能已禁用
  // DocumentStats,  // RAG 功能已禁用
  ModelConfig,
  LLMConfig,
  EmbeddingConfig,
  TestConnectionResponse,
  ProviderInfo,
  ProviderTypeInfo
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
  // 聊天
  async chat(message: string): Promise<ChatResponse> {
    const response = await client.post<ChatResponse>('/chat', { message })
    return response.data
  },

  // RAG 相关 API 已注释
  /*
  // 上传文档
  async uploadDocument(file: File): Promise<{ success: boolean; message: string }> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await client.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  // 获取文档列表
  async getDocuments(): Promise<Document[]> {
    const response = await client.get<Document[]>('/docs')
    return response.data
  },

  // 删除文档
  async deleteDocument(docId: string): Promise<{ success: boolean }> {
    const response = await client.delete(`/docs/${docId}`)
    return response.data
  },

  // 获取统计信息
  async getStats(): Promise<DocumentStats> {
    const response = await client.get<DocumentStats>('/stats')
    return response.data
  },
  */

  // ========== 模型配置 API ==========

  // 获取模型配置
  async getModelConfig(): Promise<ModelConfig> {
    const response = await client.get<ModelConfig>('/models/config')
    return response.data
  },

  // 更新 LLM 配置
  async updateLLMConfig(config: LLMConfig): Promise<ModelConfig> {
    const response = await client.post<ModelConfig>('/models/config/llm', config)
    return response.data
  },

  // 更新 Embedding 配置
  async updateEmbeddingConfig(config: EmbeddingConfig): Promise<ModelConfig> {
    const response = await client.post<ModelConfig>('/models/config/embedding', config)
    return response.data
  },

  // 测试 LLM 连接
  async testLLMConnection(config?: LLMConfig): Promise<TestConnectionResponse> {
    const response = await client.post<TestConnectionResponse>('/models/test/llm', config || {})
    return response.data
  },

  // 测试 Embedding 连接
  async testEmbeddingConnection(config?: EmbeddingConfig): Promise<TestConnectionResponse> {
    const response = await client.post<TestConnectionResponse>('/models/test/embedding', config || {})
    return response.data
  },

  // ========== Providers API (新) ==========

  // 获取所有 providers
  async getProviders(): Promise<{ providers: ProviderInfo[]; active_provider_id: string | null }> {
    const response = await client.get<{ providers: ProviderInfo[]; active_provider_id: string | null }>('/providers')
    return response.data
  },

  // 获取 provider 类型
  async getProviderTypes(): Promise<{ types: ProviderTypeInfo[] }> {
    const response = await client.get('/providers/types')
    return response.data
  },

  // 创建 provider
  async createProvider(data: {
    provider_type: string
    name: string
    api_key: string
    base_url?: string
    model_id: string
    model_name: string
  }): Promise<ProviderInfo> {
    const response = await client.post<ProviderInfo>('/providers', data)
    return response.data
  },

  // 更新 provider
  async updateProvider(id: string, data: Partial<{
    name: string
    api_key: string
    base_url: string
    model_id: string
    model_name: string
  }>): Promise<ProviderInfo> {
    const response = await client.put<ProviderInfo>(`/providers/${id}`, data)
    return response.data
  },

  // 删除 provider
  async deleteProvider(id: string): Promise<{ success: boolean }> {
    const response = await client.delete(`/providers/${id}`)
    return response.data
  },

  // 测试 provider 连接
  async testProviderConnection(data: {
    provider_type: string
    api_key: string
    base_url?: string
    model_id: string
  }): Promise<TestConnectionResponse> {
    // 使用临时测试端点，不需要 provider ID
    const response = await client.post<TestConnectionResponse>('/providers/test-connection', data)
    return response.data
  },

  // 设置激活的 provider
  async setActiveProvider(providerId: string): Promise<{ success: boolean; active_provider: ProviderInfo | null }> {
    const response = await client.post('/providers/active', { provider_id: providerId })
    return response.data
  },

  // 获取当前激活的 provider
  async getActiveProvider(): Promise<{ active_provider: ProviderInfo | null }> {
    const response = await client.get('/providers/active')
    return response.data
  },

  // 重新初始化系统（在 provider 变更后调用）
  async reinitializeSystem(): Promise<{ success: boolean; message: string }> {
    const response = await client.post('/system/reinitialize')
    return response.data
  },

  // ========== Embedding Provider API ==========

  // 获取当前激活的 embedding provider
  async getEmbeddingProvider(): Promise<{ embedding_provider: ProviderInfo | null }> {
    const response = await client.get('/providers/embedding')
    return response.data
  },

  // 设置激活的 embedding provider
  async setEmbeddingProvider(providerId: string): Promise<{ success: boolean; embedding_provider: ProviderInfo | null }> {
    const response = await client.post('/providers/embedding', { provider_id: providerId })
    return response.data
  },

  // 获取 embedding provider 类型
  async getEmbeddingProviderTypes(): Promise<{ types: ProviderTypeInfo[] }> {
    const response = await client.get('/providers/embedding/types')
    return response.data
  },
}
