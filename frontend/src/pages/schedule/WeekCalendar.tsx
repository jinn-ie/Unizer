import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ScheduleItem } from '../../types'
import { SPACES, SPACE_INDEX } from '../../lib/spaces'
import {
  addDays,
  formatMinutes,
  isSameDay,
  WEEKDAYS,
} from '../../lib/date'
import {
  CAL_DAY_MIN as DAY_MIN,
  CAL_DEFAULT_TOP_MIN as DEFAULT_TOP_MIN,
  CAL_SLOT_MIN as SLOT_MIN,
  CAL_START_MIN as BASE_START_MIN,
  CAL_VISIBLE_ROWS as VISIBLE_ROWS,
} from '../../lib/schedule'
import './WeekCalendar.css'

// 시간 범위(08:00~24:00, 처음엔 16:00부터)는 lib/schedule.ts 에서 마이페이지와 같이 써요.
const MIN_ROW_PX = 18
const MAX_ROW_PX = 44

interface Segment {
  item: ScheduleItem
  dayIndex: number
  startMin: number // 그 날 0시 기준 분
  endMin: number
  space: number // 공간 번호 (SPACES 순서) → 색
  lane: number // 날짜 칸 안에서 몇 번째 세로줄인지 (0부터)
  lanes: number // 세로줄이 몇 개로 나뉘는지
}

interface Props {
  weekStart: Date
  items: ScheduleItem[]
  now: Date
  onSelectDay: (day: Date, focusKey?: string) => void
  // spaces: 날짜 칸을 공간 4줄로 나눔 ('연습 공간', 기본값)
  // single: 날짜마다 한 칸, 색으로 공간 구분 + 막대 안에 곡명 · 공간 ('내 연습')
  layout?: 'spaces' | 'single'
}

/** 한 칸 모드: 겹치는 연습끼리만 칸을 나눠 나란히 놓음 (안 겹치면 칸 전체 폭) */
function packColumns(segments: Segment[]): void {
  for (let d = 0; d < 7; d++) {
    const daySegs = segments.filter((s) => s.dayIndex === d).sort((a, b) => a.startMin - b.startMin)
    let group: Segment[] = [] // 시간이 이어서 겹치는 연습 묶음
    let colEnds: number[] = [] // 묶음 안에서 각 세로줄이 언제 비는지
    let groupEnd = 0
    const closeGroup = () => {
      for (const s of group) s.lanes = colEnds.length
      group = []
      colEnds = []
    }
    for (const s of daySegs) {
      if (group.length > 0 && s.startMin >= groupEnd) closeGroup() // 앞 묶음과 안 겹치면 새 묶음
      // 이미 비어 있는 세로줄이 있으면 거기에, 없으면 새 줄
      let col = colEnds.findIndex((end) => end <= s.startMin)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(s.endMin)
      } else {
        colEnds[col] = s.endMin
      }
      s.lane = col
      group.push(s)
      groupEnd = group.length === 1 ? s.endMin : Math.max(groupEnd, s.endMin)
    }
    closeGroup()
  }
}

export function WeekCalendar({ weekStart, items, now, onSelectDay, layout = 'spaces' }: Props) {
  const single = layout === 'single'
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  // 예약을 날짜별 조각으로 자르기 (자정을 넘는 예약도 날마다 나눠서 그림)
  const segments = useMemo(() => {
    const out: Segment[] = []
    for (const item of items) {
      const space = SPACE_INDEX.get(item.space)
      if (space === undefined) continue
      const start = item.start.getTime()
      const end = item.end.getTime()
      days.forEach((day, dayIndex) => {
        const dayStart = day.getTime()
        const dayEnd = addDays(day, 1).getTime()
        const s = Math.max(start, dayStart)
        const e = Math.min(end, dayEnd)
        if (e <= s) return
        out.push({
          item,
          dayIndex,
          startMin: (s - dayStart) / 60000,
          endMin: (e - dayStart) / 60000,
          space,
          lane: space, // 공간 4줄 모드: 공간 번호 = 세로줄
          lanes: SPACES.length,
        })
      })
    }
    if (single) packColumns(out)
    return out
  }, [items, days, single])

  // 기본 08:00 부터. 그보다 이른 예약이 있는 주는 그 시각(정시)까지 확장
  const gridStartMin = useMemo(() => {
    const earliest = Math.min(BASE_START_MIN, ...segments.map((s) => s.startMin))
    return Math.floor(earliest / 60) * 60
  }, [segments])
  const totalRows = (DAY_MIN - gridStartMin) / SLOT_MIN

  // ── 칸 높이: 스크롤 영역 높이에 16:00~24:00 이 딱 맞게 ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<number | null>(null)
  const gridStartRef = useRef(gridStartMin)
  const pendingTopMin = useRef<number | null>(null)
  const [rowPx, setRowPx] = useState(20)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const next = Math.min(MAX_ROW_PX, Math.max(MIN_ROW_PX, el.clientHeight / VISIBLE_ROWS))
      const prev = rowRef.current
      if (prev !== null && Math.abs(prev - next) < 0.5) return
      // 처음엔 16:00 으로, 이후 화면 크기가 바뀌면 보고 있던 시각을 유지
      pendingTopMin.current =
        prev === null ? DEFAULT_TOP_MIN : gridStartRef.current + (el.scrollTop / prev) * SLOT_MIN
      rowRef.current = next
      setRowPx(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    // 측정된 칸 높이로 다시 그려진 뒤에만 스크롤 위치를 맞춤
    if (!el || pendingTopMin.current === null || rowPx !== rowRef.current) return
    el.scrollTop = ((pendingTopMin.current - gridStartMin) / SLOT_MIN) * rowPx
    pendingTopMin.current = null
  }, [rowPx, gridStartMin])

  // 주를 바꿔서 시작 시각이 달라져도 보던 시각이 그대로 보이게
  useLayoutEffect(() => {
    const el = scrollRef.current
    const prevStart = gridStartRef.current
    gridStartRef.current = gridStartMin
    if (!el || prevStart === gridStartMin) return
    el.scrollTop += ((prevStart - gridStartMin) / SLOT_MIN) * rowPx
  }, [gridStartMin, rowPx])

  const toY = (min: number) => ((min - gridStartMin) / SLOT_MIN) * rowPx
  const bodyHeight = totalRows * rowPx

  const hourMarks: number[] = []
  for (let m = gridStartMin; m < DAY_MIN; m += 60) hourMarks.push(m)

  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <div className={`cal${single ? ' is-single' : ''}`}>
      <div className="cal-head">
        <div className="cal-corner" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, now)
          return (
            <button
              key={i}
              type="button"
              className={`cal-day-head${isToday ? ' is-today' : ''}`}
              onClick={() => onSelectDay(d)}
            >
              <span className="cal-dow">{WEEKDAYS[i]}</span>
              <span className="cal-date">{d.getDate()}</span>
              {/* 공간 4줄 모드에서만: 날짜 아래 공간 색 줄 */}
              {!single && (
                <span className="cal-lane-key" aria-hidden>
                  {SPACES.map((s) => (
                    <i key={s.key} style={{ background: s.color }} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-body" style={{ height: bodyHeight }}>
          <div className="cal-times" aria-hidden>
            {hourMarks.map((m) => (
              <span key={m} className="cal-time" style={{ top: toY(m) }}>
                {formatMinutes(m)}
              </span>
            ))}
          </div>

          {/* 가로 격자선: 예약 막대와 같은 계산(toY)으로 그려서 어긋나지 않게 */}
          <div className="cal-lines" aria-hidden>
            {Array.from({ length: totalRows }, (_, k) => (
              <i
                key={k}
                className={(gridStartMin + k * SLOT_MIN) % 60 === 0 ? 'is-hour' : undefined}
                style={{ top: k * rowPx }}
              />
            ))}
          </div>

          {days.map((d, i) => {
            const isToday = isSameDay(d, now)
            return (
              <div
                key={i}
                className={`cal-day${isToday ? ' is-today' : ''}`}
                onClick={() => onSelectDay(d)}
              >
                {/* 공간 4줄 모드: 날짜 칸 양옆에 여백(--gut)을 두고, 그 안을 공간 4줄로 나눔 */}
                {!single &&
                  [1, 2, 3].map((n) => (
                    <i key={n} className="cal-lane-line" style={{ '--lane': n } as CSSProperties} />
                  ))}

                {segments
                  .filter((s) => s.dayIndex === i)
                  .map((s) => (
                    <button
                      key={`${s.item.key}-${i}`}
                      type="button"
                      className="cal-block"
                      aria-label={`${s.item.title} ${s.item.space}`}
                      style={
                        {
                          top: toY(s.startMin) + 1,
                          height: Math.max(toY(s.endMin) - toY(s.startMin) - 2, 4),
                          '--lane': s.lane,
                          '--lanes': s.lanes,
                          '--c': SPACES[s.space].color,
                        } as CSSProperties
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectDay(d, s.item.key)
                      }}
                    >
                      {/* 한 칸 모드: 막대 안에 곡명 · 공간 (막대가 짧으면 공간 줄부터 잘림) */}
                      {single && (
                        <>
                          <span className="cal-block-title">{s.item.title}</span>
                          <span className="cal-block-space">{SPACES[s.space].label}</span>
                        </>
                      )}
                    </button>
                  ))}

                {isToday && nowMin >= gridStartMin && (
                  <div className="cal-now" style={{ top: toY(nowMin) }} aria-hidden />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
