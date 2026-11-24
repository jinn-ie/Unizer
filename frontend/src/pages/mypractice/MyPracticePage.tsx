import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchNotes, fetchReservations, fetchSongMembers } from '../../api'
import type { Member, Note, Reservation, SongMember } from '../../types'
import { SPACES } from '../../lib/spaces'
import { addDays, isSameDay, startOfWeek, toDateKey } from '../../lib/date'
import { reservationToItem } from '../../lib/schedule'
import { useWeekSwipe } from '../../lib/useWeekSwipe'
import { WeekCalendar } from '../schedule/WeekCalendar'
import { WeekNav } from '../schedule/WeekNav'
import { DaySheet } from '../schedule/DaySheet'
import '../schedule/SchedulePage.css' // 주 이동 · 범례 · 시간표 모양은 '연습 공간'과 같이 써요
import './MyPracticePage.css'

interface Props {
  member: Member | null // 로그인한 부원 (로그인 전이면 null)
  onLogin: () => void // 로그인 화면으로 가기
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; reservations: Reservation[]; songMembers: SongMember[]; notes: Note[] }

// '내 연습' 탭: '연습 공간'과 같은 주별 시간표인데, 내가 멤버로 들어간 곡의 연습만 보여줘요.
// 누가 "나"인지 알아야 해서 로그인한 뒤에만 볼 수 있어요.
export function MyPracticePage({ member, onLogin }: Props) {
  if (!member) {
    return (
      <div className="mypractice-empty">
        <div className="error-card">
          <strong>로그인하면 내 연습을 볼 수 있어요</strong>
          <p>내가 참여한 곡의 연습만 모아서 보여드려요.</p>
          <button type="button" className="mypractice-login" onClick={onLogin}>
            로그인하기
          </button>
        </div>
      </div>
    )
  }
  return <MyPracticeCalendar member={member} />
}

function MyPracticeCalendar({ member }: { member: Member }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [sheet, setSheet] = useState<{ day: Date; focusKey?: string } | null>(null)

  // 연습 + 곡 멤버 + 메모를 동시에 불러옴 (메모는 부가 기능이라 실패해도 빈 목록)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchReservations(controller.signal),
      fetchSongMembers(controller.signal),
      fetchNotes(controller.signal).catch(() => [] as Note[]),
    ])
      .then(([reservations, songMembers, notes]) => setLoad({ status: 'ready', reservations, songMembers, notes }))
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

  // 내가 멤버인 곡 번호들
  const mySongIds = useMemo(() => {
    if (load.status !== 'ready') return new Set<number>()
    return new Set(load.songMembers.filter((sm) => sm.member_id === member.id).map((sm) => sm.song_id))
  }, [load, member.id])

  // 그 곡들의 연습만 (기본기 같은 곡이 아닌 일정은 빼요)
  const items = useMemo(() => {
    if (load.status !== 'ready') return []
    return load.reservations
      .filter((r) => r.song_id !== null && mySongIds.has(r.song_id))
      .map(reservationToItem)
  }, [load, mySongIds])

  const weekCount = useMemo(() => {
    const s = weekStart.getTime()
    const e = addDays(weekStart, 7).getTime()
    return items.filter((it) => it.start.getTime() < e && it.end.getTime() > s).length
  }, [items, weekStart])

  const notes = useMemo(() => (load.status === 'ready' ? load.notes : []), [load])

  const shiftWeek = useCallback((n: number) => setWeekStart((w) => addDays(w, 7 * n)), [])
  const { onTouchStart, onTouchEnd } = useWeekSwipe(shiftWeek)

  return (
    <>
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

      {load.status === 'ready' && (
        <p className="week-summary">
          {mySongIds.size === 0 ? (
            '아직 참여한 곡이 없어요'
          ) : weekCount > 0 ? (
            <>
              이 주의 내 연습 <b>{weekCount}건</b> · 내가 참여한 곡의 연습만 보여요
            </>
          ) : (
            '이 주에는 내 연습이 없어요'
          )}
        </p>
      )}

      {/* 날짜 보드: '연습 공간'과 같은 화면인데, 목록에는 내 연습만 */}
      {sheet && (
        <DaySheet
          day={sheet.day}
          focusKey={sheet.focusKey}
          items={items}
          notes={notes.filter((n) => n.date_on === toDateKey(sheet.day))}
          onClose={() => setSheet(null)}
          onChanged={(focusKey) => {
            setSheet((s) => s && { ...s, focusKey })
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}
