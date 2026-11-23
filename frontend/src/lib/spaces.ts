// 공간 목록. 배열 순서 = 날짜 칸 안의 세로줄 순서(왼쪽 → 오른쪽)
// key 는 백엔드 Space Enum 의 값과 같아야 함
export interface SpaceInfo {
  key: string
  label: string
  color: string
}

export const SPACES: SpaceInfo[] = [
  { key: '동방', label: '동방', color: 'var(--red)' },
  { key: '바깥거울', label: '바깥거울', color: 'var(--yellow)' },
  { key: '대회의실1', label: '대회의실 1', color: 'var(--teal)' },
  { key: '대회의실2', label: '대회의실 2', color: 'var(--teal)' },
]

export const SPACE_INDEX = new Map(SPACES.map((s, i) => [s.key, i]))

export function spaceInfo(key: string): SpaceInfo {
  const i = SPACE_INDEX.get(key)
  return i === undefined ? { key, label: key, color: 'var(--gray)' } : SPACES[i]
}
