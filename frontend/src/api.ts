import type { RegularPractice, Reservation } from './types'

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
