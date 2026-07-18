import { useEffect, useRef, type ReactNode } from 'react'
import { easeInOutCubic, lerp, prefersReducedMotion } from './motion'

type HeroWalkerProps = {
  children: ReactNode
  className?: string
}

/**
 * Smooth rAF patrol: ease-in-out path, bob, squash/stretch, facing flip, ground shadow + dust puffs.
 */
export function HeroWalker({ children, className }: HeroWalkerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const dustRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const body = bodyRef.current
    const shadow = shadowRef.current
    const dust = dustRef.current
    if (!root || !body || !shadow) return

    if (prefersReducedMotion()) {
      root.style.left = '42%'
      root.style.bottom = '10%'
      root.style.transform = 'translateX(-50%)'
      return
    }

    let raf = 0
    let running = true
    const start = performance.now()
    const cycleMs = 7800
    let lastFacing = 1
    let dustCooldown = 0
    let lastT = 0

    const tick = (now: number) => {
      if (!running) return
      const elapsed = now - start
      const cycle = (elapsed % cycleMs) / cycleMs
      // 0→0.5 go right, 0.5→1 go left
      const goingRight = cycle < 0.5
      const segment = goingRight ? cycle * 2 : (cycle - 0.5) * 2
      const eased = easeInOutCubic(segment)
      const x = goingRight ? lerp(0.1, 0.78, eased) : lerp(0.78, 0.1, eased)
      const facing = goingRight ? 1 : -1

      // pause slightly at edges (hold ease near 0/1)
      const edgeHold = segment < 0.06 || segment > 0.94
      const speed = Math.abs(eased - lastT) * (goingRight ? 1 : 1)
      lastT = eased

      const bob = Math.sin(elapsed / 120) * (edgeHold ? 1.2 : 3.6)
      const stretchY = edgeHold ? 1 : 1 + Math.sin(elapsed / 90) * 0.035
      const squashX = edgeHold ? 1 : 1 - Math.sin(elapsed / 90) * 0.04

      root.style.left = `${x * 100}%`
      root.style.bottom = '10%'
      root.style.transform = `translateX(-50%)`

      body.style.transform = `scaleX(${facing * squashX}) scaleY(${stretchY}) translateY(${bob}px)`
      shadow.style.transform = `translateX(-50%) scaleX(${1.05 + Math.abs(bob) * 0.02})`
      shadow.style.opacity = String(0.28 + Math.abs(bob) * 0.015)

      if (facing !== lastFacing) {
        lastFacing = facing
        dustCooldown = 0
      }

      dustCooldown -= 16
      if (dust && !edgeHold && dustCooldown <= 0 && speed > 0.002) {
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
  }, [])

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
