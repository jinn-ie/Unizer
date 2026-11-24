import { useState } from 'react'
import { createShow } from '../../api'
import type { Show } from '../../types'
import './ShowCreate.css'

interface Props {
  open: boolean // 펼침 여부 (여는 버튼은 곡 탭 맨 위에 있음)
  onClose: () => void
  names: string[] // 이미 있는 공연 이름 (같은 이름 막기)
  onCreated: (show: Show) => void
}

// 곡 탭 맨 위 "+ 공연 만들기"를 누르면 펼쳐지는 이름 입력칸. 곡 없이 이름만으로 빈 공연을 만들어요.
export function ShowCreate({ open, onClose, names, onCreated }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const taken = names.includes(trimmed)

  // 취소 · 만들기 끝: 입력한 이름도 비우고 접기
  function close() {
    setName('')
    setError(null)
    onClose()
  }

  async function submit() {
    if (!trimmed || taken || busy) return
    setBusy(true)
    setError(null)
    try {
      const show = await createShow({ name: trimmed, song_ids: [] })
      close()
      onCreated(show)
    } catch (e) {
      setError(e instanceof Error ? e.message : '공연을 만들지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="show-create">
      <div className="show-create-row">
        <input
          className="show-create-input"
          value={name}
          maxLength={100}
          placeholder="공연 이름 (예: 2026 버스킹)"
          aria-label="공연 이름"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // 한글 입력 중(조합 중) Enter 는 무시해야 마지막 글자가 두 번 들어가지 않아요
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
            if (e.key === 'Escape') close()
          }}
        />
        <button type="button" className="show-create-ok" onClick={submit} disabled={!trimmed || taken || busy}>
          {busy ? '만드는 중…' : '만들기'}
        </button>
      </div>
      {taken && <p className="show-create-error">같은 이름의 공연이 이미 있어요.</p>}
      {error && <p className="show-create-error">{error}</p>}
      <button type="button" className="show-create-cancel" onClick={close}>
        취소
      </button>
    </div>
  )
}
