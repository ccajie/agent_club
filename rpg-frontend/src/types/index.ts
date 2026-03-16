// 类型定义

export type RobotStatus = 'idle' | 'thinking' | 'speaking'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: number
  isError?: boolean
}

export interface Document {
  id: string
  name: string
  md5: string
  partsCount: number
  size: number
  uploadedAt: string
}

export interface ChatResponse {
  answer: string
  sources?: string[]
}

export interface DocumentStats {
  totalFiles: number
  totalSize: number
}

// Phaser 场景回调接口
export interface ChatSceneCallbacks {
  onPlayerMessage: (text: string) => void
  onNPCAnimationComplete: () => void
}

// ========== 模型配置类型 ==========

export type ProviderType = 'dashscope' | 'openai' | 'anthropic' | 'custom'

export interface LLMConfig {
  provider: ProviderType
  model_id: string
  model_name: string
  api_key: string
  base_url: string
  api_key_prefix: string
  is_dashscope: boolean
  dashscope_model: string
}

export interface EmbeddingConfig {
  provider: ProviderType
  model_id: string
  model_name: string
  api_key: string
  base_url: string
  api_key_prefix: string
  is_dashscope: boolean
  dashscope_model: string
}

// 默认配置常量
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'dashscope',
  model_id: 'qwen-max',
  model_name: 'Qwen Max',
  api_key: '',
  base_url: '',
  api_key_prefix: 'sk-',
  is_dashscope: true,
  dashscope_model: 'qwen-max',
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: 'dashscope',
  model_id: 'text-embedding-v4',
  model_name: 'Text Embedding V4',
  api_key: '',
  base_url: '',
  api_key_prefix: 'sk-',
  is_dashscope: true,
  dashscope_model: 'text-embedding-v4',
}

export interface ModelConfig {
  llm: LLMConfig
  embedding: EmbeddingConfig
  version: string
}

export interface TestConnectionResponse {
  success: boolean
  message: string
}

export interface ProviderModel {
  id: string
  name: string
  description: string
}

// Provider 信息（新的 providers API）
export interface ProviderInfo {
  id: string
  name: string
  provider_type: 'dashscope' | 'anthropic'
  base_url: string
  api_key: string
  model_id: string
  model_name: string
  is_active: boolean
}

// Provider 支持的模型
export interface ProviderSupportedModel {
  id: string
  name: string
}

// Provider 类型信息
export interface ProviderTypeInfo {
  id: ProviderType
  name: string
  description: string
  required_fields: string[]
  optional_fields?: string[]
  supported_models?: ProviderSupportedModel[]
}
