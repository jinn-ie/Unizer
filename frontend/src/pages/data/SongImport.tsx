import { useMemo, useState } from 'react'
import { importSongs, previewSongImport } from '../../api'
import type { ImportSong, PreviewSong } from '../../types'
import { Toast } from '../../components/Toast'
import './SongImport.css'

interface Props {
  onImported: () => void // 등록 후 아래 부원/곡 목록 다시 불러오기
}

const PLACEHOLDER = `숨
이서진(L) 김도현 김민주 김희정 신원정 임도연 진제희

쌔끈해 + Yeah!
이서진(L) 강세훈 신원정 윤지희 칫수뛔이 송승면(43기) 이민지(43기)`

// 미리보기 곡 하나 + 사용자가 고른 것들
interface Draft {
  song: PreviewSong
  picks: Record<number, number> // 동명이인: 사람 순번 → 고른 부원 id
  same: boolean | null // 같은 제목 곡이 있을 때: true=같은 곡, false=다른 곡, null=아직 안 고름
}

type Status =
  | { kind: 'ok'; payload: ImportSong }
  | { kind: 'error'; reasons: string[] }
  | { kind: 'pending' } // 아직 물어볼 게 남음

function judge(d: Draft): Status {
  const { song, picks, same } = d
  if (song.existing.length > 0 && same === true) {
    return { kind: 'error', reasons: ['이미 있는 곡이에요. 등록하지 않아요.'] }
  }

  const reasons: string[] = []
  if (song.people.length === 0) reasons.push('멤버가 없어요.')
  const missing = song.people.filter((p) => p.candidates.length === 0).map((p) => p.name)
  if (missing.length) reasons.push(`부원을 찾을 수 없어요: ${missing.join(', ')}`)

  // 사람마다 부원 id 정하기 (후보 1명이면 그 사람, 동명이인이면 고른 사람)
  const ids = song.people.map((p, i) => (p.candidates.length === 1 ? p.candidates[0].id : picks[i]))
  const seen = new Set<number>()
  const dup = new Set<string>()
  ids.forEach((id, i) => {
    if (id === undefined) return
    if (seen.has(id)) dup.add(song.people[i].name)
    seen.add(id)
  })
  if (dup.size) reasons.push(`같은 부원이 두 번 있어요: ${[...dup].join(', ')}`)

  if (reasons.length) return { kind: 'error', reasons }
  if (ids.some((id) => id === undefined)) return { kind: 'pending' }
  if (song.existing.length > 0 && same === null) return { kind: 'pending' }

  return {
    kind: 'ok',
    payload: {
      title: song.title,
      members: song.people.map((p, i) => ({ member_id: ids[i] as number, leader: p.leader })),
    },
  }
}

// 내부 데이터 탭 맨 위: 곡 + 멤버 글자를 붙여넣어 한꺼번에 등록
export function SongImport({ onImported }: Props) {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string; kind: 'error' | 'success' } | null>(
    null,
  )

  const notify = (message: string, kind: 'error' | 'success' = 'error') =>
    setToast({ id: Date.now(), message, kind })

  const statuses = useMemo(() => drafts?.map(judge) ?? [], [drafts])
  const okSongs = statuses.flatMap((s) => (s.kind === 'ok' ? [s.payload] : []))
  const pending = statuses.filter((s) => s.kind === 'pending').length
  const excluded = statuses.filter((s) => s.kind === 'error').length

  const update = (i: number, change: Partial<Draft>) =>
    setDrafts((ds) => ds && ds.map((d, j) => (j === i ? { ...d, ...change } : d)))

  const check = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      const preview = await previewSongImport(text)
      if (preview.length === 0) notify('읽을 수 있는 곡이 없어요.')
      setDrafts(preview.map((song) => ({ song, picks: {}, same: null })))
    } catch (err) {
      notify(err instanceof Error ? err.message : '확인하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const register = async () => {
    if (okSongs.length === 0 || pending > 0) return
    setBusy(true)
    try {
      const created = await importSongs(okSongs)
      notify(`${created.length}곡을 등록했어요.`, 'success')
      setText('')
      setDrafts(null)
      onImported()
    } catch (err) {
      notify(err instanceof Error ? err.message : '등록하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="data-sec import">
      <h2>곡 등록</h2>
      <p className="import-hint">
        아래 양식과 같이, 엔트리 결과를 그대로 붙여 넣으세요.
      </p>

      <textarea
        className="import-text"
        value={text}
        placeholder={PLACEHOLDER}
        rows={6}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value)
          setDrafts(null) // 글자를 고치면 다시 확인해야 함
        }}
      />

      {!drafts && (
        <button type="button" className="import-btn" disabled={!text.trim() || busy} onClick={check}>
          {busy ? '확인하는 중…' : '확인하기'}
        </button>
      )}

      {drafts && (
        <>
          <ul className="import-list">
            {drafts.map((d, i) => {
              const st = statuses[i]
              return (
                <li key={i} className={`import-song is-${st.kind}`}>
                  <div className="import-title">
                    <strong>{d.song.title}</strong>
                    <span className="import-badge">
                      {st.kind === 'ok' ? '등록 가능' : st.kind === 'error' ? '제외' : '확인 필요'}
                    </span>
                  </div>

                  <ul className="name-list">
                    {d.song.people.map((p, pi) => {
                      const cls = [
                        p.leader ? 'is-leader' : '',
                        p.candidates.length === 0 ? 'is-missing' : '',
                      ].join(' ')
                      if (p.candidates.length <= 1) {
                        return (
                          <li key={pi} className={cls}>
                            {p.name}
                          </li>
                        )
                      }
                      // 동명이인: 기수 고르기
                      return (
                        <li key={pi} className={`${cls} is-choice`}>
                          {p.name}
                          {p.candidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={d.picks[pi] === c.id ? 'is-picked' : undefined}
                              onClick={() => update(i, { picks: { ...d.picks, [pi]: c.id } })}
                            >
                              {c.gen}기
                            </button>
                          ))}
                        </li>
                      )
                    })}
                  </ul>

                  {d.song.existing.length > 0 && (
                    <div className="import-dup">
                      <p>같은 제목의 곡이 이미 있어요</p>
                      {d.song.existing.map((e) => (
                        <div key={e.id} className="import-existing">
                          <strong>{e.title}</strong>
                          <span>
                            {e.members
                              .map((m) => `${m.name}${m.leader ? '(L)' : ''}`)
                              .join(' ') || '멤버 없음'}
                          </span>
                        </div>
                      ))}
                      <p className="import-ask">이 곡과 다른 곡인가요?</p>
                      <div className="import-answers">
                        <button
                          type="button"
                          className={d.same === true ? 'is-picked' : undefined}
                          onClick={() => update(i, { same: true })}
                        >
                          같은 곡이에요
                        </button>
                        <button
                          type="button"
                          className={d.same === false ? 'is-picked' : undefined}
                          onClick={() => update(i, { same: false })}
                        >
                          다른 곡이에요
                        </button>
                      </div>
                    </div>
                  )}

                  {st.kind === 'error' && (
                    <ul className="import-reasons">
                      {st.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            className="import-btn"
            disabled={okSongs.length === 0 || pending > 0 || busy}
            onClick={register}
          >
            {busy
              ? '등록하는 중…'
              : pending > 0
                ? `확인할 곡이 ${pending}곡 남았어요`
                : okSongs.length === 0
                  ? '등록할 수 있는 곡이 없어요'
                  : `${okSongs.length}곡 등록하기${excluded ? ` (${excluded}곡 제외)` : ''}`}
          </button>
        </>
      )}

      {toast && (
        <Toast key={toast.id} message={toast.message} kind={toast.kind} onDone={() => setToast(null)} />
      )}
    </section>
  )
}
