import { useEffect, useState } from 'react'
import { fetchCurrentMember } from './api'
import type { Member } from './types'
import { LoginPage } from './pages/auth/LoginPage'
import { MyPage } from './pages/mypage/MyPage'
import { PersonIcon } from './components/PersonIcon'
import { SchedulePage } from './pages/schedule/SchedulePage'
import { DataPage } from './pages/data/DataPage'
import { MyPracticePage } from './pages/mypractice/MyPracticePage'

// account: 상단 사람 버튼 (로그인 전에는 로그인 화면, 로그인 후에는 마이페이지)
type Tab = 'schedule' | 'songs' | 'mine' | 'account'

// '의견 보내기' 탭은 잠시 숨겨 뒀어요. (화면 pages/feedback/ 과 백엔드 API 는 그대로 있어요)
// 다시 보이게 하려면: Tab 에 'feedback' 추가 → 아래 목록에 { key: 'feedback', label: '의견 보내기' }
// → 화면 그리는 곳에 {tab === 'feedback' && <FeedbackPage />} (import 도 다시)
const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: '연습 공간' },
  { key: 'mine', label: '타임픽' },
  { key: 'songs', label: '곡' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('schedule')
  const [member, setMember] = useState<Member | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [sessionAttempt, setSessionAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchCurrentMember(controller.signal)
      .then((currentMember) => {
        if (controller.signal.aborted) return
        setMember(currentMember)
        setSessionStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionStatus('error')
      })
    return () => controller.abort()
  }, [sessionAttempt])

  function retrySession() {
    setSessionStatus('loading')
    setSessionAttempt((attempt) => attempt + 1)
  }

  return (
    <div className="app">
      <header className="top">
        <img src="/logo.png" alt="UCDC" className="top-logo" />
        <div className="top-title">
          <h1>Unizer</h1>
          <p>편하게 춤춰라 유디 !</p>
        </div>
        <button
          type="button"
          className={`login-entry${member ? ' is-member' : ''}`}
          aria-pressed={tab === 'account'}
          aria-label={member ? `마이페이지 (${member.name}님)` : undefined}
          onClick={() => setTab('account')}
        >
          {member ? (
            <>
              <PersonIcon />
              <span>{member.name}님</span>
            </>
          ) : (
            '로그인'
          )}
        </button>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* 연습 · 시간표는 로그인한 사람만 등록하고, 등록한 사람(과 관리자)만 고칠 수 있어요. */}
      {tab === 'schedule' && <SchedulePage member={member} onLogin={() => setTab('account')} />}
      {tab === 'songs' && <DataPage member={member} onLogin={() => setTab('account')} />}
      {/* 다른 부원으로 로그인하면 처음부터 다시 불러오게 key 로 구분 */}
      {tab === 'mine' && (
        <MyPracticePage
          key={member?.id ?? 'guest'}
          member={member}
          onLogin={() => setTab('account')}
          // 로그인이 풀렸으면(예전 쿠키 등) 로그아웃 상태로 바꾸고 로그인 화면으로
          onSessionExpired={() => {
            setMember(null)
            setTab('account')
          }}
        />
      )}
      {tab === 'account' && member && <MyPage member={member} onLogout={() => setMember(null)} />}
      {/* 로그인 화면은 다른 탭에 다녀와도 입력한 값이 남게 숨겨만 둬요. */}
      <LoginPage
        visible={tab === 'account' && !member}
        status={sessionStatus}
        onLogin={setMember}
        onRetry={retrySession}
      />
    </div>
  )
}
