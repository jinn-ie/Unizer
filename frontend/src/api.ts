import type {
  Activity,
  FeedbackInput,
  ImportSong,
  LoginInput,
  Member,
  Note,
  NoteInput,
  PasswordChangeInput,
  PasswordStatus,
  PreviewSong,
  Reservation,
  ReservationInput,
  Show,
  ShowInput,
  Song,
  SongMember,
  TeamTimepick,
  TimepickData,
  TimepickDayCell,
  TimepickWeeklyCell,
  Timetable,
  TimetableInput,
} from './types'

// 서버가 오류로 답했을 때: 문구 + HTTP 상태 번호 (401 = 로그인 필요, 403 = 권한 없음 …)
// 화면에서 상태 번호에 따라 안내를 다르게 할 수 있게 같이 담아 둬요.
export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new HttpError(`${url} → HTTP ${res.status}`, res.status)
  return res.json()
}

export function fetchReservations(signal?: AbortSignal) {
  return getJson<Reservation[]>('/api/reservations', signal)
}

export function fetchMembers(signal?: AbortSignal) {
  return getJson<Member[]>('/api/members', signal)
}

export function fetchSongs(signal?: AbortSignal) {
  return getJson<Song[]>('/api/songs', signal)
}

export function fetchSongMembers(signal?: AbortSignal) {
  return getJson<SongMember[]>('/api/song-members', signal)
}

// 서버가 보낸 에러 문구(detail)를 꺼내서 그대로 보여줄 수 있게 Error 로 던짐
async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const detail = typeof data?.detail === 'string' ? data.detail : '입력한 내용을 다시 확인해 주세요.'
    throw new HttpError(detail, res.status)
  }
  if (res.status === 204) return undefined as T // 삭제 성공: 돌려줄 내용 없음
  return res.json()
}

export function createReservation(input: ReservationInput) {
  return sendJson<Reservation>('/api/reservations', 'POST', input)
}

export function updateReservation(id: number, input: ReservationInput) {
  return sendJson<Reservation>(`/api/reservations/${id}`, 'PUT', input)
}

export function deleteReservation(id: number) {
  return sendJson<void>(`/api/reservations/${id}`, 'DELETE')
}

// 붙여넣은 곡 글자를 파싱해서 확인용으로 받아옴 (저장 X)
export function previewSongImport(text: string) {
  return sendJson<PreviewSong[]>('/api/songs/import/preview', 'POST', { text })
}

// 확인이 끝난 곡들을 한꺼번에 저장
export function importSongs(songs: ImportSong[]) {
  return sendJson<Song[]>('/api/songs/import', 'POST', songs)
}

// ── 시간표 (블록마다 기간 안의 그 요일에 연습이 만들어짐) ──
export function fetchTimetables(signal?: AbortSignal) {
  return getJson<Timetable[]>('/api/timetables', signal)
}

// 등록: 시간표 + 연습을 한 번에 (하나라도 겹치면 전부 취소)
export function createTimetable(input: TimetableInput) {
  return sendJson<Timetable>('/api/timetables', 'POST', input)
}

// 수정: 바뀐 블록의 연습을 기간 전체에서 다시 만듦 (안 바뀐 블록의 연습은 그대로)
export function updateTimetable(id: number, input: TimetableInput) {
  return sendJson<Timetable>(`/api/timetables/${id}`, 'PUT', input)
}

// 삭제: 그 시간표로 만든 연습도 전부 지움 (지난 날짜 포함)
export function deleteTimetable(id: number) {
  return sendJson<void>(`/api/timetables/${id}`, 'DELETE')
}

// ── 공연 (곡 묶음) ──
export function fetchShows(signal?: AbortSignal) {
  return getJson<Show[]>('/api/shows', signal)
}

// 만들기: 처음엔 보통 곡 없이 이름만 (song_ids: [])
export function createShow(input: ShowInput) {
  return sendJson<Show>('/api/shows', 'POST', input)
}

// 수정: 이름 + 곡 목록을 통째로 바꿈 (체크를 푼 곡은 공연에서 빠짐)
export function updateShow(id: number, input: ShowInput) {
  return sendJson<Show>(`/api/shows/${id}`, 'PUT', input)
}

// 삭제: 공연만 지우고 곡은 그대로 남음
export function deleteShow(id: number) {
  return sendJson<void>(`/api/shows/${id}`, 'DELETE')
}

// ── 날짜별 메모 ──
export function fetchNotes(signal?: AbortSignal) {
  return getJson<Note[]>('/api/notes', signal)
}

export function createNote(input: NoteInput) {
  return sendJson<Note>('/api/notes', 'POST', input)
}

export function deleteNote(id: number) {
  return sendJson<void>(`/api/notes/${id}`, 'DELETE')
}

// ── 의견 보내기 ──
export function sendFeedback(input: FeedbackInput) {
  return sendJson<unknown>('/api/feedback', 'POST', input)
}

// ── 로그인 ──
export function fetchCurrentMember(signal?: AbortSignal) {
  return getJson<Member | null>('/api/auth/me', signal)
}

export function loginMember(input: LoginInput) {
  return sendJson<Member>('/api/auth/login', 'POST', input)
}

export function logoutMember() {
  return sendJson<void>('/api/auth/logout', 'POST')
}

export function fetchPasswordStatus(signal?: AbortSignal) {
  return getJson<PasswordStatus>('/api/auth/password', signal)
}

// 설정 · 변경 둘 다 이 함수로 해요. 성공하면 다른 기기의 로그인이 풀려요.
export function changePassword(input: PasswordChangeInput) {
  return sendJson<void>('/api/auth/password', 'PUT', input)
}

// ── 타임픽 ──
// 내가 칠한 칸 전부 (매주 칸 + 이 날만 칸)
export function fetchMyTimepick(signal?: AbortSignal) {
  return getJson<TimepickData>('/api/timepicks/me', signal)
}

// 매주 칸을 통째로 바꾸기
export function saveWeeklyTimepick(cells: TimepickWeeklyCell[]) {
  return sendJson<void>('/api/timepicks/me/weekly', 'PUT', cells)
}

// 그 주(일요일 ~ 토요일)의 이 날만 칸을 통째로 바꾸기. weekStart = 그 주 일요일 "2026-11-29"
export function saveWeekTimepickDays(weekStart: string, cells: TimepickDayCell[]) {
  return sendJson<void>(`/api/timepicks/me/days/${weekStart}`, 'PUT', cells)
}

// 팀 화면: 그 곡 팀원 전원의 칠한 칸 (그 곡의 리더만, 아니면 403)
export function fetchTeamTimepick(songId: number, signal?: AbortSignal) {
  return getJson<TeamTimepick[]>(`/api/timepicks/songs/${songId}`, signal)
}

// ── 관리자 페이지 ──
// 활동 기록: 최근 것부터. 다음 쪽은 받은 것 중 마지막 id 를 beforeId 로 (관리자만, 아니면 403)
export function fetchActivity(
  filter: { kind?: string; memberId?: number; beforeId?: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE) })
  if (filter.kind) params.set('kind', filter.kind)
  if (filter.memberId !== undefined) params.set('member_id', String(filter.memberId))
  if (filter.beforeId !== undefined) params.set('before_id', String(filter.beforeId))
  return getJson<Activity[]>(`/api/admin/activity?${params}`, signal)
}

// 한 번에 받아 오는 기록 수 (이만큼 왔으면 '더 보기'가 있을 수 있어요)
export const ACTIVITY_PAGE = 50
