import { Scene } from 'phaser'
import type { RobotStatus, AgentInfo } from '../types'

// 预定义10个Agent的纹理名称和颜色配置
const AGENT_PRESETS = [
  { texture: 'agent_0', primaryColor: 0x3498db, secondaryColor: 0x2980b9, style: 'tech' },    // 蓝色 - 科技风
  { texture: 'agent_1', primaryColor: 0xe91e63, secondaryColor: 0xc2185b, style: 'cute' },    // 粉色 - 可爱风
  { texture: 'agent_2', primaryColor: 0x2ecc71, secondaryColor: 0x27ae60, style: 'nature' },  // 绿色 - 自然风
  { texture: 'agent_3', primaryColor: 0xf39c12, secondaryColor: 0xe67e22, style: 'energy' },  // 橙色 - 活力风
  { texture: 'agent_4', primaryColor: 0x9b59b6, secondaryColor: 0x8e44ad, style: 'mystery' }, // 紫色 - 神秘风
  { texture: 'agent_5', primaryColor: 0x1abc9c, secondaryColor: 0x16a085, style: 'cool' },    // 青色 - 冷酷风
  { texture: 'agent_6', primaryColor: 0xe74c3c, secondaryColor: 0xc0392b, style: 'passion' }, // 红色 - 热情风
  { texture: 'agent_7', primaryColor: 0x34495e, secondaryColor: 0x2c3e50, style: 'dark' },    // 深蓝灰 - 暗黑风
  { texture: 'agent_8', primaryColor: 0xf1c40f, secondaryColor: 0xf39c12, style: 'sunshine' }, // 黄色 - 阳光风
  { texture: 'agent_9', primaryColor: 0x95a5a6, secondaryColor: 0x7f8c8d, style: 'neutral' }, // 灰色 - 中性风
]

export class ChatScene extends Scene {
  private npcs: Map<string, Phaser.GameObjects.Container> = new Map()
  private speechBubbles: Map<string, Phaser.GameObjects.Container> = new Map()
  private robotStatus: RobotStatus = 'idle'
  private bounceTimers: Map<string, Phaser.Time.TimerEvent> = new Map()
  private agents: AgentInfo[] = []

  // 配置参数
  private readonly NPC_SCALE = 1.8
  private readonly NPC_Y = 200
  private readonly MAX_AGENTS = 10

  constructor() {
    super({ key: 'ChatScene' })
  }

  setAgents(agents: AgentInfo[]) {
    this.agents = agents.slice(0, this.MAX_AGENTS)
    // 如果场景已经创建，重新创建NPC
    if (this.npcs.size > 0 || this.children.length > 0) {
      this.recreateNPCs()
    }
  }

  shutdown() {
    this.bounceTimers.forEach(timer => timer.remove())
    this.bounceTimers.clear()
  }

  setRobotStatus(status: RobotStatus, agentName?: string) {
    if (this.robotStatus === status) return
    this.robotStatus = status
    this.updateNPCAnimation(agentName)
  }

  preload() {
    this.createPixelTextures()
  }

  create() {
    // 创建星露谷物语风格的办公室
    this.createStardewOffice()

    // 只有在配置了agents时才创建NPC
    if (this.agents.length > 0) {
      this.createNPCs()
      this.createSpeechBubbles()
      this.updateNPCAnimation()
    }
  }

  private recreateNPCs() {
    // 清除现有NPC
    this.npcs.forEach(npc => npc.destroy())
    this.speechBubbles.forEach(bubble => bubble.destroy())
    this.npcs.clear()
    this.speechBubbles.clear()

    // 停止所有动画
    this.tweens.killAll()
    this.bounceTimers.forEach(timer => timer.remove())
    this.bounceTimers.clear()

    // 重新创建（如果有agents）
    if (this.agents.length > 0) {
      this.createNPCs()
      this.createSpeechBubbles()
      this.updateNPCAnimation()
    }
  }

  // ========== 纹理创建 - 星露谷物语风格 ==========

  private createPixelTextures() {
    // 创建10种不同风格的Agent纹理
    AGENT_PRESETS.forEach(preset => {
      this.createAgentTexture(preset.texture, preset.primaryColor, preset.secondaryColor, preset.style)
    })

    // 地板纹理 - 木质地板
    const floorGraphics = this.make.graphics({ x: 0, y: 0 })
    floorGraphics.fillStyle(0xd4a373)
    floorGraphics.fillRect(0, 0, 32, 32)
    floorGraphics.lineStyle(1, 0xbc8a5f)
    floorGraphics.beginPath()
    floorGraphics.moveTo(0, 8)
    floorGraphics.lineTo(32, 8)
    floorGraphics.moveTo(0, 16)
    floorGraphics.lineTo(32, 16)
    floorGraphics.moveTo(0, 24)
    floorGraphics.lineTo(32, 24)
    floorGraphics.strokePath()
    floorGraphics.lineStyle(1, 0xa67c52)
    floorGraphics.beginPath()
    floorGraphics.moveTo(16, 0)
    floorGraphics.lineTo(16, 32)
    floorGraphics.strokePath()
    floorGraphics.generateTexture('floor', 32, 32)

    // 墙壁纹理
    const wallGraphics = this.make.graphics({ x: 0, y: 0 })
    wallGraphics.fillStyle(0xf5f5dc)
    wallGraphics.fillRect(0, 0, 32, 32)
    wallGraphics.fillStyle(0xe8e8d0)
    wallGraphics.fillRect(2, 2, 28, 28)
    wallGraphics.generateTexture('wall', 32, 32)

    // 地毯纹理
    const carpetGraphics = this.make.graphics({ x: 0, y: 0 })
    carpetGraphics.fillStyle(0x74b9ff)
    carpetGraphics.fillRect(0, 0, 32, 32)
    carpetGraphics.fillStyle(0x0984e3, 0.3)
    carpetGraphics.fillCircle(8, 8, 4)
    carpetGraphics.fillCircle(24, 24, 4)
    carpetGraphics.fillCircle(8, 24, 4)
    carpetGraphics.fillCircle(24, 8, 4)
    carpetGraphics.generateTexture('carpet', 32, 32)

    // 桌子纹理
    const deskGraphics = this.make.graphics({ x: 0, y: 0 })
    deskGraphics.fillStyle(0x8b4513)
    deskGraphics.fillRect(4, 4, 56, 40)
    deskGraphics.fillStyle(0xa0522d)
    deskGraphics.fillRect(6, 6, 52, 36)
    deskGraphics.fillStyle(0x654321)
    deskGraphics.fillRect(8, 10, 20, 12)
    deskGraphics.fillRect(8, 26, 20, 12)
    deskGraphics.fillRect(36, 10, 20, 12)
    deskGraphics.fillRect(36, 26, 20, 12)
    deskGraphics.fillStyle(0xffd700)
    deskGraphics.fillCircle(18, 16, 2)
    deskGraphics.fillCircle(18, 32, 2)
    deskGraphics.fillCircle(46, 16, 2)
    deskGraphics.fillCircle(46, 32, 2)
    deskGraphics.generateTexture('desk', 64, 48)

    // 椅子纹理
    const chairGraphics = this.make.graphics({ x: 0, y: 0 })
    chairGraphics.fillStyle(0x2d3436)
    chairGraphics.fillCircle(16, 16, 12)
    chairGraphics.fillStyle(0x636e72)
    chairGraphics.fillCircle(16, 16, 8)
    chairGraphics.fillStyle(0x2d3436)
    chairGraphics.fillRect(6, 6, 4, 4)
    chairGraphics.fillRect(22, 6, 4, 4)
    chairGraphics.fillRect(6, 22, 4, 4)
    chairGraphics.fillRect(22, 22, 4, 4)
    chairGraphics.generateTexture('chair', 32, 32)

    // 电脑纹理
    const computerGraphics = this.make.graphics({ x: 0, y: 0 })
    computerGraphics.fillStyle(0x2d3436)
    computerGraphics.fillRect(12, 20, 24, 8)
    computerGraphics.fillStyle(0x1a1a2e)
    computerGraphics.fillRect(8, 4, 32, 20)
    computerGraphics.fillStyle(0x74b9ff)
    computerGraphics.fillRect(10, 6, 28, 16)
    computerGraphics.fillStyle(0xffffff, 0.7)
    computerGraphics.fillRect(12, 8, 20, 2)
    computerGraphics.fillRect(12, 12, 16, 2)
    computerGraphics.fillRect(12, 16, 24, 2)
    computerGraphics.generateTexture('computer', 48, 32)

    // 植物纹理
    const plantGraphics = this.make.graphics({ x: 0, y: 0 })
    plantGraphics.fillStyle(0xd2691e)
    plantGraphics.fillCircle(16, 20, 10)
    plantGraphics.fillStyle(0x8b4513)
    plantGraphics.fillCircle(16, 18, 8)
    plantGraphics.fillStyle(0x00b894)
    plantGraphics.fillCircle(16, 10, 6)
    plantGraphics.fillCircle(10, 12, 5)
    plantGraphics.fillCircle(22, 12, 5)
    plantGraphics.fillCircle(16, 4, 4)
    plantGraphics.generateTexture('plant', 32, 32)

    // 说话气泡
    const bubbleGraphics = this.make.graphics({ x: 0, y: 0 })
    bubbleGraphics.fillStyle(0xffffff)
    bubbleGraphics.fillRoundedRect(0, 0, 80, 40, 8)
    bubbleGraphics.lineStyle(2, 0x2d3436)
    bubbleGraphics.strokeRoundedRect(0, 0, 80, 40, 8)
    bubbleGraphics.fillStyle(0xffffff)
    bubbleGraphics.beginPath()
    bubbleGraphics.moveTo(30, 40)
    bubbleGraphics.lineTo(40, 50)
    bubbleGraphics.lineTo(50, 40)
    bubbleGraphics.closePath()
    bubbleGraphics.fillPath()
    bubbleGraphics.lineStyle(2, 0x2d3436)
    bubbleGraphics.beginPath()
    bubbleGraphics.moveTo(30, 40)
    bubbleGraphics.lineTo(40, 50)
    bubbleGraphics.lineTo(50, 40)
    bubbleGraphics.strokePath()
    bubbleGraphics.generateTexture('speechBubble', 80, 55)
  }

  private createAgentTexture(key: string, primaryColor: number, secondaryColor: number, style: string) {
    const graphics = this.make.graphics({ x: 0, y: 0 })

    // Q版大头身体比例

    // 头发/头部装饰
    graphics.fillStyle(0x2d3436)
    graphics.fillRect(8, 0, 32, 14)
    graphics.fillRect(4, 4, 6, 12)
    graphics.fillRect(38, 4, 6, 12)

    // 呆毛（根据风格调整颜色）
    graphics.fillStyle(primaryColor)
    graphics.fillRect(22, -4, 4, 6)
    graphics.fillRect(24, -6, 4, 4)

    // 脸部皮肤
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(10, 12, 28, 20)

    // 眼睛（使用主题色）
    graphics.fillStyle(primaryColor)
    graphics.fillRect(14, 18, 6, 6)
    graphics.fillRect(28, 18, 6, 6)
    // 眼睛高光
    graphics.fillStyle(0xffffff)
    graphics.fillRect(16, 19, 2, 2)
    graphics.fillRect(30, 19, 2, 2)

    // 眉毛
    graphics.fillStyle(0x2d3436)
    graphics.fillRect(14, 14, 6, 2)
    graphics.fillRect(28, 14, 6, 2)

    // 嘴巴（微笑）
    graphics.fillStyle(0x880e4f)
    graphics.fillRect(20, 30, 8, 2)
    graphics.fillRect(18, 28, 2, 2)
    graphics.fillRect(28, 28, 2, 2)

    // 衣服（主题色）
    graphics.fillStyle(primaryColor)
    graphics.fillRect(8, 36, 32, 24)
    // 衣服高光
    graphics.fillStyle(secondaryColor)
    graphics.fillRect(6, 34, 36, 6)
    // 胸前装饰（根据风格变化）
    graphics.fillStyle(0xffffff)
    if (style === 'tech' || style === 'cool' || style === 'dark') {
      // 科技感 - 方形
      graphics.fillRect(20, 42, 8, 8)
    } else if (style === 'cute' || style === 'sunshine') {
      // 可爱 - 圆形
      graphics.fillCircle(24, 46, 4)
    } else {
      // 其他 - 菱形
      graphics.fillRect(22, 44, 4, 4)
    }

    // 脖子
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(20, 34, 8, 4)

    // 手臂
    graphics.fillStyle(primaryColor)
    graphics.fillRect(2, 40, 8, 12)
    graphics.fillRect(38, 40, 8, 12)
    // 手
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(2, 50, 6, 6)
    graphics.fillRect(40, 50, 6, 6)

    graphics.generateTexture(key, 48, 60)
  }

  // ========== 创建星露谷物语风格办公室 ==========

  private createStardewOffice() {
    const width = this.cameras.main.width
    const height = this.cameras.main.height

    // 地板
    for (let x = 0; x < width; x += 32) {
      for (let y = 0; y < height; y += 32) {
        this.add.image(x + 16, y + 16, 'floor').setOrigin(0.5)
      }
    }

    // 地毯（中间区域）
    for (let x = 20; x < 280; x += 32) {
      for (let y = 120; y < 320; y += 32) {
        this.add.image(x + 16, y + 16, 'carpet').setOrigin(0.5)
      }
    }

    // 办公桌（上方）
    this.add.image(150, 100, 'desk').setOrigin(0.5)

    // 椅子（桌子下方）
    this.add.image(150, 150, 'chair').setOrigin(0.5)

    // 电脑（桌子上）
    this.add.image(150, 90, 'computer').setOrigin(0.5)

    // 角落植物
    this.add.image(40, 40, 'plant').setOrigin(0.5)
    this.add.image(260, 40, 'plant').setOrigin(0.5)
    this.add.image(40, 350, 'plant').setOrigin(0.5)
    this.add.image(260, 350, 'plant').setOrigin(0.5)

    // 墙壁装饰
    this.add.rectangle(width / 2, 10, width, 20, 0xf5f5dc)

    // 黑客风格装饰
    this.createWallScreen(80, 50)
    this.createWallScreen(220, 50)
    this.createServerBox(30, 280)
    this.createServerBox(270, 320)
  }

  private createWallScreen(x: number, y: number) {
    this.add.rectangle(x, y, 60, 40, 0x1a1a2e)
    this.add.rectangle(x, y, 54, 34, 0x00ff00, 0.2)
    for (let i = 0; i < 3; i++) {
      const lineWidth = 30 + Math.random() * 20
      this.add.rectangle(x - 10 + lineWidth / 2, y - 10 + i * 10, lineWidth, 4, 0x00ff00, 0.6)
    }
  }

  private createServerBox(x: number, y: number) {
    this.add.rectangle(x, y, 40, 50, 0x2d3436)
    this.add.circle(x - 10, y - 15, 3, 0xff0055)
    this.add.circle(x, y - 15, 3, 0x00ff00)
    this.add.circle(x + 10, y - 15, 3, 0x00e5ff)
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(x, y + i * 8, 30, 3, 0x1a1a2e)
    }
  }

  // ========== 动态创建NPC（根据agents数量） ==========

  private createNPCs() {
    const count = this.agents.length
    if (count === 0) return

    const width = this.cameras.main.width
    const centerY = this.NPC_Y

    // 计算布局
    let positions: { x: number; y: number }[] = []

    if (count === 1) {
      // 单个居中
      positions = [{ x: width / 2, y: centerY }]
    } else if (count === 2) {
      // 两个并排
      positions = [
        { x: width * 0.35, y: centerY },
        { x: width * 0.65, y: centerY }
      ]
    } else if (count <= 4) {
      // 2x2布局
      positions = [
        { x: width * 0.3, y: centerY - 40 },
        { x: width * 0.7, y: centerY - 40 },
        { x: width * 0.3, y: centerY + 60 },
        { x: width * 0.7, y: centerY + 60 }
      ]
    } else if (count <= 6) {
      // 2行3列
      const cols = 3
      for (let i = 0; i < count; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = width * (0.2 + col * 0.3)
        const y = centerY - 30 + row * 90
        positions.push({ x, y })
      }
    } else {
      // 最多10个，2行5列
      const cols = 5
      for (let i = 0; i < Math.min(count, this.MAX_AGENTS); i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = width * (0.15 + col * 0.175)
        const y = centerY - 30 + row * 90
        positions.push({ x, y })
      }
    }

    // 创建每个NPC
    this.agents.forEach((agent, index) => {
      const pos = positions[index]
      const texture = AGENT_PRESETS[index % AGENT_PRESETS.length].texture
      this.createSingleNPC(agent.name, pos.x, pos.y, texture, index)
    })
  }

  private createSingleNPC(name: string, x: number, y: number, textureKey: string, index: number) {
    const npc = this.add.container(x, y)

    // 身体精灵
    const body = this.add.sprite(0, 0, textureKey)
      .setOrigin(0.5, 0.5)
      .setScale(this.NPC_SCALE)

    // 阴影
    const shadow = this.add.ellipse(0, 58, 44, 14, 0x000000, 0.25)

    // 名字标签（带背景）
    const nameBg = this.add.rectangle(0, -70, 80, 22, 0x000000, 0.6)
    const nameLabel = this.add.text(0, -70, name, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5)

    npc.add([shadow, body, nameBg, nameLabel])
    this.npcs.set(name, npc)

    // 初始待机动画（错开时间）
    this.startIdleAnimation(name, index * 200)
  }

  private startIdleAnimation(agentName: string, delay: number = 0) {
    const npc = this.npcs.get(agentName)
    if (!npc) return

    // 清除该NPC的现有动画
    this.tweens.killTweensOf(npc)

    // 延迟后开始动画
    this.time.delayedCall(delay, () => {
      this.tweens.add({
        targets: npc,
        y: npc.y - 3,
        duration: 1500 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    })
  }

  // ========== 创建说话气泡 ==========

  private createSpeechBubbles() {
    this.npcs.forEach((npc, name) => {
      const bubble = this.add.container(npc.x, npc.y - 60)
      bubble.setVisible(false)
      bubble.setScale(0)

      // 气泡背景
      const bg = this.add.image(0, 0, 'speechBubble').setOrigin(0.5)

      // 文本
      const text = this.add.text(0, -5, '...', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '12px',
        color: '#2d3436',
        align: 'center'
      }).setOrigin(0.5)

      bubble.add([bg, text])
      bubble.setData('text', text)
      this.speechBubbles.set(name, bubble)
    })
  }

  // ========== 动画控制 ==========

  private updateNPCAnimation(activeAgentName?: string) {
    switch (this.robotStatus) {
      case 'idle':
        // 所有NPC恢复待机动画
        this.npcs.forEach((_, name) => this.startIdleAnimation(name))
        break

      case 'thinking':
        // 思考动画 - 所有NPC轻微摇晃
        this.npcs.forEach((npc) => {
          this.tweens.killTweensOf(npc)
          this.tweens.add({
            targets: npc,
            angle: { from: -5, to: 5 },
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          })
        })
        this.showSpeechBubble('思考中...', activeAgentName)
        break

      case 'speaking':
        // 说话动画 - 活跃Agent弹跳
        if (activeAgentName) {
          const npc = this.npcs.get(activeAgentName)
          if (npc) {
            this.tweens.killTweensOf(npc)
            this.bounceTimers.set(activeAgentName, this.time.addEvent({
              delay: 200,
              callback: () => {
                this.tweens.add({
                  targets: npc,
                  scaleY: 0.9,
                  duration: 100,
                  yoyo: true
                })
              },
              repeat: -1
            }))
          }
        }
        this.showSpeechBubble('💬', activeAgentName)
        break
    }
  }

  private showSpeechBubble(text: string, agentName?: string) {
    const targetBubbles = agentName
      ? [this.speechBubbles.get(agentName)].filter(Boolean)
      : Array.from(this.speechBubbles.values())

    targetBubbles.forEach(bubble => {
      if (!bubble) return
      const textObj = bubble.getData('text') as Phaser.GameObjects.Text
      textObj.setText(text)

      bubble.setVisible(true)
      this.tweens.add({
        targets: bubble,
        scale: { from: 0, to: 1 },
        duration: 200,
        ease: 'Back.easeOut'
      })
    })
  }

  private hideSpeechBubble(agentName?: string) {
    const targetBubbles = agentName
      ? [this.speechBubbles.get(agentName)].filter(Boolean)
      : Array.from(this.speechBubbles.values())

    targetBubbles.forEach(bubble => {
      if (!bubble) return
      this.tweens.add({
        targets: bubble,
        scale: 0,
        duration: 150,
        ease: 'Back.easeIn',
        onComplete: () => {
          bubble.setVisible(false)
        }
      })
    })
  }

  // ========== 对话功能 ==========

  showPlayerDialog(_text: string) {
    // 玩家说话时，所有AI转头看向玩家
    this.npcs.forEach((npc) => {
      this.tweens.add({
        targets: npc,
        x: npc.x + 5,
        duration: 200,
        yoyo: true
      })
    })
  }

  showNPCDialog(_text: string, agentName?: string, onComplete?: () => void) {
    this.showSpeechBubble('💬', agentName)

    this.time.delayedCall(3000, () => {
      this.hideSpeechBubble(agentName)
      onComplete?.()
    })
  }

  highlightAgent(agentName: string) {
    this.npcs.forEach((npc, name) => {
      const body = npc.getAt(1) as Phaser.GameObjects.Sprite
      if (name === agentName) {
        body.setAlpha(1)
        this.tweens.add({
          targets: npc,
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 200,
          yoyo: true
        })
      } else {
        body.setAlpha(0.6)
      }
    })
  }

  resetAgentHighlight() {
    this.npcs.forEach((npc) => {
      const body = npc.getAt(1) as Phaser.GameObjects.Sprite
      body.setAlpha(1)
    })
  }
}
