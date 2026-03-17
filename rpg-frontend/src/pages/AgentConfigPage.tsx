import { useState, useEffect } from 'react'
import type { AgentConfig, Provider } from '../types'
import { api } from '../api'

interface AgentFormData {
  name: string
  role: string
  personality: string
  provider_id: string
  specialty: string
  expertise: string
}

interface ManagerFormData {
  name: string
  role: string
  personality: string
  provider_id: string
  is_active: boolean
}

const initialAgentFormData: AgentFormData = {
  name: '',
  role: '',
  personality: '',
  provider_id: '',
  specialty: '',
  expertise: '',
}

const initialManagerFormData: ManagerFormData = {
  name: '任务管理器',
  role: '项目协调经理',
  personality: '专业、有条理、善于规划和协调，能够准确分析需求并合理分配任务',
  provider_id: '',
  is_active: false,
}

export const AgentConfigPage = () => {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [manager, setManager] = useState<AgentConfig | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAgentForm, setShowAgentForm] = useState(false)
  const [showManagerForm, setShowManagerForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [agentFormData, setAgentFormData] = useState<AgentFormData>(initialAgentFormData)
  const [managerFormData, setManagerFormData] = useState<ManagerFormData>(initialManagerFormData)
  const [saving, setSaving] = useState(false)
  const [reinitializing, setReinitializing] = useState(false)
  const [testingManager, setTestingManager] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    console.log('Loading agent and provider data...')
    setLoading(true)

    // 加载 Agents (包含 Manager)
    try {
      const agentsRes = await api.getAgentConfigs(true)
      console.log('Loaded agents:', agentsRes)

      // 分离 Manager 和 Worker
      const managerAgent = agentsRes.find((a: AgentConfig) => a.id === 'manager_default')
      const workerAgents = agentsRes.filter((a: AgentConfig) => a.id !== 'manager_default')

      if (managerAgent) {
        setManager(managerAgent)
        setManagerFormData({
          name: managerAgent.name,
          role: managerAgent.role,
          personality: managerAgent.personality,
          provider_id: managerAgent.provider_id || '',
          is_active: managerAgent.is_active,
        })
      }
      setAgents(workerAgents)
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

  const handleAddAgentClick = () => {
    if (providers.length === 0) {
      alert('请先配置 Provider（模型），再创建 Agent')
      return
    }
    setEditingAgent(null)
    setAgentFormData({
      ...initialAgentFormData,
      provider_id: providers[0]?.id || '',
    })
    setShowAgentForm(true)
  }

  const handleEditAgentClick = (agent: AgentConfig) => {
    setEditingAgent(agent)
    setAgentFormData({
      name: agent.name,
      role: agent.role,
      personality: agent.personality,
      provider_id: agent.provider_id,
      specialty: agent.specialty || '',
      expertise: agent.expertise || '',
    })
    setShowAgentForm(true)
  }

  const handleEditManagerClick = () => {
    if (manager) {
      setManagerFormData({
        name: manager.name,
        role: manager.role,
        personality: manager.personality,
        provider_id: manager.provider_id || '',
        is_active: manager.is_active,
      })
    }
    setShowManagerForm(true)
  }

  const handleCloseAgentForm = () => {
    setShowAgentForm(false)
    setEditingAgent(null)
    setAgentFormData(initialAgentFormData)
  }

  const handleCloseManagerForm = () => {
    setShowManagerForm(false)
  }

  const handleSaveAgent = async () => {
    if (!agentFormData.name || !agentFormData.role || !agentFormData.personality || !agentFormData.provider_id) {
      alert('请填写所有必填字段')
      return
    }

    const saveData = {
      name: agentFormData.name,
      role: agentFormData.role,
      personality: agentFormData.personality,
      provider_id: agentFormData.provider_id,
      specialty: agentFormData.specialty,
      expertise: agentFormData.expertise,
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
      handleCloseAgentForm()
      alert('保存成功')
    } catch (error: any) {
      console.error('Failed to save agent:', error)
      const errorMsg = error.response?.data?.detail || error.message || '保存失败'
      alert(`保存失败: ${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveManager = async () => {
    if (!managerFormData.name || !managerFormData.role || !managerFormData.personality || !managerFormData.provider_id) {
      alert('请填写所有必填字段')
      return
    }

    console.log('Saving manager config:', managerFormData)
    setSaving(true)
    try {
      const result = await api.updateManagerConfig({
        name: managerFormData.name,
        role: managerFormData.role,
        personality: managerFormData.personality,
        provider_id: managerFormData.provider_id,
        is_active: managerFormData.is_active,
      })
      console.log('Save result:', result)

      // 重新加载数据
      await loadData()
      // 重新初始化系统
      try {
        await api.reinitializeSystem()
        console.log('System reinitialized successfully')
      } catch (reinitError) {
        console.warn('System reinitialization failed:', reinitError)
      }
      // 通知 App.tsx 刷新
      window.dispatchEvent(new CustomEvent('agentUpdated'))
      handleCloseManagerForm()
      alert('Manager 配置已保存')
    } catch (error: any) {
      console.error('Failed to save manager config:', error)
      alert(`保存失败: ${error.response?.data?.detail || error.message || '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleTestManager = async () => {
    if (!managerFormData.provider_id) {
      alert('请先选择 Provider')
      return
    }

    setTestingManager(true)
    try {
      // 先保存当前配置
      await api.updateManagerConfig({
        provider_id: managerFormData.provider_id,
      })
      // 然后测试
      const result = await api.testManagerConnection()
      alert(result.message)
    } catch (error: any) {
      alert('测试连接失败: ' + (error.response?.data?.detail || error.message))
    } finally {
      setTestingManager(false)
    }
  }

  const handleDeleteAgent = async (agentId: string) => {
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
        <h2>Agent 配置</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="test-btn"
            onClick={handleReinitialize}
            disabled={reinitializing}
          >
            {reinitializing ? '初始化中...' : '🔄 重新初始化系统'}
          </button>
          <button className="add-btn" onClick={handleAddAgentClick}>
            + 添加 Agent
          </button>
        </div>
      </div>

      <div className="tab-description">
        <p>
          配置 Manager（任务协调者）和 Worker Agents（任务执行者）。
          Manager 作为系统默认 Agent 不可删除，Worker Agents 可以自由创建和删除。
        </p>
      </div>

      {/* Manager Agent 区域 */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ marginBottom: '16px', color: 'var(--pixel-text)', fontSize: '18px' }}>
          👔 Manager Agent
          <span style={{ fontSize: '13px', color: '#666', marginLeft: '12px', fontWeight: 'normal' }}>
            任务协调者，不可删除
          </span>
        </h3>

        {manager ? (
          <div
            className={`provider-card ${manager.is_active ? 'active' : ''}`}
            style={{ borderColor: manager.is_active ? '#00b894' : 'var(--pixel-surface)' }}
          >
            <div className="provider-info">
              <div className="provider-header">
                <h4>{manager.name}</h4>
                {manager.is_active ? (
                  <span className="active-badge">已启用</span>
                ) : (
                  <span style={{
                    padding: '4px 10px',
                    background: '#636e72',
                    borderRadius: '4px',
                    color: 'var(--pixel-text)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>已停用</span>
                )}
              </div>
              <div className="provider-details">
                <span className="provider-type">{manager.role}</span>
                <span className="model-name">
                  使用: {manager.provider_id ? getProviderName(manager.provider_id) : '未配置'}
                </span>
              </div>
              <div className="provider-meta">
                <span>性格: {manager.personality.slice(0, 30)}...</span>
              </div>
              <div className="provider-meta" style={{ marginTop: '4px', color: '#00b894' }}>
                {manager.is_active
                  ? '✅ 启用后 Manager 将作为任务协调者，自动分派任务给 Workers'
                  : '⏸️ 停用后系统将使用传统 MsgHub 模式运行'}
              </div>
            </div>
            <div className="provider-actions">
              <button
                className="edit-btn"
                onClick={handleEditManagerClick}
              >
                配置
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '30px' }}>
            <p>正在加载 Manager 配置...</p>
          </div>
        )}
      </div>

      {/* Worker Agents 区域 */}
      <div>
        <h3 style={{ marginBottom: '16px', color: 'var(--pixel-text)', fontSize: '18px' }}>
          🛠️ Worker Agents
          <span style={{ fontSize: '13px', color: '#666', marginLeft: '12px', fontWeight: 'normal' }}>
            任务执行者 ({agents.length} 个)
          </span>
        </h3>

        <div className="providers-list">
          {agents.length === 0 ? (
            <div className="empty-state">
              <p>还没有配置任何 Worker Agent</p>
              {providers.length === 0 ? (
                <p style={{ color: '#999', fontSize: '14px', marginTop: '8px' }}>
                  请先前往 Provider 配置页面添加模型
                </p>
              ) : (
                <button className="add-btn" onClick={handleAddAgentClick}>
                  添加第一个 Worker
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
                    <h4>🤖 {agent.name}</h4>
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
                  {agent.specialty && (
                    <div className="provider-meta" style={{ marginTop: '4px' }}>
                      🎯 专长: {agent.specialty}
                    </div>
                  )}
                </div>
                <div className="provider-actions">
                  <button
                    className="edit-btn"
                    onClick={() => handleEditAgentClick(agent)}
                  >
                    编辑
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteAgent(agent.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Worker Agent Form Modal */}
      {showAgentForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>{editingAgent ? '编辑 Worker Agent' : '添加 Worker Agent'}</h3>
              <button className="close-btn" onClick={handleCloseAgentForm}>×</button>
            </div>

            <div className="modal-body">
              {/* 基本信息 */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>基本信息</h4>

                <div className="form-group">
                  <label>Agent 名称 *</label>
                  <input
                    type="text"
                    value={agentFormData.name}
                    onChange={e => setAgentFormData({ ...agentFormData, name: e.target.value })}
                    placeholder="例如：狗哥"
                  />
                </div>

                <div className="form-group">
                  <label>角色 *</label>
                  <input
                    type="text"
                    value={agentFormData.role}
                    onChange={e => setAgentFormData({ ...agentFormData, role: e.target.value })}
                    placeholder="例如：技术专家"
                  />
                </div>

                <div className="form-group">
                  <label>性格描述 *</label>
                  <textarea
                    value={agentFormData.personality}
                    onChange={e => setAgentFormData({ ...agentFormData, personality: e.target.value })}
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

              {/* 专长配置（可选） */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>专长配置（可选）</h4>

                <div className="form-group">
                  <label>专业领域</label>
                  <input
                    type="text"
                    value={agentFormData.specialty}
                    onChange={e => setAgentFormData({ ...agentFormData, specialty: e.target.value })}
                    placeholder="例如：数据分析、文案写作、代码开发"
                  />
                  <span className="hint">
                    描述这个 Agent 的主要专业方向，Manager 会根据此分派任务
                  </span>
                </div>

                <div className="form-group">
                  <label>专长描述</label>
                  <textarea
                    value={agentFormData.expertise}
                    onChange={e => setAgentFormData({ ...agentFormData, expertise: e.target.value })}
                    placeholder="详细描述这个 Agent 的专长..."
                    rows={2}
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
                  <span className="hint">
                    详细描述专长，帮助 Manager 更准确地分派任务
                  </span>
                </div>
              </div>

              {/* Provider 选择 */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>模型配置</h4>

                <div className="form-group">
                  <label>选择 Provider *</label>
                  <select
                    value={agentFormData.provider_id}
                    onChange={e => setAgentFormData({ ...agentFormData, provider_id: e.target.value })}
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

                {agentFormData.provider_id && (
                  <div className="provider-info-box" style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: 'rgba(0, 184, 148, 0.1)',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}>
                    {(() => {
                      const p = providers.find(pr => pr.id === agentFormData.provider_id)
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
                <button className="cancel-btn" onClick={handleCloseAgentForm}>
                  取消
                </button>
                <button
                  className="save-btn"
                  onClick={handleSaveAgent}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manager Config Modal */}
      {showManagerForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>配置 Manager Agent</h3>
              <button className="close-btn" onClick={handleCloseManagerForm}>×</button>
            </div>

            <div className="modal-body">
              {/* 启用开关 */}
              <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(0, 184, 148, 0.1)', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={managerFormData.is_active}
                    onChange={e => setManagerFormData({ ...managerFormData, is_active: e.target.checked })}
                    style={{ width: '20px', height: '20px' }}
                  />
                  <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--pixel-text)' }}>
                    启用 Manager Agent
                  </span>
                </label>
                <p style={{ marginTop: '8px', fontSize: '13px', color: 'rgba(223, 230, 233, 0.6)' }}>
                  启用后，Manager 将作为任务协调者，自动分派任务给 Worker Agents
                </p>
              </div>

              {/* 基本信息 */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>基本信息</h4>

                <div className="form-group">
                  <label>Manager 名称 *</label>
                  <input
                    type="text"
                    value={managerFormData.name}
                    onChange={e => setManagerFormData({ ...managerFormData, name: e.target.value })}
                    placeholder="例如：任务管理器"
                  />
                </div>

                <div className="form-group">
                  <label>角色 *</label>
                  <input
                    type="text"
                    value={managerFormData.role}
                    onChange={e => setManagerFormData({ ...managerFormData, role: e.target.value })}
                    placeholder="例如：项目协调经理"
                  />
                </div>

                <div className="form-group">
                  <label>性格描述 *</label>
                  <textarea
                    value={managerFormData.personality}
                    onChange={e => setManagerFormData({ ...managerFormData, personality: e.target.value })}
                    placeholder="描述 Manager 的性格特点..."
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

              {/* Provider 配置 */}
              <div className="form-section" style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--pixel-accent)' }}>模型配置</h4>

                <div className="form-group">
                  <label>选择 Provider *</label>
                  <select
                    value={managerFormData.provider_id}
                    onChange={e => setManagerFormData({ ...managerFormData, provider_id: e.target.value })}
                  >
                    <option value="">请选择 Provider</option>
                    {providers.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} - {provider.model_name || provider.model_id}
                      </option>
                    ))}
                  </select>
                  <span className="hint">选择用于 Manager 的语言模型</span>
                </div>

                {managerFormData.provider_id && (
                  <div className="provider-info-box" style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: 'rgba(0, 184, 148, 0.1)',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}>
                    {(() => {
                      const p = providers.find(pr => pr.id === managerFormData.provider_id)
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

                <div style={{ marginTop: '16px' }}>
                  <button
                    className="test-btn"
                    onClick={handleTestManager}
                    disabled={testingManager || !managerFormData.provider_id}
                  >
                    {testingManager ? '测试中...' : '测试连接'}
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <div className="footer-actions">
                <button className="cancel-btn" onClick={handleCloseManagerForm}>
                  取消
                </button>
                <button
                  className="save-btn"
                  onClick={handleSaveManager}
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
