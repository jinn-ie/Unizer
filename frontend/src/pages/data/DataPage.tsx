import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchMembers, fetchReservations, fetchShows, fetchSongMembers, fetchSongs, fetchTimetables } from '../../api'
import type { Member, Reservation, Show, Song, SongMember, Timetable } from '../../types'
import { parseDateKey, parseLocal, toDateKey } from '../../lib/date'
import { Toast } from '../../components/Toast'
import { ShowCreate } from './ShowCreate'
import { ShowSheet } from './ShowSheet'
import { SongImport } from './SongImport'
import { TimetableBuilder } from './TimetableBuilder'
import './DataPage.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      members: Member[]
      songs: Song[]
      songMembers: SongMember[]
      reservations: Reservation[]
      timetables: Timetable[]
      shows: Show[] | null // null = 공연 목록을 못 불러옴 → 공연 구분 없이 곡만 보여줌
      loadedAt: number // 불러온 시각 (이후에 끝나는 연습 = 예정된 연습)
    }

interface Props {
  view: 'songs' | 'members' // 곡 탭 / 부원 탭
}

// 시간표 창: 새로 만들기 / 저장된 시간표 고치기
type Builder = { mode: 'new' } | { mode: 'edit'; timetable: Timetable }

/** "2026-11-24" → "11/24" */
function shortDate(key: string): string {
  const d = parseDateKey(key)
  return d ? `${d.getMonth() + 1}/${d.getDate()}` : key
}

/** 오늘 기준 시간표 상태 */
function timetableStatus(t: Timetable, today: string): { label: string; cls: string } {
  if (t.ends_on < today) return { label: '지남', cls: 'is-past' }
  if (t.starts_on > today) return { label: '예정', cls: 'is-soon' }
  return { label: '진행 중', cls: 'is-now' }
}

// 공연 토글 하나 (또는 맨 아래 "미분류")
interface SongGroup {
  key: string // "show-3" / "none"
  name: string
  show: Show | null // 미분류면 null
}

// 곡 탭: 공연 만들기 버튼 + 공연별 토글 안에 곡 칩(누르면 인원·예정 연습·멤버) + 곡 등록 / 시간표 목록 · 생성
// 부원 탭: 기수별 부원
export function DataPage({ view }: Props) {
  // 펼친 곡 칩 (한 번에 하나). 한 곡이 여러 공연에 있을 수 있어서 "토글 키:곡 번호"로 구분
  const [openSongKey, setOpenSongKey] = useState<string | null>(null)
  // 공연 토글을 직접 열고 닫은 기록. 기록이 없는 토글은 맨 위 하나만 펼침
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [editingShow, setEditingShow] = useState<Show | null>(null) // 곡 넣기 · 편집 시트
  // 곡 탭 맨 위 버튼으로 펼친 입력칸
  const [panel, setPanel] = useState<'show' | null>(null)
  const [builder, setBuilder] = useState<Builder | null>(null) // 시간표 창
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchMembers(controller.signal),
      fetchSongs(controller.signal),
      fetchSongMembers(controller.signal),
      // 예정 연습 수는 부가 정보라, 실패해도 빈 목록으로 두고 곡 목록은 그대로 보여줌
      fetchReservations(controller.signal).catch(() => [] as Reservation[]),
      fetchTimetables(controller.signal).catch(() => [] as Timetable[]),
      // 공연도 부가 정보: 실패하면 null 로 두고 예전처럼 곡만 보여줌
      fetchShows(controller.signal).catch(() => null),
    ])
      .then(([members, songs, songMembers, reservations, timetables, shows]) =>
        setLoad({
          status: 'ready',
          members,
          songs,
          songMembers,
          reservations,
          timetables,
          shows,
          loadedAt: Date.now(),
        }),
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

  // 곡별 참여자 (리더가 맨 앞) + 아직 끝나지 않은 연습 수
  const songs = useMemo(() => {
    if (load.status !== 'ready') return []
    const memberById = new Map(load.members.map((m) => [m.id, m]))
    const upcoming = new Map<number, number>()
    for (const r of load.reservations) {
      if (r.song_id === null || parseLocal(r.end_at).getTime() <= load.loadedAt) continue
      upcoming.set(r.song_id, (upcoming.get(r.song_id) ?? 0) + 1)
    }
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
        upcoming: upcoming.get(song.id) ?? 0,
      }
    })
  }, [load])

  // 공연 토글 목록: 최근에 만든 공연이 위, 어느 공연에도 없는 곡은 맨 아래 "미분류"
  // 토글 안의 곡 순서는 곡 목록 순서 그대로
  const groups = useMemo(() => {
    if (load.status !== 'ready' || load.shows === null) return null
    const shows = [...load.shows].sort((a, b) => b.id - a.id) // 번호가 클수록 최근에 만든 공연
    const inShow = new Set(shows.flatMap((s) => s.song_ids))
    const list: (SongGroup & { songs: typeof songs })[] = shows.map((show) => {
      const ids = new Set(show.song_ids)
      return { key: `show-${show.id}`, name: show.name, show, songs: songs.filter((s) => ids.has(s.id)) }
    })
    const rest = songs.filter((s) => !inShow.has(s.id))
    if (rest.length > 0) list.push({ key: 'none', name: '미분류', show: null, songs: rest })
    return list
  }, [load, songs])

  // 시간표 목록: 들어간 곡 이름(곡 목록 순서) + 일정 이름(기본기 등) + 오늘 기준 상태
  const timetables = useMemo(() => {
    if (load.status !== 'ready') return []
    const today = toDateKey(new Date(load.loadedAt))
    return load.timetables.map((t) => {
      const ids = new Set(t.slots.map((s) => s.song_id))
      const songTitles = load.songs.filter((s) => ids.has(s.id)).map((s) => s.title)
      const extras = [...new Set(t.slots.flatMap((s) => (s.title ? [s.title] : [])))]
      return {
        ...t,
        songCount: songTitles.length,
        names: [...songTitles, ...extras],
        status: timetableStatus(t, today),
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

  // 곡 칩 목록 (누르면 바로 아래에 인원 · 예정 연습 · 멤버)
  function renderChips(groupKey: string, list: typeof songs) {
    return (
      <div className="song-chips">
        {list.map((song) => {
          const key = `${groupKey}:${song.id}`
          const open = openSongKey === key
          return (
            <Fragment key={song.id}>
              <button
                type="button"
                className={`song-chip${open ? ' is-open' : ''}`}
                aria-expanded={open}
                onClick={() => setOpenSongKey(open ? null : key)}
              >
                {song.title}
              </button>

              {open && (
                <div className="song-detail">
                  <div className="song-meta">
                    <span className="song-count">{song.people.length}명</span>
                    {/* 연습이 잡혀 있을 때만 횟수를 보여줌 (없을 때는 따로 표시하지 않음) */}
                    {song.upcoming > 0 && <span className="song-times">예정된 연습 {song.upcoming}회</span>}
                  </div>
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
    )
  }

  const reload = () => setReloadKey((k) => k + 1)

  // 방금 만들거나 저장한 공연은 펼쳐서 보여줌
  const openShow = (id: number) => setToggled((t) => ({ ...t, [`show-${id}`]: true }))

  // 맨 위 버튼: 누르면 펼치고, 이미 펼쳐져 있으면 접기
  const togglePanel = (next: 'show') => setPanel((cur) => (cur === next ? null : next))
  const plusIcon = (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )

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

      {view === 'songs' && (
        <section className="data-sec">
          <h2>
            곡 <span>{songs.length}곡</span>
            <em className="leader-key">
              <i /> 리더
            </em>
          </h2>

          {/* 맨 위: 공연 만들기 버튼. 누르면 입력칸이 바로 아래에 펼쳐짐 */}
          <div className="song-tools">
            <button
              type="button"
              className={`tt-open-btn${panel === 'show' ? ' is-active' : ''}`}
              aria-expanded={panel === 'show'}
              onClick={() => togglePanel('show')}
              disabled={groups === null} // 공연 목록을 못 불러왔으면 만들 수도 없음
            >
              {plusIcon}
              공연 만들기
            </button>
          </div>

          {groups && (
            <ShowCreate
              open={panel === 'show'}
              onClose={() => setPanel(null)}
              names={groups.flatMap((g) => (g.show ? [g.show.name] : []))}
              onCreated={(created) => {
                openShow(created.id)
                reload()
                setToast({ id: Date.now(), message: `'${created.name}' 공연을 만들었어요.` })
              }}
            />
          )}
          {groups === null ? (
            // 공연 목록을 못 불러왔을 때: 예전처럼 곡만
            <>
              <p className="show-unavailable">공연 목록을 불러오지 못해서 곡만 보여드려요.</p>
              {renderChips('all', songs)}
            </>
          ) : (
            <div className="show-groups">
              {groups.map((group, i) => {
                const open = toggled[group.key] ?? i === 0 // 직접 연 적 없으면 맨 위 하나만 펼침
                const show = group.show
                return (
                  <div key={group.key} className={`show-group${open ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="show-toggle"
                      aria-expanded={open}
                      onClick={() => setToggled((t) => ({ ...t, [group.key]: !open }))}
                    >
                      <strong className={show ? undefined : 'is-none'}>{group.name}</strong>
                      <span className="show-toggle-count">{group.songs.length}곡</span>
                      <svg className="show-toggle-arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                        <path
                          d="M6 9l6 6 6-6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {open && (
                      <div className="show-body">
                        {group.songs.length > 0 ? (
                          renderChips(group.key, group.songs)
                        ) : (
                          <p className="show-empty">아직 곡이 없어요</p>
                        )}
                        {show && (
                          <button type="button" className="show-edit-btn" onClick={() => setEditingShow(show)}>
                            {group.songs.length > 0 ? '곡 넣기 · 편집' : '+ 곡 넣기'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 곡 목록 바로 아래: 붙여넣기로 곡 등록 */}
          <SongImport onImported={reload} />
        </section>
      )}

      {view === 'songs' && (
        <section className="data-sec">
          <h2>
            시간표 <span>{timetables.length}개</span>
          </h2>
          {timetables.length > 0 && (
            <ul className="tt-list">
              {timetables.map((t) => (
                <li key={t.id}>
                  <button type="button" className="tt-card" onClick={() => setBuilder({ mode: 'edit', timetable: t })}>
                    <span className="tt-card-top">
                      <strong>{t.name}</strong>
                      <em className={`tt-status ${t.status.cls}`}>{t.status.label}</em>
                    </span>
                    <span className="tt-card-period">
                      {shortDate(t.starts_on)} – {shortDate(t.ends_on)} · {t.songCount}곡
                    </span>
                    <span className="tt-card-songs">{t.names.join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="tt-open-btn"
            onClick={() => setBuilder({ mode: 'new' })}
            disabled={songs.length === 0}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M3.5 10h17M9 5v15M8 3v3M16 3v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            시간표 생성
          </button>
        </section>
      )}

      {builder && (
        <TimetableBuilder
          songs={load.songs}
          timetable={builder.mode === 'edit' ? builder.timetable : undefined}
          onClose={() => setBuilder(null)}
          onSaved={(saved, mode) => {
            setBuilder(null)
            setReloadKey((k) => k + 1)
            setToast({
              id: Date.now(),
              message: `'${saved.name}' 시간표를 ${mode === 'created' ? '등록' : '수정'}했어요.`,
            })
          }}
          onDeleted={(name) => {
            setBuilder(null)
            setReloadKey((k) => k + 1)
            setToast({ id: Date.now(), message: `'${name}' 시간표를 삭제했어요.` })
          }}
        />
      )}

      {editingShow && load.shows && (
        <ShowSheet
          show={editingShow}
          shows={load.shows}
          songs={load.songs}
          onClose={() => setEditingShow(null)}
          onSaved={(saved) => {
            setEditingShow(null)
            openShow(saved.id)
            reload()
            setToast({ id: Date.now(), message: `'${saved.name}' 공연을 저장했어요.` })
          }}
          onDeleted={(name) => {
            setEditingShow(null)
            reload()
            setToast({ id: Date.now(), message: `'${name}' 공연을 삭제했어요.` })
          }}
        />
      )}

      {toast && <Toast key={toast.id} kind="success" message={toast.message} onDone={() => setToast(null)} />}
    </main>
  )
}
