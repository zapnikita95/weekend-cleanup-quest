/** Room progression helpers for server.mjs (mirrors src/rooms.ts). */

export const XP_THRESHOLDS = [0, 30, 80, 150, 240, 350, 480, 630, 800, 1000]
export const ITEMS_PER_ROOM = 5

export const ROOM_ITEM_IDS = {
  room: ['room-bed', 'room-lamp', 'room-rug', 'room-shelf', 'room-plant'],
  castle: ['castle-throne', 'castle-shield', 'castle-banner', 'castle-chest', 'castle-torch'],
  ocean: ['ocean-coral', 'ocean-chest', 'ocean-weed', 'ocean-shell', 'ocean-fish'],
  beach: ['beach-umbrella', 'beach-bucket', 'beach-palm', 'beach-can', 'beach-ball'],
  space: ['space-rocket', 'space-star', 'space-window', 'space-bot', 'space-crystal'],
}

export const ROOM_THEME_ORDER = ['room', 'castle', 'ocean', 'beach', 'space']

export const getLevelFromXp = (xp) => {
  let level = 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1
    else break
  }
  return level
}

export const defaultRoomProgress = () => ({
  roomIndex: 0,
  placedItemIds: [],
  offerNextRoom: false,
  roomsCompleted: 0,
})

export const normalizeRoomProgress = (progress) => {
  const base = defaultRoomProgress()
  if (!progress || typeof progress !== 'object') return base
  return {
    roomIndex: Math.max(0, Number(progress.roomIndex) || 0),
    placedItemIds: Array.isArray(progress.placedItemIds)
      ? progress.placedItemIds.map(String).slice(0, ITEMS_PER_ROOM)
      : [],
    offerNextRoom: Boolean(progress.offerNextRoom),
    roomsCompleted: Math.max(0, Number(progress.roomsCompleted) || 0),
  }
}

const themeItemsForIndex = (roomIndex) => {
  const themeId = ROOM_THEME_ORDER[((roomIndex % ROOM_THEME_ORDER.length) + ROOM_THEME_ORDER.length) % ROOM_THEME_ORDER.length]
  return ROOM_ITEM_IDS[themeId] || ROOM_ITEM_IDS.room
}

/** @deprecated XP no longer auto-fills the room — player claims room OR cosmetic per level. */
export const applyRoomProgressOnLevelUp = (_prevXp, _nextXp, progress) => normalizeRoomProgress(progress)

export const claimNextRoomItem = (progress) => {
  const current = normalizeRoomProgress(progress)
  if (current.offerNextRoom || current.placedItemIds.length >= ITEMS_PER_ROOM) return null
  const items = themeItemsForIndex(current.roomIndex)
  const itemId = items.find((id) => !current.placedItemIds.includes(id))
  if (!itemId) return null
  const placedItemIds = [...current.placedItemIds, itemId]
  return {
    itemId,
    roomProgress: {
      ...current,
      placedItemIds,
      offerNextRoom: placedItemIds.length >= ITEMS_PER_ROOM,
    },
  }
}

export const migrateLevelRewardClaims = (profile) => {
  if (Array.isArray(profile?.levelRewardClaims) && profile.levelRewardClaims.length) {
    return profile.levelRewardClaims.map((claim) => ({
      level: Number(claim.level),
      kind: claim.kind === 'cosmetic' ? 'cosmetic' : 'room',
      itemId: String(claim.itemId || 'legacy'),
    }))
  }
  const claims = []
  const usedLevels = new Set()
  for (const level of profile?.cosmeticChoiceLevels || []) {
    const lvl = Number(level)
    if (!Number.isFinite(lvl) || usedLevels.has(lvl)) continue
    usedLevels.add(lvl)
    claims.push({ level: lvl, kind: 'cosmetic', itemId: 'legacy' })
  }
  const placed = normalizeRoomProgress(profile?.roomProgress).placedItemIds
  let cursor = 2
  for (const itemId of placed) {
    while (usedLevels.has(cursor)) cursor++
    usedLevels.add(cursor)
    claims.push({ level: cursor, kind: 'room', itemId })
    cursor++
  }
  return claims
}

export const getPendingRewardLevels = (xp, claims) => {
  const level = getLevelFromXp(Math.max(0, xp))
  const claimed = new Set((claims || []).map((claim) => claim.level))
  const pending = []
  for (let lvl = 2; lvl <= level; lvl++) {
    if (!claimed.has(lvl)) pending.push(lvl)
  }
  return pending
}
