import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CATEGORY_ACHIEVEMENTS } from './childProgress'

type AchievementCarouselProps = {
  unlockedIds: Set<string>
  progressById: Record<string, number>
  renderBadge: (achievement: (typeof CATEGORY_ACHIEVEMENTS)[number], unlocked: boolean) => ReactNode
}

export function AchievementCarousel({ unlockedIds, progressById, renderBadge }: AchievementCarouselProps) {
  const [showAll, setShowAll] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const unlocked = useMemo(
    () => CATEGORY_ACHIEVEMENTS.filter((a) => unlockedIds.has(a.id)),
    [unlockedIds],
  )
  const locked = useMemo(
    () => CATEGORY_ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id)),
    [unlockedIds],
  )

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * 220, behavior: 'smooth' })
  }

  return (
    <article className="pixel-panel achievements-rail-panel">
      <div className="achievements-rail-head">
        <div>
          <p className="eyebrow">Коллекция</p>
          <h2>Достижения</h2>
        </div>
        <div className="achievements-rail-actions">
          <span className="achievements-count">
            {unlocked.length}/{CATEGORY_ACHIEVEMENTS.length}
          </span>
          <button className="tiny-button" type="button" onClick={() => setShowAll(true)}>
            Посмотреть все
          </button>
        </div>
      </div>

      {unlocked.length > 0 ? (
        <div className="achievements-rail-wrap">
          <button className="achievements-rail-nav" type="button" aria-label="Назад" onClick={() => scrollBy(-1)}>
            ‹
          </button>
          <div className="achievements-rail" ref={scrollerRef}>
            {unlocked.map((achievement) => (
              <div className="achievement-chip unlocked" key={achievement.id}>
                {renderBadge(achievement, true)}
                <div>
                  <strong>{achievement.title}</strong>
                  <small>Открыто</small>
                </div>
              </div>
            ))}
          </div>
          <button className="achievements-rail-nav" type="button" aria-label="Вперёд" onClick={() => scrollBy(1)}>
            ›
          </button>
        </div>
      ) : (
        <div className="achievements-empty">
          <p className="hint">Пока пусто — закрой первый квест, и здесь появится награда.</p>
          <button className="tiny-button alt" type="button" onClick={() => setShowAll(true)}>
            Какие бывают
          </button>
        </div>
      )}

      {showAll && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="pixel-panel achievements-all-modal">
            <button className="modal-close-button" type="button" onClick={() => setShowAll(false)} aria-label="Закрыть">
              ×
            </button>
            <p className="eyebrow">Все достижения</p>
            <h2>Что можно открыть</h2>
            <p className="hint">Сначала твои открытые, ниже — ещё впереди.</p>

            {unlocked.length > 0 && (
              <>
                <h3 className="achievements-group-title">Уже есть</h3>
                <div className="achievements-all-grid">
                  {unlocked.map((achievement) => (
                    <div className="achievement-mini unlocked" key={`u-${achievement.id}`}>
                      {renderBadge(achievement, true)}
                      <strong>{achievement.title}</strong>
                      <span>{achievement.description}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3 className="achievements-group-title">Ещё впереди</h3>
            <div className="achievements-all-grid">
              {locked.map((achievement) => {
                const progress = Math.min(achievement.threshold, progressById[achievement.id] || 0)
                return (
                  <div className="achievement-mini" key={`l-${achievement.id}`}>
                    {renderBadge(achievement, false)}
                    <strong>{achievement.title}</strong>
                    <span>{achievement.description}</span>
                    <small>
                      {progress}/{achievement.threshold}
                    </small>
                  </div>
                )
              })}
              {!locked.length && <p className="hint">Все достижения открыты!</p>}
            </div>
          </article>
        </div>
      )}
    </article>
  )
}
