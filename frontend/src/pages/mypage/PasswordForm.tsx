import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { changePassword, fetchPasswordStatus } from '../../api'
import type { Member } from '../../types'
import { onlyPin, PIN_LENGTH } from '../../lib/pin'
// 입력칸 모양(.login-form)과 에러 문구(.login-error)는 로그인 화면 것을 같이 써요.
import '../auth/LoginPage.css'

interface PasswordFormProps {
  member: Member
}

// 마이페이지에서 비밀번호(숫자 4자리)를 처음 설정하거나 바꾸는 칸이에요.
// 이미 비밀번호가 있으면 현재 비밀번호를 같이 받아요.
export function PasswordForm({ member }: PasswordFormProps) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null) // null = 아직 모름
  const [statusError, setStatusError] = useState(false)
  const [statusAttempt, setStatusAttempt] = useState(0)
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  // 설정 여부에 따라 제목과 '현재 비밀번호' 칸이 달라져서 먼저 물어봐요.
  useEffect(() => {
    const controller = new AbortController()
    fetchPasswordStatus(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return
        setHasPassword(status.has_password)
        setStatusError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatusError(true)
      })
    return () => controller.abort()
  }, [statusAttempt])

  function retryStatus() {
    setStatusError(false)
    setStatusAttempt((attempt) => attempt + 1)
  }

  function closeForm() {
    setOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
  }

  // 서버에서도 검사하지만, 흔한 실수는 보내기 전에 바로 알려 줘요.
  function checkInput() {
    if (hasPassword && currentPassword.length !== PIN_LENGTH) return '현재 비밀번호 4자리를 입력해 주세요.'
    if (newPassword.length !== PIN_LENGTH) return '새 비밀번호는 숫자 4자리로 입력해 주세요.'
    if (newPassword !== confirmPassword) return '새 비밀번호 확인이 일치하지 않아요.'
    return ''
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const problem = checkInput()
    setError(problem)
    if (problem) return

    setBusy(true)
    try {
      await changePassword({
        current_password: hasPassword ? currentPassword : undefined,
        new_password: newPassword,
      })
      setDone(hasPassword
        ? '비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해 주세요.'
        : '비밀번호를 설정했어요. 다음부터는 로그인할 때 입력해 주세요.')
      setHasPassword(true)
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호를 저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  if (statusError) {
    return (
      <div className="password-box">
        <p role="alert">비밀번호 설정 여부를 확인하지 못했어요.</p>
        <button type="button" className="password-toggle" onClick={retryStatus}>다시 시도</button>
      </div>
    )
  }
  if (hasPassword === null) {
    return <div className="password-box"><p role="status">비밀번호 설정 여부를 확인하고 있어요.</p></div>
  }

  const title = hasPassword ? '비밀번호 변경' : '비밀번호 설정'

  // 숫자 키패드가 뜨게 하고, 숫자 4자리만 받는 비밀번호 칸
  const pinProps = {
    type: 'password',
    inputMode: 'numeric',
    pattern: '[0-9]{4}',
    maxLength: PIN_LENGTH,
    required: true,
  } as const

  return (
    <div className="password-box">
      <div className="password-head">
        <h2>{title}</h2>
        <span className={hasPassword ? 'password-badge on' : 'password-badge'}>
          {hasPassword ? '설정됨' : '설정 안 됨'}
        </span>
      </div>
      {!hasPassword && !open && (
        <p>지금은 기수와 이름만으로 로그인돼요. 숫자 4자리 비밀번호를 설정하면 다른 사람이 내 이름으로 로그인할 수 없어요.</p>
      )}
      {done && !open && <p className="password-done" role="status">{done}</p>}

      {open ? (
        <form className="login-form" onSubmit={submit}>
          {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 숨겨 둬요. */}
          <input type="text" autoComplete="username" value={`${member.gen}기 ${member.name}`} readOnly hidden />
          {hasPassword && (
            <label>
              현재 비밀번호
              <input
                {...pinProps} autoComplete="current-password"
                value={currentPassword} onChange={(event) => setCurrentPassword(onlyPin(event.target.value))}
              />
            </label>
          )}
          <label>
            새 비밀번호 <span>(숫자 4자리)</span>
            <input
              {...pinProps} autoComplete="new-password"
              value={newPassword} onChange={(event) => setNewPassword(onlyPin(event.target.value))}
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              {...pinProps} autoComplete="new-password"
              value={confirmPassword} onChange={(event) => setConfirmPassword(onlyPin(event.target.value))}
            />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <div className="password-actions">
            <button type="button" className="password-toggle" onClick={closeForm} disabled={busy}>
              취소
            </button>
            <button type="submit" className="import-btn" disabled={busy}>
              {busy ? '저장 중…' : hasPassword ? '바꾸기' : '설정하기'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="password-toggle" onClick={() => { setDone(''); setOpen(true) }}>
          {title}
        </button>
      )}
    </div>
  )
}
