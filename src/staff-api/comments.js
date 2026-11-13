// 직원용 게스트 댓글 — 답글(사무소 이름으로) · 관리(숨김 · 복구 · 승인 · 삭제, 감사기록) · 고친 기록 보기 (설계서 7.5 · 9.5)
import { J, body, ip, device } from '../lib/http.js';
import { randomHex } from '../auth/crypto.js';
import { can } from '../core/permissions.js';
import { maskComment } from '../core/comment-mask.js';
import { audit } from '../repo/audit.js';
import * as C from '../repo/comments.js';
import { OFFICE, validTarget } from '../public-api/comments.js';
import { ackText, ACK_KO } from '../core/comment-ack.js';
import { getOne, putRows } from '../repo/kv.js';
import { notify, unitLabel } from '../notify/index.js';

const shape = (c, mgr) => ({ id: c.id, target: c.target, pid: c.pid, office: !!c.staff, name: c.staff ? OFFICE : c.name, by: c.staff || '',
  text: c.text, masked: !!c.masked, broker: !!c.broker, bk: c.broker ? (c.bk_claim ? 'done' : 'new') : '', status: c.status, hideBy: c.hide_by || '', reports: c.reports || 0,
  edited: !!c.edited, del: !!c.del_at, ts: new Date(c.at).toISOString(), ip: mgr ? c.ip : undefined, ack: c.ack_by || '', auto: !!c.auto });

const ACT = { hide: ['hidden', '댓글 숨김'], restore: ['open', '댓글 복구'], approve: ['open', '댓글 승인'] };

export async function staffComments(req, env, url, u) {
  const db = env.DB, p = url.pathname, mgr = can(u, 'cmt.manage'), who = { who: u.name, ip: ip(req), dev: device(req) };

  if (req.method === 'GET') {
    if (p === '/api/staff/comments/hist') {
      if (!mgr) return J({ ok: false, err: 'perm' }, 403);
      return J({ ok: true, rows: await C.histOf(db, String(url.searchParams.get('id') || '')) });
    }
    const t = url.searchParams.get('t');
    if (t) {
      if (!validTarget(t)) return J({ ok: false, err: 'input' }, 400);
      return J({ ok: true, rows: (await C.listByTarget(db, t)).filter(c => !c.del_at || mgr).map(c => shape(c, mgr)) });
    }
    if (url.searchParams.get('view') === 'counts') return J({ ok: true, units: await C.unitCounts(db) });   // 동호배치표 칸 표시 — 직원 모두
    if (!mgr) return J({ ok: false, err: 'perm' }, 403);
    const rows = await C.listForAdmin(db, url.searchParams.get('view'), Number(url.searchParams.get('before')) || 0, url.searchParams.get('limit'));
    return J({ ok: true, rows: rows.map(c => shape(c, true)) });
  }
  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const b = await body(req) || {};
  const text = typeof b.text === 'string' ? b.text.trim() : '';

  // [확인] (시안 cmt-ack A안 확정 2026-11-04) — 답글 없이 확인만: 상황별 자동 답글(사무소 이름) · 승인 대기면 승인 ·
  //   관심등록 상담카드 담당이 비었으면 이 직원 · 알림 · 감사기록. 한 글에 한 번
  if (b.op === 'ack') {
    if (!can(u, 'cmt.reply')) return J({ ok: false, err: 'perm' }, 403);
    const c = await C.getComment(db, String(b.id || ''));
    if (!c || c.del_at || c.staff || c.pid || c.status === 'hidden') return J({ ok: false, err: 'input' }, 400);
    if (c.ack_by) return J({ ok: false, err: 'acked', by: c.ack_by }, 409);
    if (c.status === 'wait' && !mgr) return J({ ok: false, err: 'perm' }, 403);
    if (!(await C.markAck(db, c.id, u.name)).meta.changes) return J({ ok: false, err: 'acked' }, 409);   // 둘이 동시에 눌러도 한 번만
    if (c.status === 'wait') await C.setStatus(db, [c.id], 'open', u.name);
    const a = ackText(c, await getOne(db, 'cfg', 'cmtAck'));
    const r = { id: 'm' + randomHex(8), target: c.target, pid: c.id, staff: u.name, name: OFFICE, text: a.text, masked: false, status: 'open', ip: who.ip, auto: true };
    await C.addComment(db, r);
    const cid = c.author ? await C.guestCard(db, c.author) : '', card = cid ? await getOne(db, 'c', cid) : null, mgrSet = !!card && !card.mgr;
    if (mgrSet) await putRows(db, [{ s: 'c', k: cid, v: JSON.stringify(Object.assign({}, card, { mgr: u.name })), at: Date.now(), by: u.name }]);
    const where = c.target.startsWith('l:') ? '공개 매물 ' + c.target.slice(-6) : unitLabel(c.target.slice(2));
    await audit(db, Object.assign({ act: '댓글 확인', target: c.target + ' ' + c.id, detail: ACK_KO[a.kind] + (c.status === 'wait' ? ' · 승인' : '') + (mgrSet ? ' · 상담카드 담당' : '') }, who));
    await notify(env, { kind: 'cmt', text: '[댓글 확인] ' + where + ' · ' + c.name + ' → ' + u.name + (mgrSet ? '\n상담카드 담당: ' + u.name : '') + '\n자동 답글: ' + a.text, dm: mgrSet ? [u.name] : [], actor: u.name,
      path: mgrSet ? '?go=c:' + cid : c.target.startsWith('l:') ? '?go=l:' + c.target.slice(2) : '?go=cmt' });
    return J({ ok: true, kind: a.kind, mgr: mgrSet, item: shape(Object.assign({ at: Date.now() }, r), mgr) });
  }

  if (b.op === 'add') {
    if (!can(u, 'cmt.reply')) return J({ ok: false, err: 'perm' }, 403);
    if (!validTarget(b.t) || !text || text.length > 1000) return J({ ok: false, err: 'input' }, 400);
    if (b.pid) { const pc = await C.getComment(db, String(b.pid)); if (!pc || pc.target !== b.t || pc.pid) return J({ ok: false, err: 'input' }, 400); }
    const m = maskComment(text);
    const c = { id: 'm' + randomHex(8), target: b.t, pid: b.pid ? String(b.pid) : '', staff: u.name, name: OFFICE, text: m.text, masked: m.masked, status: 'open', ip: who.ip };
    await C.addComment(db, c);
    return J({ ok: true, item: shape(Object.assign({ at: Date.now() }, c), mgr) });
  }

  // 한 번에 여러 개: 숨김 · 복구 · 승인 · 삭제
  if (Array.isArray(b.ids)) {
    if (!mgr) return J({ ok: false, err: 'perm' }, 403);
    const ids = b.ids.map(String).slice(0, 200);
    if (!ids.length || !(ACT[b.op] || b.op === 'del')) return J({ ok: false, err: 'input' }, 400);
    const list = [];
    for (const id of ids) { const c = await C.getComment(db, id); if (c && !c.del_at) list.push(c); }
    if (b.op === 'del') for (const c of list) await C.deleteComment(db, c, u.name);
    else {
      await C.setStatus(db, list.map(c => c.id), ACT[b.op][0], ACT[b.op][0] === 'hidden' ? u.name : '');
      if (b.op === 'restore') await C.clearReports(db, list.map(c => c.id)); // 복구한 글은 신고 수를 0부터
    }
    for (const c of list) await audit(db, Object.assign({ act: b.op === 'del' ? '댓글 삭제' : ACT[b.op][1], target: c.target + ' ' + c.id, detail: (c.staff ? OFFICE : c.name) + ': ' + c.text.slice(0, 80) }, who));
    return J({ ok: true, n: list.length });
  }

  // 직원 본인 답글 고치기 · 지우기 (관리자는 남의 것도)
  const c = await C.getComment(db, String(b.id || ''));
  if (!c || c.del_at) return J({ ok: false, err: 'nocmt' }, 404);
  if (!(c.staff && (c.staff === u.name || mgr))) return J({ ok: false, err: 'perm' }, 403);
  if (b.op === 'del') { await C.deleteComment(db, c, u.name); return J({ ok: true }); }
  if (b.op === 'edit') {
    if (!text || text.length > 1000) return J({ ok: false, err: 'input' }, 400);
    const m = maskComment(text);
    await C.editComment(db, c, u.name, m.text, m.masked, c.status);
    return J({ ok: true });
  }
  return J({ ok: false, err: 'input' }, 400);
}
