// 게스트 댓글 가리기 (설계서 7.5) — 직원용 가림(mask.js)과 따로 둔다 (게스트 API는 mask.js 를 불러오지 않음)
// 연락처 · 메신저 아이디 · 메일 · 외부 링크를 *** 로. masked: 가린 곳이 있었나
const NUM = '0-9공영일이삼사오육칠팔구빵';
export function maskComment(t) {
  const s = String(t || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '***')
    .replace(/(https?:\/\/|www\.)\S+/gi, '***')
    .replace(/\b[\w-]+\.(com|net|org|kr|io|me|ly|gl|link|site|xyz|shop|kakao)\b\S*/gi, '***')
    .replace(/(카카오톡|카카오|카톡|오픈채팅|오픈톡|텔레그램|텔레|라인|아이디|(?<![A-Za-z])(?:kakao|katalk|telegram|line|id))\s*[:：]?\s*[A-Za-z0-9_.\-]{3,}/gi, '$1 ***')
    .replace(new RegExp('\\+?[' + NUM + '][' + NUM + '\\s.\\-()]{7,}[' + NUM + ']', 'g'), m => m.replace(new RegExp('[^' + NUM + ']', 'g'), '').length >= 9 ? '***' : m);
  return { text: s, masked: s !== String(t || '') };
}

// 게스트 표시 이름: 김하나 → 김*나
export const guestName = n => { n = String(n || '고객'); return n.length <= 1 ? n + '*' : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]; };
