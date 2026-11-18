import type { RegularPractice, Reservation, ScheduleItem } from '../types'
import { addDays, parseLocal, toDateKey } from './date'

/** 화면에 보여줄 이름: 곡 연습이면 곡명, 공통 일정이면 title */
function displayTitle(x: { song_title: string | null; title: string | null }): string {
  return x.song_title ?? x.title ?? '(이름 없음)'
}

export function reservationToItem(r: Reservation): ScheduleItem {
  return {
    key: `r-${r.id}`,
    kind: 'reservation',
    title: displayTitle(r),
    space: r.space,
    start: parseLocal(r.start_at),
    end: parseLocal(r.end_at),
    reservation: r,
  }
}

/** "19:00:00" 을 그 날짜의 시각으로 */
function atTime(day: Date, hms: string): Date {
  const [h, m] = hms.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
}

/** 정규연습 규칙을 weekStart 부터 days 일 동안의 실제 일정으로 펼치기 */
export function expandRegularPractices(
  practices: RegularPractice[],
  weekStart: Date,
  days = 7,
): ScheduleItem[] {
  const items: ScheduleItem[] = []
  for (let i = 0; i < days; i++) {
    const day = addDays(weekStart, i)
    const dayKey = toDateKey(day) // "YYYY-MM-DD" 는 문자열 비교로 날짜 순서 비교 가능
    for (const p of practices) {
      if (p.weekday !== day.getDay()) continue
      if (dayKey < p.starts_on || dayKey > p.ends_on) continue
      const start = atTime(day, p.start_time)
      let end = atTime(day, p.end_time)
      if (end <= start) end = addDays(end, 1) // 자정을 넘기는 정규연습
      items.push({
        key: `p-${p.id}-${dayKey}`,
        kind: 'regular',
        title: displayTitle(p),
        space: p.space,
        start,
        end,
      })
    }
  }
  return items
}
