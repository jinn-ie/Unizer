import { useEffect, useMemo, useState } from 'react'
import { fetchMembers, fetchSongMembers, fetchSongs } from '../api'
import type { Member, Song, SongMember } from '../types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; members: Member[]; songs: Song[]; songMembers: SongMember[] }

// 내부 데이터(임시) 탭: DB 에 들어간 부원 / 곡 / 곡별 참여자를 그대로 보여줌
export function DataPage() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchMembers(controller.signal),
      fetchSongs(controller.signal),
      fetchSongMembers(controller.signal),
    ])
      .then(([members, songs, songMembers]) =>
        setLoad({ status: 'ready', members, songs, songMembers }),
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

  // 곡별 참여자 (리더가 맨 앞)
  const songs = useMemo(() => {
    if (load.status !== 'ready') return []
    const memberById = new Map(load.members.map((m) => [m.id, m]))
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

      <section className="data-sec">
        <h2>
          곡 <span>{songs.length}곡</span>
          <em className="leader-key">
            <i /> 리더
          </em>
        </h2>
        {songs.map((song) => (
          <div key={song.id} className="data-group">
            <h3>
              {song.title} <span>{song.people.length}명</span>
            </h3>
            <ul className="name-list">
              {song.people.map((p) => (
                <li key={p.id} className={p.leader ? 'is-leader' : undefined}>
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  )
}
