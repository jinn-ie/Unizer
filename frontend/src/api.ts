import type {
  FeedbackInput,
  ImportSong,
  LoginInput,
  Member,
  Note,
  NoteInput,
  PreviewSong,
  Reservation,
  ReservationInput,
  Song,
  SongMember,
  Timetable,
  TimetableInput,
} from './types'

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
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
    throw new Error(detail)
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
