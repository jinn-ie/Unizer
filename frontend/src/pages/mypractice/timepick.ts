import type { Reservation, TimepickData, TimepickDayCell, TimepickWeeklyCell } from '../../types'
import { addDays, formatMinutes, parseLocal, toDateKey } from '../../lib/date'
import { CAL_DAY_MIN, CAL_SLOT_MIN, CAL_START_MIN } from '../../lib/schedule'

// ── 타임픽: 30분 칸마다 "안 되는 시간"을 칠해요 ──
// 칸 하나가 안 되는지는 세 겹을 위에서부터 봐서 정해요.
//   1. 유디 연습   : 내 연습이 있으면 안 됨 (자동, 잠김)
//   2. 이 날만 기록 : 있으면 그 값대로 (busy=true 안 됨 / false 됨 = 매주 칸을 이 날만 덮기)
//   3. 매주 반복   : 그 요일 칸을 칠해 뒀으면 안 됨
//   4. 셋 다 없으면 됨
// 백엔드 테이블: timepick_weekly(member_id, weekday, start_time)
//               timepick_days(member_id, date_on, start_time, busy)

/** 표의 칸 시작 시각들 (08:00, 08:30, … 23:30) — '연습 공간'과 같은 범위 */
export const TP_ROWS: number[] = []
for (let m = CAL_START_MIN; m < CAL_DAY_MIN; m += CAL_SLOT_MIN) TP_ROWS.push(m)

/** 매주 칸 이름: "2-960" = 화요일 16:00 (요일 0=일 … 6=토) */
export const weeklyKey = (weekday: number, min: number) => `${weekday}-${min}`

/** 날짜 칸 이름: "2026-12-02@960" = 12/2 16:00 */
export const dayKey = (date: Date, min: number) => `${toDateKey(date)}@${min}`

/** 아무것도 안 칠한 타임픽 (불러오기 전에 써요) */
export const EMPTY_TIMEPICK: Timepick = { weekly: new Set(), days: new Map() }

/** 한 사람의 타임픽 (백엔드 두 테이블을 그대로 옮긴 모양) */
export interface Timepick {
  weekly: Set<string> // 매주 안 되는 칸 (weeklyKey)
  days: Map<string, boolean> // 이 날만 바꾼 칸 (dayKey → busy)
}

/** 칸 하나의 상태 (화면 색을 정할 때 써요) */
export type CellState =
  | 'practice' // 유디 연습 (잠김)
  | 'day-busy' // 이 날만 안 됨
  | 'day-free' // 매주 안 되는데 이 날만 됨 (덮음)
  | 'weekly' // 매주 안 됨
  | 'free' // 됨

export function cellState(tp: Timepick, practice: Set<string>, date: Date, min: number): CellState {
  const key = dayKey(date, min)
  if (practice.has(key)) return 'practice'
  const day = tp.days.get(key)
  if (day === true) return 'day-busy'
  const weekly = tp.weekly.has(weeklyKey(date.getDay(), min))
  if (day === false) return weekly ? 'day-free' : 'free' // 매주 칸이 없어졌으면 덮을 것도 없음
  return weekly ? 'weekly' : 'free'
}

export function isBusy(state: CellState): boolean {
  return state === 'practice' || state === 'day-busy' || state === 'weekly'
}

/**
 * '이 주만' 모드에서 칸 하나를 busy 로 바꾼 새 타임픽
 * 매주 기본값과 같아지면 이 날 기록을 지우고, 다르면 남겨요.
 * (그래야 timepick_days 에는 "평소와 다른 날"만 남아요)
 */
export function setDayCell(tp: Timepick, date: Date, min: number, busy: boolean): Timepick {
  const key = dayKey(date, min)
  const weekly = tp.weekly.has(weeklyKey(date.getDay(), min))
  const days = new Map(tp.days)
  if (busy === weekly) days.delete(key)
  else days.set(key, busy)
  return { ...tp, days }
}

/** '매주' 모드에서 칸 하나를 busy 로 바꾼 새 타임픽 */
export function setWeeklyCell(tp: Timepick, weekday: number, min: number, busy: boolean): Timepick {
  const weekly = new Set(tp.weekly)
  if (busy) weekly.add(weeklyKey(weekday, min))
  else weekly.delete(weeklyKey(weekday, min))
  return { ...tp, weekly }
}

/** 연습들이 걸쳐 있는 30분 칸 전부 (dayKey 모음) → 유디 연습 회색 칸 */
export function practiceCells(reservations: Reservation[]): Set<string> {
  const cells = new Set<string>()
  for (const r of reservations) {
    const end = parseLocal(r.end_at)
    // 시작 시각을 30분 단위로 내려서 칸 시작부터 셈 (19:10 시작이면 19:00 칸부터 안 됨)
    const t = parseLocal(r.start_at)
    t.setMinutes(Math.floor(t.getMinutes() / CAL_SLOT_MIN) * CAL_SLOT_MIN, 0, 0)
    while (t.getTime() < end.getTime()) {
      cells.add(dayKey(t, t.getHours() * 60 + t.getMinutes()))
      t.setMinutes(t.getMinutes() + CAL_SLOT_MIN)
    }
  }
  return cells
}

// ── 서버 모양 ↔ 화면 모양 ──
// 서버: 칸 목록 ({ weekday, start_time: "16:30:00" } …)
// 화면: 칸 이름 모음 (Set / Map) — 칸 하나를 바로 찾을 수 있어서 칠할 때 빨라요

/** "16:30:00" → 990 (0시부터 분) */
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** 990 → "16:30:00" */
const toTime = (min: number) => `${formatMinutes(min)}:00`

/** 서버에서 받은 타임픽 → 화면용 */
export function fromServer(data: TimepickData): Timepick {
  return {
    weekly: new Set(data.weekly.map((c) => weeklyKey(c.weekday, toMin(c.start_time)))),
    days: new Map(data.days.map((c) => [`${c.date_on}@${toMin(c.start_time)}`, c.busy])),
  }
}

/** 매주 칸 전부 → 서버로 보낼 목록 (PUT /me/weekly) */
export function weeklyToServer(tp: Timepick): TimepickWeeklyCell[] {
  return [...tp.weekly].map((key) => {
    const [weekday, min] = key.split('-').map(Number) // "2-960" → 2, 960
    return { weekday, start_time: toTime(min) }
  })
}

/** 그 주(weekStart 일요일 ~ 토요일)의 이 날만 칸 → 서버로 보낼 목록 (PUT /me/days/{weekStart}) */
export function weekDaysToServer(tp: Timepick, weekStart: Date): TimepickDayCell[] {
  const weekDates = new Set(Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i))))
  const out: TimepickDayCell[] = []
  for (const [key, busy] of tp.days) {
    const [dateOn, min] = key.split('@') // "2026-12-02@960" → "2026-12-02", "960"
    if (weekDates.has(dateOn)) out.push({ date_on: dateOn, start_time: toTime(Number(min)), busy })
  }
  return out
}

