import { useEffect, useRef, useState, useCallback } from 'react'
import Phaser from 'phaser'
import { ChatScene } from './game/ChatScene'
import { ChatInput } from './components/ChatInput'
import { ProviderConfigPage } from './pages/ProviderConfigPage'
import type { ChatMessage, RobotStatus } from './types'
import { api } from './api'

type Page = 'chat' | 'providers'

// 流式输出消息组件
function StreamingMessage({ content, isStreaming, onComplete }: {
  content: string
  isStreaming: boolean
  onComplete?: () => void
}) {
  const [displayText, setDisplayText] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    if (!isStreaming) {
      setDisplayText(content)
      return
    }

    indexRef.current = 0
    setDisplayText('')

    const stream = () => {
      if (indexRef.current < content.length) {
        setDisplayText(content.slice(0, indexRef.current + 1))
        indexRef.current++

        // 随机延迟模拟打字效果
        const delay = Math.random() * 30 + 10
        setTimeout(stream, delay)
      } else {
        onComplete?.()
      }
    }

    stream()
  }, [content, isStreaming])

  return <span>{displayText}{isStreaming && <span className="cursor">▋</span>}</span>
}

// 图标组件
const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const ModelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
)

function App() {
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<ChatScene | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [robotStatus, setRobotStatus] = useState<RobotStatus>('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentPage, setCurrentPage] = useState<Page>('chat')

  // 初始化 Phaser 游戏
  useEffect(() => {
    if (currentPage !== 'chat') return

    const gameContainer = document.getElementById('game-container')
    const width = gameContainer?.clientWidth || window.innerWidth / 2
    const height = gameContainer?.clientHeight || window.innerHeight

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: width,
      height: height,
      parent: 'game-container',
      pixelArt: true,
      backgroundColor: '#e8e8e8',
      scene: ChatScene,
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 } }
      }
    }

    gameRef.current = new Phaser.Game(config)

    // 获取场景引用
    const checkScene = setInterval(() => {
      const scene = gameRef.current?.scene.getScene('ChatScene') as ChatScene
      if (scene) {
        sceneRef.current = scene
        // 设置场景回调
        scene.setCallbacks({
          onPlayerMessage: handlePlayerMessage,
          onNPCAnimationComplete: () => setRobotStatus('idle')
        })
        clearInterval(checkScene)
      }
    }, 100)

    // 响应窗口大小变化
    const handleResize = () => {
      const gameContainer = document.getElementById('game-container')
      const width = gameContainer?.clientWidth || window.innerWidth / 2
      const height = gameContainer?.clientHeight || window.innerHeight
      gameRef.current?.scale.resize(width, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      clearInterval(checkScene)
      gameRef.current?.destroy(true)
      gameRef.current = null
      sceneRef.current = null
    }
  }, [currentPage])

  // 流式输出状态
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')

  // 处理玩家消息
  const handlePlayerMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return

    // 添加玩家消息到列表
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMessage])
    setIsProcessing(true)
    setRobotStatus('thinking')

    // 在场景中显示玩家对话气泡
    sceneRef.current?.showPlayerDialog(text)

    try {
      // 调用后端 API
      const response = await api.chat(text)

      // 切换到说话状态
      setRobotStatus('speaking')

      // 创建AI消息（初始为空，用于流式显示）
      const aiMessageId = (Date.now() + 1).toString()
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: response.answer,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, aiMessage])

      // 开始流式输出
      setStreamingId(aiMessageId)
      setStreamingContent(response.answer)

      // 在场景中显示NPC说话动画（不显示内容）
      const currentScene = sceneRef.current
      if (currentScene) {
        currentScene.showNPCDialog(response.answer, () => {
          setRobotStatus('idle')
          setIsProcessing(false)
        })
      } else {
        // 如果没有场景，直接结束
        setTimeout(() => {
          setRobotStatus('idle')
          setIsProcessing(false)
        }, 1000)
      }

    } catch (error: any) {
      console.error('Chat error:', error)

      // 提取详细错误信息
      let errorMessage = '抱歉，我遇到了一些问题...'
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error.message) {
        errorMessage = error.message
      }

      // 添加错误消息到列表
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'error',
        content: errorMessage,
        timestamp: Date.now(),
        isError: true
      }
      setMessages(prev => [...prev, errorMsg])

      // 显示错误信息并恢复状态
      setRobotStatus('idle')
      setIsProcessing(false)
    }
  }, [isProcessing])

  // 流式输出完成回调
  const handleStreamComplete = useCallback(() => {
    setStreamingId(null)
    setStreamingContent('')
    setRobotStatus('idle')
    setIsProcessing(false)
  }, [])

  // 同步机器人状态到场景
  useEffect(() => {
    sceneRef.current?.setRobotStatus(robotStatus)
  }, [robotStatus])

  return (
    <div className="app">
      {/* 侧边栏 */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>RAG Agent</h2>
        </div>
        <div className="sidebar-nav">
          <button
            className={`nav-item ${currentPage === 'chat' ? 'active' : ''}`}
            onClick={() => setCurrentPage('chat')}
          >
            <ChatIcon />
            <span>聊天</span>
          </button>
          <button
            className={`nav-item ${currentPage === 'providers' ? 'active' : ''}`}
            onClick={() => setCurrentPage('providers')}
          >
            <ModelIcon />
            <span>模型配置</span>
          </button>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="main-content">
        {currentPage === 'chat' && (
          <div className="chat-layout">
            {/* 左侧 - AI 机器人场景 */}
            <div className="scene-panel">
              <div id="game-container" className="game-container" />
            </div>

            {/* 右侧 - 聊天记录 */}
            <div className="chat-panel">
              <div className="chat-header">
                <h3>💬 聊天记录</h3>
                <span className="message-count">{messages.length} 条消息</span>
              </div>

              <div className="messages-list">
                {messages.length === 0 ? (
                  <div className="empty-chat">
                    <div className="empty-icon">🤖</div>
                    <p>开始与 AI 助手对话吧！</p>
                    <span className="empty-hint">输入消息，AI 助手会为你解答问题</span>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`message ${msg.role} ${msg.isError ? 'error' : ''}`}
                    >
                      <div className="message-avatar">
                        {msg.role === 'user' ? '👤' : msg.isError ? '❌' : '🤖'}
                      </div>
                      <div className="message-content">
                        <div className="message-header">
                          <span className="message-author">
                            {msg.role === 'user' ? '你' : msg.isError ? '错误' : 'AI 助手'}
                          </span>
                          <span className="message-time">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="message-text">
                          {msg.role === 'assistant' && msg.id === streamingId ? (
                            <StreamingMessage
                              content={streamingContent}
                              isStreaming={true}
                              onComplete={handleStreamComplete}
                            />
                          ) : (
                            msg.content
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="chat-input-area">
                <ChatInput
                  onSend={handlePlayerMessage}
                  disabled={isProcessing}
                  placeholder={isProcessing ? 'AI 思考中...' : '输入消息...'}
                />
                <div className="input-hint">
                  {isProcessing ? (
                    <span className="thinking">AI 正在思考...</span>
                  ) : (
                    <span>按 Enter 发送消息</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'providers' && <ProviderConfigPage />}
      </main>
    </div>
  )
}

export default App