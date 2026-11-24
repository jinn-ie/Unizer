import { useEffect, useMemo, useState } from 'react'
import { deleteShow, updateShow } from '../../api'
import type { Show, Song } from '../../types'
import '../schedule/DaySheet.css' // 하단 시트 모양(.sheet-…)은 날짜 보드와 같이 써요
import './ShowSheet.css'

interface Props {
  show: Show // 편집할 공연
  shows: Show[] // 전체 공연 (미분류 / 공연별로 곡을 나누는 데 씀)
  songs: Song[] // 전체 곡 (곡 목록 순서)
  onClose: () => void
  onSaved: (saved: Show) => void
  onDeleted: (name: string) => void
}

// 공연 편집 시트: 이름 바꾸기 + 곡 여러 개 체크해서 넣기/빼기 + 공연 삭제
// 곡 목록: 미분류 곡은 바로 체크박스, 이미 공연에 들어간 곡은 공연별 토글 안에
export function ShowSheet({ show, shows, songs, onClose, onSaved, onDeleted }: Props) {
  const [name, setName] = useState(show.name)
  const [picked, setPicked] = useState(() => new Set(show.song_ids)) // 체크한 곡 번호
  const [openGroups, setOpenGroups] = useState(() => new Set([show.id])) // 펼친 공연 토글 (처음엔 지금 공연만)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false) // 삭제는 두 번 눌러야 지워짐

  // 시트를 연 순간 기준으로 곡을 나눔 (체크를 바꿔도 곡이 다른 칸으로 옮겨 다니지 않게)
  // 한 곡이 여러 공연에 있으면 그 공연 토글마다 다 나와요 (체크는 함께 바뀜)
  const { unassigned, groups } = useMemo(() => {
    const inAnyShow = new Set(shows.flatMap((s) => s.song_ids))
    const others = shows.filter((s) => s.id !== show.id).sort((a, b) => b.id - a.id) // 최근 공연이 위
    const groups = [show, ...others]
      .map((s) => {
        const ids = new Set(s.song_ids)
        return { show: s, songs: songs.filter((song) => ids.has(song.id)) }
      })
      .filter((g) => g.songs.length > 0) // 곡이 없는 공연은 토글도 안 보여줌
    return { unassigned: songs.filter((song) => !inAnyShow.has(song.id)), groups }
  }, [show, shows, songs])

  // Esc 로 닫기 (PC 에서 쓸 때)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const trimmed = name.trim()
  const nameTaken = shows.some((s) => s.id !== show.id && s.name === trimmed)

  // 처음 열었을 때와 달라진 게 있을 때만 저장 버튼을 켬
  const changed =
    trimmed !== show.name ||
    picked.size !== show.song_ids.length ||
    show.song_ids.some((id) => !picked.has(id))

  function toggleGroup(showId: number) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(showId)) next.delete(showId)
      else next.add(showId)
      return next
    })
  }

  function toggle(songId: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(songId)) next.delete(songId)
      else next.add(songId)
      return next
    })
    setConfirmDelete(false)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      // 고른 순서가 아니라 곡 목록 순서대로 보내요
      const songIds = songs.filter((s) => picked.has(s.id)).map((s) => s.id)
      const saved = await updateShow(show.id, { name: trimmed, song_ids: songIds })
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteShow(show.id)
      onDeleted(show.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했어요.')
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  // 체크박스 목록 (미분류 칸 · 공연 토글 안에서 같이 씀)
  function renderPickList(list: Song[]) {
    return (
      <ul className="show-pick-list">
        {list.map((song) => {
          const on = picked.has(song.id)
          return (
            <li key={song.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`show-pick${on ? ' is-on' : ''}`}
                onClick={() => toggle(song.id)}
              >
                <span className="show-check" aria-hidden>
                  {on && (
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="show-pick-title">{song.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="sheet-root" role="dialog" aria-modal aria-label="공연 편집">
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet">
        <div className="sheet-handle" aria-hidden />
        <header className="sheet-head">
          <input
            className="show-name"
            value={name}
            maxLength={100}
            aria-label="공연 이름"
            onChange={(e) => {
              setName(e.target.value)
              setConfirmDelete(false)
            }}
          />
          <button type="button" className="sheet-close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <p className="show-sub">
          이 공연에 들어갈 곡을 골라 주세요 · 모두 <b>{picked.size}곡</b> 선택
        </p>

        {songs.length === 0 ? (
          <p className="sheet-empty">등록된 곡이 없어요</p>
        ) : (
          <>
            {/* 1. 미분류: 어느 공연에도 없는 곡 → 바로 체크 */}
            <h3 className="show-sec-label">
              미분류 <span>{unassigned.length}곡</span>
            </h3>
            {unassigned.length > 0 ? (
              renderPickList(unassigned)
            ) : (
              <p className="show-sec-empty">미분류 곡이 없어요</p>
            )}

            {/* 2. 공연별: 이미 공연에 들어간 곡 → 토글을 열어서 체크 */}
            {groups.length > 0 && (
              <>
                <h3 className="show-sec-label">공연별</h3>
                <div className="show-pick-groups">
                  {groups.map((g) => {
                    const open = openGroups.has(g.show.id)
                    const pickedHere = g.songs.filter((s) => picked.has(s.id)).length
                    return (
                      <div key={g.show.id} className={`show-pick-group${open ? ' is-open' : ''}`}>
                        <button
                          type="button"
                          className="show-pick-toggle"
                          aria-expanded={open}
                          onClick={() => toggleGroup(g.show.id)}
                        >
                          <strong>{g.show.name}</strong>
                          {g.show.id === show.id && <em>편집 중</em>}
                          <span className="show-pick-count">
                            {g.songs.length}곡{pickedHere > 0 && ` · ${pickedHere}곡 선택`}
                          </span>
                          <svg className="show-pick-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
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
                        {open && <div className="show-pick-body">{renderPickList(g.songs)}</div>}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* 목록을 스크롤해도 시트 아래에 항상 붙어 있는 버튼 */}
        <div className="sheet-add">
          {nameTaken && <p className="form-error show-error">같은 이름의 공연이 이미 있어요.</p>}
          {error && <p className="form-error show-error">{error}</p>}
          <div className="show-actions">
            <button
              type="button"
              className={`show-del${confirmDelete ? ' is-confirm' : ''}`}
              onClick={remove}
              disabled={busy}
            >
              {confirmDelete ? '한 번 더 누르면 삭제' : '공연 삭제'}
            </button>
            <button
              type="button"
              className="import-btn"
              onClick={save}
              disabled={busy || !changed || !trimmed || nameTaken}
            >
              {busy ? '저장하는 중…' : `${picked.size}곡 저장`}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
