import { Scene } from 'phaser'
import type { RobotStatus, ChatSceneCallbacks } from '../types'

export class ChatScene extends Scene {
  private npc!: Phaser.GameObjects.Container
  private speechBubble!: Phaser.GameObjects.Container
  private callbacks: ChatSceneCallbacks | null = null
  private robotStatus: RobotStatus = 'idle'
  private blinkTimer?: Phaser.Time.TimerEvent
  private bounceTimer?: Phaser.Time.TimerEvent

  // 配置参数 - 俯视视角，适配左侧面板
  private readonly NPC_X = 150
  private readonly NPC_Y = 210
  private readonly SCALE = 2.2

  constructor() {
    super({ key: 'ChatScene' })
  }

  setCallbacks(callbacks: ChatSceneCallbacks) {
    this.callbacks = callbacks
  }

  destroy() {
    this.bounceTimer?.remove()
    super.destroy()
  }

  setRobotStatus(status: RobotStatus) {
    if (this.robotStatus === status) return
    this.robotStatus = status
    this.updateNPCAnimation()
  }

  preload() {
    this.createPixelTextures()
  }

  create() {
    // 创建星露谷物语风格的办公室
    this.createStardewOffice()

    // 创建卡通AI角色
    this.createNPC()

    // 创建说话气泡（初始隐藏）
    this.createSpeechBubble()

    // 启动动画
    this.updateNPCAnimation()
  }

  // ========== 纹理创建 - 星露谷物语风格 ==========

  private createPixelTextures() {
    // AI角色纹理 - 看门狗风格Q版黑客（带扳手式面具）
    const npcGraphics = this.make.graphics({ x: 0, y: 0 })

    // === Q版大头身体比例 ===
    // 头部占2/3，身体占1/3

    // === 头发（朋克风格，深灰色带点绿）===
    npcGraphics.fillStyle(0x2d3436)
    // 头顶蓬松发型
    npcGraphics.fillRect(8, 0, 32, 14)
    npcGraphics.fillRect(4, 4, 6, 12)
    npcGraphics.fillRect(38, 4, 6, 12)
    // 翘起的呆毛
    npcGraphics.fillRect(22, -4, 4, 6)
    npcGraphics.fillRect(24, -6, 4, 4)

    // === 脸部皮肤 ===
    npcGraphics.fillStyle(0xf5d0b0)
    npcGraphics.fillRect(10, 12, 28, 20)

    // === 标志性黑色面具（扳手风格）===
    // 面具底色 - 纯黑
    npcGraphics.fillStyle(0x000000)
    // 面具覆盖眼睛区域，带有机械感
    npcGraphics.fillRect(8, 14, 32, 14)
    // 面具两侧延伸
    npcGraphics.fillRect(4, 16, 6, 10)
    npcGraphics.fillRect(38, 16, 6, 10)

    // === 面具上的X型发光条纹（扳手标志性设计）===
    npcGraphics.fillStyle(0xffeb3b)
    // 左斜线
    npcGraphics.fillRect(12, 16, 3, 3)
    npcGraphics.fillRect(15, 19, 3, 3)
    npcGraphics.fillRect(18, 22, 3, 3)
    // 右斜线
    npcGraphics.fillRect(30, 16, 3, 3)
    npcGraphics.fillRect(27, 19, 3, 3)
    npcGraphics.fillRect(24, 22, 3, 3)

    // === 面具上的LED发光点 ===
    npcGraphics.fillStyle(0x00e5ff)
    npcGraphics.fillRect(14, 18, 2, 2)
    npcGraphics.fillRect(32, 18, 2, 2)

    // === 嘴巴（坏笑）===
    npcGraphics.fillStyle(0x880e4f)
    npcGraphics.fillRect(18, 32, 12, 3)
    // 嘴角上扬
    npcGraphics.fillRect(16, 30, 2, 2)
    npcGraphics.fillRect(30, 30, 2, 2)

    // === 耳机（黑色大耳机）===
    npcGraphics.fillStyle(0x1a1a2e)
    // 左耳罩
    npcGraphics.fillRect(2, 14, 8, 14)
    // 右耳罩
    npcGraphics.fillRect(38, 14, 8, 14)
    // 头梁
    npcGraphics.fillRect(6, 8, 36, 4)
    // 发光装饰
    npcGraphics.fillStyle(0xff0055)
    npcGraphics.fillRect(4, 18, 2, 6)
    npcGraphics.fillRect(42, 18, 2, 6)

    // === 身体（黑色连帽衫）===
    npcGraphics.fillStyle(0x1a1a2e)
    npcGraphics.fillRect(8, 36, 32, 24)
    // 兜帽边缘
    npcGraphics.fillStyle(0x2d3436)
    npcGraphics.fillRect(6, 34, 36, 6)
    // 胸前图案（骷髅简笔画）
    npcGraphics.fillStyle(0xffffff)
    npcGraphics.fillCircle(24, 46, 4)
    npcGraphics.fillRect(22, 50, 4, 4)
    npcGraphics.fillRect(20, 54, 2, 3)
    npcGraphics.fillRect(26, 54, 2, 3)

    // === 脖子 ===
    npcGraphics.fillStyle(0xf5d0b0)
    npcGraphics.fillRect(20, 34, 8, 4)

    // === 手臂（从袖子里伸出来）===
    npcGraphics.fillStyle(0x1a1a2e)
    npcGraphics.fillRect(2, 40, 8, 12)
    npcGraphics.fillRect(38, 40, 8, 12)
    // 手
    npcGraphics.fillStyle(0xf5d0b0)
    npcGraphics.fillRect(2, 50, 6, 6)
    npcGraphics.fillRect(40, 50, 6, 6)

    // === 发光的USB设备挂在脖子上 ===
    npcGraphics.fillStyle(0xffeb3b)
    npcGraphics.fillRect(22, 52, 4, 6)
    npcGraphics.fillStyle(0x00e5ff)
    npcGraphics.fillRect(23, 53, 2, 2)

    npcGraphics.generateTexture('npc', 48, 60)

    // 地板纹理 - 木质地板
    const floorGraphics = this.make.graphics({ x: 0, y: 0 })
    floorGraphics.fillStyle(0xd4a373)  // 木色
    floorGraphics.fillRect(0, 0, 32, 32)
    // 木板纹理线条
    floorGraphics.lineStyle(1, 0xbc8a5f)
    floorGraphics.beginPath()
    floorGraphics.moveTo(0, 8)
    floorGraphics.lineTo(32, 8)
    floorGraphics.moveTo(0, 16)
    floorGraphics.lineTo(32, 16)
    floorGraphics.moveTo(0, 24)
    floorGraphics.lineTo(32, 24)
    floorGraphics.strokePath()
    // 木板间隙
    floorGraphics.lineStyle(1, 0xa67c52)
    floorGraphics.beginPath()
    floorGraphics.moveTo(16, 0)
    floorGraphics.lineTo(16, 32)
    floorGraphics.strokePath()
    floorGraphics.generateTexture('floor', 32, 32)

    // 墙壁纹理
    const wallGraphics = this.make.graphics({ x: 0, y: 0 })
    wallGraphics.fillStyle(0xf5f5dc)  // 米色墙壁
    wallGraphics.fillRect(0, 0, 32, 32)
    // 墙壁纹理
    wallGraphics.fillStyle(0xe8e8d0)
    wallGraphics.fillRect(2, 2, 28, 28)
    wallGraphics.generateTexture('wall', 32, 32)

    // 地毯纹理
    const carpetGraphics = this.make.graphics({ x: 0, y: 0 })
    carpetGraphics.fillStyle(0x74b9ff)  // 浅蓝色地毯
    carpetGraphics.fillRect(0, 0, 32, 32)
    // 地毯花纹
    carpetGraphics.fillStyle(0x0984e3, 0.3)
    carpetGraphics.fillCircle(8, 8, 4)
    carpetGraphics.fillCircle(24, 24, 4)
    carpetGraphics.fillCircle(8, 24, 4)
    carpetGraphics.fillCircle(24, 8, 4)
    carpetGraphics.generateTexture('carpet', 32, 32)

    // 桌子纹理 - 俯视
    const deskGraphics = this.make.graphics({ x: 0, y: 0 })
    // 桌面
    deskGraphics.fillStyle(0x8b4513)
    deskGraphics.fillRect(4, 4, 56, 40)
    // 桌面高光
    deskGraphics.fillStyle(0xa0522d)
    deskGraphics.fillRect(6, 6, 52, 36)
    // 抽屉
    deskGraphics.fillStyle(0x654321)
    deskGraphics.fillRect(8, 10, 20, 12)
    deskGraphics.fillRect(8, 26, 20, 12)
    deskGraphics.fillRect(36, 10, 20, 12)
    deskGraphics.fillRect(36, 26, 20, 12)
    // 抽屉把手
    deskGraphics.fillStyle(0xffd700)
    deskGraphics.fillCircle(18, 16, 2)
    deskGraphics.fillCircle(18, 32, 2)
    deskGraphics.fillCircle(46, 16, 2)
    deskGraphics.fillCircle(46, 32, 2)
    deskGraphics.generateTexture('desk', 64, 48)

    // 椅子纹理 - 俯视
    const chairGraphics = this.make.graphics({ x: 0, y: 0 })
    // 椅子座
    chairGraphics.fillStyle(0x2d3436)
    chairGraphics.fillCircle(16, 16, 12)
    // 椅子背
    chairGraphics.fillStyle(0x636e72)
    chairGraphics.fillCircle(16, 16, 8)
    // 椅子腿（从俯视角度看）
    chairGraphics.fillStyle(0x2d3436)
    chairGraphics.fillRect(6, 6, 4, 4)
    chairGraphics.fillRect(22, 6, 4, 4)
    chairGraphics.fillRect(6, 22, 4, 4)
    chairGraphics.fillRect(22, 22, 4, 4)
    chairGraphics.generateTexture('chair', 32, 32)

    // 电脑纹理 - 俯视
    const computerGraphics = this.make.graphics({ x: 0, y: 0 })
    // 显示器底座
    computerGraphics.fillStyle(0x2d3436)
    computerGraphics.fillRect(12, 20, 24, 8)
    // 显示器屏幕
    computerGraphics.fillStyle(0x1a1a2e)
    computerGraphics.fillRect(8, 4, 32, 20)
    // 屏幕发光
    computerGraphics.fillStyle(0x74b9ff)
    computerGraphics.fillRect(10, 6, 28, 16)
    // 代码行
    computerGraphics.fillStyle(0xffffff, 0.7)
    computerGraphics.fillRect(12, 8, 20, 2)
    computerGraphics.fillRect(12, 12, 16, 2)
    computerGraphics.fillRect(12, 16, 24, 2)
    computerGraphics.generateTexture('computer', 48, 32)

    // 植物纹理 - 俯视
    const plantGraphics = this.make.graphics({ x: 0, y: 0 })
    // 花盆
    plantGraphics.fillStyle(0xd2691e)
    plantGraphics.fillCircle(16, 20, 10)
    plantGraphics.fillStyle(0x8b4513)
    plantGraphics.fillCircle(16, 18, 8)
    // 植物叶子
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
    // 尖角
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

    // 地毯（中间区域）- 适应左侧面板
    for (let x = 50; x < 250; x += 32) {
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

    // 墙壁装饰（简化表示）
    this.add.rectangle(width / 2, 10, width, 20, 0xf5f5dc)

    // 黑客风格装饰 - 墙上的屏幕
    this.createWallScreen(80, 50)
    this.createWallScreen(220, 50)

    // 地上的服务器箱（带发光灯）
    this.createServerBox(30, 280)
    this.createServerBox(270, 320)
  }

  private createWallScreen(x: number, y: number) {
    // 屏幕边框
    this.add.rectangle(x, y, 60, 40, 0x1a1a2e)
    // 屏幕内容（绿色代码效果）
    this.add.rectangle(x, y, 54, 34, 0x00ff00, 0.2)
    // 代码行
    for (let i = 0; i < 3; i++) {
      const lineWidth = 30 + Math.random() * 20
      this.add.rectangle(x - 10 + lineWidth / 2, y - 10 + i * 10, lineWidth, 4, 0x00ff00, 0.6)
    }
  }

  private createServerBox(x: number, y: number) {
    // 服务器箱体
    this.add.rectangle(x, y, 40, 50, 0x2d3436)
    // 指示灯
    this.add.circle(x - 10, y - 15, 3, 0xff0055)
    this.add.circle(x, y - 15, 3, 0x00ff00)
    this.add.circle(x + 10, y - 15, 3, 0x00e5ff)
    // 散热孔
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(x, y + i * 8, 30, 3, 0x1a1a2e)
    }
  }

  // ========== 创建卡通AI角色 ==========

  private createNPC() {
    this.npc = this.add.container(this.NPC_X, this.NPC_Y)

    // 身体精灵
    const body = this.add.sprite(0, 0, 'npc')
      .setOrigin(0.5, 0.5)
      .setScale(this.SCALE)

    // 阴影
    const shadow = this.add.ellipse(0, 58, 44, 14, 0x000000, 0.25)
    shadow.setName('shadow')

    this.npc.add([shadow, body])
  }

  // ========== 创建说话气泡 ==========

  private createSpeechBubble() {
    this.speechBubble = this.add.container(this.NPC_X, this.NPC_Y - 60)
    this.speechBubble.setVisible(false)
    this.speechBubble.setScale(0)

    // 气泡背景
    const bg = this.add.image(0, 0, 'speechBubble').setOrigin(0.5)

    // 文本
    const text = this.add.text(0, -5, '...', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: '#2d3436',
      align: 'center'
    }).setOrigin(0.5)

    this.speechBubble.add([bg, text])
    this.speechBubble.setData('text', text)
  }

  // ========== 动画控制 ==========

  private updateNPCAnimation() {
    const body = this.npc.getAt(1) as Phaser.GameObjects.Sprite

    // 清除现有动画
    this.tweens.killTweensOf(this.npc)
    this.bounceTimer?.remove()

    switch (this.robotStatus) {
      case 'idle':
        // 待机动画 - 轻微上下浮动
        this.tweens.add({
          targets: this.npc,
          y: this.NPC_Y - 3,
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
        break

      case 'thinking':
        // 思考动画 - 摇晃
        this.tweens.add({
          targets: this.npc,
          angle: { from: -10, to: 10 },
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
        // 显示思考气泡
        this.showSpeechBubble('思考中...')
        break

      case 'speaking':
        // 说话动画 - 弹跳
        this.bounceTimer = this.time.addEvent({
          delay: 200,
          callback: () => {
            this.tweens.add({
              targets: this.npc,
              scaleY: 0.9,
              duration: 100,
              yoyo: true
            })
          },
          repeat: -1
        })
        // 显示说话气泡
        this.showSpeechBubble('说话中...')
        break
    }
  }

  private showSpeechBubble(text: string) {
    const textObj = this.speechBubble.getData('text') as Phaser.GameObjects.Text
    textObj.setText(text)

    this.speechBubble.setVisible(true)
    this.tweens.add({
      targets: this.speechBubble,
      scale: { from: 0, to: 1 },
      duration: 200,
      ease: 'Back.easeOut'
    })
  }

  private hideSpeechBubble() {
    this.tweens.add({
      targets: this.speechBubble,
      scale: 0,
      duration: 150,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.speechBubble.setVisible(false)
      }
    })
  }

  // ========== 对话功能 ==========

  showPlayerDialog(text: string) {
    // 玩家说话时，AI转头看向玩家（简单动画）
    this.tweens.add({
      targets: this.npc,
      x: this.NPC_X + 10,
      duration: 200,
      yoyo: true
    })
  }

  showNPCDialog(text: string, onComplete?: () => void) {
    // 不显示完整文本，只显示气泡提示
    // 实际内容在右侧聊天面板显示

    // 隐藏思考气泡，显示说话气泡
    this.showSpeechBubble('💬')

    // 3秒后隐藏气泡并触发完成
    this.time.delayedCall(3000, () => {
      this.hideSpeechBubble()
      onComplete?.()
    })
  }
}
