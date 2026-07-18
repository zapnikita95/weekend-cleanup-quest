import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  renderAvatar: (props: { avatar: string; avatarUrl?: string; cosmetics?: Record<string, string>; small?: boolean }) => ReactNode
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
  const placed = progress.placedItemIds

  useEffect(() => {
    if (progress.offerNextRoom) setShowOffer(true)
  }, [progress.offerNextRoom])

  useEffect(() => {
    if (!placed.length) return
    const last = placed[placed.length - 1]
    setPopItemId(last)
    const timer = window.setTimeout(() => setPopItemId(null), 900)
    return () => window.clearTimeout(timer)
  }, [placed.join('|')])

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
        <div className="child-room-bg" style={{ backgroundImage: `url(${theme.backdropSrc})` }} />
        <div className="child-room-ambient" aria-hidden>
          <span className="ambient-particle p1" />
          <span className="ambient-particle p2" />
          <span className="ambient-particle p3" />
          <span className="ambient-particle p4" />
        </div>
        <div className="child-room-floor" />
        <div className="child-room-items">
          {Array.from({ length: ITEMS_PER_ROOM }, (_, slot) => {
            const itemId = placed[slot]
            const def = itemId ? getRoomItemDef(theme, itemId) : undefined
            return (
              <div
                className={`room-item-slot ${def ? 'filled' : 'empty'} ${popItemId === itemId ? 'pop' : ''}`}
                key={`${theme.id}-slot-${slot}`}
                style={{ ['--slot' as string]: String(slot) }}
              >
                {def ? (
                  <img src={def.src} alt={def.label} title={def.label} />
                ) : (
                  <span className="room-item-ghost" aria-hidden />
                )}
              </div>
            )
          })}
        </div>
        <div className="child-room-runner" aria-hidden>
          <div className="runner-bob">
            {renderAvatar({ avatar, avatarUrl, cosmetics: wearCosmetics, small: true })}
          </div>
        </div>
        <div className="child-room-badge">
          <strong>{theme.label}</strong>
          <span>
            {placed.length}/{ITEMS_PER_ROOM} предметов
          </span>
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
            <div className="progress-fill" style={{ width: `${xpProgress}%` }} />
          </div>
          <small>До следующего уровня: {xpNext} XP · предмет в комнату</small>
        </div>
      </div>

      {showOffer && progress.offerNextRoom && (
        <div className="modal-backdrop room-offer-backdrop" role="dialog" aria-modal="true">
          <article className="pixel-panel room-offer-modal">
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
