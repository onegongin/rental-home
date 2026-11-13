// 직원용 중개요청 (2026-11-02, 시안 preview/broker-request 확정)
//   GET  /api/staff/broker        알림 목록 — 확인 전엔 이름 · 연락처 가림, 확인한 직원 · 대표/관리자/권한자만 원문
//   POST /api/staff/broker/claim  첫 확인 — 한 명만 기록(동시 클릭도 한 명) → 담당 · 매물 이력 · 감사기록 · 사무소 자동 답글
import { J, body, ip, device } from '../lib/http.js';
import { randomHex } from '../auth/crypto.js';
import { can } from '../core/permissions.js';
import { maskName, maskPhone } from '../core/mask.js';
import { audit } from '../repo/audit.js';
import * as C from '../repo/comments.js';
import { listBroker, getBroker, claimBroker } from '../repo/broker.js';
import { OFFICE } from '../public-api/comments.js';

export const BK_REPLY = '요청 확인했습니다. 담당 공인중개사가 연락드리겠습니다.';
const TOP = new Set(['대표', '관리자', '권한자']);

export function brokerView(u, r) {
  const raw = TOP.has(u.role) || r.claim_by === u.name;
  return { id: r.id, lid: r.listing_id, cid: r.cid, label: r.label, msg: r.msg, at: r.at, by: r.claim_by || '', byAt: r.claim_at || 0,
    name: raw ? r.name : maskName(r.name), phone: raw ? r.phone : maskPhone(r.phone), raw };
}

export async function staffBroker(req, env, url, u) {
  const db = env.DB, p = url.pathname;
  if (p === '/api/staff/broker' && req.method === 'GET') return J({ ok: true, rows: (await listBroker(db)).map(r => brokerView(u, r)) });

  if (p === '/api/staff/broker/claim' && req.method === 'POST') {
    if (!can(u, 'card.create')) return J({ ok: false, err: 'perm' }, 403);          // 열람은 못 맡음
    const b = await body(req) || {}, id = String(b.id || '');
    const r0 = await getBroker(db, id);
    if (!r0) return J({ ok: false, err: 'notfound' }, 404);
    if (!(await claimBroker(db, id, u.name))) { const r1 = await getBroker(db, id); return J({ ok: false, err: 'taken', by: r1.claim_by, byAt: r1.claim_at }, 409); }
    const r = await getBroker(db, id), when = new Date(r.claim_at + 9 * 3600e3).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
    await db.prepare('INSERT INTO listing_events (listing_id, at, who, act, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(r.listing_id, r.claim_at, u.name, '중개요청 확인', '첫 확인 · 신규 상담카드 작성 · 유입 사이트 · 손님 ' + maskName(r.name)).run();
    await audit(db, { who: u.name, act: '중개요청 확인', target: '매물 ' + r.listing_id, detail: u.name + ' 확인 · ' + when + ' · ' + r.label, ip: ip(req), dev: device(req) });
    await C.markClaimed(db, r.cid);
    await C.addComment(db, { id: 'm' + randomHex(8), target: 'l:' + r.listing_id, pid: r.cid, staff: u.name, name: OFFICE, text: BK_REPLY, masked: false, status: 'open', ip: ip(req) });
    return J({ ok: true, item: brokerView(u, r), when });
  }
  return J({ ok: false, err: 'notfound' }, 404);
}
