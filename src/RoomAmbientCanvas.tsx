import { useEffect, useRef } from 'react'
import { AMBIENT_PALETTES, type AmbientKind, prefersReducedMotion } from './motion'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  maxLife: number
  color: string
  kind: 'dust' | 'bubble' | 'spark' | 'ember' | 'leaf'
  wobble: number
  phase: number
}

type RoomAmbientCanvasProps = {
  ambient: AmbientKind
  className?: string
}

const spawn = (w: number, h: number, ambient: AmbientKind): Particle => {
  const palette = AMBIENT_PALETTES[ambient]
  const color = palette[Math.floor(Math.random() * palette.length)]
  const kind: Particle['kind'] =
    ambient === 'ocean' ? 'bubble' : ambient === 'space' ? 'spark' : ambient === 'castle' ? 'ember' : ambient === 'beach' ? 'leaf' : 'dust'

  return {
    x: Math.random() * w,
    y: h * (0.35 + Math.random() * 0.55),
    vx: (Math.random() - 0.5) * (kind === 'leaf' ? 28 : 12),
    vy:
      kind === 'bubble'
        ? -(12 + Math.random() * 28)
        : kind === 'ember'
          ? -(8 + Math.random() * 18)
          : kind === 'spark'
            ? (Math.random() - 0.5) * 6
            : -(6 + Math.random() * 16),
    size: kind === 'bubble' ? 3 + Math.random() * 5 : kind === 'spark' ? 1.2 + Math.random() * 2 : 2 + Math.random() * 3.5,
    life: 0,
    maxLife: 2.2 + Math.random() * 3.5,
    color,
    kind,
    wobble: 8 + Math.random() * 18,
    phase: Math.random() * Math.PI * 2,
  }
}

export function RoomAmbientCanvas({ ambient, className }: RoomAmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ambientRef = useRef(ambient)
  ambientRef.current = ambient

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || prefersReducedMotion()) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    let w = 0
    let h = 0
    let last = performance.now()
    const particles: Particle[] = []
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    for (let i = 0; i < 28; i++) particles.push(spawn(w || 320, h || 240, ambientRef.current))

    const tick = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const theme = ambientRef.current

      ctx.clearRect(0, 0, w, h)

      // soft vignette glow wash
      const wash = ctx.createLinearGradient(0, 0, 0, h)
      if (theme === 'ocean') {
        wash.addColorStop(0, 'rgba(102,227,255,0.08)')
        wash.addColorStop(1, 'rgba(31,24,61,0.12)')
      } else if (theme === 'space') {
        wash.addColorStop(0, 'rgba(31,24,61,0.15)')
        wash.addColorStop(1, 'rgba(111,108,255,0.1)')
      } else if (theme === 'beach') {
        wash.addColorStop(0, 'rgba(255,215,106,0.1)')
        wash.addColorStop(1, 'rgba(255,154,90,0.08)')
      } else {
        wash.addColorStop(0, 'rgba(255,250,240,0.04)')
        wash.addColorStop(1, 'rgba(31,24,61,0.1)')
      }
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, w, h)

      while (particles.length < 32) particles.push(spawn(w, h, theme))

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life += dt
        p.phase += dt * 3
        p.x += (p.vx + Math.sin(p.phase) * p.wobble * 0.15) * dt
        p.y += p.vy * dt
        if (p.kind === 'spark') {
          p.vx *= 0.99
          p.vy *= 0.99
        }

        const t = p.life / p.maxLife
        if (t >= 1 || p.y < -20 || p.x < -30 || p.x > w + 30) {
          particles.splice(i, 1)
          continue
        }

        const alpha = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.9

        if (p.kind === 'bubble') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.strokeStyle = p.color
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.fillStyle = 'rgba(223,247,255,0.25)'
          ctx.fill()
        } else if (p.kind === 'spark') {
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha *= 0.35
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.kind === 'ember') {
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size * 0.7, p.size * 1.2, 0, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.kind === 'leaf') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.phase * 0.4)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.7, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        } else {
          ctx.fillStyle = p.color
          ctx.fillRect(p.x, p.y, p.size, p.size)
        }
      }

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className={className || 'room-ambient-canvas'} aria-hidden />
}
