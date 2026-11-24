import { useState } from 'react'
import { logoutMember } from '../../api'
import type { Member } from '../../types'
import { PersonIcon } from '../../components/PersonIcon'
import { PasswordForm } from './PasswordForm'
import { MyTimetable } from './MyTimetable'
import './MyPage.css'

interface MyPageProps {
  member: Member
  onLogout: () => void
}

// 상단의 사람 아이콘을 누르면 들어오는 마이페이지예요.
// 위에서부터: 내 정보 · 로그아웃 → 비밀번호 설정/변경 → 내 일정
export function MyPage({ member, onLogout }: MyPageProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function logout() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await logoutMember()
      onLogout()
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그아웃하지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <main className="data mypage">
      <section className="mypage-card mypage-profile">
        <span className="mypage-avatar">
          <PersonIcon size={26} />
        </span>
        <div className="mypage-who">
          <strong>{member.name}님</strong>
          <span>{member.gen}기</span>
        </div>
        <button type="button" className="mypage-logout" onClick={logout} disabled={busy}>
          {busy ? '로그아웃 중…' : '로그아웃'}
        </button>
      </section>
      {error && <p className="mypage-error" role="alert">{error}</p>}

      <section className="mypage-card">
        {/* key: 다른 부원으로 다시 로그인하면 입력칸을 새로 시작해요. */}
        <PasswordForm key={member.id} member={member} />
      </section>

      <section className="mypage-sec">
        <h2>내 일정</h2>
        <p>아직 등록된 일정이 없어요.</p>
        <MyTimetable />
      </section>
    </main>
  )
}
