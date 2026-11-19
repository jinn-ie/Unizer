import { useMemo, useRef, useState } from 'react'
import type { Song } from '../types'

// 고른 결과: 곡이거나, 목록에 없는 이름을 그대로 쓴 공통 일정(돌리기, 기본기 …)
export type PracticeChoice = { kind: 'song'; song: Song } | { kind: 'title'; title: string }

interface Props {
  songs: Song[]
  selected: PracticeChoice | null
  onSelect: (choice: PracticeChoice | null) => void
}

// 비교용: 대소문자·띄어쓰기 무시 ("fake it" 도 "Fake it + Smooth Criminal" 에 걸리게)
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

const choiceText = (c: PracticeChoice) => (c.kind === 'song' ? c.song.title : c.title)

// 곡명 자동완성: 타이핑하면 그 글자로 시작하는 곡이 아래로 주르륵 뜨고,
// 목록에 없는 이름이면 맨 아래 '일정 추가' 를 고를 수 있음
export function SongInput({ songs, selected, onSelect }: Props) {
  const [text, setText] = useState(selected ? choiceText(selected) : '')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0) // 키보드 ↑↓ 로 고르는 위치
  const inputRef = useRef<HTMLInputElement>(null)

  const typed = text.trim()

  // 아무것도 안 쳤으면 목록 없음, 쳤으면 그 글자로 '시작하는' 곡만
  const matches = useMemo(() => {
    const q = norm(text)
    return q ? songs.filter((s) => norm(s.title).startsWith(q)) : []
  }, [songs, text])

  // 친 글자가 곡명과 정확히 같지 않으면 공통 일정 선택지를 보여줌
  const showCustom = typed !== '' && !songs.some((s) => norm(s.title) === norm(typed))
  const rowCount = matches.length + (showCustom ? 1 : 0)

  const pickSong = (song: Song) => {
    onSelect({ kind: 'song', song })
    setText(song.title)
    setOpen(false)
    inputRef.current?.blur() // 골랐으면 휴대폰 키패드 내리기
  }

  const pickTitle = () => {
    onSelect({ kind: 'title', title: typed })
    setText(typed)
    setOpen(false)
    inputRef.current?.blur()
  }

  const pickRow = (i: number) => (i < matches.length ? pickSong(matches[i]) : pickTitle())

  const onType = (value: string) => {
    setText(value)
    setOpen(true)
    setCursor(0)
    // 정확히 같은 곡명을 끝까지 쳤으면 자동으로 곡 선택, 아니면 선택 해제
    const exact = songs.find((s) => norm(s.title) === norm(value))
    onSelect(exact ? { kind: 'song', song: exact } : null)
  }

  const showList = open && rowCount > 0 && !(selected && choiceText(selected) === text)

  return (
    <div className="song-input">
      <input
        ref={inputRef}
        type="text"
        value={text}
        placeholder="곡명 또는 일정 이름"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={100}
        className={`field${selected ? ' is-picked' : ''}`}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(rowCount - 1, c + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(0, c - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pickRow(Math.min(cursor, rowCount - 1))
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />

      {showList && (
        <ul className="song-list" role="listbox">
          {matches.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === cursor}
              className={i === cursor ? 'is-cursor' : undefined}
              // onMouseDown: 입력칸 blur(목록 닫힘)보다 먼저 실행되게
              onMouseDown={(e) => {
                e.preventDefault()
                pickSong(s)
              }}
            >
              {s.title}
            </li>
          ))}
          {showCustom && (
            <li
              role="option"
              aria-selected={cursor === matches.length}
              className={`song-custom${cursor === matches.length ? ' is-cursor' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pickTitle()
              }}
            >
              <span className="song-custom-icon" aria-hidden>
                +
              </span>
              <span>
                ‘{typed}’ <small>일정 추가</small>
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
