import type {
  Member,
  RegularPractice,
  Reservation,
  ReservationInput,
  Song,
  SongMember,
} from './types'

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

export function fetchReservations(signal?: AbortSignal) {
  return getJson<Reservation[]>('/api/reservations', signal)
}

export function fetchRegularPractices(signal?: AbortSignal) {
  return getJson<RegularPractice[]>('/api/regular-practices', signal)
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
