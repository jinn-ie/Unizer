import type { Member, RegularPractice, Reservation, Song, SongMember } from './types'

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
