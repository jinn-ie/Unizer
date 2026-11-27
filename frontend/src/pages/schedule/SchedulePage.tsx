import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchNotes, fetchReservations } from '../../api'
import type { Member, Note, Reservation } from '../../types'
import { SPACES } from '../../lib/spaces'
import {
  addDays,
  isSameDay,
  parseDateKey,
  startOfWeek,
  toDateKey,
} from '../../lib/date'
import { reservationToItem } from '../../lib/schedule'
import { useWeekSwipe } from '../../lib/useWeekSwipe'
import { WeekCalendar } from './WeekCalendar'
import { WeekNav } from './WeekNav'
import { DaySheet } from './DaySheet'
import './SchedulePage.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; reservations: Reservation[]; notes: Note[] }

// 주소에 ?week=2026-11-09 가 있으면 그 주를 보여줌 (카톡으로 특정 주 공유용)
function initialWeek(): Date {
  const param = new URLSearchParams(window.location.search).get('week')
  return startOfWeek((param && parseDateKey(param)) || new Date())
}

interface Props {
  member: Member | null // 로그인한 부원 (로그인 전이면 null)
  onLogin: () => void // 로그인 화면으로 가기
}

export function SchedulePage({ member, onLogin }: Props) {
  const [weekStart, setWeekStart] = useState(initialWeek)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [sheet, setSheet] = useState<{ day: Date; focusKey?: string } | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false) // 이용 안내: 처음엔 접힌 한 줄 (달력을 넓게)

  // 연습 + 메모 API 를 동시에 호출하고, 다 오면 화면에 반영
  // 메모는 부가 기능이라, 실패해도 빈 목록으로 두고 캘린더는 그대로 보여줌
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchReservations(controller.signal),
      fetchNotes(controller.signal).catch(() => [] as Note[]),
    ])
      .then(([reservations, notes]) => setLoad({ status: 'ready', reservations, notes }),
      )
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

  const items = useMemo(
    () => (load.status === 'ready' ? load.reservations.map(reservationToItem) : []),
    [load],
  )

  const notes = useMemo(() => (load.status === 'ready' ? load.notes : []), [load])

  const shiftWeek = useCallback((n: number) => setWeekStart((w) => addDays(w, 7 * n)), [])

  // 좌우 스와이프로 주 이동
  const { onTouchStart, onTouchEnd } = useWeekSwipe(shiftWeek)

  return (
    <>
      {/* 이용 안내: 접힌 한 줄 막대, 누르면 펼쳐져요 */}
      <aside className={`notice${noticeOpen ? ' is-open' : ''}`} aria-label="안내">
        <button
          type="button"
          className="notice-toggle"
          aria-expanded={noticeOpen}
          aria-controls="notice-list"
          onClick={() => setNoticeOpen((o) => !o)}
        >
          <span>연습 공간 이용 안내</span>
          <svg className="notice-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ul id="notice-list" hidden={!noticeOpen}>
          <li>
            <span>서로 배려하면서 잡아주세요.</span>
          </li>
          <li>
            <span>
              대회의실, 아라는 타동아리의 예약도 확인해주세요.{' '}
              <a
                className="notice-link"
                href="https://space.pusan.ac.kr/"
                target="_blank"
                rel="noopener noreferrer"
              >
                교육공간 예약시스템
              </a>
            </span>
          </li>
          <li>
            <span>바깥거울-대회의실 간 이동은 예약 순서에 따른 유동적 사용을 허용합니다.</span>
          </li>
        </ul>
      </aside>

      <WeekNav
        weekStart={weekStart}
        isThisWeek={isThisWeek}
        onShift={shiftWeek}
        onToday={() => setWeekStart(thisWeek)}
      />

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

      {sheet && (
        <DaySheet
          day={sheet.day}
          focusKey={sheet.focusKey}
          items={items}
          notes={notes.filter((n) => n.date_on === toDateKey(sheet.day))}
          member={member}
          onLogin={onLogin}
          onClose={() => setSheet(null)}
          onChanged={(focusKey) => {
            // 추가/수정/삭제 후 다시 불러오고, 바뀐 연습을 목록에서 강조
            setSheet((s) => s && { ...s, focusKey })
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}
