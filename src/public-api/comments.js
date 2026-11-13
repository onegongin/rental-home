// 게스트 호실 댓글 (설계서 7.5) — 읽기는 누구나, 쓰기 · 고치기 · 지우기 · 신고는 관심등록한 게스트(출입증 쿠키)만
import { J, body, cookie, setCookie, ip } from '../lib/http.js';
import { randomHex, sha256 } from '../auth/crypto.js';
import { maskComment, guestName } from '../core/comment-mask.js';
import { hit } from '../repo/rate.js';
import { audit } from '../repo/audit.js';
import * as C from '../repo/comments.js';
import { verifyTurnstile } from './turnstile.js';
import { isPublic } from '../repo/public-listings.js';
import { notify, unitLabel } from '../notify/index.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

export const OFFICE = (SITE.office || {}).name || '';   // 직원 답글 표시 이름
export const GUEST_MS = 365 * 86400e3, DAY_MAX = 10, REPORT_HIDE = 3;
const GC = 'hwip_g';
// 'u:동-호' 호실 이야기 · 'l:매물번호' 공개 매물 댓글 (P4)
export const validTarget = t => typeof t === 'string' && /^(u:[\w가-힣]{1,8}-\d{1,5}|l:[0-9A-Z]{26})$/.test(t);

export async function currentGuest(req, db) {
  const t = cookie(req, GC);
  if (!t) return null;
  const g = await C.getGuest(db, await sha256(t));
  return g && g.exp > Date.now() ? g : null;
}

// 관심등록 성공 때: 출입증 발급 (이미 있으면 이름 · 기간만 새로)
export async function issueGuest(req, db, realName, card) {
  const name = guestName(realName), exp = Date.now() + GUEST_MS, g = await currentGuest(req, db);
  if (g) { await C.renewGuest(db, g.id, name, exp, card); return { name, cookie: null }; }
  const t = randomHex(32);
  await C.addGuest(db, 'g' + randomHex(8), await sha256(t), name, exp, card);
  return { name, cookie: setCookie(req, GC, t, GUEST_MS / 1000) };
}

export const hasBan = (text, words) => words.some(w => text.includes(w));

// 게스트에게 보여 줄 모양 — 작성자 id · IP · 직원 이름은 안 보냄
function shape(c, g) {
  const gone = !!c.del_at || c.status === 'hidden';
  return { id: c.id, pid: c.pid, office: !!c.staff, badge: c.staff ? '공인중개사' : '관심고객', name: c.staff ? OFFICE : c.name,
    text: gone ? '' : c.text, del: gone, masked: !gone && !!c.masked, broker: !gone && !!c.broker, bk: !gone && !!c.broker ? (c.bk_claim ? 'done' : 'new') : '', wait: c.status === 'wait',
    edited: !gone && !!c.edited, ts: new Date(c.at).toISOString(), mine: !!g && !c.staff && c.author === g.id };
}

export function visible(rows, g) {
  const seen = c => !c.del_at && (c.status === 'open' || (c.status === 'wait' && !!g && c.author === g.id));
  const kids = new Set(rows.filter(c => c.pid && seen(c)).map(c => c.pid));
  return rows.filter(c => seen(c) || (!c.pid && kids.has(c.id))).map(c => shape(c, g)); // 지운 글도 답글이 있으면 자리만 남김
}

export async function commentsApi(req, env, url) {
  const db = env.DB, g = await currentGuest(req, db);

  if (req.method === 'GET') {
    const t = url.searchParams.get('t');
    if (!validTarget(t)) return J({ ok: false, err: 'input' }, 400);
    return J({ ok: true, me: g && { name: g.name }, rows: visible(await C.listByTarget(db, t), g) });
  }
  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const b = await body(req) || {};
  if (!g) return J({ ok: false, err: 'guest' }, 401);
  const text = typeof b.text === 'string' ? b.text.trim() : '';

  if (b.op === 'add') {
    if (!validTarget(b.t) || !text || text.length > 500) return J({ ok: false, err: 'input' }, 400);
    if (b.t.startsWith('l:') && !(await isPublic(db, b.t.slice(2)))) return J({ ok: false, err: 'input' }, 400); // 공개 중인 매물에만
    if (b.pid) { const p = await C.getComment(db, String(b.pid)); if (!p || p.target !== b.t || p.pid || p.del_at) return J({ ok: false, err: 'input' }, 400); }
    const who = ip(req);
    if (!(await verifyTurnstile(env, b.ts, who, url.host))) return J({ ok: false, err: 'robot' }, 403);
    if (!(await hit(db, 'cmt-g:' + g.id, DAY_MAX, 86400e3)) || !(await hit(db, 'cmt-ip:' + who, DAY_MAX * 3, 86400e3))) return J({ ok: false, err: 'rate' }, 429);
    const m = maskComment(text), status = hasBan(m.text, await C.banWords(db)) ? 'wait' : 'open';
    const c = { id: 'm' + randomHex(8), target: b.t, pid: b.pid ? String(b.pid) : '', author: g.id, name: g.name, text: m.text, masked: m.masked, broker: !b.pid && !!b.broker, status, ip: who };
    await C.addComment(db, c);
    // 새 글은 그룹방으로 (대표 2026-11-04 A안: 답글을 빨리 달 수 있게) — 매물 댓글은 그 매물 창으로, 호실 이야기는 설정 › 댓글 관리로
    const lid = b.t.startsWith('l:') ? b.t.slice(2) : '';
    await notify(env, { kind: 'cmt', text: '[게스트 댓글' + (status === 'wait' ? ' · 승인 대기' : '') + (c.pid ? ' · 답글' : '') + '] ' + (lid ? '공개 매물 ' + lid.slice(-6) : unitLabel(b.t.slice(2))) + '\n' + g.name + ': ' + m.text.slice(0, 200), path: lid ? '?go=l:' + lid : '?go=cmt' });
    return J({ ok: true, item: shape(Object.assign({ at: Date.now() }, c), g) });
  }

  const c = await C.getComment(db, String(b.id || ''));
  if (!c || c.del_at) return J({ ok: false, err: 'nocmt' }, 404);

  if (b.op === 'edit' || b.op === 'del') {
    if (c.staff || c.author !== g.id) return J({ ok: false, err: 'perm' }, 403);
    if (b.op === 'del') { await C.deleteComment(db, c, '게스트 ' + g.name); return J({ ok: true }); }
    if (c.status === 'hidden') return J({ ok: false, err: 'hidden' }, 409);
    if (!text || text.length > 500) return J({ ok: false, err: 'input' }, 400);
    if (!(await hit(db, 'cmt-e:' + g.id, DAY_MAX * 3, 86400e3))) return J({ ok: false, err: 'rate' }, 429);
    const m = maskComment(text), status = hasBan(m.text, await C.banWords(db)) ? 'wait' : 'open';
    await C.editComment(db, c, '게스트 ' + g.name, m.text, m.masked, status);
    return J({ ok: true, item: shape(Object.assign({}, c, { text: m.text, masked: m.masked, status, edited: Date.now() }), g) });
  }

  if (b.op === 'report') {
    if (c.author === g.id) return J({ ok: false, err: 'self' }, 409);
    const r = await C.report(db, c.id, g.id);
    if (r.n >= REPORT_HIDE && c.status === 'open') {
      await C.setStatus(db, [c.id], 'hidden', 'auto');
      await audit(db, { who: '(자동)', act: '댓글 자동 숨김', target: c.target + ' ' + c.id, detail: '신고 ' + r.n + '건', ip: ip(req) });
    }
    return J({ ok: true });
  }

  return J({ ok: false, err: 'input' }, 400);
}
