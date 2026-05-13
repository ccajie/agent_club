import { useState, useEffect } from 'react'
import type { Provider, ProviderType } from '../types'
import { api, ProviderTypeInfo, ProviderModel } from '../api'

interface ProviderFormData {
  name: string
  provider_type: ProviderType
  model_id: string
  model_name: string
  api_key: string
  base_url: string
}

const initialFormData: ProviderFormData = {
  name: '',
  provider_type: 'dashscope',
  model_id: '',
  model_name: '',
  api_key: '',
  base_url: '',
}

const defaultProviderTypes: ProviderTypeInfo[] = [
  { id: 'dashscope', name: '阿里云 DashScope', description: '阿里云大模型服务平台', required_fields: ['api_key', 'model_id'] },
  { id: 'anthropic', name: 'Anthropic 协议', description: '支持 Anthropic Claude API 协议的模型', required_fields: ['api_key', 'base_url', 'model_id'] },
  { id: 'openai', name: 'OpenAI', description: 'OpenAI 官方 API', required_fields: ['api_key', 'model_id'], optional_fields: ['base_url'] },
  { id: 'custom', name: '自定义 OpenAI 兼容', description: '任何 OpenAI 兼容的 API 服务', required_fields: ['api_key', 'base_url', 'model_id'] },
  { id: 'kimicode', name: 'KimiCode', description: 'KimiCode 编程助手', required_fields: ['api_key', 'model_id'], optional_fields: ['base_url'] },
  { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek 深度求索 AI 大模型', required_fields: ['api_key', 'model_id'] },
]

const defaultModels: Record<string, ProviderModel[]> = {
  dashscope: [
    { id: 'qwen-max', name: '通义千问 Max', description: '最强性能' },
    { id: 'qwen-plus', name: '通义千问 Plus', description: '均衡选择' },
    { id: 'qwen-turbo', name: '通义千问 Turbo', description: '快速经济' },
  ],
  anthropic: [
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '最强性能' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: '均衡选择' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: '快速经济' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', description: '最强性能' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '高性能' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '经济选择' },
  ],
  custom: [
    { id: 'custom', name: '自定义模型', description: '输入任意模型ID' },
  ],
  kimicode: [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', description: '最强推理能力' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3', description: '通用对话模型' },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1', description: '推理/思考模型' },
  ],
}

export const ProviderConfigPage = () => {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [formData, setFormData] = useState<ProviderFormData>(initialFormData)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    console.log('Loading providers...')
    setLoading(true)
    try {
      const res = await api.getProviders()
      console.log('Loaded providers:', res)
      setProviders(res)
    } catch (error) {
      console.error('Failed to load providers:', error)
      alert('加载 Provider 列表失败')
    }
    setLoading(false)
  }

  const handleAddClick = () => {
    setEditingProvider(null)
    setFormData(initialFormData)
    setTestResult(null)
    setShowForm(true)
  }

  const handleEditClick = (provider: Provider) => {
    setEditingProvider(provider)
    setFormData({
      name: provider.name,
      provider_type: provider.provider_type,
      model_id: provider.model_id,
      model_name: provider.model_name,
      api_key: '', // Don't show existing API key
      base_url: provider.base_url,
    })
    setTestResult(null)
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingProvider(null)
    setFormData(initialFormData)
    setTestResult(null)
  }

  const handleTest = async () => {
    if (!formData.api_key) {
      alert('请先填写 API Key')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      // For new providers, use the test-connection endpoint
      // For existing providers, use the provider test endpoint
      let result
      if (editingProvider) {
        // Update provider temporarily and test
        await api.updateProvider(editingProvider.id, {
          ...formData,
          api_key: formData.api_key || undefined,
        })
        result = await api.testProvider(editingProvider.id)
      } else {
        result = await api.testConnectionTemp({
          provider_type: formData.provider_type,
          api_key: formData.api_key,
          model_id: formData.model_id,
          base_url: formData.base_url || undefined,
        })
      }
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name || !formData.api_key || !formData.model_id) {
      alert('请填写所有必填字段')
      return
    }

    // Process base_url based on provider type
    let baseUrl = formData.base_url
    if (formData.provider_type === 'dashscope') {
      baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    } else if ((formData.provider_type === 'anthropic' || formData.provider_type === 'custom') && !formData.base_url) {
      alert('Anthropic 协议和自定义提供商需要填写 Base URL')
      return
    }

    // For kimicode, if no base_url provided, use the default
    if (formData.provider_type === 'kimicode' && !baseUrl) {
      baseUrl = 'https://api.kimi.com/coding'
    }

    const saveData = {
      name: formData.name,
      provider_type: formData.provider_type,
      model_id: formData.model_id,
      model_name: formData.model_name || formData.model_id,
      api_key: formData.api_key,
      base_url: baseUrl,
    }

    console.log('Saving provider data:', saveData)
    setSaving(true)
    try {
      if (editingProvider) {
        await api.updateProvider(editingProvider.id, saveData)
      } else {
        await api.createProvider(saveData)
      }
      await loadData()
      handleCloseForm()
      alert('保存成功')
    } catch (error: any) {
      console.error('Failed to save provider:', error)
      const errorMsg = error.response?.data?.detail || error.message || '保存失败'
      alert(`保存失败: ${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (providerId: string) => {
    if (!confirm('确定要删除这个 Provider 吗？\n注意：正在使用此 Provider 的 Agent 将无法正常工作。')) return

    try {
      await api.deleteProvider(providerId)
      await loadData()
    } catch (error) {
      console.error('Failed to delete provider:', error)
      alert('删除失败')
    }
  }

  const currentType = defaultProviderTypes.find(t => t.id === formData.provider_type)
  const currentModels = defaultModels[formData.provider_type] || []

  if (loading) {
    return <div className="providers-page loading">加载中...</div>
  }

  return (
    <div className="providers-page">
      <div className="providers-header">
        <h2>Provider 配置 {providers.length > 0 && <span style={{ fontSize: '14px', color: '#666' }}>({providers.length} 个)</span>}</h2>
        <button className="add-btn" onClick={handleAddClick}>
          + 添加 Provider
        </button>
      </div>

      <div className="tab-description">
        <p>
          Provider 是模型服务的配置，包含 API 密钥、模型 ID 等信息。
          配置好的 Provider 可以被多个 Agent 共享使用。
        </p>
      </div>

      <div className="providers-list">
        {providers.length === 0 ? (
          <div className="empty-state">
            <p>还没有配置任何 Provider</p>
            <button className="add-btn" onClick={handleAddClick}>
              添加第一个 Provider
            </button>
          </div>
        ) : (
          providers.map(provider => (
            <div
              key={provider.id}
              className={`provider-card ${provider.is_active ? 'active' : ''}`}
            >
              <div className="provider-info">
                <div className="provider-header">
                  <h4>{provider.name}</h4>
                  {provider.is_active && <span className="active-badge">活跃</span>}
                </div>
                <div className="provider-details">
                  <span className="provider-type">
                    {provider.provider_type === 'dashscope' ? 'DashScope' :
                     provider.provider_type === 'anthropic' ? 'Anthropic' :
                     provider.provider_type === 'openai' ? 'OpenAI' :
                     provider.provider_type === 'kimicode' ? 'KimiCode' :
                     provider.provider_type === 'deepseek' ? 'DeepSeek' : 'Custom'}
                  </span>
                  <span className="model-name">{provider.model_name || provider.model_id}</span>
                </div>
                <div className="provider-meta">
                  <span>Base URL: {provider.base_url || '默认'}</span>
                </div>
              </div>
              <div className="provider-actions">
                <button
                  className="edit-btn"
                  onClick={() => handleEditClick(provider)}
                >
                  编辑
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(provider.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>{editingProvider ? '编辑 Provider' : '添加 Provider'}</h3>
              <button className="close-btn" onClick={handleCloseForm}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>显示名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：阿里云 DashScope"
                />
                <span className="hint">给这个 Provider 起个名字，方便识别</span>
              </div>

              <div className="form-group">
                <label>提供商类型 *</label>
                <select
                  value={formData.provider_type}
                  onChange={e => setFormData({ ...formData, provider_type: e.target.value as ProviderType })}
                >
                  {defaultProviderTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <span className="hint">{currentType?.description}</span>
              </div>

              {/* 推荐模型 */}
              {currentModels.length > 0 && (
                <div className="form-group">
                  <label>推荐模型</label>
                  <div className="supported-models">
                    {currentModels.map(model => (
                      <span
                        key={model.id}
                        className="model-tag"
                        onClick={() => setFormData({ ...formData, model_id: model.id, model_name: model.name })}
                        style={{
                          cursor: 'pointer',
                          background: formData.model_id === model.id ? 'var(--pixel-accent)' : 'rgba(0, 184, 148, 0.2)',
                          color: formData.model_id === model.id ? 'white' : 'var(--pixel-accent)',
                        }}
                      >
                        {model.name}
                      </span>
                    ))}
                  </div>
                  <span className="hint">点击选择模型</span>
                </div>
              )}

              <div className="form-group">
                <label>模型 ID *</label>
                <input
                  type="text"
                  value={formData.model_id}
                  onChange={e => setFormData({ ...formData, model_id: e.target.value })}
                  placeholder="例如：qwen-max"
                />
              </div>

              <div className="form-group">
                <label>模型显示名称（可选）</label>
                <input
                  type="text"
                  value={formData.model_name}
                  onChange={e => setFormData({ ...formData, model_name: e.target.value })}
                  placeholder="留空使用模型ID"
                />
              </div>

              {/* Base URL 字段 - 根据提供商类型显示 */}
              {formData.provider_type === 'dashscope' && (
                <div className="form-group">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    disabled
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  />
                  <span className="hint">DashScope 使用默认 OpenAI 兼容模式地址</span>
                </div>
              )}
              {formData.provider_type === 'deepseek' && (
                <div className="form-group">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value="https://api.deepseek.com"
                    disabled
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  />
                  <span className="hint">DeepSeek 使用默认 API 地址</span>
                </div>
              )}
              {(formData.provider_type === 'anthropic' || formData.provider_type === 'custom') && (
                <div className="form-group">
                  <label>Base URL *</label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={e => setFormData({ ...formData, base_url: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                  <span className="hint">API 服务的基础地址（必填）</span>
                </div>
              )}
              {formData.provider_type === 'openai' && (
                <div className="form-group">
                  <label>Base URL（可选）</label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={e => setFormData({ ...formData, base_url: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                  <span className="hint">留空使用默认 OpenAI 地址</span>
                </div>
              )}
              {formData.provider_type === 'kimicode' && (
                <div className="form-group">
                  <label>Base URL（可选）</label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={e => setFormData({ ...formData, base_url: e.target.value })}
                    placeholder="https://api.kimi.com/coding"
                  />
                  <span className="hint">留空使用默认 KimiCode 地址 https://api.kimi.com/coding</span>
                </div>
              )}

              <div className="form-group">
                <label>API Key *</label>
                <input
                  type="password"
                  value={formData.api_key}
                  onChange={e => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder={editingProvider ? '留空表示不修改' : '输入 API Key'}
                />
              </div>

              {testResult && (
                <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="test-btn"
                onClick={handleTest}
                disabled={testing || !formData.api_key}
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <div className="footer-actions">
                <button className="cancel-btn" onClick={handleCloseForm}>
                  取消
                </button>
                <button
                  className="save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
