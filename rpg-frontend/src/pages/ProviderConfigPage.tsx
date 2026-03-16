import { useState, useEffect } from 'react'
import type { ProviderInfo, ProviderType, ProviderTypeInfo } from '../types'
import { api } from '../api'

type ConfigTab = 'chat' | 'embedding'

interface ProviderFormData {
  name: string
  provider_type: ProviderType
  api_key: string
  base_url: string
  model_id: string
  model_name: string
}

const initialFormData: ProviderFormData = {
  name: '',
  provider_type: 'dashscope',
  api_key: '',
  base_url: '',
  model_id: '',
  model_name: '',
}

export const ProviderConfigPage = () => {
  const [activeTab, setActiveTab] = useState<ConfigTab>('chat')

  // Chat providers state
  const [chatProviders, setChatProviders] = useState<ProviderInfo[]>([])
  const [, setActiveChatProviderId] = useState<string | null>(null)
  const [chatProviderTypes, setChatProviderTypes] = useState<ProviderTypeInfo[]>([])

  // Embedding providers state
  const [embeddingProviders, setEmbeddingProviders] = useState<ProviderInfo[]>([])
  const [activeEmbeddingId, setActiveEmbeddingId] = useState<string | null>(null)
  const [embeddingProviderTypes, setEmbeddingProviderTypes] = useState<ProviderTypeInfo[]>([])

  // Common state
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ProviderInfo | null>(null)
  const [formData, setFormData] = useState<ProviderFormData>(initialFormData)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [
        providersRes,
        typesRes,
        embeddingTypesRes,
      ] = await Promise.all([
        api.getProviders(),
        api.getProviderTypes(),
        api.getEmbeddingProviderTypes(),
      ])

      // Set chat providers
      setChatProviders(providersRes.providers)
      setActiveChatProviderId(providersRes.active_provider_id)
      setChatProviderTypes(typesRes.types)

      // Set embedding providers (only dashscope providers can be used for embedding)
      const dashscopeProviders = providersRes.providers.filter(
        p => p.provider_type === 'dashscope'
      )
      setEmbeddingProviders(dashscopeProviders)
      setEmbeddingProviderTypes(embeddingTypesRes.types)

      // Get active embedding provider
      const embeddingRes = await api.getEmbeddingProvider()
      if (embeddingRes.embedding_provider) {
        setActiveEmbeddingId(embeddingRes.embedding_provider.id)
      }
    } catch (error) {
      console.error('Failed to load providers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddClick = () => {
    setEditingProvider(null)
    // When adding embedding provider, default to dashscope
    const defaultFormData = activeTab === 'embedding'
      ? { ...initialFormData, provider_type: 'dashscope' as ProviderType }
      : initialFormData
    setFormData(defaultFormData)
    setTestResult(null)
    setShowForm(true)
  }

  const handleEditClick = (provider: ProviderInfo) => {
    setEditingProvider(provider)
    setFormData({
      name: provider.name,
      provider_type: provider.provider_type as ProviderType,
      api_key: '', // Don't show existing API key
      base_url: provider.base_url,
      model_id: provider.model_id,
      model_name: provider.model_name,
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
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.testProviderConnection({
        provider_type: formData.provider_type,
        api_key: formData.api_key,
        base_url: formData.base_url || undefined,
        model_id: formData.model_id,
      })
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!formData.api_key || !formData.model_id) {
      alert('请填写 API Key 和模型 ID')
      return
    }
    if (formData.provider_type === 'anthropic' && !formData.base_url) {
      alert('Anthropic 协议模型需要填写 Base URL')
      return
    }

    // 如果没有填写 name，使用 model_id 作为默认值
    const saveData = {
      ...formData,
      name: formData.name || `${formData.provider_type}-${formData.model_id}`,
      model_name: formData.model_name || formData.model_id,
    }

    setSaving(true)
    try {
      if (editingProvider) {
        await api.updateProvider(editingProvider.id, saveData)
      } else {
        await api.createProvider(saveData)
      }
      await loadData()
      handleCloseForm()
    } catch (error) {
      console.error('Failed to save provider:', error)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (providerId: string) => {
    if (!confirm('确定要删除这个模型配置吗？')) return

    try {
      await api.deleteProvider(providerId)
      await loadData()
      // 如果删除的是当前激活的 provider，需要重新初始化系统
      await api.reinitializeSystem()
    } catch (error) {
      console.error('Failed to delete provider:', error)
      alert('删除失败')
    }
  }

  const handleSetActiveChat = async (providerId: string) => {
    try {
      await api.setActiveProvider(providerId)
      await loadData()
      // 切换 provider 后重新初始化系统
      await api.reinitializeSystem()
      alert('已启用该对话模型配置')
    } catch (error) {
      console.error('Failed to set active provider:', error)
      alert('设置失败')
    }
  }

  const handleSetActiveEmbedding = async (providerId: string) => {
    try {
      await api.setEmbeddingProvider(providerId)
      await loadData()
      // 切换 embedding provider 后重新初始化系统
      await api.reinitializeSystem()
      alert('已启用该嵌入模型配置')
    } catch (error) {
      console.error('Failed to set active embedding provider:', error)
      alert('设置失败')
    }
  }

  const getCurrentProviderTypes = () => {
    return activeTab === 'chat' ? chatProviderTypes : embeddingProviderTypes
  }

  const getCurrentProviders = () => {
    return activeTab === 'chat' ? chatProviders : embeddingProviders
  }

  const isProviderActive = (provider: ProviderInfo) => {
    if (activeTab === 'chat') {
      return provider.is_active
    }
    return provider.id === activeEmbeddingId
  }

  const currentType = getCurrentProviderTypes().find(t => t.id === formData.provider_type)

  if (loading) {
    return <div className="providers-page loading">加载中...</div>
  }

  return (
    <div className="providers-page">
      <div className="providers-header">
        <h2>模型配置</h2>
        <button className="add-btn" onClick={handleAddClick}>
          + 添加模型
        </button>
      </div>

      {/* Tabs */}
      <div className="providers-tabs">
        <button
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          🤖 对话模型
        </button>
        <button
          className={`tab-btn ${activeTab === 'embedding' ? 'active' : ''}`}
          onClick={() => setActiveTab('embedding')}
        >
          📊 嵌入模型
        </button>
      </div>

      {/* Tab Description */}
      <div className="tab-description">
        {activeTab === 'chat' ? (
          <p>配置用于对话生成的语言模型（LLM），支持 DashScope 和 Anthropic 协议。</p>
        ) : (
          <p>配置用于文本嵌入的模型，用于知识库向量检索。目前仅支持 DashScope 嵌入模型。</p>
        )}
      </div>

      <div className="providers-list">
        {getCurrentProviders().length === 0 ? (
          <div className="empty-state">
            <p>还没有配置任何{activeTab === 'chat' ? '对话' : '嵌入'}模型</p>
            <button className="add-btn" onClick={handleAddClick}>
              添加第一个模型
            </button>
          </div>
        ) : (
          getCurrentProviders().map(provider => (
            <div
              key={provider.id}
              className={`provider-card ${isProviderActive(provider) ? 'active' : ''}`}
            >
              <div className="provider-info">
                <div className="provider-header">
                  <h4>{provider.name}</h4>
                  {isProviderActive(provider) && <span className="active-badge">使用中</span>}
                </div>
                <div className="provider-details">
                  <span className="provider-type">
                    {provider.provider_type === 'dashscope' ? 'DashScope' : 'Anthropic'}
                  </span>
                  <span className="model-name">{provider.model_name}</span>
                </div>
                <div className="provider-meta">
                  <span>Model ID: {provider.model_id}</span>
                </div>
              </div>
              <div className="provider-actions">
                {!isProviderActive(provider) && (
                  <button
                    className="activate-btn"
                    onClick={() =>
                      activeTab === 'chat'
                        ? handleSetActiveChat(provider.id)
                        : handleSetActiveEmbedding(provider.id)
                    }
                  >
                    启用
                  </button>
                )}
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
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingProvider
                  ? '编辑模型'
                  : `添加${activeTab === 'chat' ? '对话' : '嵌入'}模型`}
              </h3>
              <button className="close-btn" onClick={handleCloseForm}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>供应商类型</label>
                <select
                  value={formData.provider_type}
                  onChange={e => setFormData({ ...formData, provider_type: e.target.value as ProviderType })}
                  disabled={!!editingProvider || activeTab === 'embedding'}
                >
                  {getCurrentProviderTypes().map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <span className="hint">{currentType?.description}</span>
              </div>

              {/* Supported Models Hint for Embedding */}
              {activeTab === 'embedding' && currentType?.supported_models && (
                <div className="form-group">
                  <label>支持的模型</label>
                  <div className="supported-models">
                    {currentType.supported_models.map(model => (
                      <span
                        key={model.id}
                        className="model-tag"
                        onClick={() => setFormData({ ...formData, model_id: model.id })}
                        style={{ cursor: 'pointer' }}
                      >
                        {model.name}
                      </span>
                    ))}
                  </div>
                  <span className="hint">点击选择模型</span>
                </div>
              )}

              <div className="form-group">
                <label>配置名称（可选）</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="留空自动使用：供应商-模型ID"
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>模型名称（可选）</label>
                  <input
                    type="text"
                    value={formData.model_name}
                    onChange={e => setFormData({ ...formData, model_name: e.target.value })}
                    placeholder="留空自动使用模型ID"
                  />
                </div>
                <div className="form-group flex-1">
                  <label>模型 ID（API调用）*</label>
                  <input
                    type="text"
                    value={formData.model_id}
                    onChange={e => setFormData({ ...formData, model_id: e.target.value })}
                    placeholder={activeTab === 'chat' ? '例如：qwen-max' : '例如：text-embedding-v4'}
                  />
                </div>
              </div>

              {formData.provider_type === 'anthropic' && (
                <div className="form-group">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={e => setFormData({ ...formData, base_url: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                  <span className="hint">Anthropic 兼容 API 的基础地址</span>
                </div>
              )}

              <div className="form-group">
                <label>API Key</label>
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
