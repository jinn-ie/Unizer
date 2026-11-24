// 비밀번호는 숫자 4자리로 정해져 있어요. (백엔드 schemas.py 의 PasswordChangeIn 과 같게)
export const PIN_LENGTH = 4

/** 숫자가 아닌 글자는 지우고 4자리까지만 남겨요. (입력칸 onChange 에서 써요) */
export function onlyPin(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH)
}
