import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { fetchRegularPractices, fetchReservations } from './api'
import type { RegularPractice, Reservation } from './types'
import { SPACES } from './lib/spaces'
import {
  addDays,
  formatWeekRange,
  isSameDay,
  parseDateKey,
  startOfWeek,
  toDateKey,
} from './lib/date'
import { expandRegularPractices, reservationToItem } from './lib/schedule'
import { WeekCalendar } from './components/WeekCalendar'
import { DaySheet } from './components/DaySheet'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; reservations: Reservation[]; regulars: RegularPractice[] }

// 주소에 ?week=2026-11-09 가 있으면 그 주를 보여줌 (카톡으로 특정 주 공유용)
function initialWeek(): Date {
  const param = new URLSearchParams(window.location.search).get('week')
  return startOfWeek((param && parseDateKey(param)) || new Date())
}

export default function App() {
  const [weekStart, setWeekStart] = useState(initialWeek)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [sheet, setSheet] = useState<{ day: Date; focusKey?: string } | null>(null)

  // 리더 연습 + 정규연습 API 를 동시에 호출하고, 둘 다 오면 화면에 반영
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchReservations(controller.signal),
      fetchRegularPractices(controller.signal),
    ])
      .then(([reservations, regulars]) => setLoad({ status: 'ready', reservations, regulars }))
      .catch((e) => {
        if (!controller.signal.aborted) {
          console.error(e)
          setLoad({ status: 'error' })
        }
      })
    return () => controller.abort()
  }, [reloadKey])

  // 현재 시각 표시선을 1분마다 갱신
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const thisWeek = startOfWeek(now)
  const isThisWeek = isSameDay(weekStart, thisWeek)

  useEffect(() => {
    const url = isThisWeek ? window.location.pathname : `?week=${toDateKey(weekStart)}`
    window.history.replaceState(null, '', url)
  }, [weekStart, isThisWeek])

  // 보고 있는 주의 일정 = 리더 연습 + 그 주 날짜로 펼친 정규연습
  const items = useMemo(() => {
    if (load.status !== 'ready') return []
    return [
      ...load.reservations.map(reservationToItem),
      ...expandRegularPractices(load.regulars, weekStart),
    ]
  }, [load, weekStart])

  const weekCount = useMemo(() => {
    const s = weekStart.getTime()
    const e = addDays(weekStart, 7).getTime()
    return items.filter((it) => it.start.getTime() < e && it.end.getTime() > s).length
  }, [items, weekStart])

  const shiftWeek = useCallback((n: number) => setWeekStart((w) => addDays(w, 7 * n)), [])

  // 좌우 스와이프로 주 이동
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) shiftWeek(dx < 0 ? 1 : -1)
  }

  return (
    <div className="app">
      <header className="top">
        <img src="/logo.png" alt="UCDC" className="top-logo" />
        <div className="top-title">
          <h1>연습실 예약</h1>
          <p>UCDC · since 1983</p>
        </div>
      </header>

      <nav className="week-nav" aria-label="주 이동">
        <button type="button" className="icon-btn" onClick={() => shiftWeek(-1)} aria-label="이전 주">
          <Chevron dir="left" />
        </button>
        <div className="week-label">
          <span className="week-year">{weekStart.getFullYear()}</span>
          <strong>{formatWeekRange(weekStart)}</strong>
        </div>
        <button type="button" className="icon-btn" onClick={() => shiftWeek(1)} aria-label="다음 주">
          <Chevron dir="right" />
        </button>
        <button
          type="button"
          className="today-btn"
          onClick={() => setWeekStart(thisWeek)}
          disabled={isThisWeek}
        >
          오늘
        </button>
      </nav>

      <ul className="legend" aria-label="공간 색상 (날짜 칸 안 왼쪽부터)">
        {SPACES.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      <main className="cal-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <WeekCalendar
          weekStart={weekStart}
          items={items}
          now={now}
          onSelectDay={(day, focusKey) => setSheet({ day, focusKey })}
        />

        {load.status === 'loading' && <div className="cal-overlay">불러오는 중…</div>}

        {load.status === 'error' && (
          <div className="cal-overlay">
            <div className="error-card">
              <strong>연습 정보를 불러오지 못했어요</strong>
              <p>백엔드 서버가 켜져 있는지 확인해 주세요.</p>
              <button
                type="button"
                className="retry-btn"
                onClick={() => {
                  setLoad({ status: 'loading' })
                  setReloadKey((k) => k + 1)
                }}
              >
                다시 시도
              </button>
            </div>
          </div>
        )}
      </main>

      {load.status === 'ready' && (
        <p className="week-summary">
          {weekCount > 0 ? (
            <>
              이 주의 연습 <b>{weekCount}건</b> · 날짜를 누르면 자세히 볼 수 있어요
            </>
          ) : (
            '이 주에는 연습이 없어요'
          )}
        </p>
      )}

      {sheet && (
        <DaySheet
          day={sheet.day}
          focusKey={sheet.focusKey}
          items={items}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
