import { useState, useEffect } from 'react'
import type { AgentConfig, Provider } from '../types'
import { api } from '../api'

interface AgentFormData {
  name: string
  role: string
  personality: string
  provider_id: string
}

const initialFormData: AgentFormData = {
  name: '',
  role: '',
  personality: '',
  provider_id: '',
}

export const AgentConfigPage = () => {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [formData, setFormData] = useState<AgentFormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [reinitializing, setReinitializing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    console.log('Loading agent and provider data...')
    setLoading(true)

    // 加载 Agents
    try {
      const agentsRes = await api.getAgentConfigs(true)
      console.log('Loaded agents:', agentsRes)
      setAgents(agentsRes)
    } catch (error) {
      console.error('Failed to load agents:', error)
      alert('加载 Agent 列表失败')
    }

    // 加载 Providers
    try {
      const providersRes = await api.getProviders()
      console.log('Loaded providers:', providersRes)
      setProviders(providersRes)
    } catch (error) {
      console.error('Failed to load providers:', error)
      alert('加载 Provider 列表失败，请先配置 Provider')
    }

    setLoading(false)
  }

  const handleAddClick = () => {
    if (providers.length === 0) {
      alert('请先配置 Provider（模型），再创建 Agent')
      return
    }
    setEditingAgent(null)
    setFormData({
      ...initialFormData,
      provider_id: providers[0]?.id || '',
    })
    setShowForm(true)
  }

  const handleEditClick = (agent: AgentConfig) => {
    setEditingAgent(agent)
    setFormData({
      name: agent.name,
      role: agent.role,
      personality: agent.personality,
      provider_id: agent.provider_id,
    })
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingAgent(null)
    setFormData(initialFormData)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.role || !formData.personality || !formData.provider_id) {
      alert('请填写所有必填字段')
      return
    }

    const saveData = {
      name: formData.name,
      role: formData.role,
      personality: formData.personality,
      provider_id: formData.provider_id,
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

  const getProviderName = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId)
    return provider ? `${provider.name} (${provider.model_name || provider.model_id})` : providerId
  }

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
          每个 Agent 需要配置名称、角色、性格，并选择一个已配置的 Provider（模型）。
          系统启动时会自动加载所有启用的 Agent。
        </p>
      </div>

      <div className="providers-list">
        {agents.length === 0 ? (
          <div className="empty-state">
            <p>还没有配置任何 Agent</p>
            {providers.length === 0 ? (
              <p style={{ color: '#999', fontSize: '14px', marginTop: '8px' }}>
                请先前往 Provider 配置页面添加模型
              </p>
            ) : (
              <button className="add-btn" onClick={handleAddClick}>
                添加第一个 Agent
              </button>
            )}
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
                    使用: {getProviderName(agent.provider_id)}
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
          <div className="modal" style={{ maxWidth: '500px' }}>
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

              {/* Provider 选择 */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>模型配置</h4>

                <div className="form-group">
                  <label>选择 Provider *</label>
                  <select
                    value={formData.provider_id}
                    onChange={e => setFormData({ ...formData, provider_id: e.target.value })}
                  >
                    <option value="">请选择 Provider</option>
                    {providers.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} - {provider.model_name || provider.model_id}
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    Provider 包含模型配置和 API 密钥，请在 Provider 配置页面管理
                  </span>
                </div>

                {formData.provider_id && (
                  <div className="provider-info-box" style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: 'rgba(0, 184, 148, 0.1)',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}>
                    {(() => {
                      const p = providers.find(pr => pr.id === formData.provider_id)
                      return p ? (
                        <>
                          <div><strong>类型:</strong> {p.provider_type}</div>
                          <div><strong>模型:</strong> {p.model_name || p.model_id}</div>
                          <div><strong>Base URL:</strong> {p.base_url || '默认'}</div>
                        </>
                      ) : null
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
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
