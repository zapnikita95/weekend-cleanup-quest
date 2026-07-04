import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'setup' | 'play' | 'results'

type Player = {
  name: string
  avatar: string
}

type Chore = {
  id: string
  title: string
  minutes: number
  difficulty: Difficulty
  enabled: boolean
}

type AssignedChore = Chore & {
  assignedTo: 0 | 1
  completed: boolean
  completedAt?: number
  actualMinutes?: number
  partnerRating: number
}

type CompletedChore = AssignedChore & {
  completed: true
  completedAt: number
}

const avatarOptions = ['fox', 'cat', 'frog', 'robot', 'ghost', 'duck', 'wizard', 'dragon']

const defaultPlayers: [Player, Player] = [
  { name: 'Никита', avatar: 'fox' },
  { name: 'Любимая', avatar: 'cat' },
]

const defaultChores: Chore[] = [
  { id: 'dishes', title: 'Помыть посуду', minutes: 15, difficulty: 'normal', enabled: true },
  { id: 'kitchen', title: 'Протереть кухню', minutes: 20, difficulty: 'normal', enabled: true },
  { id: 'vacuum', title: 'Пропылесосить', minutes: 25, difficulty: 'normal', enabled: true },
  { id: 'bathroom', title: 'Ванная комната', minutes: 35, difficulty: 'hard', enabled: true },
  { id: 'laundry', title: 'Разобрать стирку', minutes: 20, difficulty: 'easy', enabled: true },
  { id: 'wardrobe', title: 'Навести порядок в шкафу', minutes: 30, difficulty: 'hard', enabled: true },
  { id: 'trash', title: 'Мусор и пакеты', minutes: 10, difficulty: 'easy', enabled: true },
  { id: 'dust', title: 'Вытереть пыль', minutes: 20, difficulty: 'normal', enabled: true },
]

const difficultyLabel: Record<Difficulty, string> = {
  easy: 'легко',
  normal: 'обычно',
  hard: 'сложно',
}

const difficultyBonus: Record<Difficulty, number> = {
  easy: 2,
  normal: 6,
  hard: 14,
}

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const shuffle = <T,>(items: T[]) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const formatClock = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const isCompleted = (chore: AssignedChore): chore is CompletedChore =>
  chore.completed && typeof chore.completedAt === 'number'

function App() {
  const [players, setPlayers] = useState<[Player, Player]>(() => {
    const saved = window.localStorage.getItem('wcq-players')
    return saved ? JSON.parse(saved) : defaultPlayers
  })
  const [chores, setChores] = useState<Chore[]>(() => {
    const saved = window.localStorage.getItem('wcq-chores')
    return saved ? JSON.parse(saved) : defaultChores
  })
  const [newChore, setNewChore] = useState({ title: '', minutes: 15, difficulty: 'normal' as Difficulty })
  const [roundMinutes, setRoundMinutes] = useState(120)
  const [phase, setPhase] = useState<Phase>('setup')
  const [assigned, setAssigned] = useState<AssignedChore[]>([])
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [musicOn, setMusicOn] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    window.localStorage.setItem('wcq-players', JSON.stringify(players))
  }, [players])

  useEffect(() => {
    window.localStorage.setItem('wcq-chores', JSON.stringify(chores))
  }, [chores])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedChores = useMemo(() => chores.filter((chore) => chore.enabled), [chores])
  const elapsedSeconds = roundStartedAt ? Math.max(0, Math.floor((now - roundStartedAt) / 1000)) : 0
  const playerPlans = useMemo(
    () => [assigned.filter((chore) => chore.assignedTo === 0), assigned.filter((chore) => chore.assignedTo === 1)] as const,
    [assigned],
  )

  const scoreFor = useCallback(
    (playerIndex: 0 | 1) => {
      const completed = assigned.filter((chore) => chore.assignedTo === playerIndex && isCompleted(chore))
      const base = completed.reduce((sum, chore) => sum + 10 + chore.minutes + difficultyBonus[chore.difficulty], 0)
      const speed = completed.reduce((sum, chore) => {
        if (!chore.actualMinutes || chore.actualMinutes >= chore.minutes) return sum
        return sum + Math.max(2, Math.ceil((chore.minutes - chore.actualMinutes) / 2))
      }, 0)
      const partner = completed.reduce((sum, chore) => sum + chore.partnerRating * 5, 0)
      const streak = completed.length >= 2 ? completed.length * 4 : 0
      return { total: base + speed + partner + streak, base, speed, partner, streak, count: completed.length }
    },
    [assigned],
  )

  const playerScores = [scoreFor(0), scoreFor(1)] as const

  const startRound = () => {
    const pools = shuffle(selectedChores)
    const totals = [0, 0]
    const nextAssigned: AssignedChore[] = []

    for (const chore of pools) {
      const firstPlayer = totals[0] <= totals[1] ? 0 : 1
      const secondPlayer = firstPlayer === 0 ? 1 : 0
      const target =
        totals[firstPlayer] + chore.minutes <= roundMinutes
          ? firstPlayer
          : totals[secondPlayer] + chore.minutes <= roundMinutes
            ? secondPlayer
            : null

      if (target === null) continue
      totals[target] += chore.minutes
      nextAssigned.push({ ...chore, assignedTo: target as 0 | 1, completed: false, partnerRating: 0 })
    }

    if (!nextAssigned.length) return
    setAssigned(nextAssigned)
    setRoundStartedAt(Date.now())
    setPhase('play')
  }

  const completeNextFor = useCallback(
    (playerIndex: 0 | 1) => {
      if (phase !== 'play') return
      setAssigned((current) => {
        const target = current.find((chore) => chore.assignedTo === playerIndex && !chore.completed)
        if (!target) return current
        const lastDoneAt =
          current
            .filter((chore) => chore.assignedTo === playerIndex)
            .filter(isCompleted)
            .sort((a, b) => b.completedAt - a.completedAt)[0]?.completedAt ?? roundStartedAt ?? Date.now()
        const completedAt = Date.now()
        const actualMinutes = Math.max(1, Math.round((completedAt - lastDoneAt) / 60000))
        return current.map((chore) =>
          chore.id === target.id && chore.assignedTo === target.assignedTo
            ? { ...chore, completed: true, completedAt, actualMinutes }
            : chore,
        )
      })
    },
    [phase, roundStartedAt],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        completeNextFor(0)
      }
      if (event.code === 'Enter') {
        event.preventDefault()
        completeNextFor(1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [completeNextFor])

  const addChore = () => {
    const title = newChore.title.trim()
    if (!title) return
    setChores((current) => [...current, { ...newChore, id: makeId(), title, enabled: true }])
    setNewChore({ title: '', minutes: 15, difficulty: 'normal' })
  }

  const updatePlayer = (index: 0 | 1, patch: Partial<Player>) => {
    setPlayers((current) => {
      const next: [Player, Player] = [{ ...current[0] }, { ...current[1] }]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const updateChore = (id: string, patch: Partial<Chore>) => {
    setChores((current) => current.map((chore) => (chore.id === id ? { ...chore, ...patch } : chore)))
  }

  const rateChore = (id: string, playerIndex: 0 | 1, rating: number) => {
    setAssigned((current) =>
      current.map((chore) => (chore.id === id && chore.assignedTo === playerIndex ? { ...chore, partnerRating: rating } : chore)),
    )
  }

  const resetRound = () => {
    setPhase('setup')
    setAssigned([])
    setRoundStartedAt(null)
  }

  const toggleMusic = async () => {
    if (musicOn) {
      timersRef.current.forEach(window.clearTimeout)
      timersRef.current = []
      await audioRef.current?.close()
      audioRef.current = null
      setMusicOn(false)
      return
    }

    const context = new AudioContext()
    audioRef.current = context
    setMusicOn(true)

    const loop = () => {
      if (!audioRef.current) return
      const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392]
      notes.forEach((freq, index) => {
        const start = context.currentTime + index * 0.18
        const osc = context.createOscillator()
        const gain = context.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
        osc.connect(gain)
        gain.connect(context.destination)
        osc.start(start)
        osc.stop(start + 0.17)
      })
      timersRef.current.push(window.setTimeout(loop, 1500))
    }
    loop()
  }

  const finishRound = () => setPhase('results')
  const allDone = assigned.length > 0 && assigned.every((chore) => chore.completed)
  const winner =
    playerScores[0].total === playerScores[1].total ? null : playerScores[0].total > playerScores[1].total ? 0 : 1

  return (
    <main className="game-shell">
      <header className="topbar pixel-panel">
        <div>
          <p className="eyebrow">Weekend Cleanup Quest</p>
          <h1>Уборка выходного дня</h1>
        </div>
        <button className="pixel-button alt" type="button" onClick={toggleMusic}>
          {musicOn ? 'Музыка: ON' : 'Музыка: OFF'}
        </button>
      </header>

      {phase === 'setup' && (
        <section className="setup-grid">
          <article className="pixel-panel">
            <div className="panel-title">
              <span>1</span>
              <h2>Герои рейда</h2>
            </div>
            <div className="players-editor">
              {players.map((player, index) => (
                <div className="player-editor" key={index}>
                  <PixelAvatar avatar={player.avatar} />
                  <label>
                    Имя игрока {index + 1}
                    <input
                      value={player.name}
                      onChange={(event) => updatePlayer(index as 0 | 1, { name: event.target.value })}
                    />
                  </label>
                  <div className="avatar-list" aria-label="Выбор аватарки">
                    {avatarOptions.map((avatar) => (
                      <button
                        className={avatar === player.avatar ? 'avatar-choice active' : 'avatar-choice'}
                        key={avatar}
                        type="button"
                        onClick={() => updatePlayer(index as 0 | 1, { avatar })}
                      >
                        <PixelAvatar avatar={avatar} small />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="pixel-panel">
            <div className="panel-title">
              <span>2</span>
              <h2>Длина игры</h2>
            </div>
            <div className="duration-buttons">
              {[60, 120, 240].map((minutes) => (
                <button
                  className={roundMinutes === minutes ? 'pixel-button active' : 'pixel-button'}
                  key={minutes}
                  type="button"
                  onClick={() => setRoundMinutes(minutes)}
                >
                  {minutes / 60}ч
                </button>
              ))}
            </div>
            <label>
              Свой лимит на каждого
              <input
                min={15}
                step={5}
                type="number"
                value={roundMinutes}
                onChange={(event) => setRoundMinutes(Number(event.target.value))}
              />
            </label>
            <p className="hint">Рандом берёт выбранные дела и старается не превысить лимит времени для каждого игрока.</p>
          </article>

          <article className="pixel-panel chores-panel">
            <div className="panel-title">
              <span>3</span>
              <h2>Общий список дел</h2>
            </div>
            <div className="add-chore">
              <input
                placeholder="Например: разобрать балкон"
                value={newChore.title}
                onChange={(event) => setNewChore((current) => ({ ...current, title: event.target.value }))}
              />
              <input
                aria-label="Минуты"
                min={5}
                step={5}
                type="number"
                value={newChore.minutes}
                onChange={(event) => setNewChore((current) => ({ ...current, minutes: Number(event.target.value) }))}
              />
              <select
                value={newChore.difficulty}
                onChange={(event) => setNewChore((current) => ({ ...current, difficulty: event.target.value as Difficulty }))}
              >
                <option value="easy">легко</option>
                <option value="normal">обычно</option>
                <option value="hard">сложно</option>
              </select>
              <button className="pixel-button" type="button" onClick={addChore}>
                Добавить
              </button>
            </div>
            <div className="chore-list">
              {chores.map((chore) => (
                <label className="chore-row" key={chore.id}>
                  <input
                    checked={chore.enabled}
                    type="checkbox"
                    onChange={(event) => updateChore(chore.id, { enabled: event.target.checked })}
                  />
                  <span>{chore.title}</span>
                  <input
                    className="mini-input"
                    min={5}
                    step={5}
                    type="number"
                    value={chore.minutes}
                    onChange={(event) => updateChore(chore.id, { minutes: Number(event.target.value) })}
                  />
                  <select
                    value={chore.difficulty}
                    onChange={(event) => updateChore(chore.id, { difficulty: event.target.value as Difficulty })}
                  >
                    <option value="easy">легко</option>
                    <option value="normal">обычно</option>
                    <option value="hard">сложно</option>
                  </select>
                </label>
              ))}
            </div>
          </article>

          <article className="pixel-panel start-card">
            <h2>Готовы к рейду?</h2>
            <p>
              Выбрано дел: <strong>{selectedChores.length}</strong>. За дело идут базовые очки, минуты, бонус сложности,
              скорость, серия выполнений и оценка партнёра.
            </p>
            <button className="pixel-button start" disabled={!selectedChores.length} type="button" onClick={startRound}>
              Сгенерировать уборку
            </button>
          </article>
        </section>
      )}

      {phase === 'play' && (
        <section className="play-screen">
          <div className="hud pixel-panel">
            <div>
              <p className="eyebrow">Время рейда</p>
              <strong>{formatClock(elapsedSeconds)}</strong>
            </div>
            <div>
              <p className="eyebrow">Горячие клавиши</p>
              <strong>Space / Enter</strong>
            </div>
            <button className="pixel-button" type="button" onClick={finishRound}>
              Завершить раунд
            </button>
          </div>

          <div className="battlefield">
            {[0, 1].map((playerIndex) => {
              const plan = playerPlans[playerIndex as 0 | 1]
              const totalMinutes = plan.reduce((sum, chore) => sum + chore.minutes, 0)
              const done = plan.filter((chore) => chore.completed).length
              return (
                <article className="pixel-panel player-board" key={playerIndex}>
                  <div className="player-card">
                    <PixelAvatar avatar={players[playerIndex as 0 | 1].avatar} />
                    <div>
                      <h2>{players[playerIndex as 0 | 1].name || `Игрок ${playerIndex + 1}`}</h2>
                      <p>
                        {done}/{plan.length} дел · {totalMinutes} мин · {playerScores[playerIndex as 0 | 1].total} очков
                      </p>
                    </div>
                  </div>
                  <button
                    className="pixel-button wide"
                    type="button"
                    onClick={() => completeNextFor(playerIndex as 0 | 1)}
                  >
                    {playerIndex === 0 ? 'Space' : 'Enter'}: отметить следующее
                  </button>
                  <div className="quest-list">
                    {plan.map((chore) => (
                      <button
                        className={chore.completed ? 'quest done' : 'quest'}
                        key={chore.id}
                        type="button"
                        onClick={() => {
                          if (!chore.completed) {
                            setAssigned((current) =>
                              current.map((item) =>
                                item.id === chore.id && item.assignedTo === chore.assignedTo
                                  ? { ...item, completed: true, completedAt: Date.now(), actualMinutes: chore.minutes }
                                  : item,
                              ),
                            )
                          }
                        }}
                      >
                        <span>{chore.completed ? '✓' : '□'}</span>
                        <strong>{chore.title}</strong>
                        <small>
                          {chore.minutes} мин · {difficultyLabel[chore.difficulty]}
                        </small>
                      </button>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>

          {allDone && (
            <div className="pixel-panel all-done">
              <h2>Все дела закрыты!</h2>
              <button className="pixel-button start" type="button" onClick={finishRound}>
                К оценкам партнёра
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'results' && (
        <section className="results-screen">
          <article className="pixel-panel winner-card">
            <p className="eyebrow">Финал</p>
            <h2>{winner === null ? 'Двойная победа!' : `Президент уборки: ${players[winner].name}`}</h2>
            <p>Проигравших нет: второе место выдаёт президенту приз, а дом получает +100 к уюту.</p>
          </article>

          <div className="score-grid">
            {[0, 1].map((playerIndex) => (
              <article className="pixel-panel score-card" key={playerIndex}>
                <div className="player-card">
                  <PixelAvatar avatar={players[playerIndex as 0 | 1].avatar} small />
                  <h2>{players[playerIndex as 0 | 1].name}</h2>
                </div>
                <strong className="big-score">{playerScores[playerIndex as 0 | 1].total}</strong>
                <p>
                  Дела: {playerScores[playerIndex as 0 | 1].count} · Скорость: +{playerScores[playerIndex as 0 | 1].speed} ·
                  Серия: +{playerScores[playerIndex as 0 | 1].streak}
                </p>
                <div className="rating-list">
                  {playerPlans[playerIndex as 0 | 1]
                    .filter(isCompleted)
                    .map((chore) => (
                      <div className="rating-row" key={chore.id}>
                        <span>{chore.title}</span>
                        <div>
                          {[0, 1, 2, 3].map((rating) => (
                            <button
                              className={chore.partnerRating === rating ? 'rating active' : 'rating'}
                              key={rating}
                              type="button"
                              onClick={() => rateChore(chore.id, playerIndex as 0 | 1, rating)}
                            >
                              {rating}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </article>
            ))}
          </div>

          <div className="actions">
            <button className="pixel-button" type="button" onClick={resetRound}>
              Новый рейд
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function PixelAvatar({ avatar, small = false }: { avatar: string; small?: boolean }) {
  return (
    <div className={small ? `pixel-avatar ${avatar} small` : `pixel-avatar ${avatar}`} aria-hidden="true">
      <span className="ear left" />
      <span className="ear right" />
      <span className="eye left" />
      <span className="eye right" />
      <span className="mouth" />
      <span className="badge" />
    </div>
  )
}

export default App
