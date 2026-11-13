// PIN 암호화 (PBKDF2 — 일부러 느린 계산식) · 무작위 토큰
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export const ITER = 100000; // Cloudflare Workers 가 허용하는 최대 반복 횟수
export const randomHex = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))); }

export async function pinHash(pin, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, k, 256));
}

// 글자 비교에 걸린 시간으로 답을 추측하지 못하게
export function same(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export const validPin = p => /^\d{4,6}$/.test(String(p || ''));
