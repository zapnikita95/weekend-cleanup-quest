import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'setup' | 'play' | 'results'

type Player = {
  email: string
  name: string
  avatar: string
  avatarUrl?: string
}

type Profile = Player & {
  createdAt: string
  updatedAt: string
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

type PlayerScore = {
  total: number
  base: number
  speed: number
  partner: number
  streak: number
  count: number
}

type GameRecord = {
  id: string
  pairKey: string
  players: (Player & { profile?: Profile | null })[]
  winnerEmail: string
  roundMinutes: number
  elapsedSeconds: number
  scores: (PlayerScore & { email: string })[]
  finishedAt: string
}

type PairLeaderboard = {
  pairKey: string
  players: (Player & { profile?: Profile | null })[]
  games: number
  totalScore: number
  totalChores: number
  wins: Record<string, number>
  lastPlayedAt: string
}

type ApiState = {
  profiles: Profile[]
  games: GameRecord[]
  leaderboard: PairLeaderboard[]
}

const avatarOptions = ['fox', 'cat', 'frog', 'robot', 'ghost', 'duck', 'wizard', 'dragon', 'ninja', 'alien', 'queen', 'slime']

const defaultPlayers: [Player, Player] = [
  { email: 'nikita@example.com', name: 'Никита', avatar: 'fox' },
  { email: 'love@example.com', name: 'Любимая', avatar: 'cat' },
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

const emptyState: ApiState = { profiles: [], games: [], leaderboard: [] }

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

const normalizeEmail = (email: string) => email.trim().toLowerCase()

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

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: 'short' }).format(
    new Date(value),
  )

const isCompleted = (chore: AssignedChore): chore is CompletedChore =>
  chore.completed && typeof chore.completedAt === 'number'

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || 'API error')
  }
  return payload
}

function App() {
  const [players, setPlayers] = useState<[Player, Player]>(() => {
    const saved = window.localStorage.getItem('wcq-players')
    return saved ? JSON.parse(saved) : defaultPlayers
  })
  const [chores, setChores] = useState<Chore[]>(() => {
    const saved = window.localStorage.getItem('wcq-chores')
    return saved ? JSON.parse(saved) : defaultChores
  })
  const [remoteState, setRemoteState] = useState<ApiState>(emptyState)
  const [status, setStatus] = useState('Профили и история хранятся на сервере в /data.')
  const [newChore, setNewChore] = useState({ title: '', minutes: 15, difficulty: 'normal' as Difficulty })
  const [roundMinutes, setRoundMinutes] = useState(120)
  const [phase, setPhase] = useState<Phase>('setup')
  const [assigned, setAssigned] = useState<AssignedChore[]>([])
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [musicOn, setMusicOn] = useState(false)
  const [savedGameId, setSavedGameId] = useState('')
  const audioRef = useRef<AudioContext | null>(null)
  const timersRef = useRef<number[]>([])

  const loadState = useCallback(async () => {
    try {
      const state = await api<ApiState>('/api/state')
      setRemoteState(state)
    } catch (error) {
      setStatus(error instanceof Error ? `Сервер истории недоступен: ${error.message}` : 'Сервер истории недоступен.')
    }
  }, [])

  useEffect(() => {
    loadState()
  }, [loadState])

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
  const currentPairKey = players.map((player) => normalizeEmail(player.email)).sort().join('|')
  const currentPairGames = remoteState.games.filter((game) => game.pairKey === currentPairKey)
  const currentPairBoard = remoteState.leaderboard.find((pair) => pair.pairKey === currentPairKey)

  const scoreFor = useCallback(
    (playerIndex: 0 | 1): PlayerScore => {
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

  const updatePlayer = (index: 0 | 1, patch: Partial<Player>) => {
    setPlayers((current) => {
      const next: [Player, Player] = [{ ...current[0] }, { ...current[1] }]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const applyProfile = (index: 0 | 1, profile: Profile) => {
    updatePlayer(index, {
      avatar: profile.avatar,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
      name: profile.name,
    })
  }

  const saveProfile = async (index: 0 | 1) => {
    const player = { ...players[index], email: normalizeEmail(players[index].email) }
    if (!player.email.includes('@')) {
      setStatus('Для профиля нужна почта. Подтверждений нет, это просто уникальный ключ.')
      return
    }
    try {
      const result = await api<{ profile: Profile; state: ApiState }>('/api/profiles', {
        body: JSON.stringify(player),
        method: 'POST',
      })
      applyProfile(index, result.profile)
      setRemoteState(result.state)
      setStatus(`Профиль ${result.profile.name} сохранён.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить профиль.')
    }
  }

  const uploadAvatar = async (index: 0 | 1, file: File | null) => {
    if (!file) return
    if (!players[index].email.includes('@')) {
      setStatus('Сначала укажи почту профиля, потом загружай свою аватарку.')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    try {
      const result = await api<{ profile: Profile; state: ApiState }>('/api/avatar', {
        body: JSON.stringify({ ...players[index], dataUrl }),
        method: 'POST',
      })
      applyProfile(index, result.profile)
      setRemoteState(result.state)
      setStatus(`Аватарка ${result.profile.name} загружена.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить аватарку.')
    }
  }

  const addChore = () => {
    const title = newChore.title.trim()
    if (!title) return
    setChores((current) => [...current, { ...newChore, id: makeId(), title, enabled: true }])
    setNewChore({ title: '', minutes: 15, difficulty: 'normal' })
  }

  const updateChore = (id: string, patch: Partial<Chore>) => {
    setChores((current) => current.map((chore) => (chore.id === id ? { ...chore, ...patch } : chore)))
  }

  const startRound = () => {
    if (players.some((player) => !normalizeEmail(player.email).includes('@'))) {
      setStatus('Перед стартом у каждого игрока должна быть почта профиля.')
      return
    }

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

    if (!nextAssigned.length) {
      setStatus('Не получилось собрать раунд: выбери больше дел или увеличь лимит времени.')
      return
    }
    setSavedGameId('')
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

  const rateChore = (id: string, playerIndex: 0 | 1, rating: number) => {
    setAssigned((current) =>
      current.map((chore) => (chore.id === id && chore.assignedTo === playerIndex ? { ...chore, partnerRating: rating } : chore)),
    )
    setSavedGameId('')
  }

  const resetRound = () => {
    setPhase('setup')
    setAssigned([])
    setRoundStartedAt(null)
    setSavedGameId('')
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
  const winnerEmail = winner === null ? '' : normalizeEmail(players[winner].email)

  const saveGame = async () => {
    try {
      const result = await api<{ game: GameRecord; state: ApiState }>('/api/games', {
        body: JSON.stringify({
          players: players.map((player) => ({ ...player, email: normalizeEmail(player.email) })),
          winnerEmail,
          roundMinutes,
          elapsedSeconds,
          scores: playerScores,
          chores: assigned,
        }),
        method: 'POST',
      })
      setRemoteState(result.state)
      setSavedGameId(result.game.id)
      setStatus('Игра сохранена в историю пары.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить игру.')
    }
  }

  return (
    <main className="game-shell">
      <header className="topbar pixel-panel">
        <div>
          <p className="eyebrow">Weekend Cleanup Quest</p>
          <h1>Уборка выходного дня</h1>
          <p className="status-line">{status}</p>
        </div>
        <button className="pixel-button alt" type="button" onClick={toggleMusic}>
          {musicOn ? 'Музыка: ON' : 'Музыка: OFF'}
        </button>
      </header>

      {phase === 'setup' && (
        <section className="setup-grid">
          <article className="pixel-panel profiles-panel">
            <div className="panel-title">
              <span>1</span>
              <h2>Профили игроков</h2>
            </div>
            <div className="players-editor">
              {players.map((player, index) => (
                <ProfileEditor
                  index={index as 0 | 1}
                  key={index}
                  onApplyProfile={applyProfile}
                  onSaveProfile={saveProfile}
                  onUpdatePlayer={updatePlayer}
                  onUploadAvatar={uploadAvatar}
                  player={player}
                  profiles={remoteState.profiles}
                />
              ))}
            </div>
          </article>

          <aside className="pixel-panel stats-panel">
            <div className="panel-title">
              <span>★</span>
              <h2>Кто круче в паре</h2>
            </div>
            {currentPairBoard ? (
              <div className="pair-stats">
                <strong>{currentPairBoard.games} игр</strong>
                <p>
                  Общий счёт: {currentPairBoard.totalScore} · Закрыто дел: {currentPairBoard.totalChores}
                </p>
                {players.map((player) => (
                  <p key={player.email}>
                    {player.name}: побед {currentPairBoard.wins[normalizeEmail(player.email)] || 0}
                  </p>
                ))}
              </div>
            ) : (
              <p className="hint">У этой пары ещё нет сохранённых игр. Самое время открыть сезон.</p>
            )}
          </aside>

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

          <Dashboard history={currentPairGames} leaderboard={remoteState.leaderboard} />

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
                    <PixelAvatar avatar={players[playerIndex as 0 | 1].avatar} avatarUrl={players[playerIndex as 0 | 1].avatarUrl} />
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
                  <PixelAvatar
                    avatar={players[playerIndex as 0 | 1].avatar}
                    avatarUrl={players[playerIndex as 0 | 1].avatarUrl}
                    small
                  />
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
            <button className="pixel-button start" disabled={Boolean(savedGameId)} type="button" onClick={saveGame}>
              {savedGameId ? 'Игра сохранена' : 'Сохранить в историю'}
            </button>
            <button className="pixel-button" type="button" onClick={resetRound}>
              Новый рейд
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function ProfileEditor({
  index,
  onApplyProfile,
  onSaveProfile,
  onUpdatePlayer,
  onUploadAvatar,
  player,
  profiles,
}: {
  index: 0 | 1
  onApplyProfile: (index: 0 | 1, profile: Profile) => void
  onSaveProfile: (index: 0 | 1) => void
  onUpdatePlayer: (index: 0 | 1, patch: Partial<Player>) => void
  onUploadAvatar: (index: 0 | 1, file: File | null) => void
  player: Player
  profiles: Profile[]
}) {
  return (
    <div className="player-editor">
      <PixelAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} />
      <label>
        Почта профиля {index + 1}
        <input
          placeholder="friend@example.com"
          value={player.email}
          onChange={(event) => onUpdatePlayer(index, { email: event.target.value })}
        />
      </label>
      <label>
        Имя героя
        <input value={player.name} onChange={(event) => onUpdatePlayer(index, { name: event.target.value })} />
      </label>
      <label>
        Выбрать существующий профиль
        <select
          value=""
          onChange={(event) => {
            const profile = profiles.find((item) => item.email === event.target.value)
            if (profile) onApplyProfile(index, profile)
          }}
        >
          <option value="">профили на сервере</option>
          {profiles.map((profile) => (
            <option key={profile.email} value={profile.email}>
              {profile.name} · {profile.email}
            </option>
          ))}
        </select>
      </label>
      <div className="avatar-list" aria-label="Выбор аватарки">
        {avatarOptions.map((avatar) => (
          <button
            className={avatar === player.avatar && !player.avatarUrl ? 'avatar-choice active' : 'avatar-choice'}
            key={avatar}
            type="button"
            onClick={() => onUpdatePlayer(index, { avatar, avatarUrl: '' })}
          >
            <PixelAvatar avatar={avatar} small />
          </button>
        ))}
      </div>
      <label className="upload-label">
        Своя аватарка
        <input accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" type="file" onChange={(event) => onUploadAvatar(index, event.target.files?.[0] || null)} />
      </label>
      <button className="pixel-button wide" type="button" onClick={() => onSaveProfile(index)}>
        Сохранить профиль
      </button>
    </div>
  )
}

function Dashboard({ history, leaderboard }: { history: GameRecord[]; leaderboard: PairLeaderboard[] }) {
  return (
    <article className="pixel-panel dashboard-panel">
      <div className="panel-title">
        <span>4</span>
        <h2>История и лидерборд</h2>
      </div>
      <div className="dashboard-grid">
        <section>
          <h3>История текущей пары</h3>
          <div className="history-list">
            {history.slice(0, 8).map((game) => (
              <div className="history-row" key={game.id}>
                <strong>{game.winnerEmail ? `Победа: ${game.players.find((player) => player.email === game.winnerEmail)?.name}` : 'Ничья'}</strong>
                <span>
                  {formatDate(game.finishedAt)} · {game.scores.map((score) => score.total).join(' : ')}
                </span>
              </div>
            ))}
            {!history.length && <p className="hint">Сохранённых игр этой пары пока нет.</p>}
          </div>
        </section>
        <section>
          <h3>Лидерборд пар</h3>
          <div className="history-list">
            {leaderboard.slice(0, 8).map((pair, index) => (
              <div className="history-row" key={pair.pairKey}>
                <strong>
                  #{index + 1} {pair.players.map((player) => player.name).join(' + ')}
                </strong>
                <span>
                  {pair.games} игр · {pair.totalScore} очков · {pair.totalChores} дел
                </span>
              </div>
            ))}
            {!leaderboard.length && <p className="hint">Лидерборд появится после первой сохранённой игры.</p>}
          </div>
        </section>
      </div>
    </article>
  )
}

function PixelAvatar({ avatar, avatarUrl, small = false }: { avatar: string; avatarUrl?: string; small?: boolean }) {
  if (avatarUrl) {
    return (
      <div className={small ? 'custom-avatar small' : 'custom-avatar'} aria-hidden="true">
        <img alt="" src={avatarUrl} />
      </div>
    )
  }

  return (
    <div className={small ? `pixel-avatar ${avatar} small` : `pixel-avatar ${avatar}`} aria-hidden="true">
      <span className="ear left" />
      <span className="ear right" />
      <span className="horn left" />
      <span className="horn right" />
      <span className="eye left" />
      <span className="eye right" />
      <span className="snout" />
      <span className="mouth" />
      <span className="badge" />
      <span className="spark" />
    </div>
  )
}

export default App
