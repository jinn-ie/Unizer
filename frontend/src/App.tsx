import { useEffect, useState } from 'react'
import { fetchCurrentMember } from './api'
import type { Member } from './types'
import { LoginPage } from './pages/auth/LoginPage'
import { SchedulePage } from './pages/schedule/SchedulePage'
import { DataPage } from './pages/data/DataPage'
import { FeedbackPage } from './pages/feedback/FeedbackPage'

type Tab = 'schedule' | 'songs' | 'members' | 'feedback' | 'login'

const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: '연습 공간' },
  { key: 'songs', label: '곡' },
  { key: 'members', label: '부원' },
  { key: 'feedback', label: '의견 보내기' },
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
          className="login-entry"
          aria-pressed={tab === 'login'}
          onClick={() => setTab('login')}
        >
          {member ? '내 계정' : '로그인'}
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

      {tab === 'schedule' && <SchedulePage />}
      {(tab === 'songs' || tab === 'members') && <DataPage key={tab} view={tab} />}
      {tab === 'feedback' && <FeedbackPage />}
      <LoginPage
        visible={tab === 'login'}
        member={member}
        status={sessionStatus}
        onMemberChange={setMember}
        onRetry={retrySession}
      />
    </div>
  )
}
