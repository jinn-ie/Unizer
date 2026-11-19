import { useState } from 'react'
import type { CSSProperties } from 'react'
import { createRegularPractices } from '../api'
import { SPACES, spaceInfo } from '../lib/spaces'
import { formatMinutes, parseDateKey } from '../lib/date'
import { TimeRangeWheels } from './TimeRangeWheels'
import { Toast } from './Toast'

export interface Period {
  startsOn: string // "2026-11-02"
  endsOn: string // "2026-11-27"
}

interface Props {
  songId: number
  period: Period // 적용 기간 (다른 곡들의 정규연습과 같게)
  onSaved: () => void
  onCancel: () => void
}

// 월요일부터 (value 는 0=일 … 6=토)
const WEEKDAY_OPTIONS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
]

const MAX_END = 23 * 60 + 30 // 정규연습은 시각만 저장해서 24:00 은 없음

interface Row {
  key: number
  weekday: number
  start: number // 분
  end: number
  space: string
}

let nextKey = 1

/** "2026-11-02" → "11월 2일" */
function formatKey(key: string) {
  const d = parseDateKey(key)
  return d ? `${d.getMonth() + 1}월 ${d.getDate()}일` : key
}

// 곡의 정규연습 시간표 등록: 요일 | 시간 | 장소 줄을 1개 이상
export function TimetableForm({ songId, period, onSaved, onCancel }: Props) {
  const [rows, setRows] = useState<Row[]>(() => [
    { key: nextKey++, weekday: 1, start: 18 * 60, end: 20 * 60, space: SPACES[0].key },
  ])
  const [openKey, setOpenKey] = useState<number | null>(null) // 시간 휠이 펼쳐진 줄
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  const showError = (message: string) => setToast({ id: Date.now(), message })

  const update = (key: number, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)))

  // 마지막 줄의 시간·장소를 그대로 복사하고 요일만 다음 날로
  const addRow = () =>
    setRows((rs) => {
      const last = rs[rs.length - 1]
      return [...rs, { ...last, key: nextKey++, weekday: (last.weekday + 1) % 7 }]
    })

  const removeRow = (key: number) => {
    setRows((rs) => rs.filter((r) => r.key !== key))
    if (openKey === key) setOpenKey(null)
  }

  const submit = async () => {
    if (rows.some((r) => r.end <= r.start)) {
      showError('끝나는 시간은 시작 시간보다 늦어야 해요.')
      return
    }
    setSaving(true)
    try {
      await createRegularPractices(
        rows.map((r) => ({
          song_id: songId,
          title: null,
          weekday: r.weekday,
          start_time: `${formatMinutes(r.start)}:00`,
          end_time: `${formatMinutes(r.end)}:00`,
          space: r.space,
          starts_on: period.startsOn,
          ends_on: period.endsOn,
        })),
      )
      onSaved()
    } catch (err) {
      showError(err instanceof Error ? err.message : '등록하지 못했어요.')
      setSaving(false)
    }
  }

  return (
    <div className="tt-form">
      <ul className="tt-rows">
        {rows.map((r) => {
          const open = openKey === r.key
          return (
            <li key={r.key} className="tt-row">
              <div className="tt-line">
                <div className="tt-select">
                  <select
                    value={r.weekday}
                    onChange={(e) => update(r.key, { weekday: Number(e.target.value) })}
                    aria-label="요일"
                  >
                    {WEEKDAY_OPTIONS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className={`tt-time${open ? ' is-open' : ''}`}
                  onClick={() => setOpenKey(open ? null : r.key)}
                  aria-expanded={open}
                >
                  {formatMinutes(r.start)}–{formatMinutes(r.end)}
                </button>

                <div
                  className="tt-select tt-space"
                  style={{ '--c': spaceInfo(r.space).color } as CSSProperties}
                >
                  <select
                    value={r.space}
                    onChange={(e) => update(r.key, { space: e.target.value })}
                    aria-label="장소"
                  >
                    {SPACES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {rows.length > 1 && (
                  <button
                    type="button"
                    className="tt-remove"
                    onClick={() => removeRow(r.key)}
                    aria-label="이 줄 지우기"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {open && (
                <TimeRangeWheels
                  start={r.start}
                  end={r.end}
                  maxEnd={MAX_END}
                  onChange={(start, end) => update(r.key, { start, end })}
                />
              )}
            </li>
          )
        })}
      </ul>

      <button type="button" className="tt-add" onClick={addRow}>
        + 요일 추가
      </button>

      <p className="tt-period">
        적용 기간 · {formatKey(period.startsOn)} ~ {formatKey(period.endsOn)}
      </p>

      <div className="tt-actions">
        <button type="button" className="tt-cancel" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="tt-submit" onClick={submit} disabled={saving}>
          {saving ? '등록하는 중…' : `${rows.length}개 등록하기`}
        </button>
      </div>

      {toast && <Toast key={toast.id} message={toast.message} onDone={() => setToast(null)} />}
    </div>
  )
}
