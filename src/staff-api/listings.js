// 매물보드 API (설계서 9.3 · 10장, P4) — 직원용. 소유자 이름 · 번호는 권한(listing.raw) 없으면 서버에서 가림
//   GET  /api/staff/listings               보드 (진행 중 + 끝난 것 최근 60일)
//   GET  /api/staff/listings/:id           상세 · 이력 · 공유 · 빠진 항목 · 공개 화면 미리보기
//   PATCH /api/staff/listings/:id          공개 항목 (가격 · 입주 · 관리비 · 향 …)
//   POST /api/staff/listings/:id/status    상태 (보드에서 끌어 놓기). 잔금완료는 상담카드에서
//   POST /api/staff/listings/:id/publish   op: request 요청(직원) · cancel · approve 승인/켜기 · reject 반려 · off 끄기
//   POST /api/staff/listings/:id/assign    담당 바꾸기 (이전 담당은 '보기' 공유로)
//   POST /api/staff/listings/:id/grants    공유 (view · edit · null=해제, 만료일)
import { J, body, ip, device } from '../lib/http.js';
import { can, ROLES } from '../core/permissions.js';
import { maskName, maskPhone } from '../core/mask.js';
import { ST, OFF, PUB_OK, DEALS, FACING, BASIS, MGMT, MGMT_NA, missing, pubAfter, label, contactOf, pubMemo } from '../core/listings.js';
import { UNIT } from '../core/units.js';
import * as LR from '../repo/listings.js';
import { audit } from '../repo/audit.js';
import { notify, listingLine } from '../notify/index.js';
import { matchNote, adsDown } from './ads.js';
import { seoPing } from '../seo/index.js';

const EDIT = ['ask', 'adj', 'dep', 'rent', 'term', 'move', 'mgmt', 'mgmt_na', 'mgmt_items', 'facing', 'basis', 'facing_auto', 'urgent', 'memo', 'memo_pub', 'opt_show', 'done_hide'];
const items = v => { try { return JSON.parse(v || '[]'); } catch (e) { return []; } };

// 한 매물을 이 직원에게 보여 줄 모양
function shape(u, l, owner, grant, cfg) {
  const it = Object.assign({}, l, { grant });
  const raw = can(u, 'listing.raw', it), unit = UNIT[l.unit_id] || {};
  const o = owner || { name: '', phone: '' };
  return {
    id: l.id, ver: l.ver, unit_id: l.unit_id, dong: unit.dong, ho: unit.ho, type: unit.type, block: unit.block, deal: l.deal, status: l.status,
    pub: l.pub, req_by: l.req_by, source: l.source, writer: l.writer, mgr: l.mgr, ask: l.ask, adj: l.adj, dep: l.dep, rent: l.rent, term: l.term,
    move: l.move, mgmt: l.mgmt, mgmt_na: !!l.mgmt_na, mgmt_items: items(l.mgmt_items), facing: l.facing, basis: l.basis, facing_auto: !!l.facing_auto, urgent: !!l.urgent, memo: raw ? l.memo : '', memo_pub: l.memo_pub || '', opt_show: l.opt_show !== 0, done_hide: !!l.done_hide, at: l.at,
    owner: raw ? o : { name: maskName(o.name), phone: maskPhone(o.phone), masked: true },
    can: { edit: can(u, 'listing.edit', it), request: can(u, 'listing.request', it), publish: can(u, 'listing.publish', it), share: can(u, 'listing.share', it) },
    missing: missing(l, cfg)
  };
}

const int = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[,\s]/g, '')); return Number.isInteger(n) && n >= 0 && n <= 10000000 ? n : undefined; };

export async function staffListings(req, env, url, u) {
  const db = env.DB, p = url.pathname, log = (act, target, detail) => audit(db, { who: u.name, act, target, detail, ip: ip(req), dev: device(req) });

  if (p === '/api/staff/listings' && req.method === 'GET') {
    const [rows, cfg, grants] = await Promise.all([LR.boardRows(db), LR.loadCfg(db), LR.myGrants(db, u.name)]);
    const owners = await LR.ownersOf(db, rows.map(r => r.unit_id));
    return J({ ok: true, st: ST, deals: DEALS, rows: rows.map(l => shape(u, l, owners[l.unit_id], grants[l.id], cfg)) });
  }

  const m = p.match(/^\/api\/staff\/listings\/([0-9A-Z]{26})(?:\/(status|publish|assign|grants))?$/);
  if (!m) return J({ ok: false, err: 'notfound' }, 404);
  const id = m[1], op = m[2];
  const cur = await LR.getListing(db, id);
  if (!cur) return J({ ok: false, err: 'notfound' }, 404);
  const grant = await LR.grantOf(db, id, u.name), it = Object.assign({}, cur, { grant }), cfg = await LR.loadCfg(db);
  // 알림 (P5): n = { kind, head, extra, dm }. 공개 중이던 매물이 꺼졌으면 따로 말하지 않아도 '자동 비공개' 알림
  const owner = cur.mgr || cur.writer;
  const say = (r, kind, head, more, dm) => notify(env, { kind, text: head + ' ' + listingLine(r.row) + (more ? '\n' + more : '') + '\n— ' + u.name, dm, actor: u.name, path: '?go=l:' + id });
  const done = async (r, extra, n) => {
    // 공개된 순간: 조건 맞는 고객 수를 알림에 붙임 (P6 매칭 광고)
    if (r.ok && n && cur.pub !== 'on' && r.row.pub === 'on') { const mt = await matchNote(db, r.row); if (mt) n.extra = (n.extra ? n.extra + '\n' : '') + mt; }
    if (r.ok && n) await say(r, n.kind, n.head, n.extra, n.dm || [owner]);
    if (r.ok && cur.pub === 'on' && r.row.pub !== 'on' && !(n && n.kind === 'pub')) await say(r, 'pub', '[자동 비공개]', r.row.status !== cur.status ? r.row.status : '필수 항목 부족', [owner]);
    // 공개가 꺼지거나 거래가 끝나면 게시 중인 외부 광고 내리기 알림 (설계서 10.3-3)
    if (r.ok && r.row.pub !== 'on' && (cur.pub === 'on' || (OFF.includes(r.row.status) && !OFF.includes(cur.status)))) await adsDown(env, r.row, u.name);
    // 공개 사본이 생기거나 바뀌거나 사라지면 검색엔진에 알림 (IndexNow, 키가 있을 때만)
    if (r.ok && (cur.pub === 'on' || r.row.pub === 'on')) await seoPing(env, [r.row], r.row.pub === 'on' ? (cur.pub === 'on' ? '수정' : '공개') : '비공개');
    return send(r, extra);
  };
  const send = (r, extra) => r.ok ? J(Object.assign({ ok: true, ver: r.row.ver, pub: r.row.pub, status: r.row.status }, extra)) : J({ ok: false, err: 'ver', msg: '다른 직원이 방금 이 매물을 바꿨습니다. 새로 불러온 뒤 다시 하세요.' }, 409);

  if (!op && req.method === 'GET') {
    const [owners, grants, events, staffRow] = await Promise.all([LR.ownersOf(db, [cur.unit_id]), LR.grantsOf(db, id), LR.eventsOf(db, id), LR.staffRow(db, cur.mgr || cur.writer)]);
    const unit = UNIT[cur.unit_id];
    return J({ ok: true, listing: shape(u, cur, owners[cur.unit_id], grant, cfg), grants, events,
      preview: unit ? Object.assign({ label: label(unit) + ' ' + unit.type }, contactOf(cur, staffRow)) : null,
      lists: { facing: FACING, basis: BASIS, mgmt: MGMT, mgmtNa: MGMT_NA } });
  }

  const b = await body(req) || {};
  if (req.method !== 'POST' && !(req.method === 'PATCH' && !op)) return J({ ok: false, err: 'notfound' }, 404);

  // 공개 항목 고치기
  if (!op) {
    if (!can(u, 'listing.edit', it)) return J({ ok: false, err: 'perm' }, 403);
    const patch = {};
    for (const k of EDIT) {
      if (!(k in b)) continue;
      let v = b[k];
      if (['ask', 'adj', 'dep', 'rent', 'mgmt'].includes(k)) { v = int(v); if (v === undefined) return J({ ok: false, err: 'input', field: k }, 400); }
      else if (k === 'facing') { if (v && !FACING.includes(v)) return J({ ok: false, err: 'input', field: k }, 400); v = v || null; }
      else if (k === 'basis') { if (v && !BASIS.includes(v)) return J({ ok: false, err: 'input', field: k }, 400); v = v || null; }
      else if (k === 'mgmt_items') v = JSON.stringify(Array.isArray(v) ? [...new Set(v.filter(x => MGMT.includes(x)))] : []);
      else if (k === 'urgent' || k === 'mgmt_na' || k === 'facing_auto' || k === 'opt_show' || k === 'done_hide') v = v ? 1 : 0;
      else if (k === 'memo_pub') v = pubMemo(v) || null;
      else v = String(v || '').trim().slice(0, k === 'memo' ? 1000 : 30) || null;
      if ((v ?? null) !== (cur[k] ?? null)) patch[k] = v;
    }
    // 관리비 '확인 불가'를 고르면 금액은 비움
    if (patch.mgmt_na ?? cur.mgmt_na) { if (cur.mgmt != null) patch.mgmt = null; else delete patch.mgmt; }
    if (!Object.keys(patch).length) return J({ ok: true, ver: cur.ver, same: true });
    return done(await LR.commit(db, cur, patch, { ver: b.ver, who: u.name, cfg, events: [['공개 항목 저장', Object.keys(patch).join(', ')]] }));
  }

  if (op === 'status') {
    if (!can(u, 'listing.edit', it)) return J({ ok: false, err: 'perm' }, 403);
    const st = b.status;
    if (!ST.includes(st)) return J({ ok: false, err: 'input' }, 400);
    if (st === cur.status) return J({ ok: true, ver: cur.ver, same: true });
    if (st === '잔금완료') return J({ ok: false, err: 'card', msg: '잔금완료는 상담카드에서 처리합니다 (소유자 · 임대차가 같이 바뀜).' }, 409);
    let pub = pubAfter(st, cur.pub);
    const reason = String(b.reason || '').trim().slice(0, 200);
    const ev = [['상태', cur.status + ' → ' + st + (reason ? ' · 사유: ' + reason : '')]];
    // 계약 취소 등으로 다시 광고 단계로 오면: 마지막 공개 기록이 '자동 비공개'(상태 때문에 꺼짐)였던 매물은 공개를 되살림
    //   공개 권한(대표 · 관리자 · 권한자)이면 바로 공개, 직원이면 공개 요청으로 (2026-11-05)
    let back = null;
    if (cur.pub === 'off' && PUB_OK.includes(st)) {
      const last = await db.prepare("SELECT act FROM listing_events WHERE listing_id = ? AND act IN ('자동 비공개', '공개 끔', '공개 승인', '공개 켬', '공개 요청', '공개 요청 취소', '공개 반려', '공개 다시 켬') ORDER BY id DESC LIMIT 1").bind(cur.id).first();
      if (last && last.act === '자동 비공개') back = can(u, 'listing.publish', it) ? 'on' : 'req';
    }
    if (back) { pub = back; ev.push(back === 'on' ? ['공개 다시 켬', cur.status + ' → ' + st] : ['공개 요청', cur.status + ' → ' + st + ' · 다시 광고']); }
    if (cur.pub === 'on' && pub === 'off') ev.push(['자동 비공개', st]);
    if (cur.pub === 'req' && pub === 'off') ev.push(['공개 요청 취소', st]);
    return done(await LR.commit(db, cur, Object.assign({ status: st, pub, req_by: pub === 'req' ? (back ? u.name : cur.req_by) : null }, back === 'req' ? { req_at: Date.now() } : {}), { ver: b.ver, who: u.name, cfg, events: ev }), null,
      { kind: 'deal', head: '[' + st + ']', extra: cur.status + ' → ' + st + (reason ? ' · 사유: ' + reason : '') });
  }

  if (op === 'publish') {
    const want = b.op;
    const miss = missing(cur, cfg);
    if (want === 'request') {
      if (!can(u, 'listing.request', it)) return J({ ok: false, err: 'perm' }, 403);
      if (OFF.includes(cur.status)) return J({ ok: false, err: 'status', msg: cur.status + ' 상태는 공개할 수 없습니다.' }, 409);
      if (miss.length) return J({ ok: false, err: 'missing', missing: miss }, 400);
      if (cur.pub !== 'off') return J({ ok: true, ver: cur.ver, same: true });
      return done(await LR.commit(db, cur, { pub: 'req', req_by: u.name, req_at: Date.now() }, { ver: b.ver, who: u.name, cfg, events: [['공개 요청', '']] }), null, { kind: 'pub', head: '[공개 요청]', extra: '승인 필요 (대표 · 관리자 · 권한자)', dm: [] });
    }
    if (want === 'cancel') {
      if (cur.pub !== 'req' || !(cur.req_by === u.name || can(u, 'listing.publish', it))) return J({ ok: false, err: 'perm' }, 403);
      return done(await LR.commit(db, cur, { pub: 'off', req_by: null }, { ver: b.ver, who: u.name, cfg, events: [['공개 요청 취소', '']] }));
    }
    if (want === 'approve') {
      if (!can(u, 'listing.publish', it)) return J({ ok: false, err: 'perm' }, 403);
      if (OFF.includes(cur.status)) return J({ ok: false, err: 'status', msg: cur.status + ' 상태는 공개할 수 없습니다.' }, 409);
      if (miss.length) return J({ ok: false, err: 'missing', missing: miss }, 400);
      if (cur.pub === 'on') return J({ ok: true, ver: cur.ver, same: true });
      const status = PUB_OK.includes(cur.status) ? cur.status : '광고중';
      const ev = [[cur.pub === 'req' ? '공개 승인' : '공개 켬', cur.pub === 'req' ? '요청 ' + (cur.req_by || '') : '']];
      if (status !== cur.status) ev.unshift(['상태', cur.status + ' → ' + status]);
      const r = await LR.commit(db, cur, { status, pub: 'on', pub_at: Date.now(), req_by: null }, { ver: b.ver, who: u.name, cfg, events: ev });
      if (r.ok) await log('매물 공개', cur.unit_id + ' ' + DEALS[cur.deal], cur.pub === 'req' ? '승인 (요청 ' + cur.req_by + ')' : '');
      return done(r, null, { kind: 'pub', head: '[매물 공개]', extra: cur.pub === 'req' ? '요청 ' + cur.req_by + ' → 승인' : '', dm: [owner, cur.req_by] });
    }
    if (want === 'reject') {
      if (!can(u, 'listing.publish', it) || cur.pub !== 'req') return J({ ok: false, err: 'perm' }, 403);
      const why = String(b.reason || '').trim().slice(0, 200) || '사유 없음';
      return done(await LR.commit(db, cur, { pub: 'off', req_by: null }, { ver: b.ver, who: u.name, cfg, events: [['공개 반려', why]] }), null, { kind: 'pub', head: '[공개 반려]', extra: '사유: ' + why, dm: [cur.req_by, owner] });
    }
    if (want === 'off') {
      if (!(can(u, 'listing.publish', it) || can(u, 'listing.edit', it)) || cur.pub !== 'on') return J({ ok: false, err: 'perm' }, 403);
      const r = await LR.commit(db, cur, { pub: 'off' }, { ver: b.ver, who: u.name, cfg, events: [['공개 끔', String(b.reason || '').slice(0, 200)]] });
      if (r.ok) await log('매물 비공개', cur.unit_id + ' ' + DEALS[cur.deal], '');
      return done(r, null, { kind: 'pub', head: '[공개 끔]', extra: String(b.reason || '').slice(0, 200) });
    }
    return J({ ok: false, err: 'input' }, 400);
  }

  if (op === 'assign') {
    if (!can(u, 'listing.share', it)) return J({ ok: false, err: 'perm' }, 403);
    const s = await LR.staffRow(db, String(b.staff || ''));
    if (!s || !s.active || s.role === '열람' || !ROLES.includes(s.role)) return J({ ok: false, err: 'input' }, 400);
    if (s.name === cur.mgr) return J({ ok: true, ver: cur.ver, same: true });
    const r = await LR.commit(db, cur, { mgr: s.name }, { ver: b.ver, who: u.name, cfg, events: [['담당 변경', (cur.mgr || '-') + ' → ' + s.name]] });
    // 이전 담당은 '보기' 권한으로 남김 (설계서 6.3)
    if (r.ok && cur.mgr && cur.mgr !== cur.writer) await LR.setGrant(db, id, cur.mgr, 'view', null, u.name);
    if (r.ok) await log('매물 담당 변경', cur.unit_id + ' ' + DEALS[cur.deal], (cur.mgr || '-') + ' → ' + s.name);
    return done(r, null, { kind: 'assign', head: '[매물 담당]', extra: (cur.mgr || '-') + ' → ' + s.name, dm: [s.name] });
  }

  if (op === 'grants') {
    if (!can(u, 'listing.share', it)) return J({ ok: false, err: 'perm' }, 403);
    const s = await LR.staffRow(db, String(b.staff || ''));
    if (!s || !s.active || s.role === '열람') return J({ ok: false, err: 'input' }, 400);
    const perm = b.perm == null ? null : b.perm;
    if (perm && !['view', 'edit'].includes(perm)) return J({ ok: false, err: 'input' }, 400);
    const until = b.until ? String(b.until) : null;
    if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return J({ ok: false, err: 'input' }, 400);
    await LR.setGrant(db, id, s.name, perm, until, u.name);
    await log('매물 공유', cur.unit_id + ' ' + DEALS[cur.deal], s.name + ' ' + (perm || '해제'));
    if (perm) await notify(env, { kind: 'assign', text: '[매물 공유] ' + listingLine(cur) + '\n' + s.name + ' · ' + (perm === 'edit' ? '수정' : '보기') + (until ? ' (~' + until + ')' : '') + '\n— ' + u.name, dm: [s.name], actor: u.name, path: '?go=l:' + id });
    return J({ ok: true, grants: await LR.grantsOf(db, id) });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
