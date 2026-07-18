import type { RoomItemDef, RoomProgress } from './rooms'
import { getRoomTheme, peekNextRoomItem } from './rooms'

export type CosmeticOption = { item: string; slot: string; label: string; minLevel: number }

type LevelRewardPickerProps = {
  level: number
  roomProgress?: Partial<RoomProgress> | null
  cosmetics: CosmeticOption[]
  onPickRoom: () => void
  onPickCosmetic: (item: string, slot: string) => void
  onLater: () => void
  onAdvanceRoom?: () => void
  roomNeedsAdvance?: boolean
}

export function LevelRewardPicker({
  level,
  roomProgress,
  cosmetics,
  onPickRoom,
  onPickCosmetic,
  onLater,
  onAdvanceRoom,
  roomNeedsAdvance,
}: LevelRewardPickerProps) {
  const nextItem = peekNextRoomItem(roomProgress)
  const theme = getRoomTheme(roomProgress?.roomIndex || 0)
  const canRoom = Boolean(nextItem) && !roomNeedsAdvance
  const canCosmetic = cosmetics.length > 0

  return (
    <div className="modal-backdrop level-reward-backdrop" role="dialog" aria-modal="true">
      <article className="pixel-panel level-reward-modal">
        <p className="eyebrow">Награда за уровень</p>
        <h2>Уровень {level}: что прокачать?</h2>
        <p className="hint">Выбери одно: предмет в комнату или вещь на персонажа. Можно взять позже.</p>

        <div className="level-reward-choices">
          <div className={`level-reward-card ${canRoom ? '' : 'disabled'}`}>
            <p className="eyebrow">Комната · {theme.label}</p>
            {canRoom && nextItem ? (
              <>
                <img src={nextItem.src} alt={nextItem.label} className="level-reward-preview" />
                <strong>{nextItem.label}</strong>
                <span>Появится в комнате</span>
                <button className="pixel-button start" type="button" onClick={onPickRoom}>
                  В комнату
                </button>
              </>
            ) : roomNeedsAdvance ? (
              <>
                <strong>Комната заполнена</strong>
                <span>Сначала перейди в новую комнату — или возьми одежду.</span>
                {onAdvanceRoom && (
                  <button className="pixel-button" type="button" onClick={onAdvanceRoom}>
                    Новая комната
                  </button>
                )}
              </>
            ) : (
              <>
                <strong>Пока недоступно</strong>
                <span>Сейчас можно только усилить персонажа.</span>
              </>
            )}
          </div>

          <div className={`level-reward-card ${canCosmetic ? '' : 'disabled'}`}>
            <p className="eyebrow">Персонаж</p>
            {canCosmetic ? (
              <div className="level-reward-cosmetic-grid">
                {cosmetics.map((option) => (
                  <button
                    key={option.item}
                    className="level-reward-cosmetic"
                    type="button"
                    onClick={() => onPickCosmetic(option.item, option.slot)}
                  >
                    <img src={`/avatars/accessories/${option.item}.svg`} alt="" />
                    <strong>{option.label}</strong>
                    <small>{option.slot}</small>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <strong>Вся одежда уже есть</strong>
                <span>Выбери предмет для комнаты.</span>
              </>
            )}
          </div>
        </div>

        <button className="tiny-button alt" type="button" onClick={onLater}>
          Выбрать позже
        </button>
      </article>
    </div>
  )
}

export function previewRoomItemLabel(item: RoomItemDef | null): string {
  return item?.label || 'предмет'
}
