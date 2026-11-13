// 공개 매물 [중개요청] — 관심등록 없이 성명 · 연락처 · 필수 동의만으로 접수 (2026-11-02 대표 확정)
//   그 매물 댓글('l:매물번호')에 '홍** · 매물 중개요청' 댓글을 달고, 직원 알림용 요청 줄을 남긴다. 연락처는 댓글에 안 나옴
import { J, body, ip } from '../lib/http.js';
import { randomHex, sha256 } from '../auth/crypto.js';
import { maskComment, guestName } from '../core/comment-mask.js';
import { hit } from '../repo/rate.js';
import * as C from '../repo/comments.js';
import { insertBroker } from '../repo/guest.js';
import { verifyTurnstile } from './turnstile.js';
import { currentGuest, hasBan } from './comments.js';
import { notify } from '../notify/index.js';

const DEAL = { sale: '매매', jeonse: '전세', wolse: '월세', short: '단기' };
const won = n => { n = Number(n) || 0; const e = Math.floor(n / 10000), m = n % 10000; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') || '0'; };
// 공개 사본 한 줄 → '매매 · 103동 중층 · 84B · 7억 2,000만'
export function brokerLabel(l) {
  const price = l.deal === 'sale' ? won(l.ask) : l.deal === 'jeonse' ? won(l.dep) : won(l.dep) + ' / ' + (Number(l.rent) || 0) + '만';
  return [DEAL[l.deal] || l.deal, l.label || (l.dong + '동'), l.type, price].filter(Boolean).join(' · ');
}

export async function brokerApi(req, env, url) {
  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const db = env.DB, b = await body(req) || {};
  const lid = String(b.lid || ''), name = typeof b.name === 'string' ? b.name.trim().slice(0, 30) : '';
  const phone = String(b.phone || '').replace(/[^\d-]/g, ''), digits = phone.replace(/\D/g, '');
  const msg = typeof b.msg === 'string' ? b.msg.trim().slice(0, 300) : '';
  if (!/^[0-9A-Z]{26}$/.test(lid) || !name || !/^0\d{8,10}$/.test(digits) || !b.consent || b.consent.req !== true) return J({ ok: false, err: 'input' }, 400);
  const l = await db.prepare('SELECT id, deal, dong, label, type, ask, dep, rent FROM public_listings WHERE id = ?').bind(lid).first();
  if (!l) return J({ ok: false, err: 'input' }, 400);                                   // 공개 중인 매물에만
  const who = ip(req);
  if (!(await verifyTurnstile(env, b.ts, who, url.host))) return J({ ok: false, err: 'robot' }, 403);
  const ph = await sha256(digits);
  if (!(await hit(db, 'bk-ip:' + who, 5, 10 * 60e3))) return J({ ok: false, err: 'rate' }, 429);
  if (!(await hit(db, 'bk-ph:' + ph, 3, 86400e3))) return J({ ok: false, err: 'rate' }, 429);
  if (!(await hit(db, 'bk-dup:' + lid + ':' + ph, 1, 30 * 86400e3))) return J({ ok: false, err: 'dup' }, 409);   // 같은 매물 같은 번호 1건
  const shown = guestName(name), g = await currentGuest(req, db), m = msg ? maskComment(msg) : { text: '', masked: false };
  const text = '이 매물 중개를 요청했습니다.' + (m.text ? '\n문의: ' + m.text : '');
  const status = m.text && hasBan(m.text, await C.banWords(db)) ? 'wait' : 'open';
  const cid = 'm' + randomHex(8);
  await C.addComment(db, { id: cid, target: 'l:' + lid, pid: '', author: g ? g.id : '', name: shown, text, masked: m.masked, broker: true, status, ip: who });
  await insertBroker(db, { id: 'b' + randomHex(8), listing_id: lid, cid, name, phone, msg, label: brokerLabel(l), ip: who, shown });
  // 그룹방 + 그 매물 담당 개인 알림 (담당 이름만 읽음 — 소유자 표는 안 읽음)
  const own = await db.prepare('SELECT mgr, writer FROM listings WHERE id = ?').bind(lid).first();
  await notify(env, { kind: 'broker', text: '[중개요청] ' + brokerLabel(l) + '\n손님 ' + name + ' · ' + phone + (msg ? '\n문의: ' + msg : '') + '\n먼저 [확인]한 직원이 담당합니다',
    dm: own ? [own.mgr || own.writer] : [], path: '?go=l:' + lid });
  return J({ ok: true, name: shown });
}
