import type { Reservation, ScheduleItem } from '../types'
import { parseLocal } from './date'

// ── 주간 시간표의 시간 범위 ──
// '연습 공간' 캘린더와 마이페이지 '내 일정'이 같은 값을 써서 똑같은 범위를 보여줘요.
export const CAL_SLOT_MIN = 30 // 한 칸 = 30분
export const CAL_DAY_MIN = 24 * 60 // 표의 끝 24:00
export const CAL_START_MIN = 8 * 60 // 위로 스크롤하면 08:00 까지 보임
export const CAL_DEFAULT_TOP_MIN = 16 * 60 // 처음 화면 맨 위에 보일 시각
// 16:00~24:00 이 스크롤 영역에 꽉 차게 보이는 칸 수
export const CAL_VISIBLE_ROWS = (CAL_DAY_MIN - CAL_DEFAULT_TOP_MIN) / CAL_SLOT_MIN

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
