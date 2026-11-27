import { useEffect, useMemo, useState } from 'react'
import { ACTIVITY_PAGE, fetchActivity, fetchMembers, HttpError } from '../../api'
import type { Activity, Member } from '../../types'
import { formatDayTitle, formatTime, parseLocal, toDateKey } from '../../lib/date'
import './AdminPage.css'

// '관리' 탭 (관리자에게만 보여요): 모든 부원의 활동 기록을 최근 것부터 모아 봐요.
// 위에서부터: 분류 칩 · 부원 고르기 → 날짜별 기록 → 더 보기
// 진짜로 막는 건 백엔드예요. (관리자가 아니면 서버가 403)

// 분류 칩 (백엔드 ActivityLog.kind 와 같은 글자). '' = 전체
const KINDS = ['', '로그인', '연습', '메모', '시간표', '곡', '공연', '타임픽']

/** 한 일에 따라 배지 색: 등록 = 초록, 수정 = 노랑, 삭제 · 로그인 실패 = 빨강, 나머지 = 회색 */
function actionTone(action: string): string {
  if (action === '등록') return 'is-add'
  if (action === '수정') return 'is-edit'
  if (action === '삭제' || action === '로그인 실패') return 'is-danger'
  return ''
}

/** 배지 글자: "연습 등록", "공연 삭제" … 로그인 분류는 한 일만 ("로그인 실패", "비밀번호 변경") */
function badgeText(a: Activity): string {
  return a.kind === '로그인' ? a.action : `${a.kind} ${a.action}`
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Activity[]; hasMore: boolean }

export function AdminPage() {
  const [kind, setKind] = useState('') // 고른 분류 ('' = 전체)
  const [memberId, setMemberId] = useState<number | undefined>(undefined) // 고른 부원 (없으면 전체)
  const [members, setMembers] = useState<Member[]>([])
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)

  // 부원 고르기 목록 (실패해도 기록은 볼 수 있게 빈 목록으로)
  useEffect(() => {
    const controller = new AbortController()
    fetchMembers(controller.signal)
      .then(setMembers)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // 분류 · 부원을 바꾸거나 다시 시도하면: 먼저 '불러오는 중'으로 바꾸고 → 아래 effect 가 첫 쪽부터 불러와요
  const startLoading = () => {
    setLoad({ status: 'loading' })
    setMoreError(false)
  }
  const changeKind = (k: string) => {
    if (k === kind) return
    startLoading()
    setKind(k)
  }
  const changeMember = (id: number | undefined) => {
    startLoading()
    setMemberId(id)
  }
  const retry = () => {
    startLoading()
    setReloadKey((n) => n + 1)
  }

  // 분류 · 부원이 바뀌면 첫 쪽부터 다시
  useEffect(() => {
    const controller = new AbortController()
    fetchActivity({ kind: kind || undefined, memberId }, controller.signal)
      .then((items) => setLoad({ status: 'ready', items, hasMore: items.length === ACTIVITY_PAGE }))
      .catch((err) => {
        if (controller.signal.aborted) return
        const message =
          err instanceof HttpError && err.status === 403
            ? '관리자만 볼 수 있어요.'
            : err instanceof HttpError && err.status === 401
              ? '로그인이 풀렸어요. 다시 로그인해 주세요.'
              : '활동 기록을 불러오지 못했어요.'
        setLoad({ status: 'error', message })
      })
    return () => controller.abort()
  }, [kind, memberId, reloadKey])

  // 더 보기: 지금 받은 것 중 가장 오래된 기록보다 앞의 것
  const loadMore = async () => {
    if (load.status !== 'ready' || loadingMore) return
    setLoadingMore(true)
    setMoreError(false)
    try {
      const last = load.items[load.items.length - 1]
      const more = await fetchActivity({ kind: kind || undefined, memberId, beforeId: last.id })
      setLoad({ status: 'ready', items: [...load.items, ...more], hasMore: more.length === ACTIVITY_PAGE })
    } catch {
      setMoreError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  // 날짜별로 묶기 (최근 날짜가 위)
  const groups = useMemo(() => {
    if (load.status !== 'ready') return []
    const list: { key: string; day: Date; items: Activity[] }[] = []
    for (const a of load.items) {
      const when = parseLocal(a.created_at)
      const key = toDateKey(when)
      const last = list[list.length - 1]
      if (last && last.key === key) last.items.push(a)
      else list.push({ key, day: when, items: [a] })
    }
    return list
  }, [load])

  return (
    <main className="data admin">
      <header className="admin-head">
        <h2>활동 기록</h2>
        <p>최근 것부터 보여요. 기록은 이 기능을 배포한 뒤부터 쌓여요.</p>
      </header>

      {/* 분류 칩: 가로로 밀어서 더 보기 */}
      <div className="admin-kinds" role="tablist" aria-label="분류">
        {KINDS.map((k) => (
          <button
            key={k || 'all'}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`admin-kind${kind === k ? ' is-active' : ''}`}
            onClick={() => changeKind(k)}
          >
            {k || '전체'}
          </button>
        ))}
      </div>

      <select
        className="admin-member"
        value={memberId ?? ''}
        onChange={(e) => changeMember(e.target.value ? Number(e.target.value) : undefined)}
        aria-label="부원 고르기"
      >
        <option value="">모든 부원</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.gen}기 {m.name}
          </option>
        ))}
      </select>

      {load.status === 'loading' && <p className="admin-empty">불러오는 중…</p>}

      {load.status === 'error' && (
        <div className="error-card">
          <strong>{load.message}</strong>
          <button type="button" className="retry-btn" onClick={retry}>
            다시 시도
          </button>
        </div>
      )}

      {load.status === 'ready' && load.items.length === 0 && (
        <p className="admin-empty">아직 기록이 없어요.</p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="admin-day">
          <h3>{formatDayTitle(g.day)}</h3>
          <ul className="admin-list">
            {g.items.map((a) => (
              <li key={a.id} className="admin-item">
                <time className="admin-time" dateTime={a.created_at}>
                  {formatTime(parseLocal(a.created_at))}
                </time>
                <div className="admin-body">
                  <div className="admin-line">
                    <strong className={a.member_name ? undefined : 'is-guest'}>
                      {a.member_name ?? '비로그인'}
                    </strong>
                    <span className={`admin-badge ${actionTone(a.action)}`}>{badgeText(a)}</span>
                  </div>
                  {a.summary && <p className="admin-summary">{a.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {load.status === 'ready' && load.hasMore && (
        <button type="button" className="admin-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? '불러오는 중…' : moreError ? '다시 시도' : '더 보기'}
        </button>
      )}
    </main>
  )
}
