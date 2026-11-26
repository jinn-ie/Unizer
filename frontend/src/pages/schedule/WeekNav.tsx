import { formatWeekRange } from '../../lib/date'

interface Props {
  weekStart: Date
  isThisWeek: boolean
  onShift: (n: number) => void // -1: 이전 주, 1: 다음 주
  onToday: () => void
}

// 주 이동 줄: [<] 2026 · 11/23 – 11/29 [>] [오늘]
// '연습 공간'과 '타임픽'이 같이 써요. (모양은 SchedulePage.css 의 .week-nav)
export function WeekNav({ weekStart, isThisWeek, onShift, onToday }: Props) {
  return (
    <nav className="week-nav" aria-label="주 이동">
      <button type="button" className="icon-btn" onClick={() => onShift(-1)} aria-label="이전 주">
        <Chevron dir="left" />
      </button>
      <div className="week-label">
        <span className="week-year">{weekStart.getFullYear()}</span>
        <strong>{formatWeekRange(weekStart)}</strong>
      </div>
      <button type="button" className="icon-btn" onClick={() => onShift(1)} aria-label="다음 주">
        <Chevron dir="right" />
      </button>
      <button type="button" className="today-btn" onClick={onToday} disabled={isThisWeek}>
        오늘
      </button>
    </nav>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
