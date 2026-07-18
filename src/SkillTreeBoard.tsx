import { useMemo, useState, type ReactNode } from 'react'
import {
  computeSkillLevels,
  getSkillRankLabel,
  SKILL_TREE,
  type Skill,
} from './childProgress'

type SkillTreeBoardProps = {
  categoryCounts: Record<string, number>
  renderIcon: (skill: Skill) => ReactNode
}

const CHORES_PER_LEVEL = 4

export function SkillTreeBoard({ categoryCounts, renderIcon }: SkillTreeBoardProps) {
  const levels = useMemo(() => computeSkillLevels(categoryCounts || {}), [categoryCounts])
  const [focused, setFocused] = useState<string>(SKILL_TREE[0].id)
  const active = SKILL_TREE.find((s) => s.id === focused) || SKILL_TREE[0]
  const count = categoryCounts[active.id] || 0
  const lvl = levels[active.id] || 1
  const intoLevel = count % CHORES_PER_LEVEL
  const progress = Math.min(100, Math.floor((intoLevel / CHORES_PER_LEVEL) * 100))
  const toNext = CHORES_PER_LEVEL - intoLevel

  return (
    <article className="pixel-panel skill-tree-panel">
      <div className="skill-tree-head">
        <div>
          <p className="eyebrow">Прокачка</p>
          <h2>Дерево навыков</h2>
          <p className="hint skill-tree-lead">
            Делай дела в комнате — качается её навык. Каждый новый уровень даёт +2 звезды.
          </p>
        </div>
        <div className="skill-tree-total">
          <strong>{Object.values(levels).reduce((a, b) => a + b, 0)}</strong>
          <span>сумма уровней</span>
        </div>
      </div>

      <div className="skill-tree-board" aria-label="Дерево навыков">
        <div className="skill-tree-trunk" aria-hidden />
        <div className="skill-tree-branch skill-tree-branch-top" aria-hidden />
        <div className="skill-tree-branch skill-tree-branch-bottom" aria-hidden />
        <div className="skill-tree-nodes">
          {SKILL_TREE.map((skill, index) => {
            const skillLvl = levels[skill.id] || 1
            const skillCount = categoryCounts[skill.id] || 0
            const skillProgress = Math.min(100, Math.floor(((skillCount % CHORES_PER_LEVEL) / CHORES_PER_LEVEL) * 100))
            const isFocus = focused === skill.id
            const isHot = skillLvl >= 2
            return (
              <button
                type="button"
                key={skill.id}
                className={`skill-node skill-node-${skill.id} ${isFocus ? 'focus' : ''} ${isHot ? 'hot' : ''} lvl-${Math.min(5, skillLvl)}`}
                style={{ animationDelay: `${index * 70}ms` }}
                onClick={() => setFocused(skill.id)}
              >
                <span className="skill-node-ring" style={{ ['--skill-pct' as string]: `${skillProgress}%` }} />
                <span className="skill-node-icon">{renderIcon(skill)}</span>
                <strong>{skill.title}</strong>
                <small>Ур. {skillLvl}</small>
                {isHot && <span className="skill-node-spark" aria-hidden />}
              </button>
            )
          })}
        </div>
      </div>

      <div className={`skill-focus-card skill-focus-${active.id}`} key={active.id}>
        <div className="skill-focus-icon">{renderIcon(active)}</div>
        <div className="skill-focus-copy">
          <p className="eyebrow">{getSkillRankLabel(lvl)}</p>
          <h3>{active.title}</h3>
          <p>{active.desc}</p>
          <small>
            {count} дел · уровень {lvl}
            {lvl < 5 ? ` · ещё ${toNext === 0 ? CHORES_PER_LEVEL : toNext} до ур. ${lvl + 1}` : ' · максимум'}
          </small>
          <div className="progress-track skill-focus-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="skill-focus-bonus">
          <strong>+{Math.max(0, (lvl - 1) * 2)}</strong>
          <span>звёзд уже за навык</span>
        </div>
      </div>
    </article>
  )
}
