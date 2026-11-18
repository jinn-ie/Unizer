import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ScheduleItem } from '../types'
import { spaceInfo, SPACE_INDEX } from '../lib/spaces'
import { addDays, formatDayTitle, formatDuration, formatTime } from '../lib/date'
import { deleteReservation } from '../api'
import { PracticeBox } from './PracticeBox'

interface Props {
  day: Date
  focusKey?: string
  items: ScheduleItem[]
  onClose: () => void
  onChanged: (focusKey?: string) => void // 추가/수정/삭제 후 다시 불러오기
}

export function DaySheet({ day, focusKey, items, onClose, onChanged }: Props) {
  const focusRef = useRef<HTMLLIElement>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null) // 수정/삭제 버튼이 열린 보충
  const [editKey, setEditKey] = useState<string | null>(null) // 입력창으로 바뀐 보충
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const toggleActive = (key: string) => {
    setActiveKey((k) => (k === key ? null : key))
    setConfirmDelete(false)
    setActionError(null)
  }

  const remove = async (id: number) => {
    setBusy(true)
    setActionError(null)
    try {
      await deleteReservation(id)
      setActiveKey(null)
      setConfirmDelete(false)
      onChanged()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '삭제하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

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
    // Esc: 수정 중이면 수정 취소, 아니면 닫기
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editKey) setEditKey(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editKey, onClose])

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusKey, dayItems])

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
              const r = it.reservation // 보충만 수정/삭제 가능 (정규연습은 X)
              const active = !!r && it.key === activeKey

              // 수정 중: 같은 자리에 기존 값이 채워진 입력 박스
              if (r && it.key === editKey) {
                return (
                  <li key={it.key} className="sheet-edit">
                    <PracticeBox
                      day={day}
                      editing={r}
                      onCancel={() => setEditKey(null)}
                      onSaved={(saved) => {
                        setEditKey(null)
                        setActiveKey(null)
                        onChanged(`r-${saved.id}`)
                      }}
                    />
                  </li>
                )
              }

              return (
                <li
                  key={it.key}
                  ref={focused ? focusRef : undefined}
                  className={`sheet-item${focused || active ? ' is-focused' : ''}${r ? ' is-tappable' : ''}`}
                  onClick={r ? () => toggleActive(it.key) : undefined}
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

                  {active && (
                    <div className="sheet-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="act-btn"
                        onClick={() => {
                          setEditKey(it.key)
                          setActiveKey(null)
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className={`act-btn is-danger${confirmDelete ? ' is-confirm' : ''}`}
                        disabled={busy}
                        onClick={() => (confirmDelete ? remove(r.id) : setConfirmDelete(true))}
                      >
                        {busy ? '삭제하는 중…' : confirmDelete ? '정말 삭제할까요?' : '삭제'}
                      </button>
                      {actionError && <p className="form-error">{actionError}</p>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <PracticeBox day={day} onSaved={(created) => onChanged(`r-${created.id}`)} />
      </section>
    </div>
  )
}
