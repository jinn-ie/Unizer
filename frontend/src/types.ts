// 백엔드 schemas.py 의 ReservationRead 와 같은 모양 (연습 1건)
// 곡 연습이면 song_id/song_title, 공통 일정이면 title 이 채워짐
export interface Reservation {
  id: number
  song_id: number | null
  song_title: string | null
  title: string | null
  space: string // "동방" | "바깥거울" | "대회의실1" | "대회의실2" | "아라"
  start_at: string // "2026-11-18T19:00:00" (한국 시간, 타임존 없음)
  end_at: string
  created_at: string | null // 등록 시각 (예전 연습은 null)
  updated_at: string | null // 마지막 수정 시각 (수정한 적 없으면 null)
  slot_id: number | null // 시간표로 만든 연습이면 그 블록 번호
  // 개인 보충 여부 + 함께하는 부원 (리더 포함). 단체 연습이면 false / []
  // 백엔드가 아직 이 값을 안 보내면 undefined → 단체로 취급
  personal?: boolean
  member_ids?: number[]
}

// 화면에 그리는 일정 1건
export interface ScheduleItem {
  key: string // 화면에서 쓰는 고유 키
  title: string
  space: string
  start: Date
  end: Date
  reservation: Reservation // 원본 (수정/삭제할 때 사용)
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
  personal: boolean // 개인 보충이면 true (곡 연습일 때만)
  member_ids: number[] // 개인 보충에 함께하는 부원 (리더 포함). 단체면 []
}

// ── 곡 일괄 등록 (백엔드 schemas.py 의 PreviewSong / ImportSong 과 같은 모양) ──
export interface PreviewPerson {
  name: string
  leader: boolean
  candidates: { id: number; gen: number }[] // 0명: 없음 / 1명: 확정 / 2명 이상: 동명이인
}

export interface ExistingSong {
  id: number
  title: string
  members: { name: string; gen: number; leader: boolean }[]
}

export interface PreviewSong {
  title: string
  people: PreviewPerson[]
  existing: ExistingSong[] // 제목이 같은 기존 곡
}

export interface ImportSong {
  title: string
  members: { member_id: number; leader: boolean }[]
}

// 시간표 (백엔드 schemas.py 의 TimetableRead / SlotRead 와 같은 모양)
// 블록 1개 = 기간 안의 그 요일마다 연습 1건
export interface TimetableSlot {
  id: number
  song_id: number | null // 곡 연습이면 곡 번호
  title: string | null // 곡이 아닌 일정이면 이름 ("기본기")
  weekday: number // 0=일 … 6=토
  start_time: string // "19:00:00"
  end_time: string // 시작보다 이르면 다음 날 ("00:00:00" = 자정)
  space: string
}

export interface Timetable {
  id: number
  name: string // "2026 버스킹 2차곡"
  starts_on: string // "2026-11-24" (포함)
  ends_on: string // "2026-12-14" (포함)
  created_at: string
  updated_at: string | null
  slots: TimetableSlot[]
}

// 시간표 등록/수정 때 보내는 값 (TimetableIn / SlotIn). 수정할 때 기존 블록은 id 를 같이 보냄
export interface TimetableSlotInput {
  id: number | null
  song_id: number | null
  title: string | null
  weekday: number
  start_time: string
  end_time: string
  space: string
}

export interface TimetableInput {
  name: string
  starts_on: string
  ends_on: string
  slots: TimetableSlotInput[]
}

// 공연 (백엔드 schemas.py 에 만들 ShowRead 와 같은 모양)
// 곡 묶음이에요. 한 곡이 여러 공연에 들어갈 수 있어요.
export interface Show {
  id: number
  name: string // "2026 버스킹"
  created_at: string
  song_ids: number[] // 이 공연에 넣은 곡 번호들
}

// 공연 만들기 / 수정 때 보내는 값 (ShowIn). 곡 목록은 통째로 보내서 그대로 저장
export interface ShowInput {
  name: string
  song_ids: number[]
}

// 날짜별 메모 (백엔드 schemas.py 의 NoteRead 와 같은 모양)
export interface Note {
  id: number
  date_on: string // "2026-11-19" 메모가 붙은 날짜
  text: string
  created_at: string // 남긴 시각
}

// 메모 남길 때 보내는 값 (NoteIn)
export interface NoteInput {
  date_on: string
  text: string
}

// 의견 보내기 (백엔드 schemas.py 에 만들 FeedbackIn 과 같은 모양)
export interface FeedbackInput {
  text: string
}

// ── 로그인 ──
export interface LoginInput {
  gen: number
  name: string
  password?: string
}

// 로그인한 부원에게 비밀번호가 설정돼 있는지 (GET /api/auth/password)
export interface PasswordStatus {
  has_password: boolean
}

// 백엔드 schemas.py 의 PasswordChangeIn 과 같은 모양
// 처음 설정할 때는 current_password 없이 보내요.
export interface PasswordChangeInput {
  current_password?: string
  new_password: string
}

// ── 타임픽 (백엔드 schemas.py 의 TimepickWeeklyCell / TimepickDayCell / TimepickRead / TeamTimepickRead) ──
// 칸 하나 = 30분. start_time 은 칸 시작 시각 "16:30:00"
export interface TimepickWeeklyCell {
  weekday: number // 0=일 … 6=토
  start_time: string
}

export interface TimepickDayCell {
  date_on: string // "2026-12-02"
  start_time: string
  busy: boolean // true: 이 날만 안 됨 / false: 매주 칸을 이 날만 됨으로 덮기
}

// 한 사람의 타임픽 (GET /api/timepicks/me)
export interface TimepickData {
  weekly: TimepickWeeklyCell[]
  days: TimepickDayCell[]
}

// 팀 화면: 누구의 타임픽인지 + 그 사람의 칸 (GET /api/timepicks/songs/{song_id})
export interface TeamTimepick extends TimepickData {
  member_id: number
}
