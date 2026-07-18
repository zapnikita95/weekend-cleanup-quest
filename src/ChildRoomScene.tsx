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
  pendingRewards?: number
  onClaimRewards?: () => void
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
  pendingRewards = 0,
  onClaimRewards,
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
    const timer = window.setTimeout(() => setPopItemId(null), 1200)
    return () => window.clearTimeout(timer)
  }, [placedKey, placed])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const nx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2
      const ny = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2
      setParallax({ x: nx * 10, y: ny * 6 })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  const acceptRoom = () => {
    onRoomProgressChange(acceptNextRoom(progress))
    setShowOffer(false)
    setSceneKey((k) => k + 1)
  }

  const declineRoom = () => {
    onRoomProgressChange(declineNextRoomOffer(progress))
    setShowOffer(false)
  }

  return (
    <div className="child-room-layout child-room-layout-hero">
      <div className={`child-room-stage ambient-${theme.ambient}`} key={sceneKey} data-theme={theme.id}>
        <div
          className="child-room-bg child-room-bg-scene"
          style={{
            backgroundImage: `url(${theme.sceneSrc})`,
            transform: `translate(${parallax.x * 0.4}px, ${parallax.y * 0.3}px) scale(1.08)`,
          }}
        />
        <div
          className="child-room-bg child-room-bg-glow"
          style={{
            backgroundImage: `url(${theme.backdropSrc})`,
            transform: `translate(${parallax.x * 0.8}px, ${parallax.y * 0.5}px) scale(1.2)`,
          }}
        />
        <div className="child-room-light-sweep" aria-hidden />
        <div className="child-room-vignette" aria-hidden />
        <RoomAmbientCanvas ambient={theme.ambient} />

        {theme.items.map((slotItem, slot) => {
          const owned = placed.includes(slotItem.id)
          const def = owned ? getRoomItemDef(theme, slotItem.id) : undefined
          const isNew = popItemId === slotItem.id
          return (
            <div
              className={`room-prop ${owned ? 'owned' : 'locked'} ${isNew ? 'pop' : ''} ${owned ? 'idle-float' : ''} ${slotItem.id.includes('fish') ? 'swim' : ''} ${slotItem.id.includes('star') ? 'twinkle-prop' : ''}`}
              key={`${theme.id}-${slotItem.id}`}
              style={{
                left: `${slotItem.x}%`,
                top: `${slotItem.y}%`,
                ['--prop-scale' as string]: String(slotItem.scale || 1),
                animationDelay: owned ? `${slot * 160}ms` : undefined,
              }}
            >
              {def ? (
                <>
                  <img src={def.src} alt={def.label} title={def.label} />
                  {isNew && <span className="item-sparkle-ring" aria-hidden />}
                  {isNew && <span className="item-burst" aria-hidden />}
                </>
              ) : (
                <span className="room-prop-ghost" title="Скоро откроется" aria-hidden />
              )}
            </div>
          )
        })}

        <HeroWalker waypoints={theme.waypoints}>
          {renderAvatar({ avatar, avatarUrl, cosmetics: wearCosmetics, small: true })}
        </HeroWalker>

        <div className="child-room-level-banner" aria-label={`Уровень ${xpLevel}`}>
          <span>Уровень</span>
          <strong>{xpLevel}</strong>
        </div>

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

        <div className="child-room-hud">
          <div className="child-room-identity">
            <div className="child-summary-stars room-hud-stars">
              {renderStar()}
              <strong>{starBalance}</strong>
            </div>
            <div className="child-room-nameblock">
              <p className="eyebrow">{ageLabel}</p>
              <h1>{name}</h1>
            </div>
          </div>
          <div className="header-xp-bar room-hud-xp" aria-label={`Уровень ${xpLevel}, опыт ${xpCurrent} из ${xpLevelEnd}`}>
            <div className="header-xp-copy">
              <span>Уровень {xpLevel}</span>
              <strong>
                {xpCurrent} / {xpLevelEnd} XP
              </strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill smooth-xp" style={{ width: `${xpProgress}%` }} />
            </div>
            <small>До ур. {xpLevel + 1}: {xpNext} XP — выбери комнату или одежду</small>
          </div>
        </div>

        {pendingRewards > 0 && onClaimRewards && (
          <button className="tiny-button room-reward-claim" type="button" onClick={onClaimRewards}>
            Есть награды · {pendingRewards}
          </button>
        )}

        {progress.offerNextRoom && !showOffer && (
          <button className="tiny-button room-offer-reopen" type="button" onClick={() => setShowOffer(true)}>
            Новая комната!
          </button>
        )}
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
