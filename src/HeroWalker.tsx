import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { easeInOutCubic, lerp, prefersReducedMotion } from './motion'
import type { RoomWaypoint } from './rooms'

type HeroWalkerProps = {
  children: ReactNode
  className?: string
  waypoints?: RoomWaypoint[]
}

const DEFAULT_WAYPOINTS: RoomWaypoint[] = [
  { x: 0.18, holdMs: 800 },
  { x: 0.5, holdMs: 600 },
  { x: 0.82, holdMs: 800 },
  { x: 0.5, holdMs: 500 },
]

/** Walk theme waypoints with holds. Stays above bottom HUD. */
export function HeroWalker({ children, className, waypoints }: HeroWalkerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const dustRef = useRef<HTMLDivElement>(null)
  const routeKey = useMemo(
    () => (waypoints?.length ? waypoints.map((w) => `${w.x}:${w.holdMs || 0}`).join('|') : 'default'),
    [waypoints],
  )
  const points = useMemo(
    () => (waypoints?.length ? waypoints : DEFAULT_WAYPOINTS),
    [routeKey],
  )

  useEffect(() => {
    const root = rootRef.current
    const body = bodyRef.current
    const shadow = shadowRef.current
    const dust = dustRef.current
    if (!root || !body || !shadow) return

    const walkFloor = '30%'

    if (prefersReducedMotion()) {
      root.style.left = `${(points[0]?.x ?? 0.42) * 100}%`
      root.style.bottom = walkFloor
      root.style.transform = 'translateX(-50%)'
      return
    }

    const MOVE_MS = 1400
    let raf = 0
    let running = true
    let lastFacing = 1
    let dustCooldown = 0
    let segmentIndex = 0
    let segmentStart = performance.now()
    let fromX = points[0].x
    let toX = points[0].x
    let holdMs = points[0].holdMs ?? 700
    let phase: 'move' | 'hold' = 'hold'
    let x = fromX

    const goNext = (now: number) => {
      const next = (segmentIndex + 1) % points.length
      fromX = x
      toX = points[next].x
      holdMs = points[next].holdMs ?? 700
      segmentIndex = next
      segmentStart = now
      phase = Math.abs(toX - fromX) < 0.012 ? 'hold' : 'move'
    }

    const tick = (now: number) => {
      if (!running) return
      const elapsed = now - segmentStart

      if (phase === 'hold') {
        if (elapsed >= holdMs) goNext(now)
      } else {
        const t = Math.min(1, elapsed / MOVE_MS)
        x = lerp(fromX, toX, easeInOutCubic(t))
        if (t >= 1) {
          x = toX
          phase = 'hold'
          segmentStart = now
        }
      }

      const dx = toX - fromX
      const facing = Math.abs(dx) < 0.01 ? lastFacing : dx > 0 ? 1 : -1
      const moving = phase === 'move'
      const bob = Math.sin(now / 95) * (moving ? 5.2 : 1.8)
      const stretchY = moving ? 1 + Math.sin(now / 75) * 0.055 : 1
      const squashX = moving ? 1 - Math.sin(now / 75) * 0.06 : 1
      const lean = moving ? facing * 3 : 0

      root.style.left = `${x * 100}%`
      root.style.bottom = walkFloor
      root.style.transform = 'translateX(-50%)'
      body.style.transform = `scaleX(${facing * squashX}) scaleY(${stretchY}) translateY(${bob}px) rotate(${lean}deg)`
      shadow.style.transform = `translateX(-50%) scaleX(${1.05 + Math.abs(bob) * 0.02})`
      shadow.style.opacity = String(0.28 + Math.abs(bob) * 0.015)

      if (facing !== lastFacing) {
        lastFacing = facing
        dustCooldown = 0
      }

      dustCooldown -= 16
      if (dust && moving && dustCooldown <= 0) {
        dustCooldown = 140
        const puff = document.createElement('span')
        puff.className = 'hero-dust-puff'
        puff.style.left = facing > 0 ? '18%' : '72%'
        dust.appendChild(puff)
        window.setTimeout(() => puff.remove(), 500)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [points, routeKey])

  return (
    <div ref={rootRef} className={className || 'hero-walker'} aria-hidden>
      <div ref={shadowRef} className="hero-walker-shadow" />
      <div ref={bodyRef} className="hero-walker-body">
        {children}
      </div>
      <div ref={dustRef} className="hero-walker-dust" />
    </div>
  )
}
