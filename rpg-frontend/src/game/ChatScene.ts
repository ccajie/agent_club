import { Scene } from 'phaser'
import type { RobotStatus, AgentState, AgentInfo } from '../types'

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
  private agentStates: Map<string, AgentState> = new Map()
  private agentDirections: Map<string, string> = new Map()
  private bounceTimers: Map<string, Phaser.Time.TimerEvent> = new Map()
  private speechTimers: Map<string, Phaser.Time.TimerEvent> = new Map()
  private agents: AgentInfo[] = []

  private readonly NPC_SCALE = 1.35
  private readonly MAX_AGENTS = 10
  private readonly MAP_WIDTH = 720
  private readonly MAP_HEIGHT = 480
  private sceneScale = 1
  private mapLayers: Phaser.Tilemaps.TilemapLayer[] = []
  private collisionRects: Array<{ x: number; y: number; width: number; height: number }> = []

  // 移动相关状态
  private selectedAgent: string | null = null
  private agentMapPositions: Map<string, { x: number; y: number }> = new Map()
  private selectionRing: Phaser.GameObjects.Ellipse | null = null
  private moveTweens: Map<string, Phaser.Tweens.Tween> = new Map()

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
    this.speechTimers.forEach(timer => timer.remove())
    this.speechTimers.clear()
    this.agentStates.clear()
    this.agentDirections.clear()
  }

  setRobotStatus(status: RobotStatus, agentName?: string) {
    if (!agentName) {
      const hadActiveStatus = Array.from(this.agentStates.values()).some(s => s !== 'idle')
      this.npcs.forEach((_, name) => {
        this.transitionState(name, status)
      })
      if (hadActiveStatus || status !== 'idle') {
        // transitionState 已处理动画，无需额外调用
      }
      return
    }
    this.transitionState(agentName, status)
  }

  // ========== 生命周期 ==========

  preload() {
    // Tiled 地图（tileset 已内嵌）
    this.load.tilemapTiledJSON('library', '/assets/maps/library.tmj')
    // 瓦片图片（被内嵌 tileset 引用）
    this.load.image('libmap', '/assets/maps/libmap.png')

    // 帧动画精灵图：4行(下/左/右/上) × N列
    // worker: 单帧 64×128；idle: 512×512 → 4行 × 8列；walk: 640×512 → 4行 × 10列
    this.load.spritesheet('worker1_idle', '/assets/characters/worker1_idle.png', { frameWidth: 64, frameHeight: 128 })
    this.load.spritesheet('worker1_walk', '/assets/characters/worker1_walking.png', { frameWidth: 64, frameHeight: 128 })

    // manager: 单帧 48×96；idle/walk: 576×384 → 4行 × 12列
    this.load.spritesheet('manager_idle', '/assets/characters/manager_idle.png', { frameWidth: 48, frameHeight: 96 })
    this.load.spritesheet('manager_walk', '/assets/characters/manager_walking.png', { frameWidth: 48, frameHeight: 96 })

    // 代码生成纹理回退（角色 + 气泡）
    this.createPixelTexturesFallback()
  }

  create() {
    // 创建 Tiled 地图
    this.createTilemap()

    // 创建角色帧动画
    this.createAnimations()

    // 创建 NPC
    if (this.agents.length > 0) {
      this.createNPCs()
      this.createSpeechBubbles()
      this.npcs.forEach((_, name) => {
        this.transitionState(name, 'idle')
      })
    }

    // 全局鼠标点击：点击空白处移动选中的 agent
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 如果点击到了交互对象（如 NPC body），不处理
      // 因为 NPC body 的 pointerdown 会 stopPropagation
      if (this.selectedAgent) {
        this.onMapClick(pointer.x, pointer.y)
      }
    })

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
      this.collisionRects = collisionLayer.objects.map(obj => ({
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        width: obj.width ?? 0,
        height: obj.height ?? 0,
      }))
      console.log(`[collision] Loaded ${this.collisionRects.length} rects:`, this.collisionRects)
    } else {
      console.warn('[collision] No collisions layer found!')
      this.collisionRects = []
    }
  }

  // ========== 帧动画 ==========

  private createAnimations() {
    const DIRS = ['down', 'left', 'right', 'up'] as const

    // worker1 idle: 4行 × 8列，单帧 64×128
    if (this.textures.exists('worker1_idle')) {
      const cols = 8
      for (let row = 0; row < 4; row++) {
        const dir = DIRS[row]
        const start = row * cols
        const frames = this.anims.generateFrameNumbers('worker1_idle', { start, end: start + cols - 1 })
        if (!frames || frames.length === 0) continue
        this.anims.create({ key: `worker1_idle_${dir}`, frames, frameRate: 6, repeat: -1 })
        this.anims.create({ key: `worker1_thinking_${dir}`, frames, frameRate: 6, repeat: -1 })
        this.anims.create({ key: `worker1_speaking_${dir}`, frames, frameRate: 8, repeat: -1 })
      }
    }

    // worker1 walk: 4行 × 10列，单帧 64×128
    if (this.textures.exists('worker1_walk')) {
      const cols = 10
      for (let row = 0; row < 4; row++) {
        const dir = DIRS[row]
        const start = row * cols
        const frames = this.anims.generateFrameNumbers('worker1_walk', { start, end: start + cols - 1 })
        if (!frames || frames.length === 0) continue
        this.anims.create({ key: `worker1_walk_${dir}`, frames, frameRate: 10, repeat: -1 })
      }
    }

    // manager idle: 4行 × 12列，单帧 48×96
    if (this.textures.exists('manager_idle')) {
      const cols = 12
      for (let row = 0; row < 4; row++) {
        const dir = DIRS[row]
        const start = row * cols
        const frames = this.anims.generateFrameNumbers('manager_idle', { start, end: start + cols - 1 })
        if (!frames || frames.length === 0) continue
        this.anims.create({ key: `manager_idle_${dir}`, frames, frameRate: 6, repeat: -1 })
        this.anims.create({ key: `manager_thinking_${dir}`, frames, frameRate: 6, repeat: -1 })
        this.anims.create({ key: `manager_speaking_${dir}`, frames, frameRate: 8, repeat: -1 })
      }
    }

    // manager walk: 4行 × 12列，单帧 48×96
    if (this.textures.exists('manager_walk')) {
      const cols = 12
      for (let row = 0; row < 4; row++) {
        const dir = DIRS[row]
        const start = row * cols
        const frames = this.anims.generateFrameNumbers('manager_walk', { start, end: start + cols - 1 })
        if (!frames || frames.length === 0) continue
        this.anims.create({ key: `manager_walk_${dir}`, frames, frameRate: 10, repeat: -1 })
      }
    }
  }

  private getAnimKey(textureKey: string, state: string, direction?: string): string | null {
    // Phaser 播放 walk 动画时会自动把 sprite.texture.key 切到 walk spritesheet，
    // 所以 textureKey 可能是 'worker1_idle'、'worker1_walk'、'manager_idle'、'manager_walk'
    const baseKey = textureKey.replace('_idle', '').replace('_walk', '')
    const suffix = direction ? `_${direction}` : ''
    const key = `${baseKey}_${state}${suffix}`
    return this.anims.exists(key) ? key : null
  }

  private playAgentAnim(agentName: string, state: string, direction?: string) {
    const npc = this.npcs.get(agentName)
    if (!npc) return
    const body = npc.getAt(1) as Phaser.GameObjects.Sprite
    const animKey = this.getAnimKey(body.texture.key, state, direction)
    if (animKey && body.anims.currentAnim?.key !== animKey) {
      body.play(animKey)
    }
  }

  private hasFrameAnim(textureKey: string): boolean {
    const baseKey = textureKey.replace('_idle', '')
    return this.anims.exists(`${baseKey}_idle_down`) || this.anims.exists(`${baseKey}_idle`)
  }

  // ========== 碰撞检测 ==========

  private isFootprintColliding(mapX: number, mapY: number): boolean {
    // NPC 底部 footprint（地图坐标）：宽 30，高 15，中心在 (mapX, mapY)
    const footX = mapX - 15
    const footY = mapY - 12
    const footW = 30
    const footH = 12
    const colliding = this.collisionRects.some(r =>
      footX < r.x + r.width && footX + footW > r.x &&
      footY < r.y + r.height && footY + footH > r.y
    )
    if (colliding) {
      console.log(`[collision] (${mapX.toFixed(0)},${mapY.toFixed(0)}) collides with footprint [${footX.toFixed(0)},${footY.toFixed(0)} ${footW}x${footH}]`)
    }
    return colliding
  }

  private findSafePos(mapX: number, mapY: number): { x: number; y: number } {
    if (!this.isFootprintColliding(mapX, mapY)) return { x: mapX, y: mapY }

    // 螺旋搜索：先左右，再上下，步长 10 像素
    for (let radius = 10; radius < 400; radius += 10) {
      // 右
      if (!this.isFootprintColliding(mapX + radius, mapY)) return { x: mapX + radius, y: mapY }
      // 左
      if (!this.isFootprintColliding(mapX - radius, mapY)) return { x: mapX - radius, y: mapY }
      // 上
      if (!this.isFootprintColliding(mapX, mapY - radius)) return { x: mapX, y: mapY - radius }
      // 下
      if (!this.isFootprintColliding(mapX, mapY + radius)) return { x: mapX, y: mapY + radius }
      // 四个对角
      if (!this.isFootprintColliding(mapX + radius, mapY - radius)) return { x: mapX + radius, y: mapY - radius }
      if (!this.isFootprintColliding(mapX - radius, mapY - radius)) return { x: mapX - radius, y: mapY - radius }
      if (!this.isFootprintColliding(mapX + radius, mapY + radius)) return { x: mapX + radius, y: mapY + radius }
      if (!this.isFootprintColliding(mapX - radius, mapY + radius)) return { x: mapX - radius, y: mapY + radius }
    }
    return { x: mapX, y: mapY }
  }

  private findSafeRandomPos(): { x: number; y: number } {
    // 中间区域随机生成，避免贴边
    const marginX = 120
    const marginY = 100
    const minX = marginX
    const maxX = this.MAP_WIDTH - marginX
    const minY = marginY
    const maxY = this.MAP_HEIGHT - marginY

    // 先随机尝试 30 次
    for (let i = 0; i < 30; i++) {
      const mapX = minX + Math.random() * (maxX - minX)
      const mapY = minY + Math.random() * (maxY - minY)
      if (!this.isFootprintColliding(mapX, mapY)) {
        return { x: mapX, y: mapY }
      }
    }

    // fallback：从中心螺旋搜索
    return this.findSafePos(this.MAP_WIDTH / 2, this.MAP_HEIGHT / 2)
  }

  // ========== NPC ==========

  private createNPCs() {
    const count = this.agents.length
    if (count === 0) return

    const scaledW = this.MAP_WIDTH * this.sceneScale
    const scaledH = this.MAP_HEIGHT * this.sceneScale
    const offsetX = (this.cameras.main.width - scaledW) / 2
    const offsetY = (this.cameras.main.height - scaledH) / 2

    this.agents.forEach((agent, index) => {
      let mapX: number, mapY: number
      const saved = this.agentMapPositions.get(agent.name)
      if (saved) {
        mapX = saved.x
        mapY = saved.y
      } else {
        const safe = this.findSafeRandomPos()
        mapX = safe.x
        mapY = safe.y
      }

      const screenX = offsetX + mapX * this.sceneScale
      const screenY = offsetY + mapY * this.sceneScale

      const isManager = agent.avatar_type === 'manager' || agent.id === 'manager_default'
      const texture = this.resolveAgentTexture(agent.name, isManager)

      this.createSingleNPC(agent.name, screenX, screenY, texture, index, mapX, mapY)
    })
  }

  private resolveAgentTexture(name: string, isManager: boolean): string {
    if (isManager) {
      if (this.textures.exists('manager_idle')) return 'manager_idle'
      return MANAGER_CONFIG.texture
    }
    if (this.textures.exists('worker1_idle')) return 'worker1_idle'
    return this.getAgentTextureByName(name)
  }

  private createSingleNPC(name: string, screenX: number, screenY: number, textureKey: string, index: number, mapX: number, mapY: number) {
    const npc = this.add.container(screenX, screenY)

    const isManagerAnim = textureKey === 'manager_idle'
    const bodyScale = isManagerAnim ? 1.8 : this.NPC_SCALE
    const body = this.add.sprite(0, 0, textureKey)
      .setOrigin(0.5, 0.5)
      .setScale(bodyScale)
      .setInteractive({ cursor: 'pointer' })

    // 点击 NPC 选中/取消选中，阻止事件冒泡到地图
    body.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      this.onNPCClick(name)
    })

    // 如果有帧动画，立即播放 idle（朝下）
    if (this.hasFrameAnim(textureKey)) {
      const animKey = this.getAnimKey(textureKey, 'idle', 'down')
      if (animKey) body.play(animKey)
    }

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

    // 记录地图坐标
    this.agentMapPositions.set(name, { x: mapX, y: mapY })

    // 初始化状态机状态
    this.agentStates.set(name, 'idle')
    this.agentDirections.set(name, 'down')

    // 无帧动画时才用 tween 做 idle 浮动
    if (!this.hasFrameAnim(textureKey)) {
      this.startIdleAnimation(name, index * 200)
    }
  }

  private recreateNPCs() {
    this.npcs.forEach(npc => npc.destroy())
    this.speechBubbles.forEach(bubble => bubble.destroy())
    this.npcs.clear()
    this.speechBubbles.clear()
    this.tweens.killAll()
    this.bounceTimers.forEach(timer => timer.remove())
    this.bounceTimers.clear()
    this.speechTimers.forEach(timer => timer.remove())
    this.speechTimers.clear()
    this.moveTweens.forEach(tween => tween.stop())
    this.moveTweens.clear()
    this.agentStates.clear()
    this.agentDirections.clear()
    this.selectedAgent = null
    this.selectionRing?.destroy()
    this.selectionRing = null

    this.createTilemap()

    if (this.agents.length > 0) {
      this.createNPCs()
      this.createSpeechBubbles()
      this.npcs.forEach((_, name) => {
        this.transitionState(name, 'idle')
      })
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const width = gameSize.width
    const height = gameSize.height
    this.cameras.main.setBounds(0, 0, width, height)
    this.recreateNPCs()
  }

  // ========== 状态机 ==========

  private transitionState(agentName: string, newState: AgentState, direction?: string) {
    const npc = this.npcs.get(agentName)
    if (!npc) return

    // 1. 始终清理旧效果（移动中再次点击需要 stop 旧 tween）
    this.clearAgentEffects(agentName)

    // 2. 更新状态与方向（即使状态相同也要更新方向）
    this.agentStates.set(agentName, newState)
    if (direction) {
      this.agentDirections.set(agentName, direction)
    }

    // 3. 应用新状态的视觉表现（始终执行，确保动画正确播放）
    this.applyStateVisuals(agentName, newState)
  }

  private clearAgentEffects(agentName: string) {
    const npc = this.npcs.get(agentName)
    if (npc) this.tweens.killTweensOf(npc)

    const bounceTimer = this.bounceTimers.get(agentName)
    if (bounceTimer) {
      bounceTimer.remove()
      this.bounceTimers.delete(agentName)
    }

    const moveTween = this.moveTweens.get(agentName)
    if (moveTween) {
      moveTween.stop()
      this.moveTweens.delete(agentName)
    }
  }

  private applyStateVisuals(agentName: string, state: AgentState) {
    const npc = this.npcs.get(agentName)
    if (!npc) return

    const body = npc.getAt(1) as Phaser.GameObjects.Sprite
    const hasAnim = this.hasFrameAnim(body.texture.key)
    const dir = this.agentDirections.get(agentName) ?? 'down'


    switch (state) {
      case 'idle':
        if (hasAnim) {
          this.playAgentAnim(agentName, 'idle', dir)
        } else {
          this.startIdleAnimation(agentName)
        }
        break
      case 'walking':
        if (hasAnim) {
          this.playAgentAnim(agentName, 'walk', dir)
        }
        break
      case 'thinking':
        if (hasAnim) {
          this.playAgentAnim(agentName, 'thinking', dir)
        } else {
          this.tweens.add({
            targets: npc,
            angle: { from: -5, to: 5 },
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          })
        }
        break
      case 'speaking':
        if (hasAnim) {
          this.playAgentAnim(agentName, 'speaking', dir)
        } else {
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
        }
        break
    }
  }

  // ========== 移动与选中 ==========

  private screenToMap(screenX: number, screenY: number): { x: number; y: number } {
    const scaledW = this.MAP_WIDTH * this.sceneScale
    const scaledH = this.MAP_HEIGHT * this.sceneScale
    const offsetX = (this.cameras.main.width - scaledW) / 2
    const offsetY = (this.cameras.main.height - scaledH) / 2
    return {
      x: (screenX - offsetX) / this.sceneScale,
      y: (screenY - offsetY) / this.sceneScale,
    }
  }

  private mapToScreen(mapX: number, mapY: number): { x: number; y: number } {
    const scaledW = this.MAP_WIDTH * this.sceneScale
    const scaledH = this.MAP_HEIGHT * this.sceneScale
    const offsetX = (this.cameras.main.width - scaledW) / 2
    const offsetY = (this.cameras.main.height - scaledH) / 2
    return {
      x: offsetX + mapX * this.sceneScale,
      y: offsetY + mapY * this.sceneScale,
    }
  }

  private onNPCClick(name: string) {
    if (this.selectedAgent === name) {
      // 再次点击，取消选中
      this.selectedAgent = null
      this.selectionRing?.destroy()
      this.selectionRing = null
    } else {
      // 选中新的（或首次选中），先取消旧的
      this.selectionRing?.destroy()
      this.selectionRing = null
      this.selectedAgent = name
      this.updateSelectionRing()
    }
  }

  private updateSelectionRing() {
    if (!this.selectedAgent) return
    const npc = this.npcs.get(this.selectedAgent)
    if (!npc) return

    this.selectionRing = this.add.ellipse(npc.x, npc.y + 58, 50, 18, 0xffd700, 0.6)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffa500)
      .setDepth(95)
  }

  private onMapClick(screenX: number, screenY: number) {
    if (!this.selectedAgent) return

    const targetMap = this.screenToMap(screenX, screenY)

    // 边界限制
    if (targetMap.x < 0 || targetMap.x > this.MAP_WIDTH || targetMap.y < 0 || targetMap.y > this.MAP_HEIGHT) {
      return
    }

    // 检查碰撞
    if (this.isFootprintColliding(targetMap.x, targetMap.y)) {
      return
    }

    this.moveAgentTo(this.selectedAgent, targetMap.x, targetMap.y)
  }

  private moveAgentTo(name: string, targetMapX: number, targetMapY: number) {
    const npc = this.npcs.get(name)
    if (!npc) return

    const currentPos = this.agentMapPositions.get(name)
    if (!currentPos) return

    const dx = targetMapX - currentPos.x
    const dy = targetMapY - currentPos.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < 5) return

    // 判断主方向
    let direction = 'down'
    if (Math.abs(dx) > Math.abs(dy)) {
      direction = dx > 0 ? 'right' : 'left'
    } else {
      direction = dy > 0 ? 'down' : 'up'
    }

    // 通过状态机进入 walking 状态（自动清理旧效果、播放 walk 动画）
    this.transitionState(name, 'walking', direction)

    const targetScreen = this.mapToScreen(targetMapX, targetMapY)
    const speed = distance * 6  // 约 6ms/像素，速度减半

    // 用 proxy 对象作为 tween target，避免 killTweensOf(npc) 杀掉移动 tween
    const proxy = { x: npc.x, y: npc.y }

    const tween = this.tweens.add({
      targets: proxy,
      x: targetScreen.x,
      y: targetScreen.y,
      duration: Math.min(speed, 2000),
      ease: 'Linear',
      onUpdate: () => {
        npc.x = proxy.x
        npc.y = proxy.y
        // 同步气泡
        const bubble = this.speechBubbles.get(name)
        if (bubble) {
          bubble.x = npc.x
          bubble.y = npc.y - 125
        }
        // 同步光圈
        if (this.selectionRing && this.selectedAgent === name) {
          this.selectionRing.x = npc.x
          this.selectionRing.y = npc.y + 58
        }
      },
      onComplete: () => {
        this.agentMapPositions.set(name, { x: targetMapX, y: targetMapY })
        this.moveTweens.delete(name)

        // 移动完成：直接恢复 idle 动画，不经过 transitionState
        // 避免 clearAgentEffects 中 killTweensOf 的潜在副作用
        this.agentStates.set(name, 'idle')
        const body = npc.getAt(1) as Phaser.GameObjects.Sprite
        const dir = this.agentDirections.get(name) ?? 'down'
        const idleAnimKey = this.getAnimKey(body.texture.key, 'idle', dir)
        if (idleAnimKey) {
          body.play(idleAnimKey)
        }
        // 无帧动画角色启动 idle 浮动
        if (!this.hasFrameAnim(body.texture.key)) {
          this.startIdleAnimation(name)
        }
      },
    })

    this.moveTweens.set(name, tween)
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
      const bubble = this.add.container(npc.x, npc.y - 125)
      bubble.setVisible(false)
      bubble.setScale(0)

      const bg = this.add.image(0, 0, 'speechBubble').setOrigin(0.5)
      const text = this.add.text(0, 0, '...', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '11px',
        color: '#2d3436',
        align: 'left',
        lineSpacing: 0,
      }).setOrigin(0.5)

      bubble.add([bg, text])
      bubble.setData('text', text)
      bubble.setDepth(200)
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

      // 取消气泡上任何正在运行的 tween（防止旧的 hide 动画把气泡缩没）
      this.tweens.killTweensOf(bubble)

      if (bubble.visible) {
        // 已经在显示（或正在入场/退场中），只更新文本并确保缩放到正常大小
        bubble.setScale(1)
        return
      }

      // 首次显示，播放入场动画
      bubble.setVisible(true)
      bubble.setScale(0)
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
      if (!bubble || !bubble.visible) return
      // 取消可能正在运行的入场/更新 tween，避免冲突
      this.tweens.killTweensOf(bubble)
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

  private wrapTextByChars(text: string, maxChars: number): string {
    const lines: string[] = []
    for (let i = 0; i < text.length; i += maxChars) {
      lines.push(text.slice(i, i + maxChars))
    }
    return lines.join('\n')
  }

  showNPCDialog(text: string, agentName?: string, onComplete?: () => void) {
    const MAX_LEN = 50
    const CHARS_PER_LINE = 18
    // 去掉换行，紧凑成纯文本
    const compact = text.replace(/\r?\n/g, '')
    const truncated = compact.length > MAX_LEN ? compact.slice(0, MAX_LEN) + '...' : compact
    const displayText = this.wrapTextByChars(truncated, CHARS_PER_LINE)

    // 清除该角色之前的隐藏定时器
    const oldTimer = agentName ? this.speechTimers.get(agentName) : null
    if (oldTimer) {
      oldTimer.remove()
      this.speechTimers.delete(agentName!)
    }

    this.showSpeechBubble(displayText, agentName)

    const timer = this.time.delayedCall(30000, () => {
      this.hideSpeechBubble(agentName)
      if (agentName) this.speechTimers.delete(agentName)
      onComplete?.()
    })

    if (agentName) {
      this.speechTimers.set(agentName, timer)
    }
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
    const BW = 260
    const BH = 90
    const arrowH = 14
    const padY = 14
    const totalH = BH + arrowH + padY
    const tipX = BW / 2
    const tipY = padY + BH
    // 圆角矩形在纹理中垂直居中，中心与纹理中心对齐
    bubbleGraphics.fillStyle(0xffffff)
    bubbleGraphics.fillRoundedRect(0, padY, BW, BH, 12)
    bubbleGraphics.lineStyle(2, 0x2d3436)
    bubbleGraphics.strokeRoundedRect(0, padY, BW, BH, 12)
    bubbleGraphics.fillStyle(0xffffff)
    bubbleGraphics.beginPath()
    bubbleGraphics.moveTo(tipX - 10, tipY)
    bubbleGraphics.lineTo(tipX, tipY + arrowH)
    bubbleGraphics.lineTo(tipX + 10, tipY)
    bubbleGraphics.closePath()
    bubbleGraphics.fillPath()
    bubbleGraphics.lineStyle(2, 0x2d3436)
    bubbleGraphics.beginPath()
    bubbleGraphics.moveTo(tipX - 10, tipY)
    bubbleGraphics.lineTo(tipX, tipY + arrowH)
    bubbleGraphics.lineTo(tipX + 10, tipY)
    bubbleGraphics.strokePath()
    bubbleGraphics.generateTexture('speechBubble', BW, totalH)
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
