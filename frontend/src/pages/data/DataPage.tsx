import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchMembers, fetchRegularPractices, fetchSongMembers, fetchSongs } from '../../api'
import type { Member, RegularPractice, Song, SongMember } from '../../types'
import { toDateKey, WEEKDAYS } from '../../lib/date'
import { SongImport } from './SongImport'
import { TimetableForm } from './TimetableForm'
import type { Period } from './TimetableForm'
import './DataPage.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      members: Member[]
      songs: Song[]
      songMembers: SongMember[]
      regulars: RegularPractice[]
    }

/** "18:00:00" → "18:00" */
const hhmm = (t: string) => t.slice(0, 5)

interface Props {
  view: 'songs' | 'members' // 곡 탭 / 부원 탭
}

// 곡 탭: 곡 등록 + 곡 칩(누르면 인원·시간표·멤버) / 부원 탭: 기수별 부원
export function DataPage({ view }: Props) {
  const [openId, setOpenId] = useState<number | null>(null) // 펼친 곡 (한 번에 하나, 기본은 접힘)
  const [formOpen, setFormOpen] = useState(false) // 펼친 곡의 시간표 등록 칸
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchMembers(controller.signal),
      fetchSongs(controller.signal),
      fetchSongMembers(controller.signal),
      fetchRegularPractices(controller.signal),
    ])
      .then(([members, songs, songMembers, regulars]) =>
        setLoad({ status: 'ready', members, songs, songMembers, regulars }),
      )
      .catch((e) => {
        if (!controller.signal.aborted) {
          console.error(e)
          setLoad({ status: 'error' })
        }
      })
    return () => controller.abort()
  }, [reloadKey])

  // 기수별로 묶기 (오름차순)
  const gens = useMemo(() => {
    if (load.status !== 'ready') return []
    const byGen = new Map<number, Member[]>()
    for (const m of load.members) {
      byGen.set(m.gen, [...(byGen.get(m.gen) ?? []), m])
    }
    return [...byGen.entries()].sort((a, b) => a[0] - b[0])
  }, [load])

  // 새 시간표의 적용 기간: 지금 쓰이는 정규연습 기간 중 가장 많은 것 (다른 곡들과 같게)
  // 하나도 없으면 오늘 ~ 이번 달 말일
  const period = useMemo<Period>(() => {
    const today = toDateKey(new Date())
    const counts = new Map<string, number>()
    if (load.status === 'ready') {
      for (const r of load.regulars) {
        if (r.ends_on < today) continue
        const k = `${r.starts_on}|${r.ends_on}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best) {
      const [startsOn, endsOn] = best[0].split('|')
      return { startsOn, endsOn }
    }
    const now = new Date()
    return { startsOn: today, endsOn: toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  }, [load])

  // 곡별 참여자 (리더가 맨 앞) + 정규연습 시간
  const songs = useMemo(() => {
    if (load.status !== 'ready') return []
    const memberById = new Map(load.members.map((m) => [m.id, m]))
    // 아직 끝나지 않은 정규연습만 (지난달 시간표는 제외)
    const today = toDateKey(new Date())
    const current = load.regulars.filter((r) => r.song_id !== null && r.ends_on >= today)
    return load.songs.map((song) => {
      const rows = load.songMembers
        .filter((sm) => sm.song_id === song.id)
        .sort((a, b) => Number(b.leader) - Number(a.leader))
      return {
        ...song,
        people: rows.flatMap((sm) => {
          const m = memberById.get(sm.member_id)
          return m ? [{ ...m, leader: sm.leader }] : []
        }),
        // "월 18:00–20:00" (월요일부터 순서대로)
        times: current
          .filter((r) => r.song_id === song.id)
          .sort((a, b) => (a.weekday || 7) - (b.weekday || 7) || a.start_time.localeCompare(b.start_time))
          .map((r) => `${WEEKDAYS[r.weekday]} ${hhmm(r.start_time)}–${hhmm(r.end_time)}`),
      }
    })
  }, [load])

  if (load.status === 'loading') {
    return <div className="data-state">불러오는 중…</div>
  }

  if (load.status === 'error') {
    return (
      <div className="data-state">
        <div className="error-card">
          <strong>데이터를 불러오지 못했어요</strong>
          <p>백엔드 서버와 부원·곡 API 를 확인해 주세요.</p>
          <button
            type="button"
            className="retry-btn"
            onClick={() => {
              setLoad({ status: 'loading' })
              setReloadKey((k) => k + 1)
            }}
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <main className="data">
      {view === 'members' && (
        <section className="data-sec">
          <h2>
            부원 <span>{load.members.length}명</span>
          </h2>
          {gens.map(([gen, members]) => (
            <div key={gen} className="data-group">
              <h3>{gen}기</h3>
              <ul className="name-list">
                {members.map((m) => (
                  <li key={m.id}>{m.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {view === 'songs' && <SongImport onImported={() => setReloadKey((k) => k + 1)} />}

      {view === 'songs' && (
        <section className="data-sec">
          <h2>
            곡 <span>{songs.length}곡</span>
            <em className="leader-key">
              <i /> 리더
            </em>
          </h2>
          <div className="song-chips">
            {songs.map((song) => {
              const open = openId === song.id
              const needsTime = song.times.length === 0
              return (
                <Fragment key={song.id}>
                  <button
                    type="button"
                    className={`song-chip${open ? ' is-open' : ''}`}
                    aria-expanded={open}
                    onClick={() => {
                      setOpenId(open ? null : song.id)
                      setFormOpen(false)
                    }}
                  >
                    {song.title}
                    {needsTime && (
                      <svg
                        className="song-clock"
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        aria-label="시간표 등록 필요"
                      >
                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
                        <path
                          d="M12 7.5V12l3 2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>

                  {open && (
                    <div className="song-detail">
                      <div className="song-meta">
                        <span className="song-count">{song.people.length}명</span>
                        {needsTime ? (
                          <button
                            type="button"
                            className={`song-times is-empty${formOpen ? ' is-open' : ''}`}
                            onClick={() => setFormOpen((f) => !f)}
                            aria-expanded={formOpen}
                          >
                            시간표 등록
                          </button>
                        ) : (
                          <span className="song-times">
                            {song.times.map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                          </span>
                        )}
                      </div>
                      {needsTime && formOpen && (
                        <TimetableForm
                          songId={song.id}
                          period={period}
                          onCancel={() => setFormOpen(false)}
                          onSaved={() => {
                            setFormOpen(false)
                            setReloadKey((k) => k + 1)
                          }}
                        />
                      )}
                      <ul className="name-list">
                        {song.people.map((p) => (
                          <li key={p.id} className={p.leader ? 'is-leader' : undefined}>
                            {p.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
