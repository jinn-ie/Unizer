import type { Member } from '../types'

// 누가 무엇을 고칠 수 있는지 (버튼을 보여줄지 정하는 용도)
// 진짜로 막는 건 백엔드예요. 여기서는 못 누를 버튼을 숨기기만 해요.

/** 관리자인가요? (지금은 42기 이서진만) */
export function isAdmin(member: Member | null): boolean {
  return !!member?.is_admin
}

/**
 * 이 연습 · 메모를 수정 · 삭제할 수 있나요?
 * - 등록한 본인이면 가능
 * - 관리자는 모두 가능 (등록자가 없는 예전 것 · 시간표로 만든 연습 포함)
 */
export function canChange(member: Member | null, item: { created_by?: number | null }): boolean {
  if (!member) return false
  if (isAdmin(member)) return true
  return item.created_by != null && item.created_by === member.id
}
