import { Scene } from 'phaser'
import type { RobotStatus, AgentInfo } from '../types'

// ========== 配置常量 ==========

const MANAGER_CONFIG = {
  texture: 'manager_capitalist',
  hatColor: 0x1a1a1a,
  suitColor: 0x2c2c2c,
  tieColor: 0x8b0000,
  shirtColor: 0xffffff
}

export class ChatScene extends Scene {
  private npcs: Map<string, Phaser.GameObjects.Container> = new Map()
  private speechBubbles: Map<string, Phaser.GameObjects.Container> = new Map()
  private robotStatuses: Map<string, RobotStatus> = new Map()
  private bounceTimers: Map<string, Phaser.Time.TimerEvent> = new Map()
  private agents: AgentInfo[] = []

  private readonly NPC_SCALE = 1.8
  private readonly MAX_AGENTS = 10
  private readonly MAP_WIDTH = 720
  private readonly MAP_HEIGHT = 480
  private sceneScale = 1
  private mapLayers: Phaser.Tilemaps.TilemapLayer[] = []

  constructor() {
    super({ key: 'ChatScene' })
  }

  // ========== 公共 API ==========

  setAgents(agents: AgentInfo[]) {
    this.agents = agents.slice(0, this.MAX_AGENTS)
    if (this.children.length > 0) {
      this.recreateNPCs()
    }
  }

  shutdown() {
    this.bounceTimers.forEach(timer => timer.remove())
    this.bounceTimers.clear()
  }

  setRobotStatus(status: RobotStatus, agentName?: string) {
    if (!agentName) {
      const hadActiveStatus = Array.from(this.robotStatuses.values()).some(s => s !== 'idle')
      this.robotStatuses.clear()
      this.npcs.forEach((_, name) => {
        this.robotStatuses.set(name, status)
      })
      if (hadActiveStatus || status !== 'idle') {
        this.updateAllNPCAnimations()
      }
      return
    }
    const currentStatus = this.robotStatuses.get(agentName)
    if (currentStatus === status) return
    this.robotStatuses.set(agentName, status)
    this.updateNPCAnimation(agentName)
  }

  // ========== 生命周期 ==========

  preload() {
    // Tiled 地图（tileset 已内嵌）
    this.load.tilemapTiledJSON('library', '/assets/maps/library.tmj')
    // 瓦片图片（被内嵌 tileset 引用）
    this.load.image('libmap', '/assets/maps/libmap.png')

    // 外部角色图（可选，不存在则回退代码生成）
    this.load.image('manager', '/assets/characters/manager.png')
    this.load.image('worker_1', '/assets/characters/worker_1.png')
    this.load.image('worker_2', '/assets/characters/worker_2.png')

    // 代码生成纹理回退（角色 + 气泡）
    this.createPixelTexturesFallback()
  }

  create() {
    // 创建 Tiled 地图
    this.createTilemap()

    // 创建 NPC
    if (this.agents.length > 0) {
      this.createNPCs()
      this.createSpeechBubbles()
      this.npcs.forEach((_, name) => {
        this.robotStatuses.set(name, 'idle')
      })
      this.updateAllNPCAnimations()
    }

    this.scale.on('resize', this.handleResize, this)
  }

  // ========== Tiled 地图渲染 ==========

  private createTilemap() {
    // 清理旧图层
    this.mapLayers.forEach(l => l.destroy())
    this.mapLayers = []

    const map = this.make.tilemap({ key: 'library' })

    const tileset = map.addTilesetImage('libassetpack-tiled', 'libmap')
    if (!tileset) {
      console.error('Failed to add tileset')
      return
    }

    this.sceneScale = Math.min(
      this.cameras.main.width / this.MAP_WIDTH,
      this.cameras.main.height / this.MAP_HEIGHT
    )

    const layers = [
      map.createLayer('ground', tileset),
      map.createLayer('decorate', tileset),
      map.createLayer('items', tileset),
      map.createLayer('items2', tileset),
      map.createLayer('item3', tileset),
    ]

    const scaledW = this.MAP_WIDTH * this.sceneScale
    const scaledH = this.MAP_HEIGHT * this.sceneScale
    const offsetX = (this.cameras.main.width - scaledW) / 2
    const offsetY = (this.cameras.main.height - scaledH) / 2

    layers.forEach((layer, index) => {
      if (!layer) return
      layer.setPosition(offsetX, offsetY)
      layer.setScale(this.sceneScale)
      layer.setDepth(-10 + index * 5)
      this.mapLayers.push(layer)
    })

    const collisionLayer = map.getObjectLayer('collisions')
    if (collisionLayer) {
      console.log(`Loaded collision layer with ${collisionLayer.objects.length} objects`)
    }
  }

  // ========== NPC ==========

  private createNPCs() {
    const count = this.agents.length
    if (count === 0) return

    const margin = 60
    const usableWidth = this.MAP_WIDTH - margin * 2
    const spacing = count > 1 ? usableWidth / (count - 1) : 0
    const startX = margin

    const scaledW = this.MAP_WIDTH * this.sceneScale
    const scaledH = this.MAP_HEIGHT * this.sceneScale
    const offsetX = (this.cameras.main.width - scaledW) / 2
    const offsetY = (this.cameras.main.height - scaledH) / 2

    this.agents.forEach((agent, index) => {
      const mapX = count === 1 ? this.MAP_WIDTH / 2 : startX + index * spacing
      const mapY = this.MAP_HEIGHT - 60
      const x = offsetX + mapX * this.sceneScale
      const y = offsetY + mapY * this.sceneScale

      const isManager = agent.avatar_type === 'manager' || agent.id === 'manager_default'
      const texture = this.resolveAgentTexture(agent.name, isManager)

      this.createSingleNPC(agent.name, x, y, texture, index)
    })
  }

  private resolveAgentTexture(name: string, isManager: boolean): string {
    if (isManager) {
      return this.textures.exists('manager') ? 'manager' : MANAGER_CONFIG.texture
    }
    const hash = this.getAgentTextureByName(name)
    if (hash === 'aiden' && this.textures.exists('worker_1')) return 'worker_1'
    if (hash === 'wrench' && this.textures.exists('worker_2')) return 'worker_2'
    return hash
  }

  private createSingleNPC(name: string, x: number, y: number, textureKey: string, index: number) {
    const npc = this.add.container(x, y)

    const body = this.add.sprite(0, 0, textureKey)
      .setOrigin(0.5, 0.5)
      .setScale(this.NPC_SCALE)

    const shadow = this.add.ellipse(0, 58, 44, 14, 0x000000, 0.25)

    const nameBg = this.add.rectangle(0, -70, 80, 22, 0x000000, 0.6)
    const nameLabel = this.add.text(0, -70, name, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5)

    npc.add([shadow, body, nameBg, nameLabel])
    npc.setDepth(100)
    this.npcs.set(name, npc)

    this.startIdleAnimation(name, index * 200)
  }

  private recreateNPCs() {
    this.npcs.forEach(npc => npc.destroy())
    this.speechBubbles.forEach(bubble => bubble.destroy())
    this.npcs.clear()
    this.speechBubbles.clear()
    this.tweens.killAll()
    this.bounceTimers.forEach(timer => timer.remove())
    this.bounceTimers.clear()

    this.createTilemap()

    if (this.agents.length > 0) {
      this.createNPCs()
      this.createSpeechBubbles()
      this.npcs.forEach((_, name) => {
        this.robotStatuses.set(name, 'idle')
      })
      this.updateAllNPCAnimations()
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const width = gameSize.width
    const height = gameSize.height
    this.cameras.main.setBounds(0, 0, width, height)
    this.recreateNPCs()
  }

  // ========== 动画 ==========

  private updateAllNPCAnimations() {
    this.npcs.forEach((_, name) => this.updateNPCAnimation(name))
  }

  private updateNPCAnimation(agentName: string) {
    const npc = this.npcs.get(agentName)
    if (!npc) return

    const status = this.robotStatuses.get(agentName) || 'idle'
    this.tweens.killTweensOf(npc)
    const existingTimer = this.bounceTimers.get(agentName)
    if (existingTimer) {
      existingTimer.remove()
      this.bounceTimers.delete(agentName)
    }

    switch (status) {
      case 'idle':
        this.startIdleAnimation(agentName)
        this.hideSpeechBubble(agentName)
        break
      case 'thinking':
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

  private startIdleAnimation(agentName: string, delay: number = 0) {
    const npc = this.npcs.get(agentName)
    if (!npc) return
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

  // ========== 气泡 ==========

  private createSpeechBubbles() {
    this.npcs.forEach((npc, name) => {
      const bubble = this.add.container(npc.x, npc.y - 60)
      bubble.setVisible(false)
      bubble.setScale(0)

      const bg = this.add.image(0, 0, 'speechBubble').setOrigin(0.5)
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

  // ========== 纹理回退（代码生成） ==========

  private createPixelTexturesFallback() {
    this.createAidenTexture()
    this.createWrenchTexture()
    this.createManagerTexture()

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

  private getAgentTextureByName(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash) % 2 === 0 ? 'aiden' : 'wrench'
  }

  // ========== 角色纹理生成（回退用） ==========

  private createAidenTexture() {
    const graphics = this.make.graphics({ x: 0, y: 0 })
    graphics.fillStyle(0x5d4037)
    graphics.fillRect(8, 2, 32, 10)
    graphics.fillRect(6, 6, 4, 6)
    graphics.fillRect(38, 6, 4, 6)
    graphics.fillStyle(0x4a3228)
    graphics.fillRect(10, 10, 28, 4)
    graphics.fillStyle(0x3e2723, 0.3)
    graphics.fillRect(10, 12, 28, 2)
    graphics.fillStyle(0xe8c4a8)
    graphics.fillRect(10, 14, 28, 18)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(14, 19, 5, 4)
    graphics.fillRect(29, 19, 5, 4)
    graphics.fillStyle(0xffffff)
    graphics.fillRect(15, 20, 2, 2)
    graphics.fillRect(30, 20, 2, 2)
    graphics.fillStyle(0x3e2723)
    graphics.fillRect(13, 16, 7, 2)
    graphics.fillRect(28, 16, 7, 2)
    graphics.fillStyle(0x5a4a3a)
    graphics.fillRect(20, 30, 8, 2)
    graphics.fillStyle(0x6d4c41)
    graphics.fillRect(16, 32, 16, 8)
    graphics.fillRect(14, 34, 4, 4)
    graphics.fillRect(30, 34, 4, 4)
    graphics.fillStyle(0x5d4037)
    graphics.fillRect(8, 40, 32, 20)
    graphics.fillStyle(0x4a3228)
    graphics.fillRect(8, 38, 6, 10)
    graphics.fillRect(34, 38, 6, 10)
    graphics.fillStyle(0x3e2723)
    graphics.fillRect(23, 46, 2, 2)
    graphics.fillRect(23, 52, 2, 2)
    graphics.fillStyle(0x5d4037)
    graphics.fillRect(2, 44, 8, 14)
    graphics.fillRect(38, 44, 8, 14)
    graphics.fillStyle(0xe8c4a8)
    graphics.fillRect(2, 54, 6, 6)
    graphics.fillRect(40, 54, 6, 6)
    graphics.generateTexture('aiden', 48, 60)
  }

  private createWrenchTexture() {
    const graphics = this.make.graphics({ x: 0, y: 0 })
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(6, 0, 36, 12)
    graphics.fillRect(4, 4, 4, 8)
    graphics.fillRect(40, 4, 4, 8)
    graphics.fillRect(8, -2, 4, 4)
    graphics.fillRect(20, -3, 4, 5)
    graphics.fillRect(32, -2, 4, 4)
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(10, 12, 28, 18)
    graphics.fillStyle(0x424242)
    graphics.fillRect(12, 16, 24, 12)
    graphics.fillStyle(0xffeb3b)
    graphics.fillRect(14, 18, 4, 2)
    graphics.fillRect(18, 20, 4, 2)
    graphics.fillRect(22, 22, 4, 2)
    graphics.fillRect(26, 20, 4, 2)
    graphics.fillRect(30, 18, 4, 2)
    graphics.fillStyle(0x000000)
    graphics.fillRect(16, 18, 4, 4)
    graphics.fillRect(28, 18, 4, 4)
    graphics.fillStyle(0xffeb3b)
    graphics.fillRect(17, 19, 2, 2)
    graphics.fillRect(29, 19, 2, 2)
    graphics.fillStyle(0x880e4f)
    graphics.fillRect(20, 30, 8, 2)
    graphics.fillRect(18, 28, 2, 2)
    graphics.fillRect(28, 28, 2, 2)
    graphics.fillRect(16, 30, 2, 2)
    graphics.fillRect(30, 30, 2, 2)
    graphics.fillStyle(0x212121)
    graphics.fillRect(8, 34, 32, 8)
    graphics.fillRect(6, 36, 4, 6)
    graphics.fillRect(38, 36, 4, 6)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(8, 42, 32, 18)
    graphics.fillStyle(0xffeb3b)
    graphics.fillRect(20, 44, 2, 8)
    graphics.fillRect(26, 44, 2, 8)
    graphics.fillStyle(0xffeb3b)
    graphics.fillRect(22, 50, 4, 4)
    graphics.fillRect(21, 51, 6, 2)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(2, 46, 8, 14)
    graphics.fillRect(38, 46, 8, 14)
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(2, 56, 6, 6)
    graphics.fillRect(40, 56, 6, 6)
    graphics.generateTexture('wrench', 48, 60)
  }

  private createManagerTexture() {
    const { hatColor, suitColor, tieColor, shirtColor } = MANAGER_CONFIG
    const graphics = this.make.graphics({ x: 0, y: 0 })
    graphics.fillStyle(hatColor)
    graphics.fillRect(4, 8, 40, 6)
    graphics.fillRect(10, -4, 28, 14)
    graphics.fillStyle(0x333333)
    graphics.fillRect(10, 8, 28, 3)
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(10, 14, 28, 18)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(14, 20, 5, 4)
    graphics.fillRect(29, 20, 5, 4)
    graphics.fillStyle(0xffffff)
    graphics.fillRect(15, 21, 2, 2)
    graphics.fillStyle(0xffffff)
    graphics.fillRect(30, 21, 2, 2)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(13, 17, 7, 2)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(28, 17, 7, 2)
    graphics.fillStyle(0x4a4a4a)
    graphics.fillRect(20, 32, 8, 2)
    graphics.fillStyle(suitColor)
    graphics.fillRect(8, 36, 14, 24)
    graphics.fillRect(26, 36, 14, 24)
    graphics.fillStyle(shirtColor)
    graphics.fillRect(22, 36, 4, 24)
    graphics.fillRect(20, 36, 8, 6)
    graphics.fillStyle(tieColor)
    graphics.fillRect(22, 40, 4, 12)
    graphics.fillRect(21, 38, 6, 4)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(8, 36, 4, 20)
    graphics.fillStyle(0x1a1a1a)
    graphics.fillRect(36, 36, 4, 20)
    graphics.fillStyle(0xf5d0b0)
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(20, 34, 8, 4)
    graphics.fillStyle(suitColor)
    graphics.fillRect(2, 40, 8, 14)
    graphics.fillRect(38, 40, 8, 14)
    graphics.fillStyle(0xf5d0b0)
    graphics.fillRect(2, 52, 6, 6)
    graphics.fillRect(40, 52, 6, 6)
    graphics.fillStyle(0xffffff)
    graphics.fillRect(32, 42, 4, 3)
    graphics.generateTexture(MANAGER_CONFIG.texture, 48, 60)
  }
}
