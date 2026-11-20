import { useState } from 'react'
import type { FormEvent } from 'react'
import { createNote, deleteNote } from '../../api'
import type { Note } from '../../types'
import { formatStamp, toDateKey } from '../../lib/date'
import { Toast } from '../../components/Toast'
import './NoteList.css'

type ToastState = { id: number; message: string } | null

// ── 메모 목록: 연습 목록 바로 아래, 댓글처럼 한 줄씩 ──
interface ListProps {
  notes: Note[] // 이 날의 메모 (오래된 것부터)
  onChanged: () => void // 삭제 후 다시 불러오기
}

export function NoteList({ notes, onChanged }: ListProps) {
  const [confirmId, setConfirmId] = useState<number | null>(null) // × 를 한 번 누른 메모
  const [toast, setToast] = useState<ToastState>(null)

  const remove = async (id: number) => {
    try {
      await deleteNote(id)
      setConfirmId(null)
      onChanged()
    } catch (err) {
      setToast({ id: Date.now(), message: err instanceof Error ? err.message : '메모를 지우지 못했어요.' })
    }
  }

  if (notes.length === 0) return null

  return (
    <section className="notes" aria-label="메모">
      <ul className="note-list">
        {notes.map((n) => (
          <li key={n.id}>
            <div className="note-body">
              <p>{n.text}</p>
              <span>{formatStamp(n.created_at)}</span>
            </div>
            {/* 한 번 누르면 '삭제', 한 번 더 누르면 진짜 삭제 */}
            <button
              type="button"
              className={`note-del${confirmId === n.id ? ' is-confirm' : ''}`}
              onClick={() => (confirmId === n.id ? remove(n.id) : setConfirmId(n.id))}
              onBlur={() => setConfirmId((c) => (c === n.id ? null : c))}
              aria-label="메모 삭제"
            >
              {confirmId === n.id ? (
                '삭제'
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>

      {toast && <Toast key={toast.id} message={toast.message} onDone={() => setToast(null)} />}
    </section>
  )
}

// ── 메모 입력칸: 연습 등록 박스와 함께 보드 아래에 고정 ──
interface FormProps {
  day: Date
  onChanged: () => void // 등록 후 다시 불러오기
}

export function NoteForm({ day, onChanged }: FormProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || saving) return
    setSaving(true)
    try {
      await createNote({ date_on: toDateKey(day), text: value })
      setText('')
      onChanged()
    } catch (err) {
      setToast({ id: Date.now(), message: err instanceof Error ? err.message : '메모를 남기지 못했어요.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <form className="note-form" onSubmit={submit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="아라 사용 / 거울 반반 사용 등은 댓글로 남겨주세요"
          maxLength={200}
          enterKeyHint="send"
          aria-label="메모 내용"
        />
        <button type="submit" disabled={!text.trim() || saving}>
          등록
        </button>
      </form>

      {toast && <Toast key={toast.id} message={toast.message} onDone={() => setToast(null)} />}
    </>
  )
}
