// 직원 소통 3종 (R3-4, 시안 r3-board 확정 2026-11-13) — 로그인한 직원 누구나 씀, 처리 · 답변은 대표 · 관리자(board.admin)
//   GET  /api/staff/board                 → { note, req(관리자 = 전체, 직원 = 본인), fb } + 대기 수
//   POST /api/staff/board                 { kind, body, dept, pin, rkind, ref }  새 글 (req · fb 는 관리자에게 알림)
//   POST /api/staff/board/:id             고치기 (쓴 사람 · 관리자, 요청은 대기일 때만)
//   POST /api/staff/board/:id/del         지우기 (쓴 사람 · 관리자, 숨김)
//   POST /api/staff/board/:id/answer      { status, answer } 처리 · 답변 (관리자) — 요청 처리완료면 요청한 직원에게 알림
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { DEPTS, REQ_KINDS, ST, ST0, cleanPost, sortPosts } from '../core/board.js';
import * as B from '../repo/board.js';
import { audit } from '../repo/audit.js';
import { notify } from '../notify/index.js';

const KO = { note: '상담참고 · 지시', req: '요청함', fb: '사용 불편사항' };
const cut = (t, n) => { t = String(t || '').replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

export async function staffBoard(req, env, url, u) {
  const db = env.DB, p = url.pathname, adm = can(u, 'board.admin'), who = { who: u.name, ip: ip(req), dev: device(req) };

  if (p === '/api/staff/board' && req.method === 'GET') {
    const rows = await B.listPosts(db);
    const by = k => sortPosts(k, rows.filter(r => r.kind === k && (k !== 'req' || adm || r.author === u.name)));
    return J({ ok: true, me: u.name, admin: adm, depts: DEPTS, reqKinds: REQ_KINDS, st: ST, note: by('note'), req: by('req'), fb: by('fb'),
      reqWait: rows.filter(r => r.kind === 'req' && r.status === '대기').length });
  }

  if (p === '/api/staff/board' && req.method === 'POST') {
    const b = await body(req) || {}, kind = b.kind, x = cleanPost(kind, b, true);
    if (x.err) return J({ ok: false, err: 'input', field: x.err }, 400);
    const o = Object.assign({ kind, author: u.name, status: ST0[kind] }, x);
    const id = await B.insertPost(db, o);
    if (kind === 'req') await notify(env, { kind: 'req', text: '[요청함] ' + o.rkind + (o.ref ? ' · ' + o.ref : '') + '\n' + cut(o.body, 200) + '\n— ' + u.name, dm: await B.admins(db), actor: u.name, path: 'board.html#req' });
    if (kind === 'fb') await notify(env, { kind: 'fb', text: '[사용 불편사항] ' + (o.rkind ? o.rkind + ' · ' : '') + cut(o.body, 200) + '\n— ' + u.name, dm: await B.admins(db), actor: u.name, path: 'board.html#fb' });
    return J({ ok: true, id });
  }

  const m = p.match(/^\/api\/staff\/board\/([0-9A-Z]{26})(\/del|\/answer)?$/);
  if (!m || req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const r = await B.getPost(db, m[1]);
  if (!r || (r.kind === 'req' && !adm && r.author !== u.name)) return J({ ok: false, err: 'notfound' }, 404);
  const mine = r.author === u.name, b = await body(req) || {};

  if (m[2] === '/answer') {
    if (!adm || r.kind === 'note') return J({ ok: false, err: 'perm' }, 403);
    const status = b.status || (r.kind === 'req' ? '처리완료' : r.status);
    if (!ST[r.kind].includes(status)) return J({ ok: false, err: 'input', field: 'status' }, 400);
    const answer = String(b.answer || '').trim().slice(0, 2000) || null;
    await B.answerPost(db, r.id, status, answer, u.name);
    if (r.kind === 'req' && status === '처리완료' && r.status !== '처리완료')
      await notify(env, { kind: 'req', text: '[요청 처리완료] ' + r.rkind + (r.ref ? ' · ' + r.ref : '') + '\n요청: ' + cut(r.body, 80) + (answer ? '\n결과: ' + cut(answer, 200) : '') + '\n— ' + u.name, dm: [r.author], actor: u.name, path: 'board.html#req' });
    await audit(db, Object.assign({ act: r.kind === 'req' ? '요청 처리' : '불편사항 답변', target: r.id, detail: r.status + ' → ' + status }, who));
    return J({ ok: true });
  }

  if (!mine && !adm) return J({ ok: false, err: 'perm', msg: '쓴 사람 · 관리자만 고칠 수 있습니다' }, 403);

  if (m[2] === '/del') {
    await B.hidePost(db, r.id, u.name);
    await audit(db, Object.assign({ act: KO[r.kind] + ' 지움', target: r.id, detail: (mine ? '' : r.author + ' 글 · ') + cut(r.body, 60) }, who));
    return J({ ok: true });
  }

  if (r.kind === 'req' && r.status !== '대기' && !adm) return J({ ok: false, err: 'done', msg: '처리된 요청은 고칠 수 없습니다 — 새 요청을 보내 주세요' }, 409);
  const x = cleanPost(r.kind, b, false);
  if (x.err) return J({ ok: false, err: 'input', field: x.err }, 400);
  if (Object.keys(x).length) await B.editPost(db, r.id, x);
  return J({ ok: true });
}
