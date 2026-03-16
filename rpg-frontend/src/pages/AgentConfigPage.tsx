import { useState, useEffect } from 'react'
import type { AgentConfig, ProviderType } from '../types'
import { api, ProviderTypeInfo, ProviderModel } from '../api'

interface AgentFormData {
  name: string
  role: string
  personality: string
  provider_type: ProviderType
  model_id: string
  model_name: string
  api_key: string
  base_url: string
}

const initialFormData: AgentFormData = {
  name: '',
  role: '',
  personality: '',
  provider_type: 'dashscope',
  model_id: '',
  model_name: '',
  api_key: '',
  base_url: '',
}

export const AgentConfigPage = () => {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [formData, setFormData] = useState<AgentFormData>(initialFormData)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [reinitializing, setReinitializing] = useState(false)
  const [providerTypes, setProviderTypes] = useState<ProviderTypeInfo[]>([])
  const [providerModels, setProviderModels] = useState<Record<string, ProviderModel[]>>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    console.log('Loading agent data...')
    setLoading(true)

    // 独立加载每个数据，一个失败不影响其他
    try {
      const agentsRes = await api.getAgentConfigs(true)
      console.log('Loaded agents:', agentsRes)
      setAgents(agentsRes)
    } catch (error) {
      console.error('Failed to load agents:', error)
      alert('加载 Agent 列表失败')
    }

    try {
      const typesRes = await api.getProviderTypes()
      console.log('Loaded provider types:', typesRes.types)
      setProviderTypes(typesRes.types)
    } catch (error) {
      console.error('Failed to load provider types:', error)
    }

    try {
      const modelsRes = await api.getProviderModels()
      console.log('Loaded provider models:', modelsRes.models)
      setProviderModels(modelsRes.models)
    } catch (error) {
      console.error('Failed to load provider models:', error)
    }

    setLoading(false)
  }

  const handleAddClick = () => {
    setEditingAgent(null)
    setFormData(initialFormData)
    setTestResult(null)
    setShowForm(true)
  }

  const handleEditClick = (agent: AgentConfig) => {
    setEditingAgent(agent)
    setFormData({
      name: agent.name,
      role: agent.role,
      personality: agent.personality,
      provider_type: agent.provider_type,
      model_id: agent.model_id,
      model_name: agent.model_name,
      api_key: '', // Don't show existing API key
      base_url: agent.base_url,
    })
    setTestResult(null)
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingAgent(null)
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
      const result = await api.testConnectionTemp({
        provider_type: formData.provider_type,
        api_key: formData.api_key,
        model_id: formData.model_id,
        base_url: formData.base_url || undefined,
      })
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name || !formData.role || !formData.api_key || !formData.model_id) {
      alert('请填写所有必填字段')
      return
    }

    // 根据提供商类型处理 base_url
    let baseUrl = formData.base_url
    if (formData.provider_type === 'dashscope') {
      // DashScope 使用默认 URL（OpenAI 兼容模式）
      baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    } else if ((formData.provider_type === 'anthropic' || formData.provider_type === 'custom') && !formData.base_url) {
      alert('Anthropic 协议和自定义提供商需要填写 Base URL')
      return
    }

    const saveData = {
      name: formData.name,
      role: formData.role,
      personality: formData.personality,
      provider_type: formData.provider_type,
      model_id: formData.model_id,
      model_name: formData.model_name || formData.model_id,
      api_key: formData.api_key,
      base_url: baseUrl,
      is_active: true,
    }

    console.log('Saving agent data:', saveData)
    setSaving(true)
    try {
      if (editingAgent) {
        await api.updateAgentConfig(editingAgent.id, saveData)
      } else {
        const result = await api.createAgentConfig(saveData)
        console.log('Agent created:', result)
      }
      // 重新加载数据
      await loadData()
      // 自动重新初始化系统以加载新 Agent
      try {
        await api.reinitializeSystem()
        console.log('System reinitialized successfully')
      } catch (reinitError) {
        console.warn('System reinitialization failed:', reinitError)
        // 不影响保存成功的提示
      }
      // 通知 App.tsx 刷新 agents 列表
      window.dispatchEvent(new CustomEvent('agentUpdated'))
      handleCloseForm()
      alert('保存成功')
    } catch (error: any) {
      console.error('Failed to save agent:', error)
      const errorMsg = error.response?.data?.detail || error.message || '保存失败'
      alert(`保存失败: ${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (agentId: string) => {
    if (!confirm('确定要删除这个 Agent 吗？')) return

    try {
      await api.deleteAgentConfig(agentId)
      await loadData()
      // 删除后重新初始化系统
      try {
        await api.reinitializeSystem()
        console.log('System reinitialized after deletion')
      } catch (reinitError) {
        console.warn('System reinitialization failed:', reinitError)
      }
      // 通知 App.tsx 刷新 agents 列表
      window.dispatchEvent(new CustomEvent('agentUpdated'))
    } catch (error) {
      console.error('Failed to delete agent:', error)
      alert('删除失败')
    }
  }

  const handleReinitialize = async () => {
    if (!confirm('重新初始化系统会重新加载所有 Agent 配置，确定继续吗？')) return

    setReinitializing(true)
    try {
      const result = await api.reinitializeSystem()
      alert(`系统已重新初始化，共加载 ${result.agent_count} 个 Agent`)
    } catch (error) {
      console.error('Failed to reinitialize:', error)
      alert('重新初始化失败')
    } finally {
      setReinitializing(false)
    }
  }

  // 默认提供商类型（备用）
  const defaultProviderTypes: ProviderTypeInfo[] = [
    { id: 'dashscope', name: '阿里云 DashScope', description: '阿里云大模型服务平台', required_fields: ['api_key', 'model_id'] },
    { id: 'anthropic', name: 'Anthropic 协议', description: '支持 Anthropic Claude API 协议的模型', required_fields: ['api_key', 'base_url', 'model_id'] },
    { id: 'openai', name: 'OpenAI', description: 'OpenAI 官方 API', required_fields: ['api_key', 'model_id'], optional_fields: ['base_url'] },
    { id: 'custom', name: '自定义 OpenAI 兼容', description: '任何 OpenAI 兼容的 API 服务', required_fields: ['api_key', 'base_url', 'model_id'] },
  ]

  const effectiveProviderTypes = providerTypes.length > 0 ? providerTypes : defaultProviderTypes
  const currentType = effectiveProviderTypes.find(t => t.id === formData.provider_type)
  const currentModels = providerModels[formData.provider_type] || []

  if (loading) {
    return <div className="providers-page loading">加载中...</div>
  }

  return (
    <div className="providers-page">
      <div className="providers-header">
        <h2>Agent 配置 {agents.length > 0 && <span style={{ fontSize: '14px', color: '#666' }}>({agents.length} 个)</span>}</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="test-btn"
            onClick={handleReinitialize}
            disabled={reinitializing}
          >
            {reinitializing ? '初始化中...' : '🔄 重新初始化系统'}
          </button>
          <button className="add-btn" onClick={handleAddClick}>
            + 添加 Agent
          </button>
        </div>
      </div>

      <div className="tab-description">
        <p>
          每个 Agent 可以独立配置模型、API 密钥、角色和性格。
          系统启动时会自动加载所有启用的 Agent。
        </p>
      </div>

      <div className="providers-list">
        {agents.length === 0 ? (
          <div className="empty-state">
            <p>还没有配置任何 Agent</p>
            <button className="add-btn" onClick={handleAddClick}>
              添加第一个 Agent
            </button>
          </div>
        ) : (
          agents.map(agent => (
            <div
              key={agent.id}
              className={`provider-card ${agent.is_active ? 'active' : ''}`}
            >
              <div className="provider-info">
                <div className="provider-header">
                  <h4>
                    🤖 {agent.name}
                  </h4>
                  {agent.is_active && <span className="active-badge">已启用</span>}
                </div>
                <div className="provider-details">
                  <span className="provider-type">{agent.role}</span>
                  <span className="model-name">
                    {agent.provider_type === 'dashscope' ? 'DashScope' :
                     agent.provider_type === 'anthropic' ? 'Anthropic' :
                     agent.provider_type === 'openai' ? 'OpenAI' : 'Custom'} / {agent.model_name || agent.model_id}
                  </span>
                </div>
                <div className="provider-meta">
                  <span>性格: {agent.personality.slice(0, 30)}...</span>
                </div>
              </div>
              <div className="provider-actions">
                <button
                  className="edit-btn"
                  onClick={() => handleEditClick(agent)}
                >
                  编辑
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(agent.id)}
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
              <h3>{editingAgent ? '编辑 Agent' : '添加 Agent'}</h3>
              <button className="close-btn" onClick={handleCloseForm}>×</button>
            </div>

            <div className="modal-body">
              {/* 基本信息 */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>基本信息</h4>

                <div className="form-group">
                  <label>Agent 名称 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：狗哥"
                  />
                </div>

                <div className="form-group">
                  <label>角色 *</label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    placeholder="例如：技术专家"
                  />
                </div>

                <div className="form-group">
                  <label>性格描述 *</label>
                  <textarea
                    value={formData.personality}
                    onChange={e => setFormData({ ...formData, personality: e.target.value })}
                    placeholder="描述这个 Agent 的性格特点..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      color: 'var(--pixel-text)',
                      background: 'rgba(99, 110, 114, 0.3)',
                      border: '2px solid var(--pixel-surface)',
                      borderRadius: '6px',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              {/* 模型配置 */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>模型配置</h4>

                <div className="form-group">
                  <label>模型提供商 *</label>
                  <select
                    value={formData.provider_type}
                    onChange={e => setFormData({ ...formData, provider_type: e.target.value as ProviderType })}
                  >
                    {effectiveProviderTypes.map(type => (
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

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>模型 ID *</label>
                    <input
                      type="text"
                      value={formData.model_id}
                      onChange={e => setFormData({ ...formData, model_id: e.target.value })}
                      placeholder="例如：qwen-max"
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label>模型显示名称（可选）</label>
                    <input
                      type="text"
                      value={formData.model_name}
                      onChange={e => setFormData({ ...formData, model_name: e.target.value })}
                      placeholder="留空使用模型ID"
                    />
                  </div>
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

                <div className="form-group">
                  <label>API Key *</label>
                  <input
                    type="password"
                    value={formData.api_key}
                    onChange={e => setFormData({ ...formData, api_key: e.target.value })}
                    placeholder={editingAgent ? '留空表示不修改' : '输入 API Key'}
                  />
                </div>

                {testResult && (
                  <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.success ? '✅' : '❌'} {testResult.message}
                  </div>
                )}
              </div>
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
