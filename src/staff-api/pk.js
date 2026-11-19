// 상담 '사람 표시' pk (시안 r66 A안 확정 2026-11-19) — 상담카드를 직원 화면에 보낼 때 붙임
//   같은 연락처 = 같은 사람(p…), 연락처 없으면 이름(임차인 · 소유자 · 구분 없음은 호실 + 이름, n…)
//   비밀값(STAFF_KEY)으로 만든 암호 코드라 연락처가 가려진 화면에서도 같은 사람끼리 묶이지만 번호는 알 수 없음
//   화면이 돌려보낸 pk 는 저장하지 않음 (push 에서 뺌)
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export function personBase(v) {
  if (!v || typeof v !== 'object') return '';
  const d = String(v.phone || '').replace(/\D/g, '');
  if (d.length >= 9) return 'p|' + d;
  const nm = String(v.name || '').trim(); if (!nm) return '';
  const isU = v.kind === 'seller' || v.kind === 'owner' || !v.kind;
  return 'n|' + (isU && v.unit ? v.unit + '|' : '') + nm;
}

export async function pkSigner(env) {
  const key = await crypto.subtle.importKey('raw', enc.encode('pk|' + String((env && env.STAFF_KEY) || 'rental-home')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const memo = new Map();
  return async v => {
    const b = personBase(v); if (!b) return '';
    if (!memo.has(b)) memo.set(b, b[0] + hex(await crypto.subtle.sign('HMAC', key, enc.encode(b))).slice(0, 16));
    return memo.get(b);
  };
}

// view() 를 지난 줄(가린 줄일 수 있음)에 원래 자료로 만든 pk 를 붙임
export async function withPk(sign, raw, out) {
  if (!out || raw.s !== 'c') return out;
  let src, v; try { src = JSON.parse(raw.v); v = out.v === raw.v ? src : JSON.parse(out.v); } catch (e) { return out; }
  if (!v || typeof v !== 'object') return out;
  const pk = await sign(src); if (!pk) return out;
  return Object.assign({}, out, { v: JSON.stringify(Object.assign({}, v, { pk })) });
}
