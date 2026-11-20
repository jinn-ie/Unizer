import { useState } from 'react'
import { SchedulePage } from './pages/schedule/SchedulePage'
import { DataPage } from './pages/data/DataPage'
import { FeedbackPage } from './pages/feedback/FeedbackPage'

type Tab = 'schedule' | 'songs' | 'members' | 'feedback'

const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: '연습 공간' },
  { key: 'songs', label: '곡' },
  { key: 'members', label: '부원' },
  { key: 'feedback', label: '의견 보내기' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('schedule')

  return (
    <div className="app">
      <header className="top">
        <img src="/logo.png" alt="UCDC" className="top-logo" />
        <div className="top-title">
          <h1>Unizer</h1>
          <p>편하게 춤춰라 유디 !</p>
        </div>
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
    </div>
  )
}
