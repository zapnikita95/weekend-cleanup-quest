import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'avatars')
mkdirSync(root, { recursive: true })

const palette = {
  fox: { body: '#e86a2f', accent: '#ffd166', detail: '#8b3f1f', eye: '#1f183d' },
  cat: { body: '#9b5de5', accent: '#f15bb5', detail: '#6a3d9f', eye: '#1f183d' },
  frog: { body: '#52b788', accent: '#95d5b2', detail: '#2d6a4f', eye: '#1f183d' },
  robot: { body: '#8ecae6', accent: '#caf0f8', detail: '#457b9d', eye: '#023047' },
  ghost: { body: '#f8f7ff', accent: '#cdb4db', detail: '#b8b2d8', eye: '#1f183d' },
  duck: { body: '#ffe066', accent: '#ff922b', detail: '#f08c00', eye: '#1f183d' },
  wizard: { body: '#5a67d8', accent: '#f6e05e', detail: '#3c366b', eye: '#1f183d' },
  dragon: { body: '#ef476f', accent: '#ffd166', detail: '#9d0208', eye: '#1f183d' },
  ninja: { body: '#2b2d42', accent: '#8d99ae', detail: '#111320', eye: '#edf2f4' },
  alien: { body: '#70e000', accent: '#ccff33', detail: '#38b000', eye: '#1f183d' },
  queen: { body: '#ff85a1', accent: '#ffc8dd', detail: '#c9184a', eye: '#1f183d' },
  slime: { body: '#80ed99', accent: '#b7efc5', detail: '#38a3a5', eye: '#1f183d' },
}

const draw = (colors, extras = '') => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect width="16" height="16" fill="transparent"/>
  <rect x="3" y="2" width="10" height="9" fill="${colors.body}"/>
  <rect x="2" y="4" width="1" height="3" fill="${colors.accent}"/>
  <rect x="13" y="4" width="1" height="3" fill="${colors.accent}"/>
  <rect x="5" y="5" width="2" height="2" fill="${colors.eye}"/>
  <rect x="9" y="5" width="2" height="2" fill="${colors.eye}"/>
  <rect x="6" y="8" width="4" height="1" fill="${colors.detail}"/>
  <rect x="4" y="11" width="8" height="4" fill="${colors.body}"/>
  <rect x="5" y="12" width="2" height="2" fill="${colors.accent}"/>
  <rect x="9" y="12" width="2" height="2" fill="${colors.accent}"/>
  ${extras}
</svg>
`

const extras = {
  fox: '<rect x="4" y="1" width="2" height="2" fill="#e86a2f"/><rect x="10" y="1" width="2" height="2" fill="#e86a2f"/>',
  cat: '<rect x="4" y="1" width="2" height="1" fill="#9b5de5"/><rect x="10" y="1" width="2" height="1" fill="#9b5de5"/>',
  wizard: '<rect x="3" y="0" width="10" height="2" fill="#f6e05e"/><rect x="5" y="0" width="6" height="1" fill="#5a67d8"/>',
  duck: '<rect x="7" y="8" width="4" height="2" fill="#ff922b"/>',
  robot: '<rect x="4" y="0" width="8" height="2" fill="#457b9d"/><rect x="6" y="1" width="1" height="1" fill="#caf0f8"/><rect x="9" y="1" width="1" height="1" fill="#caf0f8"/>',
  ghost: '<rect x="4" y="13" width="2" height="2" fill="#f8f7ff"/><rect x="7" y="14" width="2" height="1" fill="#f8f7ff"/><rect x="10" y="13" width="2" height="2" fill="#f8f7ff"/>',
  dragon: '<rect x="3" y="1" width="2" height="2" fill="#ef476f"/><rect x="11" y="1" width="2" height="2" fill="#ef476f"/>',
  ninja: '<rect x="4" y="4" width="8" height="2" fill="#111320"/>',
  queen: '<rect x="3" y="0" width="10" height="2" fill="#ffc8dd"/><rect x="5" y="0" width="6" height="1" fill="#f6e05e"/>',
  alien: '<rect x="2" y="3" width="2" height="4" fill="#70e000"/><rect x="12" y="3" width="2" height="4" fill="#70e000"/>',
}

for (const [name, colors] of Object.entries(palette)) {
  writeFileSync(join(root, `${name}.svg`), draw(colors, extras[name] || ''))
}

writeFileSync(
  join(root, 'SOURCES.md'),
  `# Avatar sprites

Pixel portrait SVGs generated for Tidy Titans (16×16, scaled in UI).

Style references (CC0 / open):
- [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) — CC0
- [Kenney Roguelike Characters](https://kenney.nl/assets/roguelike-characters) — CC0
- [OpenGameArt CC0 Walk Cycles](https://opengameart.org/content/cc0-walk-cycles)

Legacy CSS avatars remain in \`src/App.tsx\` as \`LegacyPixelAvatar\` fallback.
`,
)

console.log(`Generated ${Object.keys(palette).length} avatars in ${root}`)
