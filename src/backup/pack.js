// 백업 파일 모양 (설계서 14장, P7) — 자동 · 수동 백업과 DB 이관이 같은 형식을 쓴다
//   속 내용: { format: 'hwip-backup', v: 1, at, tables: { 표이름: { cols: [...], rows: [[...], ...] } } }
//   저장할 때는 gzip(압축). 대표가 PC로 받는 파일은 여기에 비밀번호 잠금(AES-GCM)을 한 번 더 — 2026-11-03 대표 결정
//   잠긴 파일 = 'HWIPBK1\n' + salt 16바이트 + iv 12바이트 + 암호문
import { ITER } from '../auth/crypto.js';

export const FORMAT = 'hwip-backup';
export const MAGIC = 'HWIPBK1\n';
const enc = new TextEncoder(), dec = new TextDecoder();

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
export const gzip = s => pipe(enc.encode(s), new CompressionStream('gzip'));
export const gunzip = async b => dec.decode(await pipe(b, new DecompressionStream('gzip')));

async function keyOf(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function lock(bytes, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(pw, salt), bytes));
  const m = enc.encode(MAGIC), out = new Uint8Array(m.length + 28 + ct.length);
  out.set(m, 0); out.set(salt, m.length); out.set(iv, m.length + 16); out.set(ct, m.length + 28);
  return out;
}

const starts = (b, s) => { const m = enc.encode(s); return b.length >= m.length && m.every((x, i) => b[i] === x); };
export const isLocked = b => starts(b, MAGIC);

// 파일 바이트 → 백업 내용. 잠긴 파일은 비밀번호 필요. 틀리면 Error('pw' | 'nopw' | 'format')
export async function unpack(b, pw) {
  b = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (isLocked(b)) {
    if (!pw) throw new Error('nopw');
    const n = enc.encode(MAGIC).length;
    try { b = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(n + 16, n + 28) }, await keyOf(pw, b.slice(n, n + 16)), b.slice(n + 28))); }
    catch (e) { throw new Error('pw'); }
  }
  let text;
  try { text = b[0] === 0x1f && b[1] === 0x8b ? await gunzip(b) : dec.decode(b); } catch (e) { throw new Error('format'); }
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error('format'); }
  if (!o || o.format !== FORMAT || !o.tables || typeof o.tables !== 'object') throw new Error('format');
  return o;
}

// base64 ↔ 바이트 (화면에서 올린 파일을 JSON 으로 받을 때)
export function fromB64(s) {
  const bin = atob(String(s || '').replace(/^data:[^,]*,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
