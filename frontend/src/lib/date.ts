// 일요일 시작 주
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 그 날의 0시 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 그 주의 일요일 0시 */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  return addDays(day, -day.getDay())
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 일요일=0 … 토요일=6 (WEEKDAYS 인덱스) */
export function weekdayIndex(d: Date): number {
  return d.getDay()
}

/** "2026-11-18T19:00:00" → 로컬(한국) 시간 Date */
export function parseLocal(iso: string): Date {
  return new Date(iso)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateKey(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatMinutes(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h && m) return `${h}시간 ${m}분`
  if (h) return `${h}시간`
  return `${m}분`
}

/** "11월 16일 – 22일" / "11월 30일 – 12월 6일" */
export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const left = `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일`
  const right =
    end.getMonth() === weekStart.getMonth()
      ? `${end.getDate()}일`
      : `${end.getMonth() + 1}월 ${end.getDate()}일`
  return `${left} – ${right}`
}

/** "11월 18일 (수)" */
export function formatDayTitle(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[weekdayIndex(d)]})`
}
