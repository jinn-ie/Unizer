import { useEffect, useRef, useState } from 'react'

export interface WheelOption {
  value: number
  label: string
}

interface Props {
  options: WheelOption[]
  value: number
  onChange: (value: number) => void
  ariaLabel: string
}

const ITEM = 40 // 한 칸 높이(px) — CSS 의 .wheel-item 높이와 같아야 함

// 드르륵 굴려서 고르는 휠. 가운데 칸에 멈춘 값이 선택됨
export function WheelPicker({ options, value, onChange, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const mounted = useRef(false)
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const [live, setLive] = useState(index) // 굴리는 중 가운데에 있는 칸 (글자 강조용)

  // 값이 바깥에서 바뀌면(처음 열 때, 시작을 바꿔 종료가 따라 밀릴 때) 그 칸으로 굴려줌
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (Math.round(el.scrollTop / ITEM) !== index) {
      el.scrollTo({ top: index * ITEM, behavior: mounted.current ? 'smooth' : 'auto' })
    }
    setLive(index)
    mounted.current = true
  }, [index])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)))
    setLive(i)
    // 멈추고 잠깐 뒤에 값 확정
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (options[i].value !== value) onChange(options[i].value)
    }, 90)
  }

  const step = (d: number) => {
    const i = Math.min(options.length - 1, Math.max(0, index + d))
    onChange(options[i].value)
  }

  return (
    <div className="wheel">
      <div className="wheel-band" aria-hidden />
      <div
        ref={ref}
        className="wheel-scroll"
        onScroll={onScroll}
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            step(-1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            step(1)
          }
        }}
      >
        {options.map((o, i) => (
          <div
            key={o.value}
            role="option"
            aria-selected={i === index}
            className={`wheel-item${i === live ? ' is-active' : ''}`}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  )
}
