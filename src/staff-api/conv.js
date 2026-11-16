// 세대 전환 상태 · 공개 세대 고르기 (R2, 시안 r2-public-pick 확정 2026-11-13) — 직원용
//   GET  /api/staff/conv               → 300세대 상태 · 퇴거일 · 메모 · 공개 여부 + 내 권한
//   POST /api/staff/conv/101-1502      { status, move_out, memo }  (세대 고치기 권한) — 공개 불가 상태가 되면 공개 자동 내림
//   POST /api/staff/conv/101-1502/pub  { on }                       (대표 · 관리자 · 권한자)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { CONV, PUB_KIND, KIND_KO, cleanConv } from '../core/conv.js';
import { UNIT } from '../core/units.js';
import { listConv, getConv, setConv, setPub, listVacancy, putPubListing, dropPubListing, pubEligible } from '../repo/conv.js';
import { band, TOP, areaOf } from '../core/listings.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };
import { DEALS, DEAL_KO } from '../core/conv.js';
import { priceOf } from '../core/price.js';
import { getOne } from '../repo/kv.js';
import { audit } from '../repo/audit.js';

// 신규분양 공개 매물 한 줄 (공개 칸만): 동 · 층구간 · 타입 · 면적 · 매입보장가(만원) · 입주 시기 · 방/욕실 · 사무소 연락처
async function saleRow(db, id) {
  const un = UNIT[id], pr = priceOf(id) || {}, e = (await pubEligible(db, id)) || {}, T = (SITE.types || {})[un.type] || {}, ar = areaOf(un), o = SITE.office || {}, bd = band(un.floor, TOP[un.dong]);
  return { deal: 'sale', dong: un.dong, block: un.block || '', label: un.dong + '동 ' + bd, band: bd, type: un.type, kind: '아파트', exclusive: ar.exclusive, supply: ar.supply,
    ask: pr.hedge ? Math.round(pr.hedge / 1e4) : null, move: e.kind === 'vac' ? '즉시 입주' : '입주일 협의', facing: '라인별 상이', basis: '상담 시 안내', rooms: T.rooms || null, baths: T.baths || null,
    approval: '상담 시 안내', parking: '상담 시 안내', urgent: 0, badge: '신규분양 · 3년 뒤 분양가 매입보장(헷지했지)', contact: o.name || '', tel: o.tel || '' };
}

export async function staffConv(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };
  const perms = await getOne(db, 'cfg', 'perms');

  if (p === '/api/staff/conv' && req.method === 'GET') {
    const { conv, pub } = await listConv(db);
    return J({ ok: true, statuses: CONV, pubKinds: PUB_KIND, kindKo: KIND_KO, canEdit: can(u, 'conv.edit', null, perms), canPub: can(u, 'unit.publish'), conv, pub });
  }

  // 공실 · 신규분양 목록 (시안 r46 확정 2026-11-17) — 계약조건 빈칸 · 현재 임대차 있는 세대: 만기 · 공실 여부 · 공개 거래 구분 · 분양가
  if (p === '/api/staff/conv/vacancy' && req.method === 'GET') {
    const rows = (await listVacancy(db)).filter(r => UNIT[r.id]).map(r => { const u = UNIT[r.id], pr = priceOf(r.id) || {}; return Object.assign(r, { dong: u.dong, floor: u.floor, line: u.line, type: u.type, hedge: pr.hedge || 0, benefit: pr.benefit || 0 }); });
    return J({ ok: true, rows, deals: DEALS, dealKo: DEAL_KO, canPub: can(u, 'unit.publish') });
  }

  let m = p.match(/^\/api\/staff\/conv\/(\d+-\d+)$/);
  if (m && req.method === 'POST') {
    if (!UNIT[m[1]]) return J({ ok: false, err: 'notfound' }, 404);
    if (!can(u, 'conv.edit', null, perms)) return J({ ok: false, err: 'perm' }, 403);
    const v = cleanConv(await body(req));
    if (!v) return J({ ok: false, err: 'input' }, 400);
    const old = await getConv(db, m[1]);
    const off = await setConv(db, m[1], v, u.name);
    if (!old || old.status !== v.status || old.move_out !== v.move_out)
      await audit(db, Object.assign({ act: '전환 상태', target: '세대 ' + m[1], detail: ((old && old.status) || '미정') + ' → ' + (v.status || '미정') + (v.move_out ? ' · 퇴거 ' + v.move_out : '') + (off ? ' · 공개 자동 내림' : '') }, who));
    return J({ ok: true, unpublished: off });
  }

  m = p.match(/^\/api\/staff\/conv\/(\d+-\d+)\/pub$/);
  if (m && req.method === 'POST') {
    if (!UNIT[m[1]]) return J({ ok: false, err: 'notfound' }, 404);
    if (!can(u, 'unit.publish')) return J({ ok: false, err: 'perm' }, 403);
    const b = (await body(req)) || {}, on = !!b.on;
    const r = await setPub(db, m[1], on, u.name, Date.now(), b.deal);
    if (r === 'status') return J({ ok: false, err: 'status', msg: '신규분양 대상(계약조건 빈칸 · 임대차 있음) 또는 공실 · 퇴거확정(매물동의) 세대만 공개할 수 있습니다' }, 409);
    // 신규분양(매매 · 둘 다)이면 손님 '현재 매물'에 매입보장가로 (시안 r47 확정 2026-11-17, 대표 결정: 신규분양 공개 세대는 매입보장가 공개 — 혜택가 · 보증금은 비공개)
    if (on && (b.deal === '매매' || b.deal === '둘 다')) await putPubListing(db, m[1], await saleRow(db, m[1]));
    else await dropPubListing(db, m[1]);
    await audit(db, Object.assign({ act: on ? '세대 공개' : '세대 공개 내림', target: '세대 ' + m[1], detail: on ? DEAL_KO[b.deal] || '신규분양' : '' }, who));
    return J({ ok: true });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
