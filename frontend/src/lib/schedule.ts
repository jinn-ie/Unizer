import type { Reservation, ScheduleItem } from '../types'
import { parseLocal } from './date'

/** 화면에 보여줄 이름: 곡 연습이면 곡명, 공통 일정이면 title */
function displayTitle(x: { song_title: string | null; title: string | null }): string {
  return x.song_title ?? x.title ?? '(이름 없음)'
}

export function reservationToItem(r: Reservation): ScheduleItem {
  return {
    key: `r-${r.id}`,
    title: displayTitle(r),
    space: r.space,
    start: parseLocal(r.start_at),
    end: parseLocal(r.end_at),
    reservation: r,
  }
}
