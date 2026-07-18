import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from './motion'

type FxBurstProps = {
  activeKey: number | null
  label?: string
  className?: string
}

type Spark = {
  el: HTMLSpanElement
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  rot: number
  vr: number
}

/** Coin pop + radial spark burst for quest completions. */
export function FxBurst({ activeKey, label, className }: FxBurstProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (activeKey == null || prefersReducedMotion()) return
    const root = rootRef.current
    const labelEl = labelRef.current
    if (!root) return

    const sparks: Spark[] = []
    const colors = ['#ffd76a', '#ff79b8', '#66e3ff', '#53e3c0', '#fff4bd']
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('span')
      el.className = 'fx-spark'
      el.style.background = colors[i % colors.length]
      root.appendChild(el)
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4
      const speed = 90 + Math.random() * 140
      sparks.push({
        el,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0,
        max: 0.45 + Math.random() * 0.35,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 420,
      })
    }

    if (labelEl) {
      labelEl.style.animation = 'none'
      // force reflow
      void labelEl.offsetWidth
      labelEl.style.animation = ''
    }

    let raf = 0
    let last = performance.now()
    let running = true

    const tick = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let alive = 0
      for (const s of sparks) {
        s.life += dt
        if (s.life >= s.max) {
          s.el.style.opacity = '0'
          continue
        }
        alive++
        s.vy += 380 * dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.rot += s.vr * dt
        const t = s.life / s.max
        s.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg) scale(${1.15 - t * 0.8})`
        s.el.style.opacity = String(1 - t)
      }
      if (alive > 0) raf = requestAnimationFrame(tick)
      else sparks.forEach((s) => s.el.remove())
    }

    raf = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      sparks.forEach((s) => s.el.remove())
    }
  }, [activeKey])

  if (activeKey == null) return null

  return (
    <div className={className || 'fx-burst'} ref={rootRef} aria-hidden>
      {label ? (
        <span className="fx-burst-label" ref={labelRef} key={activeKey}>
          {label}
        </span>
      ) : null}
    </div>
  )
}
