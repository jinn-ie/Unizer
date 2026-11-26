import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  fetchMyTimepick,
  fetchReservations,
  fetchSongMembers,
  HttpError,
  logoutMember,
  saveWeeklyTimepick,
  saveWeekTimepickDays,
} from '../../api'
import type { Member, Reservation, SongMember } from '../../types'
import { addDays, isSameDay, parseDateKey, startOfWeek } from '../../lib/date'
import { TimepickView } from './TimepickView'
import { EMPTY_TIMEPICK, fromServer, weekDaysToServer, weeklyToServer } from './timepick'
import type { Timepick } from './timepick'
import '../schedule/SchedulePage.css' // 주 이동 · 범례 · 아래 안내 줄 모양은 '연습 공간'과 같이 써요
import './MyPracticePage.css'

// 칠하고 나서 이만큼 더 안 바뀌면 저장해요 (끌어서 여러 번 바꿔도 한 번만 보내려고)
const SAVE_DELAY_MS = 400

interface Props {
  member: Member | null // 로그인한 부원 (로그인 전이면 null)
  onLogin: () => void // 로그인 화면으로 가기
  onSessionExpired: () => void // 로그인이 풀렸을 때: 로그아웃 처리 + 로그인 화면으로
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'login' } // 서버가 401: 예전 로그인 쿠키라 다시 로그인해야 해요
  | { status: 'ready'; reservations: Reservation[]; songMembers: SongMember[] }

/** 저장할 범위: 'weekly' = 매주 칸 전체 / "2026-11-29" = 그 주(일요일부터)의 이 날만 칸 */
export type SaveScope = string

/** 자동 저장 상태 (화면 아래에 보여줘요) */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'login'

// '타임픽' 탭: 안 되는 시간을 칠하고, 리더는 곡 팀원 전체를 겹쳐 봐요. (화면은 TimepickView)
// 내 유디 연습도 여기서 회색 막대(곡명)로 보여서, 예전 '내 연습' 화면 대신이에요.
// 누가 "나"인지 알아야 해서 로그인한 뒤에만 볼 수 있어요.
export function MyPracticePage({ member, onLogin, onSessionExpired }: Props) {
  if (!member) {
    return (
      <div className="mypractice-empty">
        <div className="error-card">
          <strong>로그인하면 타임픽을 쓸 수 있어요</strong>
          <p>내 유디 연습을 보고, 안 되는 시간을 표시할 수 있어요.</p>
          <button type="button" className="mypractice-login" onClick={onLogin}>
            로그인하기
          </button>
        </div>
      </div>
    )
  }
  return <MyTimepick member={member} onSessionExpired={onSessionExpired} />
}

function MyTimepick({ member, onSessionExpired }: { member: Member; onSessionExpired: () => void }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [myPick, setMyPick] = useState<Timepick>(EMPTY_TIMEPICK) // 내가 칠한 칸

  // 연습 + 곡 멤버 + 내 타임픽을 동시에 불러옴
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchReservations(controller.signal),
      fetchSongMembers(controller.signal),
      fetchMyTimepick(controller.signal),
    ])
      .then(([reservations, songMembers, pick]) => {
        setMyPick(fromServer(pick))
        setLoad({ status: 'ready', reservations, songMembers })
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        console.error(e)
        setLoad({ status: e instanceof HttpError && e.status === 401 ? 'login' : 'error' })
      })
    return () => controller.abort()
  }, [reloadKey])

  // '오늘' 표시를 1분마다 갱신 (자정이 지나면 오늘 칸이 바뀌게)
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const thisWeek = startOfWeek(now)
  const isThisWeek = isSameDay(weekStart, thisWeek)
  const shiftWeek = useCallback((n: number) => setWeekStart((w) => addDays(w, 7 * n)), [])

  // ── 자동 저장 ──
  // 칸을 바꾸면 "어느 범위가 바뀌었는지"만 적어 두고, SAVE_DELAY_MS 동안 더 안 바뀌면
  // 그 범위를 통째로 서버에 보내요. (매주 칸 전체 / 그 주의 이 날만 칸)
  const pickRef = useRef(myPick) // 보내는 순간의 최신 칸
  useLayoutEffect(() => {
    pickRef.current = myPick
  })
  const pendingRef = useRef(new Set<SaveScope>()) // 아직 안 보낸 범위
  const queueRef = useRef<Promise<void>>(Promise.resolve()) // 저장을 하나씩 차례로 보내는 줄
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [editCount, setEditCount] = useState(0) // 바뀔 때마다 +1 → 저장 타이머를 다시 시작

  /** 바뀐 범위를 서버에 보내기 (앞 저장이 끝난 뒤에 보내서, 예전 값이 나중에 덮어쓰지 않게) */
  const flush = useCallback(() => {
    const scopes = [...pendingRef.current]
    if (scopes.length === 0) return
    pendingRef.current.clear()
    setSaveState('saving')
    queueRef.current = queueRef.current.then(async () => {
      try {
        for (const scope of scopes) {
          const tp = pickRef.current
          if (scope === 'weekly') {
            await saveWeeklyTimepick(weeklyToServer(tp))
          } else {
            const start = parseDateKey(scope)
            if (start) await saveWeekTimepickDays(scope, weekDaysToServer(tp, start))
          }
        }
        // 보내는 동안 또 바뀐 게 없으면 "저장했어요"
        if (pendingRef.current.size === 0) setSaveState('saved')
      } catch (e) {
        console.error(e)
        for (const scope of scopes) pendingRef.current.add(scope) // 다시 시도할 때 보내게 남겨 둠
        setSaveState(e instanceof HttpError && e.status === 401 ? 'login' : 'error')
      }
    })
  }, [])

  // 바뀐 뒤 잠깐 기다렸다가 저장 (그 사이 또 바뀌면 타이머를 다시 시작)
  useEffect(() => {
    if (editCount === 0) return
    const t = window.setTimeout(flush, SAVE_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [editCount, flush])

  // 다른 탭으로 나가면 기다리지 않고 바로 저장
  useEffect(() => () => flush(), [flush])

  /** 칸 바꾸기: 화면에는 바로 반영하고, 범위는 저장할 목록에 적어 둬요 */
  const editPick = useCallback((update: (tp: Timepick) => Timepick, scope: SaveScope) => {
    setMyPick(update)
    pendingRef.current.add(scope)
    setEditCount((n) => n + 1)
  }, [])

  // 로그인이 풀렸을 때: 예전 쿠키까지 지우고(로그아웃) 로그인 화면으로
  const relogin = () => {
    logoutMember()
      .catch(() => {})
      .finally(onSessionExpired)
  }

  // 불러오는 중 · 실패 안내 (표 위에 덮어서 보여줘요. 덮여 있는 동안은 칠할 수 없어요)
  let overlay = null
  if (load.status === 'loading') {
    overlay = <div className="cal-overlay">불러오는 중…</div>
  } else if (load.status === 'login') {
    overlay = (
      <div className="cal-overlay">
        <div className="error-card">
          <strong>다시 로그인해 주세요</strong>
          <p>로그인 방식이 바뀌어서 한 번만 다시 로그인하면 돼요.</p>
          <button type="button" className="mypractice-login" onClick={relogin}>
            다시 로그인
          </button>
        </div>
      </div>
    )
  } else if (load.status === 'error') {
    overlay = (
      <div className="cal-overlay">
        <div className="error-card">
          <strong>타임픽을 불러오지 못했어요</strong>
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
    )
  }

  return (
    <TimepickView
      member={member}
      now={now}
      weekStart={weekStart}
      isThisWeek={isThisWeek}
      onShiftWeek={shiftWeek}
      onToday={() => setWeekStart(thisWeek)}
      reservations={load.status === 'ready' ? load.reservations : []}
      songMembers={load.status === 'ready' ? load.songMembers : []}
      myPick={myPick}
      onEditPick={editPick}
      saveState={saveState}
      onRetrySave={flush}
      onRelogin={relogin}
      overlay={overlay}
    />
  )
}
