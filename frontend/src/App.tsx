import { useState } from 'react'
import { SchedulePage } from './components/SchedulePage'
import { DataPage } from './components/DataPage'

type Tab = 'schedule' | 'data'

export default function App() {
  const [tab, setTab] = useState<Tab>('schedule')

  return (
    <div className="app">
      <header className="top">
        <img src="/logo.png" alt="UCDC" className="top-logo" />
        <div className="top-title">
          <h1>연습실 예약</h1>
          <p>UCDC · since 1983</p>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedule'}
          className={`tab${tab === 'schedule' ? ' is-active' : ''}`}
          onClick={() => setTab('schedule')}
        >
          연습 공간
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'data'}
          className={`tab${tab === 'data' ? ' is-active' : ''}`}
          onClick={() => setTab('data')}
        >
          내부 데이터<small>(임시)</small>
        </button>
      </nav>

      {tab === 'schedule' ? <SchedulePage /> : <DataPage />}
    </div>
  )
}
