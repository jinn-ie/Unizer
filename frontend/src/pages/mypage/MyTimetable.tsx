import { useLayoutEffect, useRef } from 'react'
import { formatMinutes, WEEKDAYS } from '../../lib/date'
import {
  CAL_DAY_MIN,
  CAL_DEFAULT_TOP_MIN,
  CAL_SLOT_MIN,
  CAL_START_MIN,
  CAL_VISIBLE_ROWS,
} from '../../lib/schedule'
// 칸 · 시각 · 격자선 모양은 '연습 공간' 캘린더와 같은 클래스(.cal-…)를 써요.
import '../schedule/WeekCalendar.css'
import './MyTimetable.css'

const ROW_PX = 22 // 30분 한 칸 높이
const TOTAL_ROWS = (CAL_DAY_MIN - CAL_START_MIN) / CAL_SLOT_MIN

/** 0시부터 min분 → 표 맨 위에서 몇 px */
const toY = (min: number) => ((min - CAL_START_MIN) / CAL_SLOT_MIN) * ROW_PX

// 마이페이지 '내 정규 일정'의 주간 시간표예요. 지금은 빈 표만 보여줘요.
// 시간 범위는 '연습 공간'과 같아요: 08:00~24:00, 처음엔 16:00~24:00 이 보이게.
export function MyTimetable() {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 처음 그릴 때 16:00 이 맨 위에 오도록 스크롤해 둬요.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = toY(CAL_DEFAULT_TOP_MIN)
  }, [])

  const hourMarks: number[] = []
  for (let m = CAL_START_MIN; m < CAL_DAY_MIN; m += 60) hourMarks.push(m)

  return (
    <div className="cal my-tt">
      <div className="cal-head">
        <div className="cal-corner" />
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-day-head">
            <span className="cal-dow">{w}</span>
          </div>
        ))}
      </div>

      {/* 16:00~24:00 만큼의 높이로 보여주고, 위로 스크롤하면 08:00 까지 보여요. */}
      <div className="cal-scroll" ref={scrollRef} style={{ height: CAL_VISIBLE_ROWS * ROW_PX }}>
        <div className="cal-body" style={{ height: TOTAL_ROWS * ROW_PX }}>
          <div className="cal-times" aria-hidden>
            {hourMarks.map((m) => (
              <span key={m} className="cal-time" style={{ top: toY(m) }}>
                {formatMinutes(m)}
              </span>
            ))}
          </div>

          <div className="cal-lines" aria-hidden>
            {Array.from({ length: TOTAL_ROWS }, (_, k) => (
              <i key={k} className={k % 2 === 0 ? 'is-hour' : undefined} style={{ top: k * ROW_PX }} />
            ))}
          </div>

          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-day" />
          ))}
        </div>
      </div>
    </div>
  )
}
