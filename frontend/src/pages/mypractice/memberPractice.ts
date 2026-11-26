import type { Member, Reservation } from '../../types'
import { parseLocal } from '../../lib/date'

// 타임픽이 쓰는 규칙: 이 연습이 이 부원의 연습인가?
// (나에게도, 팀 화면에서는 팀원 한 명 한 명에게도 똑같이 써요)

// ── 곡이 아닌 공통 일정 중 부원에게 해당하는 것 ──
const ALL_MEMBER_TITLES = ['의돌', '신돌'] // 전체 부원의 일정
const TWO_GEN_TITLES = ['돌리기', '기본기'] // 그 해의 두 기수만의 일정 (연도 - 1984기, 연도 - 1983기)

/** 공통 일정(title 로 잡힌 연습)이 이 기수의 부원에게 해당하는지 */
function isCommonScheduleFor(r: Reservation, gen: number): boolean {
  if (r.title === null) return false
  const title = r.title.trim()
  if (ALL_MEMBER_TITLES.includes(title)) return true
  if (TWO_GEN_TITLES.includes(title)) {
    // "당해 연도"는 그 연습이 있는 날짜의 연도 (2026년이면 42기 · 43기, 2027년이면 43기 · 44기)
    const year = parseLocal(r.start_at).getFullYear()
    return gen === year - 1984 || gen === year - 1983
  }
  return false // 사람 이름으로 된 일정 등 나머지는 일단 안 보여줌
}

/**
 * 이 연습이 이 부원의 연습인지
 * - 공통 일정: 그 부원의 기수에 해당하면
 * - 개인 보충: 함께하는 사람으로 고른 부원(리더 포함)만
 * - 단체 연습: 그 곡 멤버 모두
 * songIds = 이 부원이 멤버로 들어간 곡 번호들
 */
export function isMemberPractice(r: Reservation, member: Member, songIds: Set<number>): boolean {
  if (r.song_id === null) return isCommonScheduleFor(r, member.gen)
  if (r.personal) return (r.member_ids ?? []).includes(member.id)
  return songIds.has(r.song_id)
}
