import { WheelPicker } from './WheelPicker'
import './TimeRangeWheels.css'

interface Props {
  start: number // 그 날 0시부터 몇 분 (예: 18:00 → 1080)
  end: number
  onChange: (start: number, end: number) => void
  maxEnd?: number // 종료 최댓값 (기본 24:00, 정규연습처럼 시각만 저장하면 23:30)
}

const STEP = 30 // 30분 단위
const DAY_MIN = 24 * 60

const pad2 = (n: number) => String(n).padStart(2, '0')
const hourOptions = (last: number) =>
  Array.from({ length: last + 1 }, (_, h) => ({ value: h, label: pad2(h) }))
const START_HOURS = hourOptions(23) // 00 ~ 23
const MINUTES = Array.from({ length: 60 / STEP }, (_, i) => ({
  value: i * STEP,
  label: pad2(i * STEP),
}))

// 휠 4개: 시작 시 : 시작 분 ~ 종료 시 : 종료 분
export function TimeRangeWheels({ start, end, onChange, maxEnd = DAY_MIN }: Props) {
  const endHours = hourOptions(Math.floor(maxEnd / 60)) // 기본 00 ~ 24

  // 시작을 종료 이후로 굴리면, 종료를 시작 + 1시간으로 밀어줌
  const changeStart = (m: number) => onChange(m, end <= m ? Math.min(m + 60, maxEnd) : end)
  // 종료는 maxEnd 까지만 (24시를 고르면 분은 00 으로)
  const changeEnd = (m: number) => onChange(start, Math.min(m, maxEnd))

  const [startH, startM] = [Math.floor(start / 60), start % 60]
  const [endH, endM] = [Math.floor(end / 60), end % 60]

  return (
    <div className="qa-wheels">
      <WheelPicker
        options={START_HOURS}
        value={startH}
        onChange={(h) => changeStart(h * 60 + startM)}
        ariaLabel="시작 시"
      />
      <span className="time-colon">:</span>
      <WheelPicker
        options={MINUTES}
        value={startM}
        onChange={(m) => changeStart(startH * 60 + m)}
        ariaLabel="시작 분"
      />
      <span className="time-sep">~</span>
      <WheelPicker
        options={endHours}
        value={endH}
        onChange={(h) => changeEnd(h * 60 + endM)}
        ariaLabel="종료 시"
      />
      <span className="time-colon">:</span>
      <WheelPicker
        options={MINUTES}
        value={endM}
        onChange={(m) => changeEnd(endH * 60 + m)}
        ariaLabel="종료 분"
      />
    </div>
  )
}
