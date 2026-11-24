import { useRef } from 'react'
import type { TouchEvent } from 'react'

// 시간표를 좌우로 밀어서 주 이동 ('연습 공간'과 '내 연습'이 같이 써요)
// 돌려준 두 함수를 시간표를 감싼 요소의 onTouchStart / onTouchEnd 에 붙이면 돼요.
export function useWeekSwipe(shiftWeek: (n: number) => void) {
  const touch = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    touch.current = null
    // 가로로 충분히 밀었고 세로로는 거의 안 움직였을 때만 (세로 스크롤과 헷갈리지 않게)
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) shiftWeek(dx < 0 ? 1 : -1)
  }

  return { onTouchStart, onTouchEnd }
}
