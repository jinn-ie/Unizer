import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { formatMinutes } from '../../lib/date'
import { CAL_DEFAULT_TOP_MIN, CAL_SLOT_MIN, CAL_START_MIN } from '../../lib/schedule'
import { TP_ROWS } from './timepick'
// 머리줄 · 시각 · 격자선 모양은 '연습 공간' 캘린더와 같은 클래스(.cal-…)를 써요.
import '../schedule/WeekCalendar.css'
import './TimepickGrid.css'

const ROW_PX = 24 // 30분 한 칸 높이
const LONG_PRESS_MS = 300 // 이만큼 꾹 누르면 끌어서 칠하기 시작 ('시간표 만들기'와 비슷하게)
const TOLERANCE_PX = 8 // 누르는 동안 이보다 많이 움직이면 스크롤하려는 것
const EDGE_PX = 40 // 칠하는 중 손가락이 표 위 · 아래 끝에서 이만큼 안으로 들어오면 자동 스크롤
const MAX_SCROLL_STEP = 14 // 자동 스크롤 한 프레임에 최대 몇 px (끝에 가까울수록 빠르게)

/** 0시부터 min분 → 표 맨 위에서 몇 px */
const toY = (min: number) => ((min - CAL_START_MIN) / CAL_SLOT_MIN) * ROW_PX

export interface GridColumn {
  dow: string // "화"
  date: number | null // 12 (매주 모드는 날짜 없음)
  isToday: boolean
}

/** 칸 하나의 모양: 클래스 + (팀 화면이면) 숫자 */
export interface GridCell {
  className: string
  text?: string
}

/** 칸 위에 그리는 막대 (유디 연습) */
export interface GridBlock {
  key: string
  col: number
  startMin: number
  endMin: number
  title: string
}

/** 칠하기에 필요한 세 함수 (칠할 수 있는 표에만 줘요) */
export interface GridPaint {
  busyAt: (col: number, min: number) => boolean // 지금 안 되는 칸인지
  lockedAt: (col: number, min: number) => boolean // 못 바꾸는 칸인지 (유디 연습)
  set: (col: number, min: number, busy: boolean) => void
}

interface Props {
  columns: GridColumn[]
  cellOf: (col: number, min: number) => GridCell | null // null 이면 빈 칸
  blocks?: GridBlock[]
  paint?: GridPaint // 있으면 칠하기 표, 없으면 보기 전용
  onTapCell?: (col: number, min: number) => void // 보기 전용 표에서 칸을 눌렀을 때 (팀 화면)
  selected?: { col: number; min: number } | null // 팀 화면에서 고른 칸 테두리
}

type Cell = { col: number; min: number }

/** 끄는 중인 직사각형: 처음 칸(start)과 지금 손가락 칸(end)이 마주 보는 꼭짓점 */
interface Painting {
  pointerId: number
  busy: boolean // 직사각형을 무엇으로 칠할지 (처음 칸의 반대 값)
  start: Cell
  end: Cell
}

/** 칸이 직사각형 안에 있는지 */
function inRect(p: Painting, col: number, min: number): boolean {
  return (
    col >= Math.min(p.start.col, p.end.col) &&
    col <= Math.max(p.start.col, p.end.col) &&
    min >= Math.min(p.start.min, p.end.min) &&
    min <= Math.max(p.start.min, p.end.min)
  )
}

// 타임픽의 주간 표예요.
// - 칸을 톡 누르면 그 칸이 바뀌어요. (안 됨 ↔ 됨)
// - 꾹 누른 채 끌면, 처음 칸과 지금 칸을 꼭짓점으로 하는 직사각형이 칠해져요.
//   끄는 동안은 미리보기만 보여주고, 손을 뗄 때 한 번에 반영해요.
//   (그래서 직사각형을 다시 줄이면 빠진 칸은 원래대로 돌아가요)
// - 마우스는 누르자마자 끌어서 칠할 수 있어요. (스크롤과 헷갈릴 일이 없어서)
export function TimepickGrid({ columns, cellOf, blocks = [], paint, onTapCell, selected }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const colRefs = useRef<(HTMLDivElement | null)[]>([])

  // 손가락 이벤트는 창 전체에서 받아서, 최신 paint 함수를 ref 로 넘겨줘요.
  const paintRef = useRef(paint)
  useLayoutEffect(() => {
    paintRef.current = paint
  })

  // 누르는 중 (아직 칠하기 전)
  const pressRef = useRef<{ pointerId: number; x0: number; y0: number; cell: Cell; timer: number } | null>(null)
  // 끄는 중인 직사각형: 이벤트에서 읽는 ref + 미리보기를 그리는 state 를 같이 둬요
  const paintingRef = useRef<Painting | null>(null)
  const [painting, setPainting] = useState<Painting | null>(null)

  // 처음 그릴 때 16:00 이 맨 위에 오도록
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = toY(CAL_DEFAULT_TOP_MIN)
  }, [])

  /** 화면 좌표 → 그 자리의 칸 (표 밖이면 null) */
  const cellAt = (x: number, y: number): Cell | null => {
    for (let col = 0; col < colRefs.current.length; col++) {
      const el = colRefs.current[col]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x < r.left || x >= r.right) continue
      const row = Math.floor((y - r.top) / ROW_PX)
      if (row < 0 || row >= TP_ROWS.length) return null
      return { col, min: TP_ROWS[row] }
    }
    return null
  }

  // 칠하는 중 손가락의 마지막 위치 (손가락이 멈춰 있어도 자동 스크롤하면서 끝 칸을 다시 찾으려고)
  const pointRef = useRef<{ x: number; y: number } | null>(null)

  /**
   * 칠하는 중: 손가락 자리의 칸으로 직사각형 끝을 옮김
   * 손가락이 표 밖(위 머리줄, 왼쪽 시각 줄 등)으로 나가면 가장 가까운 표 안 칸으로 맞춰요.
   */
  const moveEndTo = (x: number, y: number) => {
    const cur = paintingRef.current
    const scroll = scrollRef.current
    const first = colRefs.current[0]
    const last = colRefs.current[colRefs.current.length - 1]
    if (!cur || !scroll || !first || !last) return
    const view = scroll.getBoundingClientRect()
    const left = first.getBoundingClientRect().left
    const right = last.getBoundingClientRect().right
    const cx = Math.min(Math.max(x, left), right - 1)
    const cy = Math.min(Math.max(y, view.top), view.bottom - 1)
    const cell = cellAt(cx, cy)
    if (!cell) return
    if (cell.col === cur.end.col && cell.min === cur.end.min) return // 같은 칸 안에서 움직이는 중
    const next = { ...cur, end: cell }
    paintingRef.current = next
    setPainting(next)
  }

  /** 칠하기 시작: 처음 칸의 반대 값으로 칠해요 (안 됨 칸에서 시작하면 지우개) */
  const startPaint = (pointerId: number, cell: Cell, x: number, y: number) => {
    const p = paintRef.current
    if (!p || p.lockedAt(cell.col, cell.min)) return
    const next: Painting = { pointerId, busy: !p.busyAt(cell.col, cell.min), start: cell, end: cell }
    paintingRef.current = next
    pointRef.current = { x, y }
    setPainting(next)
    document.body.classList.add('tp-painting')
  }

  // ── 칠하는 동안 매 프레임: 손가락이 표 위 · 아래 끝이면 자동 스크롤 + 끝 칸 다시 찾기 ──
  const isPainting = painting !== null
  useEffect(() => {
    if (!isPainting) return
    let raf = 0
    const tick = () => {
      const scroll = scrollRef.current
      const pt = pointRef.current
      if (scroll && pt) {
        const view = scroll.getBoundingClientRect()
        // 끝까지 남은 거리가 짧을수록(또는 표 밖으로 나갈수록) 빠르게
        if (pt.y < view.top + EDGE_PX) {
          scroll.scrollTop -= Math.min(MAX_SCROLL_STEP, Math.ceil((view.top + EDGE_PX - pt.y) / 4))
        } else if (pt.y > view.bottom - EDGE_PX) {
          scroll.scrollTop += Math.min(MAX_SCROLL_STEP, Math.ceil((pt.y - (view.bottom - EDGE_PX)) / 4))
        }
        moveEndTo(pt.x, pt.y) // 표가 움직였으니 손가락 밑 칸도 바뀌었을 수 있음
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPainting])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!paintRef.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (pressRef.current || paintingRef.current) return
    const cell = cellAt(e.clientX, e.clientY)
    if (!cell) return
    if (e.pointerType === 'mouse') {
      startPaint(e.pointerId, cell, e.clientX, e.clientY)
      return
    }
    const { pointerId, clientX, clientY } = e
    const timer = window.setTimeout(() => {
      pressRef.current = null
      navigator.vibrate?.(12)
      startPaint(pointerId, cell, clientX, clientY)
    }, LONG_PRESS_MS)
    pressRef.current = { pointerId, x0: clientX, y0: clientY, cell, timer }
  }

  // ── 누르기 · 끌기 · 떼기는 창 전체에서 받음 (손가락이 표 밖으로 나가도 끝을 알 수 있게) ──
  useEffect(() => {
    const cancelPress = () => {
      if (pressRef.current) window.clearTimeout(pressRef.current.timer)
      pressRef.current = null
    }
    const endPaint = () => {
      paintingRef.current = null
      pointRef.current = null
      setPainting(null)
      document.body.classList.remove('tp-painting')
    }
    const onMove = (e: PointerEvent) => {
      const press = pressRef.current
      if (press && press.pointerId === e.pointerId) {
        if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > TOLERANCE_PX) cancelPress() // 스크롤하려는 것
      }
      const cur = paintingRef.current
      if (!cur || cur.pointerId !== e.pointerId) return
      pointRef.current = { x: e.clientX, y: e.clientY }
      moveEndTo(e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      const press = pressRef.current
      if (press && press.pointerId === e.pointerId) {
        cancelPress()
        // 꾹 누르기 전에 뗐으면 = 톡 누르기 → 그 칸 하나만 바꿈
        const p = paintRef.current
        const { col, min } = press.cell
        if (e.type === 'pointerup' && p && !p.lockedAt(col, min)) p.set(col, min, !p.busyAt(col, min))
      }
      const cur = paintingRef.current
      if (cur && cur.pointerId === e.pointerId) {
        // 손을 뗐으면 직사각형 안의 칸을 한 번에 반영 (잠긴 유디 연습 칸은 건너뜀)
        // pointercancel(브라우저가 동작을 가져감)이면 반영하지 않고 취소
        const p = paintRef.current
        if (e.type === 'pointerup' && p) {
          for (let col = 0; col < colRefs.current.length; col++) {
            for (const min of TP_ROWS) {
              if (inRect(cur, col, min) && !p.lockedAt(col, min)) p.set(col, min, cur.busy)
            }
          }
        }
        endPaint()
      }
    }
    // 칠하는 동안에는 화면이 스크롤되지 않게 (passive: false 여야 막을 수 있음)
    const onTouchMove = (e: TouchEvent) => {
      if (paintingRef.current) e.preventDefault()
    }
    // 길게 누르면 뜨는 메뉴(복사 · 미리보기) 막기
    const onContextMenu = (e: Event) => {
      if (pressRef.current || paintingRef.current) e.preventDefault()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      cancelPress()
      endPaint()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  const hourMarks = TP_ROWS.filter((m) => m % 60 === 0)

  return (
    <div className={`cal tp-grid${paint ? ' is-paint' : ''}`}>
      <div className="cal-head">
        <div className="cal-corner" />
        {columns.map((c, i) => (
          <div key={i} className={`cal-day-head${c.isToday ? ' is-today' : ''}`}>
            <span className="cal-dow">{c.dow}</span>
            {c.date !== null && <span className="cal-date">{c.date}</span>}
          </div>
        ))}
      </div>

      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-body" style={{ height: TP_ROWS.length * ROW_PX }} onPointerDown={onPointerDown}>
          <div className="cal-times" aria-hidden>
            {hourMarks.map((m) => (
              <span key={m} className="cal-time" style={{ top: toY(m) }}>
                {formatMinutes(m)}
              </span>
            ))}
          </div>

          <div className="cal-lines" aria-hidden>
            {TP_ROWS.map((m) => (
              <i key={m} className={m % 60 === 0 ? 'is-hour' : undefined} style={{ top: toY(m) }} />
            ))}
          </div>

          {columns.map((c, col) => (
            <div
              key={col}
              ref={(el) => {
                colRefs.current[col] = el
              }}
              className={`cal-day${c.isToday ? ' is-today' : ''}`}
              onClick={(e) => {
                if (!onTapCell) return
                const cell = cellAt(e.clientX, e.clientY)
                if (cell) onTapCell(cell.col, cell.min)
              }}
            >
              {TP_ROWS.map((min) => {
                // 끄는 중인 직사각형 안이면 칠해질 모습으로 미리보기 (칠하기는 '나' 화면에서만 써서 is-busy / is-free)
                const preview = painting && paint && inRect(painting, col, min) && !paint.lockedAt(col, min)
                const cell = preview
                  ? { className: `${painting.busy ? 'is-busy' : 'is-free'} is-preview`, text: undefined }
                  : cellOf(col, min)
                if (!cell) return null
                return (
                  <div
                    key={min}
                    className={`tp-cell ${cell.className}`}
                    style={{ top: toY(min) + 1, height: ROW_PX - 2 }}
                  >
                    {cell.text}
                  </div>
                )
              })}

              {blocks
                .filter((b) => b.col === col)
                .map((b) => (
                  <div
                    key={b.key}
                    className="tp-block"
                    style={{ top: toY(b.startMin) + 1, height: Math.max(toY(b.endMin) - toY(b.startMin) - 2, 4) }}
                  >
                    {b.title}
                  </div>
                ))}

              {selected && selected.col === col && (
                <div className="tp-selected" style={{ top: toY(selected.min), height: ROW_PX }} aria-hidden />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
