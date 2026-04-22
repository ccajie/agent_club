import { useState } from 'react'
import type { GameConfig } from '../game/config'
import { api } from '../api'

interface SceneSelectPageProps {
  config: GameConfig
  onSceneChange: (newConfig: GameConfig) => void
}

export const SceneSelectPage = ({ config, onSceneChange }: SceneSelectPageProps) => {
  const [saving, setSaving] = useState(false)
  const scenes = Object.entries(config.scenes)

  const handleSelect = async (sceneKey: string) => {
    if (sceneKey === config.currentScene) return
    setSaving(true)
    try {
      const updated = await api.updateCurrentScene(sceneKey)
      onSceneChange(updated)
    } catch (err) {
      console.error('Failed to switch scene:', err)
      alert('场景切换失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="providers-page">
      <div className="providers-header">
        <h2>场景切换</h2>
      </div>

      <div className="tab-description">
        <p>选择已配置的场景，切换后聊天页面将自动加载新场景。</p>
      </div>

      <div className="providers-list">
        {scenes.length === 0 ? (
          <div className="empty-state">
            <p>暂无配置的场景</p>
          </div>
        ) : (
          scenes.map(([key, scene]) => {
            const isActive = key === config.currentScene
            return (
              <div
                key={key}
                className={`provider-card ${isActive ? 'active' : ''}`}
                style={{
                  borderColor: isActive ? '#00b894' : 'var(--pixel-surface)',
                  cursor: 'pointer',
                }}
                onClick={() => !saving && handleSelect(key)}
              >
                <div className="provider-info">
                  <div className="provider-header">
                    <h4>{key}</h4>
                    {isActive && (
                      <span className="active-badge">当前场景</span>
                    )}
                  </div>
                  <div className="provider-details">
                    <span className="provider-type">地图: {scene.mapPath.split('/').pop()}</span>
                    <span className="model-name">图层: {scene.layers.length} 个</span>
                  </div>
                  <div className="provider-meta">
                    Tileset: {scene.tilesetName}
                  </div>
                </div>
                <div className="provider-actions">
                  {!isActive && (
                    <button className="edit-btn" disabled={saving}>
                      {saving ? '切换中...' : '切换'}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
