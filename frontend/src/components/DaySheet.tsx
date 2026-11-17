import { useEffect, useMemo, useRef } from 'react'
import type { Reservation } from '../types'
import { spaceInfo, SPACE_INDEX } from '../lib/spaces'
import {
  addDays,
  formatDayTitle,
  formatDuration,
  formatTime,
  parseLocal,
} from '../lib/date'

interface Props {
  day: Date
  focusId?: number
  reservations: Reservation[]
  onClose: () => void
}

export function DaySheet({ day, focusId, reservations, onClose }: Props) {
  const focusRef = useRef<HTMLLIElement>(null)

  const items = useMemo(() => {
    const dayStart = day.getTime()
    const dayEnd = addDays(day, 1).getTime()
    return reservations
      .map((r) => ({ r, start: parseLocal(r.start_at), end: parseLocal(r.end_at) }))
      .filter(({ start, end }) => start.getTime() < dayEnd && end.getTime() > dayStart)
      .sort(
        (a, b) =>
          a.start.getTime() - b.start.getTime() ||
          (SPACE_INDEX.get(a.r.space) ?? 9) - (SPACE_INDEX.get(b.r.space) ?? 9),
      )
  }, [day, reservations])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusId])

  return (
    <div className="sheet-root" role="dialog" aria-modal aria-label={formatDayTitle(day)}>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet">
        <div className="sheet-handle" aria-hidden />
        <header className="sheet-head">
          <h2>{formatDayTitle(day)}</h2>
          <span className="sheet-count">{items.length}건</span>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {items.length === 0 ? (
          <p className="sheet-empty">이 날은 연습이 없어요</p>
        ) : (
          <ul className="sheet-list">
            {items.map(({ r, start, end }) => {
              const space = spaceInfo(r.space)
              const focused = r.id === focusId
              return (
                <li
                  key={r.id}
                  ref={focused ? focusRef : undefined}
                  className={`sheet-item${focused ? ' is-focused' : ''}`}
                >
                  <span className="sheet-bar" style={{ background: space.color }} />
                  <div className="sheet-main">
                    <strong className="sheet-song">{r.song_title}</strong>
                    <span className="sheet-time">
                      {formatTime(start)} – {formatTime(end)}
                      <span className="sheet-dur"> · {formatDuration(end.getTime() - start.getTime())}</span>
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
