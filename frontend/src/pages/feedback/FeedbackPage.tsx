import { useState } from 'react'
import type { FormEvent } from 'react'
import { sendFeedback } from '../../api'
import { Toast } from '../../components/Toast'
import './FeedbackPage.css'

type ToastState = { id: number; message: string; kind: 'error' | 'success' } | null

// 의견 보내기 탭: 안내 한 줄 + 글 상자 + 보내기
export function FeedbackPage() {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    try {
      await sendFeedback({ text: value })
      setText('')
      setToast({ id: Date.now(), message: '의견을 보냈어요. 고마워요!', kind: 'success' })
    } catch (err) {
      setToast({
        id: Date.now(),
        message: err instanceof Error ? err.message : '의견을 보내지 못했어요.',
        kind: 'error',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="data feedback">
      <form onSubmit={submit}>
        <p className="feedback-hint">
          불편한 점이나 있었으면 하는 기능을 자유롭게 남겨주세요
          <br />
          익명은 보장되며, 의견은 부원과 개발자 모두에게 도움이 됩니다 :)
        </p>
        <textarea
          className="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={1000}
          aria-label="의견"
        />
        <button type="submit" className="import-btn" disabled={!text.trim() || sending}>
          {sending ? '보내는 중…' : '보내기'}
        </button>
      </form>

      {toast && (
        <Toast key={toast.id} message={toast.message} kind={toast.kind} onDone={() => setToast(null)} />
      )}
    </main>
  )
}
