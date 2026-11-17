import type { Reservation } from './types'

export async function fetchReservations(signal?: AbortSignal): Promise<Reservation[]> {
  const res = await fetch('/api/reservations', { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
