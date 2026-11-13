// ULID — 시간순으로 정렬되는 고유번호 (설계서 4.2: DB 자동번호 대신)
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function ulid(t = Date.now()) {
  let s = '';
  for (let i = 0; i < 10; i++) { s = B32[t % 32] + s; t = Math.floor(t / 32); }
  const r = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 16; i++) s += B32[r[i] % 32];
  return s;
}
