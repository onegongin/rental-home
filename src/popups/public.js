// 팝업 — 손님 쪽 (켜진 공개 팝업 목록 · 파일 내려주기). 공개 API 가 불러오는 곳이라
// 설정(cfg) 줄만 직접 읽고, 상담카드가 든 kv 도우미(repo/kv)는 불러오지 않는다 (설계서 7.2)
import { J } from '../lib/http.js';

const cfgOf = async (db, k) => { const r = await db.prepare("SELECT v FROM kv WHERE s = 'cfg' AND k = ?").bind(k).first(); try { return r ? JSON.parse(r.v) : null; } catch (e) { return null; } };

// 받을 수 있는 종류만 (웹페이지 · 실행 파일 막음). 그림은 화면이 1000×1000 JPEG 로 줄여서 보냄
export const FILE_TYPES = {
  pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/hwp+zip', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', zip: 'application/zip'
};
export const MAX_FILE = 20 * 1024 * 1024, MAX_IMG = 3 * 1024 * 1024, MAX_FILES = 3, KEEP0 = 30;
export const extOf = n => (String(n || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export const keyOf = id => 'm/' + id;

// 팝업 한 개가 쓰는 파일 번호들
export const idsOf = p => [p && p.img && p.img.id].concat(((p && p.files) || []).map(f => f && f.id)).filter(x => typeof x === 'string' && /^[a-z0-9]{8,40}$/.test(x));
export const refsOf = pops => new Set((Array.isArray(pops) ? pops : []).flatMap(idsOf));
export const isOn = (p, td = kstDay()) => !!(p && p.on) && (!p.from || td >= p.from) && (!p.to || td <= p.to);
const safeLink = l => { const s = String(l || '').trim(); return /^https?:\/\//i.test(s) || /^\/(?!\/)/.test(s) ? s.slice(0, 500) : ''; };

// 손님에게 보낼 공개 팝업 (관리용 이름은 안 보냄)
export async function publicPopups(env) {
  const pops = (await cfgOf(env.DB, 'popups')) || [], td = kstDay();
  const list = (Array.isArray(pops) ? pops : []).filter(p => p && p.aud === 'guest' && isOn(p, td)).map(p => out(p, 'public'));
  return J({ ok: true, list });
}
export function out(p, side) {
  const u = id => '/api/' + side + '/media/' + id;
  const kind = p.kind === 'img' || (p.img && p.img.id) ? 'img' : 'text';
  return {
    id: String(p.id), kind, head: String(p.head || (kind === 'text' ? p.title || '' : '')).slice(0, 200), body: String(p.body || '').slice(0, 4000), color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#c8381e',
    btn: String(p.btn || '').slice(0, 40), link: safeLink(p.link), img: kind === 'img' && p.img && p.img.id ? u(p.img.id) : '',
    files: ((p.files) || []).filter(f => f && f.id).slice(0, MAX_FILES).map(f => ({ name: String(f.name || '첨부파일').slice(0, 200), size: Number(f.size) || 0, url: u(f.id) }))
  };
}

// 파일 내려주기. staff: 로그인한 직원 (모든 팝업) · 아니면 켜진 공개 팝업에 쓰인 파일만
export async function serveMedia(env, id, staff) {
  if (!env.MEDIA || !/^[a-z0-9]{8,40}$/.test(id)) return J({ ok: false, err: 'notfound' }, 404);
  const m = await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  if (!m) return J({ ok: false, err: 'notfound' }, 404);
  if (!staff) {
    const pops = (await cfgOf(env.DB, 'popups')) || [], td = kstDay();
    if (!(Array.isArray(pops) ? pops : []).some(p => p && p.aud === 'guest' && isOn(p, td) && idsOf(p).includes(id))) return J({ ok: false, err: 'notfound' }, 404);
  }
  const o = await env.MEDIA.get(keyOf(id));
  if (!o) return J({ ok: false, err: 'notfound' }, 404);
  const ext = extOf(m.name), type = m.kind === 'img' ? 'image/jpeg' : FILE_TYPES[ext] || 'application/octet-stream';
  const h = new Headers({ 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=60', 'content-security-policy': "default-src 'none'; sandbox" });
  if (m.kind !== 'img') {
    h.set('content-disposition', "attachment; filename=\"" + String(m.name).replace(/[^\x20-\x7e]|["\\]/g, '_') + "\"; filename*=UTF-8''" + encodeURIComponent(m.name));
    env.ctx.waitUntil(env.DB.prepare('UPDATE media SET dl = dl + 1 WHERE id = ?').bind(id).run());
  }
  return new Response(o.body, { headers: h });
}
