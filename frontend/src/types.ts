// 백엔드 schemas.py 의 ReservationRead 와 같은 모양
export interface Reservation {
  id: number
  space: string // "동방" | "대회의실1" | "대회의실2" | "바깥거울"
  song_title: string
  start_at: string // "2026-11-18T19:00:00" (한국 시간, 타임존 없음)
  end_at: string
}
