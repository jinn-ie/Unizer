// 백엔드 schemas.py 의 ReservationRead 와 같은 모양 (리더가 잡은 연습)
export interface Reservation {
  id: number
  space: string // "동방" | "대회의실1" | "대회의실2" | "바깥거울"
  song_title: string
  start_at: string // "2026-11-18T19:00:00" (한국 시간, 타임존 없음)
  end_at: string
}

// 백엔드 schemas.py 의 RegularPracticeRead 와 같은 모양 (매주 반복 규칙)
export interface RegularPractice {
  id: number
  title: string
  weekday: number // 0=일 … 6=토
  start_time: string // "19:00:00"
  end_time: string
  space: string
  starts_on: string // "2026-11-02" (포함)
  ends_on: string // "2026-11-27" (포함)
}

// 화면에 그리는 일정 1건 (리더 연습 / 정규연습을 같은 모양으로)
export type ScheduleKind = 'reservation' | 'regular'

export interface ScheduleItem {
  key: string // 화면에서 쓰는 고유 키
  kind: ScheduleKind
  title: string
  space: string
  start: Date
  end: Date
}
