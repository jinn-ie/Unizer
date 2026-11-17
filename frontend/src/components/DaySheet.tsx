import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ScheduleItem } from '../types'
import { spaceInfo, SPACE_INDEX } from '../lib/spaces'
import { addDays, formatDayTitle, formatDuration, formatTime } from '../lib/date'

interface Props {
  day: Date
  focusKey?: string
  items: ScheduleItem[]
  onClose: () => void
}

export function DaySheet({ day, focusKey, items, onClose }: Props) {
  const focusRef = useRef<HTMLLIElement>(null)

  const dayItems = useMemo(() => {
    const dayStart = day.getTime()
    const dayEnd = addDays(day, 1).getTime()
    return items
      .filter((it) => it.start.getTime() < dayEnd && it.end.getTime() > dayStart)
      .sort(
        (a, b) =>
          a.start.getTime() - b.start.getTime() ||
          (SPACE_INDEX.get(a.space) ?? 9) - (SPACE_INDEX.get(b.space) ?? 9),
      )
  }, [day, items])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusKey])

  return (
    <div className="sheet-root" role="dialog" aria-modal aria-label={formatDayTitle(day)}>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet">
        <div className="sheet-handle" aria-hidden />
        <header className="sheet-head">
          <h2>{formatDayTitle(day)}</h2>
          <span className="sheet-count">{dayItems.length}건</span>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {dayItems.length === 0 ? (
          <p className="sheet-empty">이 날은 연습이 없어요</p>
        ) : (
          <ul className="sheet-list">
            {dayItems.map((it) => {
              const space = spaceInfo(it.space)
              const focused = it.key === focusKey
              const regular = it.kind === 'regular'
              return (
                <li
                  key={it.key}
                  ref={focused ? focusRef : undefined}
                  className={`sheet-item${focused ? ' is-focused' : ''}`}
                >
                  <span className="sheet-bar" style={{ '--c': space.color } as CSSProperties} />
                  <div className="sheet-main">
                    <strong className="sheet-song">
                      {regular && <span className="sheet-tag">정규</span>}
                      {it.title}
                    </strong>
                    <span className="sheet-time">
                      {formatTime(it.start)} – {formatTime(it.end)}
                      <span className="sheet-dur"> · {formatDuration(it.end.getTime() - it.start.getTime())}</span>
                    </span>
                  </div>
                  <span className="sheet-space" style={{ color: space.color, borderColor: space.color }}>
                    {space.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
