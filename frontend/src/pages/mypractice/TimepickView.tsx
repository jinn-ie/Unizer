import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchMembers, fetchSongs, fetchTeamTimepick, HttpError } from '../../api'
import type { Member, Reservation, Song, SongMember } from '../../types'
import { addDays, isSameDay, toDateKey, WEEKDAYS } from '../../lib/date'
import { CAL_DAY_MIN, CAL_SLOT_MIN, CAL_START_MIN, reservationToItem } from '../../lib/schedule'
import { useWeekSwipe } from '../../lib/useWeekSwipe'
import { WeekNav } from '../schedule/WeekNav'
import { isMemberPractice } from './memberPractice'
import {
  cellState,
  dayKey,
  EMPTY_TIMEPICK,
  fromServer,
  isBusy,
  practiceCells,
  setDayCell,
  setWeeklyCell,
  weeklyKey,
} from './timepick'
import type { CellState, Timepick } from './timepick'
import type { SaveScope, SaveState } from './MyPracticePage'
import { TimepickGrid } from './TimepickGrid'
import type { GridBlock, GridCell, GridColumn, GridPaint } from './TimepickGrid'
import './TimepickView.css'

interface Props {
  member: Member // 로그인한 나
  now: Date
  weekStart: Date
  isThisWeek: boolean
  onShiftWeek: (n: number) => void
  onToday: () => void
  reservations: Reservation[] // 모든 연습 (나와 팀원의 유디 연습을 여기서 골라요)
  songMembers: SongMember[]
  myPick: Timepick // 내가 칠한 칸 (MyPracticePage 가 들고 있다가 자동 저장해요)
  onEditPick: (update: (tp: Timepick) => Timepick, scope: SaveScope) => void // 칸 바꾸기 + 저장할 범위
  saveState: SaveState
  onRetrySave: () => void
  onRelogin: () => void // 로그인이 풀렸을 때 다시 로그인
  overlay?: ReactNode // 불러오는 중 · 실패 안내 (MyPracticePage 가 만들어 줘요)
}

// 팀 화면에서 불러온 팀원들의 칠한 칸 (곡마다 따로)
type TeamLoad =
  | { songId: number; status: 'loading' }
  | { songId: number; status: 'error'; message: string }
  | { songId: number; status: 'ready'; picks: Map<number, Timepick> } // 부원 번호 → 칠한 칸

// 누구의 타임픽을 보나: 나 / 내가 리더인 곡의 팀
type Target = { kind: 'me' } | { kind: 'team'; songId: number }
// 나를 칠하는 방식: 이 주만(날짜) / 매주(요일)
type Mode = 'day' | 'weekly'

// 나: 칸 상태 → 칸 모양. 가능은 청록, 불가능은 회색 (매주 · 이 날만 구분 없이)
// 유디 연습은 곡명이 들어간 회색 막대를 따로 그려서 칸은 비워 둬요.
const MY_CELL_CLASS: Record<CellState, string | null> = {
  practice: null,
  'day-busy': 'is-busy',
  'day-free': 'is-free', // 매주 불가능인데 이 날만 됨
  weekly: 'is-busy',
  free: 'is-free',
}

/** 이 부원이 멤버로 들어간 곡 번호들 */
function songIdsOf(memberId: number, songMembers: SongMember[]): Set<number> {
  return new Set(songMembers.filter((sm) => sm.member_id === memberId).map((sm) => sm.song_id))
}

// '타임픽' 탭 화면
// - 나: 안 되는 시간을 칠해요. 내 유디 연습은 자동으로 회색(잠김)
// - 곡 팀 (리더만): 팀원 전원을 겹쳐서, 되는 사람이 많을수록 진한 청록 (모두 안 되면 회색)
export function TimepickView({
  member,
  now,
  weekStart,
  isThisWeek,
  onShiftWeek,
  onToday,
  reservations,
  songMembers,
  myPick,
  onEditPick,
  saveState,
  onRetrySave,
  onRelogin,
  overlay,
}: Props) {
  const [target, setTarget] = useState<Target>({ kind: 'me' })
  const [mode, setMode] = useState<Mode>('day')
  const [selected, setSelected] = useState<{ col: number; min: number } | null>(null) // 팀 화면에서 고른 칸
  const [team, setTeam] = useState<TeamLoad | null>(null)

  // 팀 칩 이름(곡명)과 팀원 이름 · 기수를 알아야 해서 곡 · 부원 목록을 따로 불러와요.
  // 실패하면 팀 칩만 안 보이고 '나'는 그대로 쓸 수 있어요.
  const [lists, setLists] = useState<{ songs: Song[]; members: Member[] } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([fetchSongs(controller.signal), fetchMembers(controller.signal)])
      .then(([songs, members]) => setLists({ songs, members }))
      .catch((e) => {
        if (!controller.signal.aborted) console.error(e)
      })
    return () => controller.abort()
  }, [])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  // 팀 칩: 내가 리더인 곡만 (리더가 아니면 팀 칩 없이 '나'만)
  const teamSongs = useMemo(() => {
    if (!lists) return []
    const ids = new Set(
      songMembers
        .filter((sm) => sm.member_id === member.id && sm.leader)
        .map((sm) => sm.song_id),
    )
    return lists.songs.filter((s) => ids.has(s.id))
  }, [lists, songMembers, member.id])

  // ── 나 ──
  const myReservations = useMemo(() => {
    const mySongIds = songIdsOf(member.id, songMembers)
    return reservations.filter((r) => isMemberPractice(r, member, mySongIds))
  }, [reservations, songMembers, member])
  const myPractice = useMemo(() => practiceCells(myReservations), [myReservations])

  // 이 주의 내 유디 연습 → 회색 막대 (잠긴 칸과 딱 맞게 30분 단위로 늘려서 그려요)
  const myBlocks = useMemo(() => {
    const out: GridBlock[] = []
    for (const r of myReservations) {
      const item = reservationToItem(r)
      days.forEach((day, col) => {
        const dayStart = day.getTime()
        const s = Math.max(item.start.getTime(), dayStart)
        const e = Math.min(item.end.getTime(), addDays(day, 1).getTime())
        if (e <= s) return
        const startMin = Math.max(Math.floor((s - dayStart) / 60000 / CAL_SLOT_MIN) * CAL_SLOT_MIN, CAL_START_MIN)
        const endMin = Math.min(Math.ceil((e - dayStart) / 60000 / CAL_SLOT_MIN) * CAL_SLOT_MIN, CAL_DAY_MIN)
        if (endMin <= startMin) return // 표 범위(08:00 전) 밖
        out.push({ key: `${item.key}-${col}`, col, startMin, endMin, title: item.title })
      })
    }
    return out
  }, [myReservations, days])

  // ── 팀 ──
  // 팀 칩을 고를 때마다 그 곡 팀원들의 칠한 칸을 새로 불러와요 (그 사이 바뀐 것까지 보이게)
  useEffect(() => {
    if (target.kind !== 'team') return
    const songId = target.songId
    const controller = new AbortController()
    fetchTeamTimepick(songId, controller.signal)
      .then((list) => {
        const picks = new Map(list.map((t) => [t.member_id, fromServer(t)]))
        setTeam({ songId, status: 'ready', picks })
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        console.error(e)
        const message =
          e instanceof HttpError && e.status === 403
            ? '이 곡의 리더만 볼 수 있어요'
            : e instanceof HttpError && e.status === 401
              ? '다시 로그인해 주세요'
              : '팀 타임픽을 불러오지 못했어요'
        setTeam({ songId, status: 'error', message })
      })
    return () => controller.abort()
  }, [target])

  // 팀원마다: 유디 연습 칸 + 칠한 칸 (나는 지금 칠하고 있는 값을 바로 써요)
  const teamMembers = useMemo(() => {
    if (target.kind !== 'team' || !lists) return []
    if (team?.status !== 'ready' || team.songId !== target.songId) return []
    const picks = team.picks
    const memberById = new Map(lists.members.map((m) => [m.id, m]))
    const out: { member: Member; practice: Set<string>; pick: Timepick }[] = []
    for (const sm of songMembers) {
      if (sm.song_id !== target.songId) continue
      const m = memberById.get(sm.member_id)
      if (!m) continue
      const songIds = songIdsOf(m.id, songMembers)
      const practice = practiceCells(reservations.filter((r) => isMemberPractice(r, m, songIds)))
      const pick = m.id === member.id ? myPick : (picks.get(m.id) ?? EMPTY_TIMEPICK)
      out.push({ member: m, practice, pick })
    }
    return out
  }, [target, team, lists, songMembers, reservations, member.id, myPick])

  /** 그 칸에 안 되는 팀원 (유디 연습 때문이면 practice = true) */
  const busyPeople = (col: number, min: number) =>
    teamMembers
      .map((t) => ({ name: t.member.name, state: cellState(t.pick, t.practice, days[col], min) }))
      .filter((p) => isBusy(p.state))
      .map((p) => ({ name: p.name, practice: p.state === 'practice' }))

  // ── 표에 넘길 값 ──
  const isTeam = target.kind === 'team'
  const isWeekly = !isTeam && mode === 'weekly'

  const columns: GridColumn[] = isWeekly
    ? WEEKDAYS.map((dow) => ({ dow, date: null, isToday: false }))
    : days.map((d) => ({ dow: WEEKDAYS[d.getDay()], date: d.getDate(), isToday: isSameDay(d, now) }))

  let cellOf: (col: number, min: number) => GridCell | null
  let paint: GridPaint | undefined
  if (isTeam) {
    // 되는 사람이 많을수록 진한 청록. 모두 안 되면 회색
    cellOf = (col, min) => {
      const total = teamMembers.length
      if (total === 0) return null
      const free = total - busyPeople(col, min).length // 되는 사람 수
      if (free === 0) return { className: 'is-busy' }
      // 모두 되는 칸만 가장 진한 4단계 (리더가 제일 먼저 찾을 칸이라 따로 눈에 띄게)
      // 나머지는 되는 사람 비율로 1~3단계 + 되는 사람 수
      if (free === total) return { className: 'is-lv4' }
      const level = Math.ceil((free / total) * 3)
      return { className: `is-lv${level}`, text: String(free) }
    }
  } else if (isWeekly) {
    cellOf = (col, min) => ({ className: myPick.weekly.has(weeklyKey(col, min)) ? 'is-busy' : 'is-free' })
    paint = {
      busyAt: (col, min) => myPick.weekly.has(weeklyKey(col, min)),
      lockedAt: () => false,
      set: (col, min, busy) => onEditPick((tp) => setWeeklyCell(tp, col, min, busy), 'weekly'),
    }
  } else {
    cellOf = (col, min) => {
      const cls = MY_CELL_CLASS[cellState(myPick, myPractice, days[col], min)]
      return cls ? { className: cls } : null
    }
    paint = {
      busyAt: (col, min) => isBusy(cellState(myPick, myPractice, days[col], min)),
      lockedAt: (col, min) => myPractice.has(dayKey(days[col], min)),
      // 저장 범위 = 이 주 (일요일 날짜)
      set: (col, min, busy) => onEditPick((tp) => setDayCell(tp, days[col], min, busy), toDateKey(weekStart)),
    }
  }

  // 주를 넘기거나 대상을 바꾸면 고른 칸은 지워요
  const shiftWeek = (n: number) => {
    setSelected(null)
    onShiftWeek(n)
  }
  const goToday = () => {
    setSelected(null)
    onToday()
  }
  const pickTarget = (t: Target) => {
    setSelected(null)
    if (t.kind === 'team') setTeam({ songId: t.songId, status: 'loading' }) // 불러오는 동안 안내
    setTarget(t)
  }

  // 팀 화면: 불러오는 중 · 실패 안내 (탭 전체 안내가 있으면 그게 먼저)
  let teamOverlay: ReactNode = null
  if (isTeam && team?.status === 'loading') {
    teamOverlay = <div className="cal-overlay">불러오는 중…</div>
  } else if (isTeam && team?.status === 'error') {
    teamOverlay = (
      <div className="cal-overlay">
        <div className="error-card">
          <strong>{team.message}</strong>
        </div>
      </div>
    )
  }

  // 나: 자동 저장 상태 (아래 안내 줄 밑에 작게)
  let saveLine: ReactNode = null
  if (!isTeam) {
    if (saveState === 'saving') saveLine = <span className="tp-save">저장 중…</span>
    else if (saveState === 'saved') saveLine = <span className="tp-save is-saved">저장했어요</span>
    else if (saveState === 'error')
      saveLine = (
        <span className="tp-save is-error">
          저장하지 못했어요
          <button type="button" onClick={onRetrySave}>
            다시 시도
          </button>
        </span>
      )
    else if (saveState === 'login')
      saveLine = (
        <span className="tp-save is-error">
          로그인이 풀려서 저장하지 못했어요
          <button type="button" onClick={onRelogin}>
            다시 로그인
          </button>
        </span>
      )
  }

  // 좌우로 밀어 주 이동은 팀 화면에서만 (나는 끌어서 칠하기와 헷갈려서 화살표로만)
  const swipe = useWeekSwipe(shiftWeek)

  // 맨 아래 줄: 팀 화면에서 고른 칸의 안 되는 사람 (안내 문구는 없어요)
  let summary: ReactNode = null
  if (isTeam && selected) {
    // 고른 칸은 표에 흰 테두리로 보이니, 여기는 안 되는 사람만 간단하게
    const people = busyPeople(selected.col, selected.min)
    summary =
      people.length === 0
        ? '모두 돼요'
        : `안 되는 사람: ${people.map((p) => (p.practice ? `${p.name}(연습)` : p.name)).join(', ')}`
  }

  return (
    <>
      <div className="tp-bar">
        {/* 내가 리더인 곡이 있을 때만: [나] [곡A 팀] [곡B 팀] */}
        {teamSongs.length > 0 && (
          <div className="tp-chips" role="group" aria-label="누구의 타임픽">
            <button
              type="button"
              className={`tp-chip${!isTeam ? ' is-on' : ''}`}
              aria-pressed={!isTeam}
              onClick={() => pickTarget({ kind: 'me' })}
            >
              나
            </button>
            {teamSongs.map((s) => {
              const on = target.kind === 'team' && target.songId === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`tp-chip${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => pickTarget({ kind: 'team', songId: s.id })}
                >
                  {s.title} 팀
                </button>
              )
            })}
          </div>
        )}

        {/* 나를 칠할 때만: 이 주만(날짜) / 매주(요일) */}
        {!isTeam && (
          <div className="tp-mode" role="group" aria-label="칠하는 방식">
            <button
              type="button"
              className={mode === 'day' ? 'is-on' : undefined}
              aria-pressed={mode === 'day'}
              onClick={() => setMode('day')}
            >
              이 주만
            </button>
            <button
              type="button"
              className={mode === 'weekly' ? 'is-on' : undefined}
              aria-pressed={mode === 'weekly'}
              onClick={() => setMode('weekly')}
            >
              매주
            </button>
          </div>
        )}
      </div>

      {/* 매주 모드는 날짜가 없어서 주 이동 대신 제목 */}
      {isWeekly ? (
        <div className="tp-weekly-head">
          <strong>매주 반복</strong>
          <span>수업 · 알바등 반복되는 일정 | 유디 정규 연습은 표시할 필요 X</span>
        </div>
      ) : (
        <WeekNav weekStart={weekStart} isThisWeek={isThisWeek} onShift={shiftWeek} onToday={goToday} />
      )}

      <ul className="legend tp-legend" aria-label="칸 색 설명">
        {isTeam ? (
          // 팀: 모두 안 됨 [회색][옅은 청록 … 진한 청록] 모두 됨
          <li className="tp-legend-scale">
            모두 안 됨
            <span className="tp-sw-row" aria-hidden>
              <i className="tp-sw is-busy" />
              <i className="tp-sw is-lv1" />
              <i className="tp-sw is-lv2" />
              <i className="tp-sw is-lv3" />
              <i className="tp-sw is-lv4" />
            </span>
            모두 됨
          </li>
        ) : (
          <>
            <li>
              <i className="tp-sw is-free" />
              가능
            </li>
            <li>
              <i className="tp-sw is-busy" />
              {isWeekly ? '매주 불가능' : '불가능'}
            </li>
            {/* 유디 연습은 날짜가 있는 '이 주만'에서만 보여요 */}
            {!isWeekly && (
              <li>
                <i className="tp-sw is-practice" />
                유디 연습 (못 바꿔요)
              </li>
            )}
          </>
        )}
      </ul>

      <main className="cal-wrap" {...(isTeam ? swipe : {})}>
        <TimepickGrid
          columns={columns}
          cellOf={cellOf}
          blocks={isTeam || isWeekly ? [] : myBlocks}
          paint={paint}
          onTapCell={isTeam ? (col, min) => setSelected({ col, min }) : undefined}
          selected={isTeam ? selected : null}
        />
        {overlay ?? teamOverlay}
      </main>

      {/* 보여줄 게 있을 때만 (고른 칸의 안 되는 사람 · 저장 상태) */}
      {(summary || saveLine) && (
        <p className="week-summary tp-summary">
          {summary}
          {saveLine}
        </p>
      )}
    </>
  )
}
