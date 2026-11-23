import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { createTimetable, deleteTimetable, updateTimetable } from '../../api'
import type { Song, Timetable } from '../../types'
import { SPACES, spaceInfo } from '../../lib/spaces'
import { addDays, formatMinutes, parseDateKey, startOfDay, toDateKey, WEEKDAYS } from '../../lib/date'
import { TimeRangeWheels } from '../../components/TimeRangeWheels'
import { Toast } from '../../components/Toast'
import './TimetableBuilder.css'

const GRID_START = 10 * 60 // 표의 시작 10:00
const GRID_END = 23 * 60 // 표의 끝 23:00
const SLOT = 30 // 30분 단위
const ROWS = (GRID_END - GRID_START) / SLOT
const ROW_PX = 22 // 30분 한 칸 높이
const DAY_MIN = 24 * 60
const DEFAULT_LEN = 120 // 곡을 놓으면 기본 2시간
const DEFAULT_SPACE = SPACES[0].key // 기본 장소: 동방
const COLUMNS = [1, 2, 3, 4, 5, 6, 0] // 표의 열 순서: 월 … 일 (값은 0=일 … 6=토)
const MAX_DAYS = 180 // 백엔드 services/timetables.py 의 MAX_DAYS 와 같게
const LONG_PRESS_MS = 350 // 이만큼 꾹 누르면 끌기 시작
const TOLERANCE_PX = 8 // 누르는 동안 이보다 많이 움직이면 스크롤로 보고 취소
const EDGE_PX = 40 // 끄는 중 표의 위/아래 끝 이만큼 안에 있으면 자동 스크롤
const PRESETS = ['돌리기', '기본기'] // 곡이 아닌 일정 칩 (칩 줄 맨 앞, 이름으로 저장)

// 표에 놓인 시간대 1개 (등록하면 기간 안의 그 요일마다 연습 1건씩)
interface Block {
  key: number
  slotId: number | null // 서버에 저장된 블록이면 그 번호 (수정할 때 같이 보냄), 새 블록이면 null
  songId: number | null // 곡 연습이면 곡 번호
  title: string | null // 곡이 아닌 일정이면 이름 ("기본기")
  weekday: number // 0=일 … 6=토
  start: number // 그 날 0시부터 몇 분
  end: number
  space: string
}

// 끄는 것: 칩(곡 또는 일정) / 이미 놓인 블록
type Source =
  | { kind: 'chip'; chipKey: string; songId: number | null; title: string | null }
  | { kind: 'block'; key: number }

/** 같은 곡 / 같은 일정끼리 묶는 키 ("s:3" / "t:기본기") */
const chipKeyOf = (x: { songId: number | null; title: string | null }) =>
  x.songId !== null ? `s:${x.songId}` : `t:${x.title}`

// 끌고 있는 것
interface Drag {
  source: Source
  pointerId: number
  x: number // 지금 손가락 위치 (화면 기준)
  y: number
  len: number // 길이 (분)
  grab: number // 블록 시작 시각에서 손가락까지 (분) → 잡은 자리 그대로 따라오게
  label: string
  color: string
  prefer: string // 비어 있으면 쓸 장소 (새 곡: 동방, 옮기는 블록: 원래 장소)
  exclude: number | null // 옮기는 중인 블록 (겹침 계산에서 뺌)
}

// 지금 손가락 아래에 놓일 자리
interface Target {
  weekday: number
  start: number
  end: number
  space: string // 겹치는 블록이 쓰는 장소를 피해서 정함
}

const PREVIEW_KEY = -1 // 미리보기를 칸 나누기 계산에 넣을 때 쓰는 key

interface Press {
  pointerId: number
  x0: number
  y0: number
  x: number
  y: number
  timer: number
}

interface Props {
  songs: Song[]
  timetable?: Timetable // 있으면 수정 모드 (저장된 블록이 채워진 채로 시작)
  onClose: () => void
  onSaved: (saved: Timetable, mode: 'created' | 'updated') => void
  onDeleted: (name: string) => void
}

let nextKey = 1

/** "19:30:00" → 1170 (0시부터 몇 분) */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** 저장된 시간표의 블록 → 표의 블록 (끝이 시작보다 이르면 다음 날: 22:00~00:00 → 1320~1440) */
function blocksFrom(tt?: Timetable): Block[] {
  return (tt?.slots ?? []).map((s) => {
    const start = toMinutes(s.start_time)
    let end = toMinutes(s.end_time)
    if (end <= start) end += DAY_MIN
    return {
      key: nextKey++,
      slotId: s.id,
      songId: s.song_id,
      title: s.title,
      weekday: s.weekday,
      start,
      end,
      space: s.space,
    }
  })
}

/** 바뀐 게 있는지 비교하기 위한 글자 */
function snapshot(name: string, period: { startsOn: string; endsOn: string }, blocks: Block[]): string {
  return JSON.stringify([
    name.trim(),
    period.startsOn,
    period.endsOn,
    blocks.map((b) => [b.slotId, b.songId, b.title, b.weekday, b.start, b.end, b.space]),
  ])
}

/** 기본 기간: 다음 월요일(오늘이 월요일이면 오늘)부터 3주 */
function defaultPeriod() {
  const today = startOfDay(new Date())
  const start = addDays(today, (8 - today.getDay()) % 7)
  return { startsOn: toDateKey(start), endsOn: toDateKey(addDays(start, 20)) }
}

/** 기간 안에 요일별로 며칠 있는지 [일, 월, … 토]. 기간이 잘못되면 null */
function countWeekdays(startsOn: string, endsOn: string): number[] | null {
  const s = parseDateKey(startsOn)
  const e = parseDateKey(endsOn)
  if (!s || !e || e < s) return null
  const counts = [0, 0, 0, 0, 0, 0, 0]
  // 연도 오타로 기간이 아주 길어도 멈추도록 최대 기간 + 1일까지만 셈 (넘으면 등록할 때 오류)
  for (let d = s, i = 0; d <= e && i <= MAX_DAYS + 1; d = addDays(d, 1), i++) {
    counts[d.getDay()]++
  }
  return counts
}

/** 분 → "19:00:00" (24:00 은 "00:00:00": 백엔드가 다음 날로 봄) */
const toTime = (min: number) => `${formatMinutes(min % DAY_MIN)}:00`

const ghostTransform = (x: number, y: number) => `translate(${x}px, ${y}px) translate(-50%, -150%)`

type Slot = Pick<Block, 'key' | 'start' | 'end' | 'space'>

const OUTSIDE = SPACES[1].key // 바깥거울: 겹치면 오른쪽 반

/** 같은 요일에 시간이 겹치는 블록이 있으면 반으로 (한 시간대엔 최대 2곡: 동방 왼쪽 · 바깥거울 오른쪽) */
function halfOf(s: Slot, day: Slot[]): 'full' | 'left' | 'right' {
  const other = day.find((o) => o.key !== s.key && o.start < s.end && s.start < o.end)
  if (!other) return 'full'
  if (s.space === other.space) return s.key < other.key ? 'left' : 'right' // 같은 장소(빨간 겹침)
  return s.space === OUTSIDE ? 'right' : other.space === OUTSIDE ? 'left' : s.key < other.key ? 'left' : 'right'
}

const HALF_STYLE = {
  full: { left: '1px', width: 'calc(100% - 2px)' },
  left: { left: '1px', width: 'calc(50% - 2px)' },
  right: { left: 'calc(50% + 1px)', width: 'calc(50% - 2px)' },
}

/** 놓을 장소: 그 시간에 다른 곡이 원하는 장소를 쓰고 있으면 동방 ↔ 바깥거울 반대쪽으로 */
function pickSpace(prefer: string, t: Omit<Target, 'space'>, blocks: Block[], exclude: number | null): string {
  const taken = blocks.find(
    (b) => b.key !== exclude && b.weekday === t.weekday && b.start < t.end && t.start < b.end,
  )
  if (!taken || taken.space !== prefer) return prefer
  return prefer === OUTSIDE ? DEFAULT_SPACE : OUTSIDE
}

/** 손가락 위치 → 놓일 요일 · 시간 (표 밖이면 null) */
function findTarget(
  d: Drag,
  scroll: HTMLElement | null,
  cols: HTMLElement | null,
): Omit<Target, 'space'> | null {
  if (!scroll || !cols) return null
  const view = scroll.getBoundingClientRect() // 보이는 표 영역
  const rect = cols.getBoundingClientRect() // 스크롤 포함 표 전체 (요일 열만)
  if (d.x < rect.left || d.x >= rect.right || d.y < view.top || d.y >= view.bottom) return null
  const col = Math.min(6, Math.floor(((d.x - rect.left) / rect.width) * 7))
  const pointerMin = GRID_START + ((d.y - rect.top) / ROW_PX) * SLOT
  let start = GRID_START + Math.round((pointerMin - d.grab - GRID_START) / SLOT) * SLOT
  start = Math.max(GRID_START, Math.min(start, Math.max(GRID_START, GRID_END - d.len)))
  return { weekday: COLUMNS[col], start, end: start + d.len }
}

// 시간표 생성 / 수정: 이름 · 기간 + 주간 표. 곡 칩을 꾹 눌러 표에 끌어다 놓으면 2시간 · 동방으로 들어감
// 이미 놓인 곡과 시간이 겹치면 칸을 세로로 반 나누고, 새 곡은 바깥거울로 (한 시간대엔 최대 2곡)
export function TimetableBuilder({ songs, timetable, onClose, onSaved, onDeleted }: Props) {
  const editing = !!timetable
  // 처음 값 (수정 모드면 저장된 시간표). 닫을 때 바뀐 게 있는지 비교하려고 snap 도 같이
  const [init] = useState(() => {
    const name = timetable?.name ?? ''
    const period = timetable
      ? { startsOn: timetable.starts_on, endsOn: timetable.ends_on }
      : defaultPeriod()
    const blocks = blocksFrom(timetable)
    // 이미 시작한 시간표: 고치거나 지우면 지난 날짜의 연습도 같이 바뀌니 알려줌
    const started = !!timetable && timetable.starts_on <= toDateKey(new Date())
    return { name, period, blocks, started, snap: snapshot(name, period, blocks) }
  })
  const [name, setName] = useState(init.name)
  const [period, setPeriod] = useState(init.period)
  const [blocks, setBlocks] = useState<Block[]>(init.blocks)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedKey, setSelectedKey] = useState<number | null>(null)
  const [timeOpen, setTimeOpen] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [hintFlash, setHintFlash] = useState(0) // 칩을 짧게 누르면 안내문 반짝
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const showError = (message: string) => setToast({ id: Date.now(), message })

  const scrollRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const targetRef = useRef<Target | null>(null)
  const pressRef = useRef<Press | null>(null)
  const draggedRef = useRef(false) // 방금 끌었으면 뒤따라 오는 click 은 무시
  const blocksRef = useRef(blocks) // 끄는 중 매 프레임 계산에서 최신 블록 목록 읽기용
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs])
  /** 블록 · 칩 이름: 곡명 또는 일정 이름 */
  const nameOf = (x: { songId: number | null; title: string | null }) =>
    x.songId !== null ? (songById.get(x.songId)?.title ?? '(삭제된 곡)') : (x.title ?? '')

  // 칩 줄: 일정(돌리기 · 기본기) 먼저, 그다음 곡
  const chips = useMemo(
    () => [
      ...PRESETS.map((t) => ({ key: `t:${t}`, songId: null, title: t, label: t, preset: true })),
      ...songs.map((s) => ({ key: `s:${s.id}`, songId: s.id, title: null, label: s.title, preset: false })),
    ],
    [songs],
  )

  const weekdayCounts = useMemo(
    () => countWeekdays(period.startsOn, period.endsOn),
    [period.startsOn, period.endsOn],
  )
  const totalDays = weekdayCounts ? weekdayCounts.reduce((a, b) => a + b) : 0
  const periodLabel = !weekdayCounts
    ? null
    : totalDays % 7 === 0
      ? `${totalDays / 7}주`
      : `${totalDays}일`
  // 실제로 만들어질 연습 수 = 블록마다 기간 안의 그 요일 수
  const practiceCount = weekdayCounts
    ? blocks.reduce((sum, b) => sum + weekdayCounts[b.weekday], 0)
    : 0

  // 같은 요일 · 같은 장소에서 시간이 겹치는 블록 (등록하면 서버에서 막힘)
  const conflicts = useMemo(() => {
    const s = new Set<number>()
    blocks.forEach((a, i) =>
      blocks.slice(i + 1).forEach((b) => {
        if (a.weekday === b.weekday && a.space === b.space && a.start < b.end && b.start < a.end) {
          s.add(a.key)
          s.add(b.key)
        }
      }),
    )
    return s
  }, [blocks])

  // 칸 나누기: 끄는 중이면 놓일 자리(미리보기)도 넣어서, 놓기 전에 반으로 갈라지는 모습을 보여줌
  const liftedKey = drag?.source.kind === 'block' ? drag.source.key : null
  const daySlots = useMemo(() => {
    const slots: (Slot & { weekday: number })[] = blocks.filter((b) => b.key !== liftedKey)
    if (target) slots.push({ key: PREVIEW_KEY, ...target })
    return new Map(COLUMNS.map((w) => [w, slots.filter((s) => s.weekday === w)]))
  }, [blocks, target, liftedKey])

  // 칩마다 표에 몇 개 놓였는지
  const countByChip = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of blocks) m.set(chipKeyOf(b), (m.get(chipKeyOf(b)) ?? 0) + 1)
    return m
  }, [blocks])

  const selected = blocks.find((b) => b.key === selectedKey) ?? null

  const update = (key: number, change: Partial<Block>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...change } : b)))

  const removeBlock = (key: number) => {
    setBlocks((bs) => bs.filter((b) => b.key !== key))
    setSelectedKey(null)
  }

  // ── 꾹 눌러서 끌기 ──
  // 손가락 이동 · 떼기는 창 전체에서 받음 (칩에서 시작해 표로 넘어가니까)
  useEffect(() => {
    const endPress = () => {
      if (pressRef.current) window.clearTimeout(pressRef.current.timer)
      pressRef.current = null
    }
    const finish = (drop: boolean) => {
      const d = dragRef.current
      const t = targetRef.current
      dragRef.current = null
      targetRef.current = null
      setDrag(null)
      setTarget(null)
      document.body.classList.remove('tb-dragging')
      if (!d || !t || !drop) return
      if (d.source.kind === 'chip') {
        const { songId, title } = d.source
        const block: Block = { key: nextKey++, slotId: null, songId, title, ...t }
        setBlocks((bs) => [...bs, block])
      } else {
        const key = d.source.key
        setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...t } : b)))
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = pressRef.current
      if (p && p.pointerId === e.pointerId) {
        p.x = e.clientX
        p.y = e.clientY
        if (Math.hypot(p.x - p.x0, p.y - p.y0) > TOLERANCE_PX) endPress() // 스크롤하려는 것
      }
      const d = dragRef.current
      if (d && d.pointerId === e.pointerId) {
        d.x = e.clientX
        d.y = e.clientY
        if (ghostRef.current) ghostRef.current.style.transform = ghostTransform(d.x, d.y)
      }
    }
    const onUp = (e: PointerEvent) => {
      if (pressRef.current?.pointerId === e.pointerId) endPress()
      if (dragRef.current?.pointerId === e.pointerId) finish(e.type === 'pointerup')
    }
    // 끄는 동안에는 화면이 스크롤되지 않게 (passive: false 여야 막을 수 있음)
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault()
    }
    // 길게 누르면 뜨는 메뉴(복사 · 미리보기) 막기
    const onContextMenu = (e: Event) => {
      if (dragRef.current || pressRef.current) e.preventDefault()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      endPress()
      document.body.classList.remove('tb-dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  // 끄는 동안 매 프레임: 표 끝이면 자동 스크롤 + 놓일 자리 계산
  useEffect(() => {
    if (!drag) return
    let raf = 0
    const tick = () => {
      const d = dragRef.current
      const scroll = scrollRef.current
      if (d && scroll) {
        const view = scroll.getBoundingClientRect()
        if (d.x >= view.left && d.x <= view.right) {
          if (d.y >= view.top && d.y < view.top + EDGE_PX) {
            scroll.scrollTop -= Math.ceil((view.top + EDGE_PX - d.y) / 4)
          } else if (d.y <= view.bottom && d.y > view.bottom - EDGE_PX) {
            scroll.scrollTop += Math.ceil((d.y - (view.bottom - EDGE_PX)) / 4)
          }
        }
        const pos = findTarget(d, scroll, colsRef.current)
        // 이미 놓인 블록과 겹치면 반대쪽 장소로 (동방이 차 있으면 바깥거울)
        const t = pos && { ...pos, space: pickSpace(d.prefer, pos, blocksRef.current, d.exclude) }
        const prev = targetRef.current
        if (t?.weekday !== prev?.weekday || t?.start !== prev?.start || t?.space !== prev?.space) {
          targetRef.current = t
          setTarget(t)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drag])

  /** 누르기 시작: LONG_PRESS_MS 동안 거의 안 움직이면 끌기 시작 */
  const startPress = (
    e: ReactPointerEvent<HTMLElement>,
    make: (x: number, y: number) => Omit<Drag, 'pointerId' | 'x' | 'y'>,
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (dragRef.current) return
    draggedRef.current = false
    const { pointerId, clientX, clientY } = e
    const timer = window.setTimeout(() => {
      const p = pressRef.current
      pressRef.current = null
      if (!p) return
      const d: Drag = { ...make(p.x, p.y), pointerId, x: p.x, y: p.y }
      dragRef.current = d
      draggedRef.current = true
      document.body.classList.add('tb-dragging')
      navigator.vibrate?.(12)
      setDrag(d)
    }, LONG_PRESS_MS)
    if (pressRef.current) window.clearTimeout(pressRef.current.timer)
    pressRef.current = { pointerId, x0: clientX, y0: clientY, x: clientX, y: clientY, timer }
  }

  // ── 닫기 · 저장 · 삭제 ──
  const dirty = snapshot(name, period, blocks) !== init.snap
  const leaveMessage = editing ? '고친 내용이 사라져요. 닫을까요?' : '만들던 시간표가 사라져요. 닫을까요?'

  const close = () => {
    if (dirty && !window.confirm(leaveMessage)) return
    onClose()
  }

  useEffect(() => {
    // Esc: 블록 편집 중이면 편집 닫기, 아니면 창 닫기
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedKey !== null) setSelectedKey(null)
      else if (!dirty || window.confirm(leaveMessage)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedKey, dirty, leaveMessage, onClose])

  const submit = async () => {
    if (!name.trim()) {
      showError('시간표 이름을 적어 주세요.')
      return
    }
    if (!weekdayCounts) {
      showError('기간을 다시 확인해 주세요.')
      return
    }
    if (totalDays > MAX_DAYS + 1) {
      showError(`기간은 최대 ${MAX_DAYS}일까지 등록할 수 있어요.`)
      return
    }
    if (blocks.some((b) => b.end <= b.start)) {
      showError('끝나는 시간은 시작 시간보다 늦어야 해요.')
      return
    }
    if (practiceCount === 0) {
      showError('기간 안에 고른 요일이 없어요.')
      return
    }

    // 시간표 + 모든 곡의 블록을 한 번에 (하나라도 겹치면 서버가 전부 취소)
    const input = {
      name: name.trim(),
      starts_on: period.startsOn,
      ends_on: period.endsOn,
      slots: blocks.map((b) => ({
        id: b.slotId,
        song_id: b.songId,
        title: b.title,
        weekday: b.weekday,
        start_time: toTime(b.start),
        end_time: toTime(b.end),
        space: b.space,
      })),
    }
    setSaving(true)
    setSelectedKey(null)
    try {
      const saved = timetable ? await updateTimetable(timetable.id, input) : await createTimetable(input)
      onSaved(saved, timetable ? 'updated' : 'created')
    } catch (err) {
      showError(err instanceof Error ? err.message : '저장하지 못했어요.')
      setSaving(false)
    }
  }

  // 삭제는 두 번 눌러야 (한 번 누르면 '정말 삭제할까요?')
  const remove = async () => {
    if (!timetable) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    try {
      await deleteTimetable(timetable.id)
      onDeleted(timetable.name)
    } catch (err) {
      showError(err instanceof Error ? err.message : '삭제하지 못했어요.')
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  const hourMarks: number[] = []
  for (let m = GRID_START; m < GRID_END; m += 60) hourMarks.push(m)
  const toY = (min: number) => ((min - GRID_START) / SLOT) * ROW_PX

  return createPortal(
    <div className="tb-root" role="dialog" aria-modal aria-label={editing ? '시간표 수정' : '시간표 생성'}>
      <div className="tb">
        <header className="tb-head">
          <h2>{editing ? '시간표 수정' : '시간표 생성'}</h2>
          <button type="button" className="tb-close" onClick={close} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="tb-fields">
          <input
            className="tb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="시간표 이름 (예: 2026 버스킹 2차곡)"
            maxLength={100}
            aria-label="시간표 이름"
          />
          <div className="tb-period">
            <input
              type="date"
              value={period.startsOn}
              onChange={(e) => setPeriod((p) => ({ ...p, startsOn: e.target.value }))}
              aria-label="시작일"
            />
            <span className="tb-tilde">~</span>
            <input
              type="date"
              value={period.endsOn}
              min={period.startsOn}
              onChange={(e) => setPeriod((p) => ({ ...p, endsOn: e.target.value }))}
              aria-label="종료일"
            />
            <span className={`tb-weeks${periodLabel ? '' : ' is-bad'}`}>{periodLabel ?? '기간 오류'}</span>
          </div>
          {init.started && <p className="tb-note">이미 시작한 시간표예요. 고치거나 지우면 지난 날짜의 연습도 같이 바뀌어요.</p>}
        </div>

        <div className="tb-tray" aria-label="곡 · 일정 (꾹 눌러서 표로 끌기)">
          {chips.map((c) => {
            const n = countByChip.get(c.key) ?? 0
            const lifted = drag?.source.kind === 'chip' && drag.source.chipKey === c.key
            return (
              <button
                key={c.key}
                type="button"
                className={`tb-chip${c.preset ? ' is-preset' : ''}${lifted ? ' is-lifted' : ''}${n ? ' is-placed' : ''}`}
                onPointerDown={(e) =>
                  startPress(e, () => ({
                    source: { kind: 'chip', chipKey: c.key, songId: c.songId, title: c.title },
                    len: DEFAULT_LEN,
                    grab: SLOT / 2, // 손가락이 있는 칸에서 시작
                    label: c.label,
                    color: spaceInfo(DEFAULT_SPACE).color,
                    prefer: DEFAULT_SPACE,
                    exclude: null,
                  }))
                }
                onClick={() => {
                  if (!draggedRef.current) setHintFlash((k) => k + 1)
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {c.label}
                {n > 0 && <b>{n}</b>}
              </button>
            )
          })}
        </div>
        <p key={hintFlash} className={`tb-hint${hintFlash ? ' is-flash' : ''}`}>
          칩을 <b>꾹 눌러서</b> 표에 놓기 · 2시간 · 동방 (겹치면 바깥거울)
        </p>

        <div className="tb-grid">
          <div className="tb-grid-head">
            <span />
            {COLUMNS.map((w) => (
              <span key={w} className={w === 0 ? 'is-sun' : w === 6 ? 'is-sat' : undefined}>
                {WEEKDAYS[w]}
              </span>
            ))}
          </div>
          <div className="tb-scroll" ref={scrollRef}>
            <div className="tb-body" style={{ height: ROWS * ROW_PX }}>
              <div className="tb-times" aria-hidden>
                {hourMarks.map((m) => (
                  <span key={m} style={{ top: toY(m) }}>
                    {formatMinutes(m)}
                  </span>
                ))}
              </div>

              <div className="tb-cols" ref={colsRef}>
                <div className="tb-lines" aria-hidden>
                  {Array.from({ length: ROWS }, (_, k) => (
                    <i key={k} className={k % 2 === 0 ? 'is-hour' : undefined} style={{ top: k * ROW_PX }} />
                  ))}
                </div>

                {COLUMNS.map((w) => {
                  const day = daySlots.get(w) ?? []
                  return (
                    <div key={w} className="tb-day" onClick={() => setSelectedKey(null)}>
                      {blocks
                        .filter((b) => b.weekday === w)
                        .map((b) => {
                          const space = spaceInfo(b.space)
                          const lifted = liftedKey === b.key
                          const half = lifted ? 'full' : halfOf(b, day)
                          const height = Math.max(toY(b.end) - toY(b.start) - 2, ROW_PX / 2)
                          return (
                            <button
                              key={b.key}
                              type="button"
                              className={`tb-block${b.key === selectedKey ? ' is-selected' : ''}${conflicts.has(b.key) ? ' is-conflict' : ''}${lifted ? ' is-lifted' : ''}`}
                              style={
                                {
                                  top: toY(b.start) + 1,
                                  height,
                                  left: HALF_STYLE[half].left,
                                  width: HALF_STYLE[half].width,
                                  '--c': space.color,
                                } as CSSProperties
                              }
                              aria-label={`${nameOf(b)} ${WEEKDAYS[b.weekday]} ${formatMinutes(b.start)}–${formatMinutes(b.end)} ${space.label}`}
                              onPointerDown={(e) =>
                                startPress(e, (_x, y) => {
                                  const top = colsRef.current?.getBoundingClientRect().top ?? 0
                                  const pointerMin = GRID_START + ((y - top) / ROW_PX) * SLOT
                                  return {
                                    source: { kind: 'block', key: b.key },
                                    len: Math.max(SLOT, b.end - b.start),
                                    grab: pointerMin - b.start,
                                    label: nameOf(b),
                                    color: space.color,
                                    prefer: b.space,
                                    exclude: b.key,
                                  }
                                })
                              }
                              onClick={(e) => {
                                e.stopPropagation()
                                if (draggedRef.current) return
                                setSelectedKey((k) => (k === b.key ? null : b.key))
                                setTimeOpen(false)
                              }}
                              onContextMenu={(e) => e.preventDefault()}
                            >
                              <span className="tb-block-title">{nameOf(b)}</span>
                              {/* 겹쳐서 좁아지면 곡명만 */}
                              {height >= ROW_PX * 2 && half === 'full' && (
                                <span className="tb-block-time">
                                  {formatMinutes(b.start)}
                                  {height >= ROW_PX * 3 && <em>{space.label}</em>}
                                </span>
                              )}
                            </button>
                          )
                        })}

                      {drag &&
                        target?.weekday === w &&
                        (() => {
                          const half = halfOf({ key: PREVIEW_KEY, ...target }, day)
                          const space = spaceInfo(target.space)
                          return (
                            <div
                              className="tb-preview"
                              style={
                                {
                                  top: toY(target.start) + 1,
                                  height: toY(target.end) - toY(target.start) - 2,
                                  left: HALF_STYLE[half].left,
                                  width: HALF_STYLE[half].width,
                                  '--c': space.color,
                                } as CSSProperties
                              }
                              aria-hidden
                            >
                              {formatMinutes(target.start)}
                              {half !== 'full' && <em>{space.label}</em>}
                            </div>
                          )
                        })()}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {selected ? (
          <div className="tb-editor">
            <div className="tb-ed-top">
              <strong>{nameOf(selected)}</strong>
              <button type="button" className="tb-ed-del" onClick={() => removeBlock(selected.key)}>
                삭제
              </button>
              <button type="button" className="tb-ed-done" onClick={() => setSelectedKey(null)}>
                완료
              </button>
            </div>

            <div className="tb-ed-days" role="group" aria-label="요일">
              {COLUMNS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={w === selected.weekday ? 'is-on' : undefined}
                  aria-pressed={w === selected.weekday}
                  onClick={() => update(selected.key, { weekday: w })}
                >
                  {WEEKDAYS[w]}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`tb-ed-time${timeOpen ? ' is-open' : ''}`}
              onClick={() => setTimeOpen((o) => !o)}
              aria-expanded={timeOpen}
            >
              {formatMinutes(selected.start)} – {formatMinutes(selected.end)}
            </button>
            {timeOpen && (
              <TimeRangeWheels
                start={selected.start}
                end={selected.end}
                onChange={(start, end) => update(selected.key, { start, end })}
              />
            )}

            <div className="tb-ed-spaces" role="group" aria-label="장소">
              {SPACES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={s.key === selected.space ? 'is-on' : undefined}
                  aria-pressed={s.key === selected.space}
                  style={{ '--c': s.color } as CSSProperties}
                  onClick={() => update(selected.key, { space: s.key })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="tb-foot">
            {conflicts.size > 0 && (
              <p className="tb-warn">같은 장소에서 겹치는 시간대가 있어요. 빨간 칸을 누르거나 옮겨서 고쳐 주세요.</p>
            )}
            <div className="tb-actions">
              {editing ? (
                <button
                  type="button"
                  className={`tb-delete${confirmDelete ? ' is-confirm' : ''}`}
                  onClick={remove}
                  disabled={saving}
                >
                  {confirmDelete ? '정말 삭제할까요?' : '시간표 삭제'}
                </button>
              ) : (
                <button type="button" className="tb-cancel" onClick={close}>
                  취소
                </button>
              )}
              <button
                type="button"
                className="tb-submit"
                onClick={submit}
                disabled={saving || blocks.length === 0 || conflicts.size > 0 || (editing && !dirty)}
              >
                {saving
                  ? '저장하는 중…'
                  : blocks.length === 0
                    ? '곡을 표에 놓아 주세요'
                    : editing
                      ? dirty
                        ? '고친 내용 저장하기'
                        : '바뀐 내용 없음'
                      : `연습 ${practiceCount}건 등록하기`}
              </button>
            </div>
          </div>
        )}
      </div>

      {drag && (
        <div
          ref={ghostRef}
          className="tb-ghost"
          style={{ transform: ghostTransform(drag.x, drag.y), '--c': drag.color } as CSSProperties}
          aria-hidden
        >
          {drag.label}
        </div>
      )}

      {toast && <Toast key={toast.id} message={toast.message} onDone={() => setToast(null)} />}
    </div>,
    document.body,
  )
}
