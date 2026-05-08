/**
 * 登录/注册页面
 */
import { useState } from 'react'
import { api } from '../api'
import { TilemapBackground } from '../components/TilemapBackground'

interface LoginPageProps {
  onLoginSuccess: (user: { id: string; username: string; nickname: string }) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let result
      if (mode === 'login') {
        result = await api.login(username, password)
      } else {
        result = await api.register(username, password, nickname)
      }

      if (result.success && result.user) {
        onLoginSuccess(result.user)
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || '操作失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <TilemapBackground
        mapPath="/assets/maps/library.tmj"
        tilesetPath="/assets/maps/libmap.png"
      />
      <div className="login-bg-overlay" />
      <div className="login-card">
        <div className="login-header">
          <h1>Agent Club</h1>
          <p>多智能体 RPG 协作平台</p>
        </div>

        <div className="login-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError('') }}
          >
            登录
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError('') }}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
              required
              minLength={2}
            />
          </div>

          {mode === 'register' && (
            <div className="form-field">
              <label>昵称（可选）</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="显示名称，不填则使用用户名"
              />
            </div>
          )}

          <div className="form-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              minLength={4}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <div className="login-footer">
          <a href="#" onClick={(e) => { e.preventDefault(); /* 跳转广场 */ }}>
            浏览作品广场（无需登录）
          </a>
        </div>
      </div>
    </div>
  )
}
