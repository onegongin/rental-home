// 게스트용 API — 로그인 없이 누구나. 고객 · 소유자 · 임차인 자료를 읽는 함수는 import 하지 않는다 (설계서 7.2)
// 등록은 '새 행 추가'만, 응답은 '접수됨'만. 로봇 확인(Turnstile) + 같은 IP 10분 5건 + 같은 전화번호 하루 3건
import { J, body, ip } from '../lib/http.js';
import { sha256 } from '../auth/crypto.js';
import { hit } from '../repo/rate.js';
import { insertGuestCard, insertGuestListings } from '../repo/guest.js';
import { publicListings } from './listings.js';
import { verifyTurnstile } from './turnstile.js';
import { commentsApi, issueGuest } from './comments.js';
import { brokerApi } from './broker.js';
import { publicPopups, serveMedia } from '../popups/public.js';
import { notify, DEAL_KO, unitLabel } from '../notify/index.js';

const KINDS = ['buyer', 'seller', 'client', 'owner'];
const str = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const plain = (v, n) => { try { const s = JSON.stringify(v); return v && typeof v === 'object' && s.length <= n ? JSON.parse(s) : undefined; } catch (e) { return undefined; } };

// 화면이 보낸 등록 카드에서 허용한 칸만 골라 담는다. 틀리면 null
export function cleanLead(c) {
  if (!c || typeof c !== 'object') return null;
  const phone = String(c.phone || '').replace(/[^\d-]/g, ''), digits = phone.replace(/\D/g, '');
  const name = str(c.name, 30);
  if (!KINDS.includes(c.kind) || !name || !/^0\d{8,10}$/.test(digits)) return null;
  if (!c.consent || c.consent.req !== true) return null; // [필수] 수집·이용 동의
  const visit = str(c.visit, 40);
  const card = {
    id: /^g\d{10,16}$/.test(String(c.id || '')) ? c.id : 'g' + Date.now(),
    kind: c.kind, at: str(c.at, 30), unit: str(c.unit, 20), interest: str(c.interest, 200),
    name, phone, birth: str(c.birth, 20), ask: str(c.ask, 40) || undefined, adj: str(c.adj, 40) || undefined,
    trades: plain(c.trades, 3000), wants: Array.isArray(c.wants) ? c.wants.slice(0, 6).map(x => str(x, 10)) : undefined,
    text: str(c.text, 2000), visit: visit || undefined,
    writer: visit ? '게스트 방문예약' : '게스트 등록', guest: true, synced: true, agree: true,
    consent: { req: true, mkt: !!c.consent.mkt, third: !!c.consent.third, at: str(c.consent.at, 30) },
    tags: visit ? ['상담', '방문예약'] : ['상담'],
    want: plain(c.want, 3000) || null, gsb: plain(c.gsb, 2000)
  };
  return JSON.stringify(card).length <= 20000 ? card : null;
}

// 그룹방 알림 글 (원문 — 대표가 초대한 사람만 있는 방, 2026-11-02 결정). 담당이 없으니 개인 알림은 없음
const KIND_KO = { buyer: '분양권 매수', seller: '분양권 매도', client: '신규고객', owner: '소유자' };
export function leadNote(c) {
  const deals = c.trades && typeof c.trades === 'object' ? Object.keys(c.trades).filter(k => c.trades[k]).map(k => DEAL_KO[k] || k) : [];
  const sell = c.kind === 'owner' && deals.length;
  const head = c.visit ? '[방문예약]' : sell ? '[내 집 내놓기]' : '[관심등록]';
  const lines = [head + ' ' + (KIND_KO[c.kind] || c.kind) + ' · ' + c.name + ' · ' + c.phone];
  if (c.unit) lines.push(unitLabel(c.unit) + (sell ? ' · ' + deals.join(' · ') + ' 내놓기' : ''));
  if (c.visit) lines.push('방문 희망: ' + c.visit);
  if (c.interest) lines.push('관심: ' + c.interest.slice(0, 80));
  if (c.text) lines.push('문의: ' + c.text.slice(0, 120));
  return { kind: sell ? 'sell' : 'lead', text: lines.join('\n'), path: '?go=c:' + c.id };
}

export async function publicApi(req, env, url) {
  const db = env.DB, p = url.pathname;

  if (p === '/api/public/ping') return J({ ok: true });

  if (p === '/api/public/lead' && req.method === 'POST') {
    const b = await body(req);
    const card = b && cleanLead(b.card);
    if (!card) return J({ ok: false, err: 'input' }, 400);
    const who = ip(req);
    if (!(await verifyTurnstile(env, b.ts, who, url.host))) return J({ ok: false, err: 'robot' }, 403);
    if (!(await hit(db, 'lead-ip:' + who, 5, 10 * 60e3))) return J({ ok: false, err: 'rate' }, 429);
    if (!(await hit(db, 'lead-ph:' + await sha256(card.phone.replace(/\D/g, '')), 3, 86400e3))) return J({ ok: false, err: 'rate' }, 429);
    await insertGuestCard(db, card);
    await insertGuestListings(db, card); // R2: 내 집 내놓기 → 매물보드 '확인중'
    await notify(env, leadNote(card));
    const g = await issueGuest(req, db, card.name, card.id); // 댓글 쓰기용 게스트 출입증 (1년)
    return J({ ok: true }, 200, g.cookie ? [g.cookie] : []);
  }

  if (p === '/api/public/comments') return commentsApi(req, env, url);
  if (p === '/api/public/listings') return publicListings(req, env, url);
  if (p === '/api/public/broker') return brokerApi(req, env, url);   // 공개 매물 중개요청 (관심등록 없이)
  if (p === '/api/public/popups' && req.method === 'GET') return publicPopups(env);   // 켜진 공개 팝업 (그림 · 글만 · 첨부)
  if (p.startsWith('/api/public/media/') && req.method === 'GET') return serveMedia(env, p.slice(18), false);

  return J({ ok: false, err: 'notfound' }, 404);
}
