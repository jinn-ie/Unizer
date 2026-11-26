import { useState } from 'react'
import type { FormEvent } from 'react'
import { loginMember } from '../../api'
import type { Member } from '../../types'
import { onlyPin, PIN_LENGTH } from '../../lib/pin'
import './LoginPage.css'

interface LoginPageProps {
  visible: boolean
  status: 'loading' | 'ready' | 'error'
  onLogin: (member: Member) => void
  onRetry: () => void
}

// 로그인하지 않았을 때 사람 버튼을 누르면 나오는 화면이에요. (로그인한 뒤에는 마이페이지)
export function LoginPage({ visible, status, onLogin, onRetry }: LoginPageProps) {
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
      onLogin(currentMember)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="data" hidden={!visible}>
      <section className="login-card">
        <h2>로그인</h2>
        {status === 'loading' && <p role="status">로그인 상태를 확인하고 있어요.</p>}
        {status === 'error' && (
          <>
            <p role="alert">로그인 상태를 확인하지 못했어요.</p>
            <button type="button" className="import-btn" onClick={onRetry}>다시 시도</button>
          </>
        )}
        {status === 'ready' && (
          <form className="login-form" onSubmit={submitLogin}>
            {/* 기수 · 이름 한 줄: [ 42 ]기 [ 홍길동 ] (칸 이름은 칸 안의 흐린 글씨로) */}
            <div className="login-who">
              <input
                className="login-gen" aria-label="기수" placeholder="기수"
                type="number" inputMode="numeric" min={1} max={2147483647} required
                value={gen} onChange={(event) => setGen(event.target.value)}
              />
              <span className="login-gen-unit" aria-hidden>기</span>
              <input
                className="login-name" aria-label="부원 이름" placeholder="이름"
                autoComplete="username" maxLength={30} required
                value={name} onChange={(event) => setName(event.target.value)}
              />
            </div>
            <label>
              비밀번호 <span>(선택)</span>
              {/* 숫자 4자리만: 숫자 키패드가 뜨고, 숫자가 아닌 글자는 지워요. */}
              <input
                type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={PIN_LENGTH}
                autoComplete="current-password" aria-describedby="login-password-hint"
                value={password} onChange={(event) => setPassword(onlyPin(event.target.value))}
              />
            </label>
            <p id="login-password-hint">비밀번호를 설정한 부원만 숫자 4자리를 입력해 주세요.</p>
            <button type="submit" className="import-btn" disabled={busy || !gen || !name.trim()}>
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </form>
        )}
        {error && <p className="login-error" role="alert">{error}</p>}
      </section>
    </main>
  )
}
