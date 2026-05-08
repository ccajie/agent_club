/**
 * 渲染 Tiled 地图 (.tmj) 到 Canvas 作为背景
 */
import { useEffect, useRef } from 'react'

interface TilemapBackgroundProps {
  mapPath: string        // e.g. '/assets/maps/library.tmj'
  tilesetPath: string    // e.g. '/assets/maps/libmap.png'
}

export function TilemapBackground({ mapPath, tilesetPath }: TilemapBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    async function render() {
      // Load map JSON
      const resp = await fetch(mapPath)
      const mapData = await resp.json()

      if (cancelled) return

      const { width, height, tilewidth, tileheight, layers, tilesets } = mapData
      const ts = tilesets[0]
      const columns = ts.columns as number
      const firstgid = ts.firstgid as number

      // Load tileset image
      const img = new Image()
      img.src = tilesetPath
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
      })

      if (cancelled) return

      // Set canvas size to map pixel size
      const mapPixelW = width * tilewidth
      const mapPixelH = height * tileheight
      canvas!.width = mapPixelW
      canvas!.height = mapPixelH

      const ctx = canvas!.getContext('2d')
      if (!ctx) return

      ctx.imageSmoothingEnabled = false

      // Render each visible layer
      for (const layer of layers) {
        if (layer.type !== 'tilelayer' || !layer.data) continue
        if (layer.name === 'collisions') continue

        const data = layer.data as number[]
        for (let i = 0; i < data.length; i++) {
          const gid = data[i]
          if (gid === 0) continue

          const tileIndex = gid - firstgid
          const srcX = (tileIndex % columns) * tilewidth
          const srcY = Math.floor(tileIndex / columns) * tileheight
          const destX = (i % width) * tilewidth
          const destY = Math.floor(i / width) * tileheight

          ctx.drawImage(img, srcX, srcY, tilewidth, tileheight, destX, destY, tilewidth, tileheight)
        }
      }
    }

    render().catch(console.error)

    return () => { cancelled = true }
  }, [mapPath, tilesetPath])

  return (
    <canvas
      ref={canvasRef}
      className="login-bg-canvas"
    />
  )
}
