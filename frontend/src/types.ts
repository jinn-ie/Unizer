// 백엔드 schemas.py 의 ReservationRead 와 같은 모양 (한 번만 있는 연습)
// 곡 연습이면 song_id/song_title, 공통 일정이면 title 이 채워짐
export interface Reservation {
  id: number
  song_id: number | null
  song_title: string | null
  title: string | null
  space: string // "동방" | "대회의실1" | "대회의실2" | "바깥거울"
  start_at: string // "2026-11-18T19:00:00" (한국 시간, 타임존 없음)
  end_at: string
}

// 백엔드 schemas.py 의 RegularPracticeRead 와 같은 모양 (매주 반복 규칙)
export interface RegularPractice {
  id: number
  song_id: number | null
  song_title: string | null
  title: string | null
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
  reservation?: Reservation // 보충이면 원본 (수정/삭제할 때 사용)
}

// 백엔드 schemas.py 의 MemberRead / SongRead / SongMemberRead 와 같은 모양
export interface Member {
  id: number
  gen: number // 기수 (42, 43 …)
  name: string
}

export interface Song {
  id: number
  title: string
}

// 곡 ↔ 부원 연결 한 줄
export interface SongMember {
  song_id: number
  member_id: number
  leader: boolean
}

// 백엔드 schemas.py 의 ReservationIn 과 같은 모양 (보충 등록/수정 때 보내는 값)
export interface ReservationInput {
  song_id: number | null
  title: string | null
  space: string
  start_at: string // "2026-11-18T19:00:00"
  end_at: string
}
