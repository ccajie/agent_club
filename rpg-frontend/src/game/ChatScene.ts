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

// Manager 资本家形象配置
const MANAGER_CONFIG = {
  texture: 'manager_capitalist',
  hatColor: 0x1a1a1a,      // 黑色礼帽
  suitColor: 0x2c2c2c,      // 深色礼服
  tieColor: 0x8b0000,       // 深红色领带
  shirtColor: 0xffffff      // 白色衬衫
}

export class ChatScene extends Scene {
  private npcs: Map<string, Phaser.GameObjects.Container> = new Map()
  private speechBubbles: Map<string, Phaser.GameObjects.Container> = new Map()
  private robotStatuses: Map<string, RobotStatus> = new Map()  // 每个Agent独立的状态
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
    // 如果场景已经创建（有children），重新创建NPC
    if (this.children.length > 0) {
      this.recreateNPCs()
    }
  }

  shutdown() {
    this.bounceTimers.forEach(timer => timer.remove())
    this.bounceTimers.clear()
  }

  setRobotStatus(status: RobotStatus, agentName?: string) {
    // 如果没有指定agentName，则应用到所有agent（用于全局重置）
    if (!agentName) {
      const hadActiveStatus = Array.from(this.robotStatuses.values()).some(s => s !== 'idle')
      this.robotStatuses.clear()
      this.npcs.forEach((_, name) => {
        this.robotStatuses.set(name, status)
      })
      // 只有当状态真正有变化时才更新动画
      if (hadActiveStatus || status !== 'idle') {
        this.updateAllNPCAnimations()
      }
      return
    }

    // 只更新指定agent的状态
    const currentStatus = this.robotStatuses.get(agentName)
    if (currentStatus === status) return

    this.robotStatuses.set(agentName, status)
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
      // 初始化所有agent为idle状态
      this.npcs.forEach((_, name) => {
        this.robotStatuses.set(name, 'idle')
      })
      this.updateAllNPCAnimations()
    }

    // 监听窗口大小变化，自适应调整
    this.scale.on('resize', this.handleResize, this)
  }

  // 处理窗口大小变化
  private handleResize(gameSize: Phaser.Structs.Size) {
    const width = gameSize.width
    const height = gameSize.height

    // 更新相机边界
    this.cameras.main.setBounds(0, 0, width, height)

    // 重新创建场景内容
    this.recreateNPCs()
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
      // 重置所有agent为idle状态
      this.npcs.forEach((_, name) => {
        this.robotStatuses.set(name, 'idle')
      })
      this.updateAllNPCAnimations()
    }
  }

  // ========== 纹理创建 - 星露谷物语风格 ==========

  private createPixelTextures() {
    // Worker统一使用艾登或扳手形象（不再使用旧的预设）
    this.createAidenTexture()
    this.createWrenchTexture()

    // 创建Manager资本家纹理
    this.createManagerTexture()

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

  // 创建Manager资本家形象 - 戴黑帽子、穿礼服
  private createManagerTexture() {
    const { hatColor, suitColor, tieColor, shirtColor } = MANAGER_CONFIG
    const graphics = this.make.graphics({ x: 0, y: 0 })

    // 黑色礼帽（高顶礼帽样式）
    graphics.fillStyle(hatColor)
    // 帽檐
    graphics.fillRect(4, 8, 40, 6)
    // 帽顶
    graphics.fillRect(10, -4, 28, 14)
    // 帽带
    graphics.fillStyle(0x333333)
    graphics.fillRect(10, 8, 28, 3)

    // 脸部皮肤
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(10, 14, 28, 18)

    // 眼睛（锐利的眼神）
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(14, 20, 5, 4)
    graphics.fillRect(29, 20, 5, 4)
    // 眼睛高光
    graphics.fillStyle(0xffffff)
    graphics.fillRect(15, 21, 2, 2)
    graphics.fillStyle(0xffffff)
    graphics.fillRect(30, 21, 2, 2)

    // 眉毛（浓密）
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(13, 17, 7, 2)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(28, 17, 7, 2)

    // 嘴巴（严肃）
    graphics.fillStyle(0x4a4a4a)
    graphics.fillRect(20, 32, 8, 2)

    // 深色礼服外套
    graphics.fillStyle(suitColor)
    // 左半边
    graphics.fillRect(8, 36, 14, 24)
    // 右半边
    graphics.fillRect(26, 36, 14, 24)

    // 白色衬衫（V领）
    graphics.fillStyle(shirtColor)
    graphics.fillRect(22, 36, 4, 24)
    // 衬衫领子
    graphics.fillRect(20, 36, 8, 6)

    // 深红色领带
    graphics.fillStyle(tieColor)
    graphics.fillRect(22, 40, 4, 12)
    graphics.fillRect(21, 38, 6, 4)

    // 礼服翻领
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(8, 36, 4, 20)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(36, 36, 4, 20)

    // 脖子
    graphics.fillStyle(0xf5d0b0)
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(20, 34, 8, 4)

    // 手臂（自然下垂）
    graphics.fillStyle(suitColor)
    graphics.fillRect(2, 40, 8, 14)
    graphics.fillRect(38, 40, 8, 14)
    // 手
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(2, 52, 6, 6)
    graphics.fillRect(40, 52, 6, 6)

    // 口袋巾（白色）
    graphics.fillStyle(0xffffff)
    graphics.fillRect(32, 42, 4, 3)

    graphics.generateTexture(MANAGER_CONFIG.texture, 48, 60)
  }

  // 创建艾登形象 - 看门狗主角，棕色系配色
  private createAidenTexture() {
    const graphics = this.make.graphics({ x: 0, y: 0 })

    // 棕色棒球帽（艾登标志性帽子）
    graphics.fillStyle(0x5d4037)  // 棕色
    graphics.fillRect(8, 2, 32, 10)
    graphics.fillRect(6, 6, 4, 6)
    graphics.fillRect(38, 6, 4, 6)
    // 帽檐
    graphics.fillStyle(0x4a3228)
    graphics.fillRect(10, 10, 28, 4)

    // 帽檐阴影
    graphics.fillStyle(0x3e2723, 0.3)
    graphics.fillRect(10, 12, 28, 2)

    // 脸部皮肤
    graphics.fillStyle(0xe8c4a8)
    graphics.fillRect(10, 14, 28, 18)

    // 眼睛（锐利，半隐藏在帽檐阴影下）
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(14, 19, 5, 4)
    graphics.fillRect(29, 19, 5, 4)
    // 眼睛高光
    graphics.fillStyle(0xffffff)
    graphics.fillRect(15, 20, 2, 2)
    graphics.fillRect(30, 20, 2, 2)

    // 眉毛（浓密，严肃）
    graphics.fillStyle(0x3e2723)  // 深棕色
    graphics.fillRect(13, 16, 7, 2)
    graphics.fillRect(28, 16, 7, 2)

    // 嘴巴（严肃线条）
    graphics.fillStyle(0x5a4a3a)
    graphics.fillRect(20, 30, 8, 2)

    // 围巾（艾登标志性围巾，棕色系）
    graphics.fillStyle(0x6d4c41)  // 中棕色
    graphics.fillRect(16, 32, 16, 8)
    graphics.fillRect(14, 34, 4, 4)
    graphics.fillRect(30, 34, 4, 4)

    // 棕色风衣外套
    graphics.fillStyle(0x5d4037)  // 棕色
    graphics.fillRect(8, 40, 32, 20)

    // 风衣领子立起
    graphics.fillStyle(0x4a3228)
    graphics.fillRect(8, 38, 6, 10)
    graphics.fillRect(34, 38, 6, 10)

    // 风衣纽扣
    graphics.fillStyle(0x3e2723)
    graphics.fillRect(23, 46, 2, 2)
    graphics.fillRect(23, 52, 2, 2)

    // 手臂
    graphics.fillStyle(0x5d4037)
    graphics.fillRect(2, 44, 8, 14)
    graphics.fillRect(38, 44, 8, 14)
    // 手
    graphics.fillStyle(0xe8c4a8)
    graphics.fillRect(2, 54, 6, 6)
    graphics.fillRect(40, 54, 6, 6)

    graphics.generateTexture('aiden', 48, 60)
  }

  // 创建扳手形象 - 看门狗2角色，黑色系配色
  private createWrenchTexture() {
    const graphics = this.make.graphics({ x: 0, y: 0 })

    // 头发（乱蓬蓬的朋克发型，黑色）
    graphics.fillStyle(0x1a1a1a)  // 黑色
    graphics.fillRect(6, 0, 36, 12)
    graphics.fillRect(4, 4, 4, 8)
    graphics.fillRect(40, 4, 4, 8)
    // 头发尖刺
    graphics.fillRect(8, -2, 4, 4)
    graphics.fillRect(20, -3, 4, 5)
    graphics.fillRect(32, -2, 4, 4)

    // 脸部皮肤
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(10, 12, 28, 18)

    // 扳手标志性面具（简化版，像素风格）
    // 面具底色 - 深灰色
    graphics.fillStyle(0x424242)
    graphics.fillRect(12, 16, 24, 12)

    // 面具上的X形图案（扳手标志）
    graphics.fillStyle(0xffeb3b)  // 黄色
    graphics.fillRect(14, 18, 4, 2)
    graphics.fillRect(18, 20, 4, 2)
    graphics.fillRect(22, 22, 4, 2)
    graphics.fillRect(26, 20, 4, 2)
    graphics.fillRect(30, 18, 4, 2)

    // 眼睛（透过面具）
    graphics.fillStyle(0x000000)
    graphics.fillRect(16, 18, 4, 4)
    graphics.fillRect(28, 18, 4, 4)
    // 眼睛发光效果
    graphics.fillStyle(0xffeb3b)  // 黄色
    graphics.fillRect(17, 19, 2, 2)
    graphics.fillRect(29, 19, 2, 2)

    // 嘴巴（嚣张的笑容）
    graphics.fillStyle(0x880e4f)
    graphics.fillRect(20, 30, 8, 2)
    graphics.fillRect(18, 28, 2, 2)
    graphics.fillRect(28, 28, 2, 2)
    graphics.fillRect(16, 30, 2, 2)
    graphics.fillRect(30, 30, 2, 2)

    // 连帽衫帽子（黑色）
    graphics.fillStyle(0x212121)
    graphics.fillRect(8, 34, 32, 8)
    graphics.fillRect(6, 36, 4, 6)
    graphics.fillRect(38, 36, 4, 6)

    // 黑色连帽衫外套
    graphics.fillStyle(0x1a1a1a)  // 黑色
    graphics.fillRect(8, 42, 32, 18)

    // 连帽衫抽绳（黄色点缀）
    graphics.fillStyle(0xffeb3b)
    graphics.fillRect(20, 44, 2, 8)
    graphics.fillRect(26, 44, 2, 8)

    // DedSec标志（简化，胸前黄色）
    graphics.fillStyle(0xffeb3b)
    graphics.fillRect(22, 50, 4, 4)
    graphics.fillRect(21, 51, 6, 2)

    // 手臂
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(2, 46, 8, 14)
    graphics.fillRect(38, 46, 8, 14)
    // 手
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(2, 56, 6, 6)
    graphics.fillRect(40, 56, 6, 6)

    graphics.generateTexture('wrench', 48, 60)
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

  // 根据Agent名称确定固定形象（艾登或扳手）
  private getAgentTextureByName(name: string): string {
    // 使用简单的字符串hash算法
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    // 根据hash的奇偶性决定形象，确保同一个name总是得到相同形象
    return Math.abs(hash) % 2 === 0 ? 'aiden' : 'wrench'
  }

  // ========== 动态创建NPC（根据agents数量） ==========

  private createNPCs() {
    const count = this.agents.length
    if (count === 0) return

    const width = this.cameras.main.width
    const centerY = this.NPC_Y

    // 计算布局 - 向左偏移，避免与聊天框重合
    // 聊天框在右侧固定400px，所以NPC区域限制在左侧
    const maxRightX = width - 420  // 留出聊天框空间

    let positions: { x: number; y: number }[] = []

    if (count === 1) {
      // 单个靠左居中
      positions = [{ x: Math.min(width * 0.3, maxRightX - 50), y: centerY }]
    } else if (count === 2) {
      // 两个并排，偏左
      positions = [
        { x: width * 0.25, y: centerY },
        { x: Math.min(width * 0.45, maxRightX - 100), y: centerY }
      ]
    } else if (count <= 4) {
      // 2x2布局，偏左
      positions = [
        { x: width * 0.2, y: centerY - 40 },
        { x: Math.min(width * 0.5, maxRightX - 80), y: centerY - 40 },
        { x: width * 0.2, y: centerY + 60 },
        { x: Math.min(width * 0.5, maxRightX - 80), y: centerY + 60 }
      ]
    } else if (count <= 6) {
      // 2行3列，偏左
      const cols = 3
      for (let i = 0; i < count; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = Math.min(width * (0.12 + col * 0.2), maxRightX - 60)
        const y = centerY - 30 + row * 90
        positions.push({ x, y })
      }
    } else {
      // 最多10个，2行5列，偏左
      const cols = 5
      for (let i = 0; i < Math.min(count, this.MAX_AGENTS); i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = Math.min(width * (0.08 + col * 0.12), maxRightX - 40)
        const y = centerY - 30 + row * 90
        positions.push({ x, y })
      }
    }

    // 创建每个NPC
    this.agents.forEach((agent, index) => {
      const pos = positions[index]
      // Manager使用资本家形象，Worker使用艾登或扳手形象（基于name固定）
      const isManager = agent.avatar_type === 'manager' || agent.id === 'manager_default'
      let texture: string
      if (isManager) {
        texture = MANAGER_CONFIG.texture
      } else {
        // Worker根据name的hash固定二选一：艾登或扳手
        texture = this.getAgentTextureByName(agent.name)
      }
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

  // 更新所有NPC的动画状态
  private updateAllNPCAnimations() {
    this.npcs.forEach((_, name) => this.updateNPCAnimation(name))
  }

  // 更新单个NPC的动画状态
  private updateNPCAnimation(agentName: string) {
    const npc = this.npcs.get(agentName)
    if (!npc) return

    // 获取该agent的当前状态，默认为idle
    const status = this.robotStatuses.get(agentName) || 'idle'

    // 清除该NPC的现有动画和定时器
    this.tweens.killTweensOf(npc)
    const existingTimer = this.bounceTimers.get(agentName)
    if (existingTimer) {
      existingTimer.remove()
      this.bounceTimers.delete(agentName)
    }

    switch (status) {
      case 'idle':
        // 待机动画 - 轻微上下浮动
        this.startIdleAnimation(agentName)
        // 隐藏该agent的气泡
        this.hideSpeechBubble(agentName)
        break

      case 'thinking':
        // 思考动画 - 轻微摇晃
        this.tweens.add({
          targets: npc,
          angle: { from: -5, to: 5 },
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
        this.showSpeechBubble('思考中...', agentName)
        break

      case 'speaking':
        // 说话动画 - 弹跳效果
        this.bounceTimers.set(agentName, this.time.addEvent({
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
        this.showSpeechBubble('💬', agentName)
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
