import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'rooms', 'scenes')
mkdirSync(out, { recursive: true })

const W = 320
const H = 180

const svg = (body) =>
  `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">\n${body}\n</svg>\n`

const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

const scenes = {
  room: [
    rect(0, 0, W, H, '#1f183d'),
    rect(0, 0, W, 110, '#ffd6ea'),
    rect(0, 100, W, 80, '#d6a56f'),
    rect(0, 98, W, 4, '#7a4a12'),
    // window
    rect(18, 18, 70, 52, '#1f183d'),
    rect(22, 22, 62, 44, '#9fdfff'),
    rect(52, 22, 3, 44, '#fff'),
    rect(22, 42, 62, 3, '#fff'),
    rect(24, 24, 18, 10, 'rgba(255,255,255,0.35)'),
    // curtain
    rect(16, 14, 10, 60, '#ff79b8'),
    rect(80, 14, 10, 60, '#ff79b8'),
    // poster
    rect(250, 20, 48, 40, '#fff4bd'),
    rect(254, 24, 40, 32, '#6f6cff'),
    rect(262, 32, 12, 12, '#ffd76a'),
    // shelf outline
    rect(120, 28, 90, 6, '#7a4a12'),
    rect(126, 34, 18, 16, '#53e3c0'),
    rect(150, 34, 18, 16, '#ff9ec8'),
    rect(174, 34, 18, 16, '#ffd76a'),
    // floor planks
    ...Array.from({ length: 10 }, (_, i) => rect(0, 108 + i * 7, W, 1, 'rgba(122,74,18,0.25)')),
  ].join('\n'),

  castle: [
    rect(0, 0, W, H, '#1b1540'),
    rect(0, 0, W, 120, '#3a3270'),
    // stone wall
    rect(0, 40, W, 90, '#7b82c9'),
    ...Array.from({ length: 8 }, (_, i) => rect(i * 40, 40, 2, 90, '#646bb0')),
    ...Array.from({ length: 5 }, (_, i) => rect(0, 50 + i * 16, W, 2, '#646bb0')),
    // floor
    rect(0, 120, W, 60, '#4a3a28'),
    rect(0, 118, W, 4, '#1f183d'),
    // arches
    rect(30, 55, 50, 65, '#2a2458'),
    rect(40, 65, 30, 40, '#9fdfff'),
    rect(135, 45, 50, 75, '#2a2458'),
    rect(145, 55, 30, 50, '#dff7ff'),
    rect(240, 55, 50, 65, '#2a2458'),
    rect(250, 65, 30, 40, '#9fdfff'),
    // banners
    rect(70, 20, 14, 36, '#f04b4b'),
    rect(236, 20, 14, 36, '#f04b4b'),
    rect(72, 28, 10, 4, '#ffd76a'),
    rect(238, 28, 10, 4, '#ffd76a'),
    // carpet
    rect(110, 130, 100, 28, '#ff4d6d'),
    rect(120, 138, 80, 12, '#ffd76a'),
  ].join('\n'),

  ocean: [
    rect(0, 0, W, H, '#06263f'),
    rect(0, 0, W, 40, '#0a3a5c'),
    rect(0, 40, W, 80, '#0e6a8f'),
    rect(0, 100, W, 80, '#0b8aa8'),
    // light rays
    rect(40, 0, 18, 120, 'rgba(223,247,255,0.08)'),
    rect(120, 0, 24, 140, 'rgba(223,247,255,0.1)'),
    rect(220, 0, 16, 110, 'rgba(223,247,255,0.07)'),
    // sand
    rect(0, 140, W, 40, '#d6b56f'),
    rect(0, 136, W, 6, '#c49a4a'),
    // rocks
    rect(10, 128, 40, 20, '#5a6a7a'),
    rect(260, 124, 50, 24, '#5a6a7a'),
    // distant coral silhouettes
    rect(70, 110, 8, 30, '#ff79b8'),
    rect(82, 100, 10, 40, '#ff4d6d'),
    rect(200, 108, 8, 32, '#ff9ec8'),
    rect(214, 96, 12, 44, '#ff4d6d'),
    // bubbles placeholders as dots
    rect(50, 50, 4, 4, 'rgba(223,247,255,0.5)'),
    rect(90, 70, 3, 3, 'rgba(223,247,255,0.45)'),
    rect(180, 40, 5, 5, 'rgba(223,247,255,0.4)'),
    rect(250, 60, 3, 3, 'rgba(223,247,255,0.5)'),
  ].join('\n'),

  beach: [
    rect(0, 0, W, 90, '#6ec8ff'),
    rect(0, 90, W, 30, '#3aa0e8'),
    rect(0, 110, W, 70, '#f2d08a'),
    // sun
    rect(250, 18, 28, 28, '#ffd76a'),
    rect(256, 24, 16, 16, '#fff4bd'),
    // clouds
    rect(30, 22, 40, 12, '#fff'),
    rect(40, 16, 28, 10, '#fff'),
    rect(140, 28, 50, 12, '#fff'),
    // water line foam
    rect(0, 108, W, 4, '#dff7ff'),
    rect(0, 112, W, 3, 'rgba(255,255,255,0.5)'),
    // palms silhouette far
    rect(24, 70, 6, 40, '#7a4a12'),
    rect(10, 60, 20, 10, '#2f8f4e'),
    rect(20, 52, 22, 12, '#53e3c0'),
    rect(280, 74, 6, 36, '#7a4a12'),
    rect(268, 62, 22, 12, '#2f8f4e'),
    // sand dunes
    rect(0, 150, W, 30, '#e8c06a'),
  ].join('\n'),

  space: [
    rect(0, 0, W, H, '#070716'),
    rect(0, 0, W, 90, '#12122e'),
    // stars
    ...Array.from({ length: 40 }, (_, i) => {
      const x = (i * 47) % W
      const y = (i * 29) % 110
      const s = 1 + (i % 3)
      return rect(x, y, s, s, i % 5 === 0 ? '#ffd76a' : '#fff4bd')
    }),
    // planet
    rect(220, 20, 50, 50, '#6f6cff'),
    rect(230, 30, 16, 10, '#9aa4ff'),
    rect(248, 42, 12, 8, '#ff79b8'),
    // station floor
    rect(0, 120, W, 60, '#2a2a4a'),
    rect(0, 118, W, 4, '#66e3ff'),
    ...Array.from({ length: 16 }, (_, i) => rect(i * 20, 120, 2, 60, '#1f183d')),
    // window ring
    rect(40, 40, 70, 70, '#1f183d'),
    rect(48, 48, 54, 54, '#0a3a5c'),
    rect(56, 56, 38, 38, '#9fdfff'),
    rect(62, 62, 12, 8, 'rgba(255,255,255,0.45)'),
    // neon strip
    rect(0, 150, W, 4, '#ff79b8'),
  ].join('\n'),
}

for (const [name, body] of Object.entries(scenes)) {
  writeFileSync(join(out, `${name}.svg`), svg(body))
}
console.log('Room scenes written to', out)
