import { useState, useEffect } from 'react'
import type { Skill } from '../types'
import { api } from '../api'

export const SkillConfigPage = () => {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    loadSkills()
  }, [])

  const loadSkills = async () => {
    setLoading(true)
    try {
      const allSkills = await api.getSkills(true)
      setSkills(allSkills)
    } catch (error) {
      console.error('Failed to load skills:', error)
      alert('加载技能列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSkill = async (skill: Skill) => {
    try {
      const newEnabled = !skill.is_enabled
      await api.updateSkill(skill.name, newEnabled)
      // 更新本地状态
      setSkills(prev =>
        prev.map(s =>
          s.name === skill.name ? { ...s, is_enabled: newEnabled } : s
        )
      )
    } catch (error) {
      console.error('Failed to toggle skill:', error)
      alert('更新技能状态失败')
    }
  }

  const handleViewDetail = async (skill: Skill) => {
    setSelectedSkill(skill)
    setShowDetail(true)
    if (!skill.content) {
      setDetailLoading(true)
      try {
        const fullSkill = await api.getSkill(skill.name)
        setSelectedSkill(fullSkill)
      } catch (error) {
        console.error('Failed to load skill detail:', error)
      } finally {
        setDetailLoading(false)
      }
    }
  }

  const enabledCount = skills.filter(s => s.is_enabled).length

  if (loading) {
    return <div className="providers-page loading">加载中...</div>
  }

  return (
    <div className="providers-page">
      <div className="providers-header">
        <h2>技能管理</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="test-btn" onClick={loadSkills}>
            🔄 刷新
          </button>
        </div>
      </div>

      <div className="tab-description">
        <p>
          管理所有可用的技能（Skill）。技能以 Markdown 文件形式存放在 <code>skills/</code> 目录下，
          项目启动时会自动加载。启用/禁用技能以控制 Agent 能否使用它们。
          当前共 <strong>{skills.length}</strong> 个技能，其中 <strong style={{ color: '#00b894' }}>{enabledCount}</strong> 个已启用。
        </p>
      </div>

      <div className="providers-list">
        {skills.length === 0 ? (
          <div className="empty-state">
            <p>未找到任何技能文件</p>
            <p style={{ color: '#999', fontSize: '14px', marginTop: '8px' }}>
              请在 <code>skills/</code> 目录下添加 .md 格式的技能文件
            </p>
          </div>
        ) : (
          skills.map(skill => (
            <div
              key={skill.name}
              className={`provider-card ${skill.is_enabled ? 'active' : ''}`}
              style={{
                cursor: 'pointer',
                opacity: skill.is_enabled ? 1 : 0.7,
              }}
              onClick={() => handleViewDetail(skill)}
            >
              <div className="provider-info" style={{ flex: 1 }}>
                <div className="provider-header">
                  <h4>{skill.metadata?.emoji || ''} {skill.name}</h4>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={skill.is_enabled}
                        onChange={() => handleToggleSkill(skill)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      {skill.is_enabled ? (
                        <span style={{ color: '#00b894' }}>已启用</span>
                      ) : (
                        <span style={{ color: '#636e72' }}>已禁用</span>
                      )}
                    </label>
                  </div>
                </div>
                <div className="provider-details">
                  <span className="provider-type">{skill.name}</span>
                  {skill.metadata?.version && (
                    <span className="model-name">v{skill.metadata.version}</span>
                  )}
                </div>
                <div className="provider-meta" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                  {skill.description || '暂无描述'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Skill Detail Modal */}
      {showDetail && selectedSkill && (
        <div className="modal-overlay" onClick={() => setShowDetail(false)}>
          <div
            className="modal"
            style={{ maxWidth: '640px', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{selectedSkill.name}</h3>
              <button className="close-btn" onClick={() => setShowDetail(false)}>
                ×
              </button>
            </div>

            <div
              className="modal-body"
              style={{ overflowY: 'auto', maxHeight: '60vh' }}
            >
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '16px',
                      padding: '12px',
                      background: selectedSkill.is_enabled
                        ? 'rgba(0, 184, 148, 0.1)'
                        : 'rgba(99, 110, 114, 0.15)',
                      borderRadius: '8px',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkill.is_enabled}
                        onChange={() => {
                          handleToggleSkill(selectedSkill)
                          setSelectedSkill({
                            ...selectedSkill,
                            is_enabled: !selectedSkill.is_enabled,
                          })
                        }}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <span style={{ color: selectedSkill.is_enabled ? '#00b894' : '#636e72' }}>
                        {selectedSkill.is_enabled ? '已启用' : '已禁用'}
                      </span>
                    </label>
                    <span style={{ color: '#666', fontSize: '13px' }}>
                      {selectedSkill.metadata?.version && `v${selectedSkill.metadata.version}`}
                    </span>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ color: 'var(--pixel-accent)', marginBottom: '8px', fontSize: '14px' }}>
                      使用说明（面向 LLM）
                    </h4>
                    <div
                      style={{
                        padding: '12px',
                        background: 'rgba(99, 110, 114, 0.1)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        lineHeight: '1.7',
                        color: 'var(--pixel-text)',
                      }}
                    >
                      {selectedSkill.description || '暂无描述'}
                    </div>
                  </div>

                  {selectedSkill.content && (
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ color: 'var(--pixel-accent)', marginBottom: '8px', fontSize: '14px' }}>
                        技能内容
                      </h4>
                      <pre
                        style={{
                          padding: '16px',
                          background: 'rgba(99, 110, 114, 0.15)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          lineHeight: '1.7',
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          overflow: 'auto',
                          color: 'var(--pixel-text)',
                        }}
                      >
                        {selectedSkill.content}
                      </pre>
                    </div>
                  )}

                  {!selectedSkill.content && selectedSkill.preview && (
                    <div>
                      <h4 style={{ color: 'var(--pixel-accent)', marginBottom: '8px', fontSize: '14px' }}>
                        预览
                      </h4>
                      <pre
                        style={{
                          padding: '16px',
                          background: 'rgba(99, 110, 114, 0.15)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          lineHeight: '1.7',
                          whiteSpace: 'pre-wrap',
                          color: 'var(--pixel-text)',
                        }}
                      >
                        {selectedSkill.preview}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowDetail(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
