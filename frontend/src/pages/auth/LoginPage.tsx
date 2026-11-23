import { useState } from 'react'
import type { FormEvent } from 'react'
import { loginMember, logoutMember } from '../../api'
import type { Member } from '../../types'
import './LoginPage.css'

interface LoginPageProps {
  visible: boolean
  member: Member | null
  status: 'loading' | 'ready' | 'error'
  onMemberChange: (member: Member | null) => void
  onRetry: () => void
}

export function LoginPage({ visible, member, status, onMemberChange, onRetry }: LoginPageProps) {
  const [gen, setGen] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !name.trim()) return
    setError('')
    setBusy(true)
    try {
      const currentMember = await loginMember({
        gen: Number(gen),
        name: name.trim(),
        password: password || undefined,
      })
      setPassword('')
      onMemberChange(currentMember)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  async function submitLogout() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await logoutMember()
      onMemberChange(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그아웃하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="data" hidden={!visible}>
      <section className="login-card">
        <h2>{member ? '내 계정' : '로그인'}</h2>
        {status === 'loading' && <p role="status">로그인 상태를 확인하고 있어요.</p>}
        {status === 'error' && (
          <>
            <p role="alert">로그인 상태를 확인하지 못했어요.</p>
            <button type="button" className="import-btn" onClick={onRetry}>다시 시도</button>
          </>
        )}
        {status === 'ready' && (member ? (
          <>
            <p role="status">{member.gen}기 {member.name}님으로 로그인했어요.</p>
            <button type="button" className="import-btn" onClick={submitLogout} disabled={busy}>
              {busy ? '로그아웃 중…' : '로그아웃'}
            </button>
          </>
        ) : (
          <form className="login-form" onSubmit={submitLogin}>
            <label>
              기수
              <input
                type="number" inputMode="numeric" min={1} max={2147483647} required
                value={gen} onChange={(event) => setGen(event.target.value)}
              />
            </label>
            <label>
              부원 이름
              <input
                autoComplete="username" maxLength={30} required
                value={name} onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              비밀번호 <span>(선택)</span>
              <input
                type="password" autoComplete="current-password" maxLength={128}
                aria-describedby="login-password-hint"
                value={password} onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <p id="login-password-hint">비밀번호가 설정된 계정만 입력해 주세요.</p>
            <button type="submit" className="import-btn" disabled={busy || !gen || !name.trim()}>
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </form>
        ))}
        {error && <p className="login-error" role="alert">{error}</p>}
      </section>
    </main>
  )
}
