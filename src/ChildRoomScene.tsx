import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { HeroWalker } from './HeroWalker'
import { RoomAmbientCanvas } from './RoomAmbientCanvas'
import type { RoomProgress } from './rooms'
import {
  acceptNextRoom,
  declineNextRoomOffer,
  getRoomItemDef,
  getRoomTheme,
  ITEMS_PER_ROOM,
  normalizeRoomProgress,
} from './rooms'

type ChildRoomSceneProps = {
  avatar: string
  avatarUrl?: string
  cosmetics?: Record<string, string>
  name: string
  ageLabel: string
  xpLevel: number
  xpCurrent: number
  xpLevelEnd: number
  xpProgress: number
  xpNext: number
  starBalance: number
  roomProgress?: Partial<RoomProgress> | null
  onRoomProgressChange: (next: RoomProgress) => void
  renderAvatar: (props: {
    avatar: string
    avatarUrl?: string
    cosmetics?: Record<string, string>
    small?: boolean
  }) => ReactNode
  renderStar: () => ReactNode
}

export function ChildRoomScene({
  avatar,
  avatarUrl,
  cosmetics = {},
  name,
  ageLabel,
  xpLevel,
  xpCurrent,
  xpLevelEnd,
  xpProgress,
  xpNext,
  starBalance,
  roomProgress,
  onRoomProgressChange,
  renderAvatar,
  renderStar,
}: ChildRoomSceneProps) {
  const progress = useMemo(() => normalizeRoomProgress(roomProgress), [roomProgress])
  const theme = getRoomTheme(progress.roomIndex)
  const wearCosmetics = useMemo(() => {
    const next = { ...cosmetics }
    delete next.backdrop
    return next
  }, [cosmetics])
  const [showOffer, setShowOffer] = useState(false)
  const [sceneKey, setSceneKey] = useState(0)
  const [popItemId, setPopItemId] = useState<string | null>(null)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const placed = progress.placedItemIds
  const placedKey = placed.join('|')

  useEffect(() => {
    if (progress.offerNextRoom) setShowOffer(true)
  }, [progress.offerNextRoom])

  useEffect(() => {
    if (!placed.length) return
    const last = placed[placed.length - 1]
    setPopItemId(last)
    const timer = window.setTimeout(() => setPopItemId(null), 1100)
    return () => window.clearTimeout(timer)
  }, [placedKey, placed])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const nx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2
      const ny = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2
      setParallax({ x: nx * 8, y: ny * 5 })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  const acceptRoom = () => {
    const next = acceptNextRoom(progress)
    onRoomProgressChange(next)
    setShowOffer(false)
    setSceneKey((k) => k + 1)
  }

  const declineRoom = () => {
    onRoomProgressChange(declineNextRoomOffer(progress))
    setShowOffer(false)
  }

  return (
    <div className="child-room-layout">
      <div className={`child-room-stage ambient-${theme.ambient}`} key={sceneKey} data-theme={theme.id}>
        <div
          className="child-room-bg child-room-bg-far"
          style={{
            backgroundImage: `url(${theme.backdropSrc})`,
            transform: `translate(${parallax.x * 0.35}px, ${parallax.y * 0.25}px) scale(1.12)`,
          }}
        />
        <div
          className="child-room-bg child-room-bg-near"
          style={{
            backgroundImage: `url(${theme.backdropSrc})`,
            transform: `translate(${parallax.x * 0.7}px, ${parallax.y * 0.45}px) scale(1.06)`,
            opacity: 0.35,
            mixBlendMode: 'soft-light',
          }}
        />
        <div className="child-room-light-sweep" aria-hidden />
        <RoomAmbientCanvas ambient={theme.ambient} />
        <div className="child-room-floor" />
        <div className="child-room-items">
          {Array.from({ length: ITEMS_PER_ROOM }, (_, slot) => {
            const itemId = placed[slot]
            const def = itemId ? getRoomItemDef(theme, itemId) : undefined
            const isNew = popItemId === itemId
            return (
              <div
                className={`room-item-slot ${def ? 'filled' : 'empty'} ${isNew ? 'pop' : ''} ${def ? 'idle-float' : ''}`}
                key={`${theme.id}-slot-${slot}`}
                style={
                  def
                    ? {
                        animationDelay: `${slot * 180}ms`,
                        animationDuration: `${2.4 + slot * 0.25}s`,
                      }
                    : undefined
                }
              >
                {def ? (
                  <>
                    <img src={def.src} alt={def.label} title={def.label} />
                    {isNew && <span className="item-sparkle-ring" aria-hidden />}
                  </>
                ) : (
                  <span className="room-item-ghost" aria-hidden />
                )}
              </div>
            )
          })}
        </div>
        <HeroWalker>
          {renderAvatar({ avatar, avatarUrl, cosmetics: wearCosmetics, small: true })}
        </HeroWalker>
        <div className="child-room-badge">
          <strong>{theme.label}</strong>
          <span>
            {placed.length}/{ITEMS_PER_ROOM} предметов
          </span>
          <div className="room-progress-dots" aria-hidden>
            {Array.from({ length: ITEMS_PER_ROOM }, (_, i) => (
              <span key={i} className={i < placed.length ? 'on' : ''} />
            ))}
          </div>
        </div>
        {progress.offerNextRoom && !showOffer && (
          <button className="tiny-button room-offer-reopen" type="button" onClick={() => setShowOffer(true)}>
            Новая комната!
          </button>
        )}
      </div>

      <div className="child-cabinet-copy room-copy">
        <p className="eyebrow">
          {ageLabel} · Ур.{xpLevel}
        </p>
        <h1>{name}</h1>
        <div className="child-summary-stars">
          {renderStar()}
          <strong>{starBalance}</strong>
          <span>звёзд</span>
        </div>
        <div className="header-xp-bar" aria-label={`Опыт ${xpCurrent} из ${xpLevelEnd}`}>
          <div className="header-xp-copy">
            <span>Опыт</span>
            <strong>
              {xpCurrent} / {xpLevelEnd} XP
            </strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill smooth-xp" style={{ width: `${xpProgress}%` }} />
          </div>
          <small>До следующего уровня: {xpNext} XP · предмет в комнату</small>
        </div>
      </div>

      {showOffer && progress.offerNextRoom && (
        <div className="modal-backdrop room-offer-backdrop" role="dialog" aria-modal="true">
          <article className="pixel-panel room-offer-modal room-offer-modal-in">
            <p className="eyebrow">Комната собрана!</p>
            <h2>Перейти в новую комнату?</h2>
            <p>
              Ты собрал {ITEMS_PER_ROOM} предметов в «{theme.label}». Следующая комната будет пустой — собирай новую
              коллекцию!
            </p>
            <p className="hint">Следующая тема: {getRoomTheme(progress.roomIndex + 1).label}</p>
            <div className="room-offer-actions">
              <button className="pixel-button start" type="button" onClick={acceptRoom}>
                Перейти
              </button>
              <button className="pixel-button alt" type="button" onClick={declineRoom}>
                Остаться
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  )
}
