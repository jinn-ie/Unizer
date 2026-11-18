import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  message: string
  onDone: () => void
}

const DURATION = 2000 // 2초 뒤 사라짐 (CSS 애니메이션 길이와 같게)

// 화면 위쪽에 잠깐 떴다 사라지는 오류 알림
// 같은 문구를 다시 띄울 땐 부모에서 key 를 바꿔서 처음부터 다시 시작
export function Toast({ message, onDone }: Props) {
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const t = window.setTimeout(() => done.current(), DURATION)
    return () => window.clearTimeout(t)
  }, [])

  return createPortal(
    <div className="toast" role="alert">
      <span className="toast-icon" aria-hidden>
        !
      </span>
      {message}
    </div>,
    document.body,
  )
}
