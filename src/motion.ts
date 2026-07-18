export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
export const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
export const easeOutElastic = (t: number) => {
  if (t === 0 || t === 1) return t
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export type AmbientKind = 'cozy' | 'castle' | 'ocean' | 'beach' | 'space'

export const AMBIENT_PALETTES: Record<AmbientKind, string[]> = {
  cozy: ['#ff9ec8', '#fff4bd', '#6f6cff', '#ffd76a'],
  castle: ['#ffd76a', '#ff9a5a', '#c9a227', '#fff4bd'],
  ocean: ['#66e3ff', '#53e3c0', '#dff7ff', '#6f6cff'],
  beach: ['#ffd76a', '#ff9a5a', '#53e3c0', '#fff4bd'],
  space: ['#fff4bd', '#9aa4ff', '#ff79b8', '#66e3ff'],
}
