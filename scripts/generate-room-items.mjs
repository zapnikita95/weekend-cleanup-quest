import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'rooms')

const svg = (body, w = 48, h = 48) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">\n${body}\n</svg>\n`

const items = {
  room: {
    bed: svg(`
  <rect x="4" y="28" width="40" height="14" fill="#6f6cff"/>
  <rect x="4" y="22" width="14" height="10" fill="#ff9ec8"/>
  <rect x="6" y="18" width="10" height="6" fill="#fff4bd"/>
  <rect x="18" y="26" width="24" height="6" fill="#dff7ff"/>
  <rect x="4" y="40" width="40" height="4" fill="#1f183d"/>
`),
    lamp: svg(`
  <rect x="20" y="36" width="8" height="8" fill="#7a4a12"/>
  <rect x="22" y="20" width="4" height="16" fill="#1f183d"/>
  <rect x="14" y="8" width="20" height="14" fill="#fff4bd"/>
  <rect x="16" y="10" width="16" height="10" fill="#ffd76a"/>
  <rect x="22" y="4" width="4" height="6" fill="#1f183d"/>
`),
    rug: svg(`
  <rect x="4" y="18" width="40" height="20" fill="#ff79b8"/>
  <rect x="8" y="22" width="32" height="12" fill="#ff9ec8"/>
  <rect x="12" y="26" width="8" height="4" fill="#fff4bd"/>
  <rect x="28" y="26" width="8" height="4" fill="#fff4bd"/>
`),
    shelf: svg(`
  <rect x="6" y="12" width="36" height="4" fill="#7a4a12"/>
  <rect x="6" y="28" width="36" height="4" fill="#7a4a12"/>
  <rect x="8" y="16" width="8" height="10" fill="#6f6cff"/>
  <rect x="20" y="16" width="8" height="10" fill="#ff79b8"/>
  <rect x="32" y="16" width="8" height="10" fill="#53e3c0"/>
  <rect x="10" y="32" width="10" height="8" fill="#ffd76a"/>
  <rect x="28" y="32" width="10" height="8" fill="#dff7ff"/>
`),
    plant: svg(`
  <rect x="18" y="30" width="12" height="12" fill="#d96b3c"/>
  <rect x="20" y="32" width="8" height="8" fill="#ff9a5a"/>
  <rect x="22" y="14" width="4" height="18" fill="#2f8f4e"/>
  <rect x="12" y="10" width="10" height="8" fill="#53e3c0"/>
  <rect x="26" y="8" width="10" height="8" fill="#3cb371"/>
  <rect x="18" y="4" width="10" height="8" fill="#53e3c0"/>
`),
  },
  castle: {
    throne: svg(`
  <rect x="10" y="14" width="28" height="6" fill="#ffd76a"/>
  <rect x="12" y="20" width="24" height="18" fill="#6f6cff"/>
  <rect x="8" y="14" width="6" height="28" fill="#ffd76a"/>
  <rect x="34" y="14" width="6" height="28" fill="#ffd76a"/>
  <rect x="14" y="24" width="20" height="8" fill="#ff79b8"/>
  <rect x="16" y="8" width="16" height="6" fill="#fff4bd"/>
`),
    shield: svg(`
  <path d="M24 6 L38 12 V26 L24 40 L10 26 V12 Z" fill="#dff7ff" stroke="#1f183d" stroke-width="2"/>
  <rect x="20" y="14" width="8" height="14" fill="#ff4d6d"/>
  <rect x="16" y="18" width="16" height="4" fill="#ff4d6d"/>
`),
    banner: svg(`
  <rect x="22" y="4" width="4" height="38" fill="#7a4a12"/>
  <rect x="26" y="8" width="16" height="22" fill="#ff4d6d"/>
  <rect x="28" y="12" width="12" height="4" fill="#ffd76a"/>
  <rect x="28" y="20" width="12" height="4" fill="#ffd76a"/>
`),
    chest: svg(`
  <rect x="8" y="20" width="32" height="18" fill="#d96b3c"/>
  <rect x="8" y="14" width="32" height="10" fill="#ff9a5a"/>
  <rect x="20" y="22" width="8" height="6" fill="#ffd76a"/>
  <rect x="8" y="24" width="32" height="3" fill="#1f183d"/>
`),
    torch: svg(`
  <rect x="22" y="18" width="4" height="22" fill="#7a4a12"/>
  <rect x="18" y="8" width="12" height="12" fill="#ff9a5a"/>
  <rect x="20" y="6" width="8" height="8" fill="#ffd76a"/>
  <rect x="22" y="4" width="4" height="4" fill="#fff4bd"/>
`),
  },
  ocean: {
    coral: svg(`
  <rect x="10" y="28" width="6" height="14" fill="#ff79b8"/>
  <rect x="18" y="20" width="6" height="22" fill="#ff4d6d"/>
  <rect x="26" y="24" width="6" height="18" fill="#ff9ec8"/>
  <rect x="32" y="30" width="6" height="12" fill="#ff79b8"/>
  <rect x="8" y="40" width="32" height="4" fill="#d6a56f"/>
`),
    chest: svg(`
  <rect x="8" y="22" width="32" height="16" fill="#ffd76a"/>
  <rect x="8" y="16" width="32" height="10" fill="#c9a227"/>
  <rect x="20" y="24" width="8" height="6" fill="#53e3c0"/>
  <rect x="6" y="36" width="8" height="4" fill="#3cb371"/>
  <rect x="34" y="36" width="8" height="4" fill="#3cb371"/>
`),
    weed: svg(`
  <rect x="14" y="16" width="4" height="26" fill="#2f8f4e"/>
  <rect x="22" y="10" width="4" height="32" fill="#53e3c0"/>
  <rect x="30" y="18" width="4" height="24" fill="#3cb371"/>
  <rect x="12" y="12" width="8" height="4" fill="#53e3c0"/>
  <rect x="28" y="14" width="8" height="4" fill="#2f8f4e"/>
`),
    shell: svg(`
  <path d="M10 30 Q24 8 38 30 Q24 38 10 30 Z" fill="#fff4bd" stroke="#1f183d" stroke-width="2"/>
  <rect x="18" y="22" width="12" height="3" fill="#ff9ec8"/>
  <rect x="20" y="27" width="8" height="3" fill="#ff9ec8"/>
`),
    fish: svg(`
  <ellipse cx="22" cy="24" rx="12" ry="8" fill="#6f6cff"/>
  <rect x="30" y="20" width="10" height="8" fill="#ff79b8"/>
  <rect x="14" y="22" width="3" height="3" fill="#fff4bd"/>
  <rect x="8" y="22" width="6" height="4" fill="#53e3c0"/>
`),
  },
  beach: {
    umbrella: svg(`
  <rect x="22" y="18" width="4" height="24" fill="#7a4a12"/>
  <path d="M8 20 Q24 4 40 20 Z" fill="#ff4d6d"/>
  <rect x="10" y="16" width="8" height="4" fill="#fff4bd"/>
  <rect x="30" y="16" width="8" height="4" fill="#6f6cff"/>
`),
    bucket: svg(`
  <rect x="14" y="16" width="20" height="22" fill="#53e3c0"/>
  <rect x="16" y="20" width="16" height="14" fill="#dff7ff"/>
  <rect x="18" y="10" width="12" height="4" fill="#1f183d"/>
  <rect x="20" y="28" width="8" height="4" fill="#ffd76a"/>
`),
    palm: svg(`
  <rect x="22" y="18" width="4" height="24" fill="#7a4a12"/>
  <rect x="10" y="10" width="12" height="6" fill="#2f8f4e"/>
  <rect x="26" y="8" width="12" height="6" fill="#53e3c0"/>
  <rect x="16" y="4" width="14" height="6" fill="#3cb371"/>
  <rect x="18" y="38" width="12" height="4" fill="#d6a56f"/>
`),
    can: svg(`
  <rect x="16" y="16" width="16" height="20" fill="#6f6cff"/>
  <rect x="18" y="20" width="12" height="12" fill="#dff7ff"/>
  <rect x="28" y="10" width="10" height="4" fill="#1f183d"/>
  <rect x="34" y="12" width="4" height="10" fill="#1f183d"/>
`),
    ball: svg(`
  <circle cx="24" cy="24" r="14" fill="#ff4d6d"/>
  <rect x="10" y="22" width="28" height="4" fill="#fff4bd"/>
  <rect x="22" y="10" width="4" height="28" fill="#fff4bd"/>
  <path d="M12 16 Q24 20 36 16" stroke="#6f6cff" stroke-width="3" fill="none"/>
`),
  },
  space: {
    rocket: svg(`
  <rect x="20" y="8" width="8" height="26" fill="#dff7ff"/>
  <rect x="18" y="14" width="12" height="8" fill="#6f6cff"/>
  <rect x="22" y="4" width="4" height="6" fill="#ff4d6d"/>
  <rect x="14" y="28" width="6" height="8" fill="#ff79b8"/>
  <rect x="28" y="28" width="6" height="8" fill="#ff79b8"/>
  <rect x="22" y="34" width="4" height="8" fill="#ffd76a"/>
`),
    star: svg(`
  <polygon points="24,4 28,18 42,18 30,26 34,40 24,32 14,40 18,26 6,18 20,18" fill="#ffd76a"/>
  <rect x="22" y="20" width="4" height="4" fill="#fff4bd"/>
`),
    window: svg(`
  <circle cx="24" cy="24" r="16" fill="#1f183d"/>
  <circle cx="24" cy="24" r="12" fill="#6f6cff"/>
  <circle cx="24" cy="24" r="8" fill="#dff7ff"/>
  <rect x="8" y="22" width="32" height="3" fill="#fff4bd" opacity="0.5"/>
`),
    bot: svg(`
  <rect x="14" y="14" width="20" height="18" fill="#9aa4ff"/>
  <rect x="18" y="18" width="4" height="4" fill="#53e3c0"/>
  <rect x="26" y="18" width="4" height="4" fill="#53e3c0"/>
  <rect x="20" y="26" width="8" height="3" fill="#1f183d"/>
  <rect x="20" y="8" width="8" height="6" fill="#ffd76a"/>
  <rect x="12" y="32" width="6" height="8" fill="#6f6cff"/>
  <rect x="30" y="32" width="6" height="8" fill="#6f6cff"/>
`),
    crystal: svg(`
  <polygon points="24,6 34,20 28,40 20,40 14,20" fill="#53e3c0"/>
  <polygon points="24,10 30,20 24,34 18,20" fill="#dff7ff"/>
  <rect x="22" y="18" width="4" height="10" fill="#fff4bd" opacity="0.7"/>
`),
  },
}

for (const [theme, files] of Object.entries(items)) {
  const dir = join(root, theme)
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.svg`), content)
  }
}

console.log('Generated room item SVGs')
