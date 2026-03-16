import { useEffect, useRef, useState, useCallback } from 'react'
import Phaser from 'phaser'
import { ChatScene } from './game/ChatScene'
import { ChatInput } from './components/ChatInput'
import { AgentConfigPage } from './pages/AgentConfigPage'
import { ProviderConfigPage } from './pages/ProviderConfigPage'
import type { ChatMessage, RobotStatus, AgentInfo } from './types'
import { api } from './api'

type Page = 'chat' | 'agents' | 'providers'

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

const ProviderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>
)

// 收起图标（向下箭头）
const CollapseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

// 展开图标（向上箭头）
const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
)

function App() {
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<ChatScene | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [robotStatus, setRobotStatus] = useState<RobotStatus>('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentPage, setCurrentPage] = useState<Page>('chat')
  const [agents, setAgents] = useState<AgentInfo[]>([])

  // 初始化 Phaser 游戏
  useEffect(() => {
    if (currentPage !== 'chat') return

    const gameContainer = document.getElementById('game-container')
    const width = gameContainer?.clientWidth || window.innerWidth
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
        console.log('ChatScene initialized, agents count:', agents.length)
        // 传递 agents 信息（即使为空也要传递，让场景知道当前状态）
        scene.setAgents(agents)
        clearInterval(checkScene)
      }
    }, 100)

    // 响应窗口大小变化
    const handleResize = () => {
      const gameContainer = document.getElementById('game-container')
      const width = gameContainer?.clientWidth || window.innerWidth
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
  const [isChatCollapsed, setIsChatCollapsed] = useState(false)

  // 获取 Agent 列表
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        console.log('Fetching agents for page:', currentPage)
        const agentList = await api.getAgents()
        console.log('Fetched agents:', agentList.length, agentList)
        setAgents(agentList)
      } catch (err) {
        console.error('Failed to fetch agents:', err)
      }
    }
    fetchAgents()
  }, [currentPage])

  // 监听 agent 更新事件（从配置页面返回时刷新）
  useEffect(() => {
    const handleAgentUpdated = () => {
      console.log('Agent updated event received, refreshing...')
      const fetchAgents = async () => {
        try {
          const agentList = await api.getAgents()
          console.log('Refreshed agents after update:', agentList.length, agentList)
          setAgents(agentList)
        } catch (err) {
          console.error('Failed to refresh agents:', err)
        }
      }
      fetchAgents()
    }
    window.addEventListener('agentUpdated', handleAgentUpdated)
    return () => window.removeEventListener('agentUpdated', handleAgentUpdated)
  }, [])

  // 当 agents 变化时，更新场景
  useEffect(() => {
    if (sceneRef.current && agents.length > 0) {
      console.log('Setting agents to scene:', agents)
      sceneRef.current.setAgents(agents)
    }
  }, [agents])

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
      // 调用后端 API - 现在返回多 Agent 响应
      const responses = await api.chat(text)

      // 切换到说话状态
      setRobotStatus('speaking')

      // 依次显示每个 Agent 的回复
      for (let i = 0; i < responses.length; i++) {
        const agentResponse = responses[i]
        const messageId = (Date.now() + i + 1).toString()

        // 添加消息到列表
        const aiMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: agentResponse.content,
          timestamp: Date.now(),
          agentName: agentResponse.agent_name,
          agentRole: agentResponse.agent_role
        }
        setMessages(prev => [...prev, aiMessage])

        // 高亮当前说话的 Agent
        sceneRef.current?.highlightAgent(agentResponse.agent_name)
        sceneRef.current?.showNPCDialog(agentResponse.content, agentResponse.agent_name)

        // 最后一个 Agent 回复完成后恢复状态
        if (i === responses.length - 1) {
          setTimeout(() => {
            sceneRef.current?.resetAgentHighlight()
            setRobotStatus('idle')
            setIsProcessing(false)
          }, 3000)
        } else {
          // 等待一段时间再显示下一个 Agent 的回复
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
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
            className={`nav-item ${currentPage === 'agents' ? 'active' : ''}`}
            onClick={() => setCurrentPage('agents')}
          >
            <ModelIcon />
            <span>Agent 配置</span>
          </button>
          <button
            className={`nav-item ${currentPage === 'providers' ? 'active' : ''}`}
            onClick={() => setCurrentPage('providers')}
          >
            <ProviderIcon />
            <span>Provider 配置</span>
          </button>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="main-content">
        {currentPage === 'chat' && (
          <div className="chat-layout">
            {/* 全屏 - AI 机器人场景 */}
            <div className="scene-panel" style={{ width: '100%', height: '100%' }}>
              <div id="game-container" className="game-container" />
            </div>

            {/* 右下角浮动聊天窗口 */}
            <div className={`chat-float-panel ${isChatCollapsed ? 'collapsed' : ''}`}>
              <div className="chat-header">
                <div className="chat-header-left">
                  <h3>💬 聊天记录</h3>
                  <span className="message-count">{messages.length} 条消息</span>
                </div>
                <button
                  className="collapse-btn"
                  onClick={() => setIsChatCollapsed(!isChatCollapsed)}
                  title={isChatCollapsed ? '展开' : '收起'}
                >
                  {isChatCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                </button>
              </div>

              {!isChatCollapsed && (
              <>
              <div className="messages-list">
                {messages.length === 0 ? (
                  <div className="empty-chat">
                    <div className="empty-icon">🤖</div>
                    <p>开始与 AI 助手们对话吧！</p>
                    <span className="empty-hint">输入消息，多个 AI Agent 会为你解答问题</span>
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
                            {msg.role === 'user'
                              ? '你'
                              : msg.isError
                                ? '错误'
                                : msg.agentName || 'AI 助手'}
                          </span>
                          {msg.agentRole && (
                            <span className="message-role">{msg.agentRole}</span>
                          )}
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
              </>
              )}
            </div>
          </div>
        )}

        {currentPage === 'agents' && <AgentConfigPage />}
        {currentPage === 'providers' && <ProviderConfigPage />}
      </main>
    </div>
  )
}

export default App