import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { createReservation, fetchMembers, fetchSongMembers, fetchSongs, updateReservation } from '../../api'
import type { Member, Reservation, Song, SongMember } from '../../types'
import { SPACES, spaceInfo } from '../../lib/spaces'
import { addDays, formatMinutes, parseLocal, startOfDay, toDateKey } from '../../lib/date'
import { SongInput } from './SongInput'
import type { PracticeChoice } from './SongInput'
import { TimeRangeWheels } from '../../components/TimeRangeWheels'
import { Toast } from '../../components/Toast'
import './PracticeBox.css'

interface Props {
  day: Date
  editing?: Reservation // 있으면 '수정' 모드 (기존 값이 채워진 채로 시작)
  onSaved: (reservation: Reservation) => void
  onCancel?: () => void // 수정 모드에서 바뀐 게 없을 때 ✕ 버튼
}

const DAY_MIN = 24 * 60

/** 날짜 + 그 날 0시부터의 분 → "2026-11-18T19:30:00" (24:00 은 다음날 00:00) */
function toLocalIso(day: Date, minutes: number): string {
  const d = addDays(day, Math.floor(minutes / DAY_MIN))
  return `${toDateKey(d)}T${formatMinutes(minutes % DAY_MIN)}:00`
}

/** 그 날 0시부터 몇 분 지났는지 */
function minutesFrom(day: Date, iso: string): number {
  return Math.round((parseLocal(iso).getTime() - day.getTime()) / 60000)
}

/** 바뀌었는지 비교하기 위한 글자 */
function choiceKey(c: PracticeChoice | null): string {
  if (!c) return ''
  return c.kind === 'song' ? `song:${c.song.id}` : `title:${c.title}`
}

/** 두 부원 번호 목록이 같은지 (순서 무시) */
function sameIds(a: Set<number>, b: number[]): boolean {
  return a.size === new Set(b).size && b.every((id) => a.has(id))
}

/** 수정할 보충의 기존 값 */
function initialValues(day: Date, r?: Reservation) {
  if (!r) {
    return { choice: null, start: 18 * 60, end: 19 * 60, space: SPACES[0].key, personal: false, memberIds: [] }
  }
  const choice: PracticeChoice | null =
    r.song_id !== null
      ? { kind: 'song', song: { id: r.song_id, title: r.song_title ?? '' } }
      : r.title
        ? { kind: 'title', title: r.title }
        : null
  return {
    choice,
    start: minutesFrom(day, r.start_at),
    end: minutesFrom(day, r.end_at),
    space: r.space,
    personal: r.personal ?? false, // 백엔드가 아직 안 보내면 단체
    memberIds: r.member_ids ?? [],
  }
}

// 1줄: 곡명(자동완성) | 단체/개인 / (개인이면) 함께하는 사람 / 2줄: 시간 | 장소 / 오른쪽 버튼
// 추가 모드: + 로 등록
// 수정 모드: 바뀐 게 없으면 ✕(취소), 바뀌면 ✓(저장)
export function PracticeBox({ day: sheetDay, editing, onSaved, onCancel }: Props) {
  // 수정할 땐 그 보충이 시작하는 날 기준
  const day = useMemo(
    () => (editing ? startOfDay(parseLocal(editing.start_at)) : sheetDay),
    [editing, sheetDay],
  )
  const init = useMemo(() => initialValues(day, editing), [day, editing])

  const [songs, setSongs] = useState<Song[]>([])
  const [songMembers, setSongMembers] = useState<SongMember[]>([]) // 개인 보충: 곡 멤버 고르기용
  const [members, setMembers] = useState<Member[]>([])
  const [choice, setChoice] = useState<PracticeChoice | null>(init.choice)
  const [personal, setPersonal] = useState(init.personal) // 단체(false) / 개인(true)
  const [picked, setPicked] = useState(() => new Set(init.memberIds)) // 개인 보충에 함께하는 부원
  const [resetKey, setResetKey] = useState(0) // 등록 후 곡명 입력칸 비우기용
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)
  const [timeOpen, setTimeOpen] = useState(false)
  const [space, setSpace] = useState(init.space)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  // 2초짜리 오류 알림 띄우기 (id 가 바뀌면 같은 문구여도 처음부터 다시)
  const showError = (message: string) => setToast({ id: Date.now(), message })
  const formRef = useRef<HTMLFormElement>(null)

  // 자동완성 목록이나 시간 휠이 펼쳐져 박스가 커지면, 가려지지 않게 화면 안으로 스크롤
  useEffect(() => {
    const el = formRef.current
    if (!el) return
    let prev = el.offsetHeight
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight > prev) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      prev = el.offsetHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchSongs(controller.signal),
      fetchSongMembers(controller.signal),
      fetchMembers(controller.signal),
    ])
      .then(([s, sm, m]) => {
        setSongs(s)
        setSongMembers(sm)
        setMembers(m)
      })
      .catch(() => !controller.signal.aborted && showError('곡 목록을 불러오지 못했어요.'))
    return () => controller.abort()
  }, [])

  // 개인 보충은 곡 연습일 때만 (돌리기 같은 공통 일정은 멤버가 없어서 항상 단체)
  const canPersonal = choice?.kind !== 'title'
  const isPersonal = personal && canPersonal

  // 고른 곡의 멤버 (리더가 맨 앞) → 개인 보충에서 함께할 사람 고르기
  const songPeople = useMemo(() => {
    if (choice?.kind !== 'song') return []
    const memberById = new Map(members.map((m) => [m.id, m]))
    return songMembers
      .filter((sm) => sm.song_id === choice.song.id)
      .sort((a, b) => Number(b.leader) - Number(a.leader))
      .flatMap((sm) => {
        const m = memberById.get(sm.member_id)
        return m ? [{ ...m, leader: sm.leader }] : []
      })
  }, [choice, songMembers, members])

  // 리더가 아닌 사람 중 고른 수 (개인 보충은 한 명 이상 골라야 함)
  const pickedCount = songPeople.filter((p) => !p.leader && picked.has(p.id)).length

  // 곡이 바뀌면 함께할 사람은 처음부터 다시 고름
  const selectChoice = (next: PracticeChoice | null) => {
    if (choiceKey(next) !== choiceKey(choice)) setPicked(new Set())
    setChoice(next)
  }

  const togglePick = (memberId: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })

  const changed =
    choiceKey(choice) !== choiceKey(init.choice) ||
    start !== init.start ||
    end !== init.end ||
    space !== init.space ||
    isPersonal !== init.personal ||
    (isPersonal && !sameIds(picked, init.memberIds))
  const isCancel = !!editing && !changed // 수정 모드인데 아직 바꾼 게 없음
  // 시간 순서 · 함께할 사람은 버튼을 막지 않고, 눌렀을 때 오류 알림으로 알려줌
  const canSubmit = !!choice && !saving

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (isCancel || !canSubmit || !choice) return
    if (end <= start) {
      showError('끝나는 시간은 시작 시간보다 늦어야 해요.')
      return
    }
    if (isPersonal && pickedCount === 0) {
      showError('개인 보충은 함께하는 사람을 한 명 이상 골라 주세요.')
      return
    }
    setSaving(true)
    const input = {
      // 곡이면 song_id, 공통 일정이면 title 만 보냄
      song_id: choice.kind === 'song' ? choice.song.id : null,
      title: choice.kind === 'title' ? choice.title : null,
      space,
      start_at: toLocalIso(day, start),
      end_at: toLocalIso(day, end),
      personal: isPersonal,
      // 개인 보충: 리더는 항상 + 고른 사람 (지금 곡의 멤버인 사람만). 단체면 빈 목록
      member_ids: isPersonal ? songPeople.filter((p) => p.leader || picked.has(p.id)).map((p) => p.id) : [],
    }
    try {
      if (editing) {
        onSaved(await updateReservation(editing.id, input))
      } else {
        const created = await createReservation(input)
        setChoice(null)
        setPersonal(false)
        setPicked(new Set())
        setResetKey((k) => k + 1)
        setTimeOpen(false)
        onSaved(created)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : '저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <form
        ref={formRef}
        className={`quick-add${editing ? ' is-edit' : ''}`}
        onSubmit={submit}
      >
        <div className="qa-main">
          {/* 1줄: 곡명 | 단체/개인 */}
          <div className="qa-top">
            <SongInput key={resetKey} songs={songs} selected={choice} onSelect={selectChoice} />
            <div className="qa-kind" role="group" aria-label="연습 종류">
              <button
                type="button"
                className={!isPersonal ? 'is-on' : undefined}
                aria-pressed={!isPersonal}
                onClick={() => setPersonal(false)}
              >
                단체
              </button>
              <button
                type="button"
                className={isPersonal ? 'is-on' : undefined}
                aria-pressed={isPersonal}
                onClick={() => setPersonal(true)}
                disabled={!canPersonal}
              >
                개인
              </button>
            </div>
          </div>

          {/* 개인 보충: 함께하는 사람 고르기 (리더는 항상 포함, 잠겨 있음) */}
          {isPersonal && (
            <div className="qa-people">
              <p className="qa-people-head">
                함께하는 사람 <span>리더는 항상 포함</span>
              </p>
              {choice?.kind !== 'song' ? (
                <p className="qa-people-empty">곡을 고르면 멤버가 나와요</p>
              ) : songPeople.length === 0 ? (
                <p className="qa-people-empty">이 곡에 등록된 멤버가 없어요</p>
              ) : (
                <ul className="qa-people-list">
                  {songPeople.map((p) => {
                    const on = p.leader || picked.has(p.id)
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`qa-person${on ? ' is-on' : ''}${p.leader ? ' is-leader' : ''}`}
                          aria-pressed={on}
                          disabled={p.leader}
                          onClick={() => togglePick(p.id)}
                        >
                          {p.name}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="qa-row">
            <button
              type="button"
              className={`qa-time${timeOpen ? ' is-open' : ''}`}
              onClick={() => setTimeOpen((o) => !o)}
              aria-expanded={timeOpen}
            >
              {formatMinutes(start)} – {formatMinutes(end)}
            </button>
            <div className="qa-space" style={{ '--c': spaceInfo(space).color } as CSSProperties}>
              <select value={space} onChange={(e) => setSpace(e.target.value)} aria-label="장소">
                {SPACES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isCancel ? (
          <button type="button" className="qa-submit is-cancel" onClick={onCancel} aria-label="수정 취소">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            className="qa-submit"
            disabled={!canSubmit}
            aria-label={editing ? '수정 저장' : '추가'}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path
                d={editing ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 5v14M5 12h14'}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        {timeOpen && (
          <TimeRangeWheels
            start={start}
            end={end}
            onChange={(s, e) => {
              setStart(s)
              setEnd(e)
            }}
          />
        )}
      </form>

      {toast && <Toast key={toast.id} message={toast.message} onDone={() => setToast(null)} />}
    </>
  )
}
