// 직원용 API — 로그인한 직원만. 보내기 전에 권한별로 거르고 가린다 (설계서 7.3)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { maskDeep, unmask } from '../core/mask.js';
import { pkSigner, withPk } from './pk.js';
import { pullRows, getMany, getOne, putRows, histRows, parse } from '../repo/kv.js';
import { audit } from '../repo/audit.js';
import { staffComments } from './comments.js';
import { staffUnits } from './units.js';
import { staffConv } from './conv.js';
import { cleanupPub, syncConv, getConv } from '../repo/conv.js';
import { UNIT } from '../core/units.js';
import { staffConsult } from './consult.js';
import { staffReport } from './report.js';
import { staffClaim } from './claim.js';
import { staffBoard } from './board.js';
import { staffPrice } from './price.js';
import { repo } from '../repo/index.js';
import { staffListings } from './listings.js';
import { staffAds } from './ads.js';
import { staffBroker } from './broker.js';
import { syncFromCard, rebuildPublic, refreshUnits } from '../repo/listings.js';
import { notify, reps, unitLabel } from '../notify/index.js';
import { staffNotify } from './notify.js';
import { serveMedia, onPopupsSaved } from '../popups/index.js';

// 한 줄을 이 직원에게 보여 줄 모양으로. null 이면 안 보냄
// 같은 손님(연락처)의 가장 최근 신규분양 매수 카드 계약관리 값 (이번에 저장하는 카드는 빼고)
async function lastClientCt(db, phone, exceptId) {
  const d = String(phone || '').replace(/\D/g, ''); if (!d) return null;
  const r = (await db.prepare("SELECT k, v FROM kv WHERE s = 'c' AND json_extract(v, '$.kind') = 'client' AND json_extract(v, '$.ct') IS NOT NULL AND k <> ?").bind(String(exceptId)).all()).results || [];
  let best = null; for (const x of r) { const v = parse(x.v) || {}; if (String(v.phone || '').replace(/\D/g, '') !== d) continue; if (!best || String(v.at || '') > String(best.at || '')) best = v; }
  return best ? best.ct : null;
}

export function view(u, r, perms) {
  if (r.s === 'cfg') return can(u, 'cfg.read', r.k) ? r : null;
  if (r.s !== 'c' && r.s !== 'u') return r;
  const v = parse(r.v);
  if (v == null) return r;
  const raw = r.s === 'c' ? can(u, 'card.raw', v) : can(u, 'unit.raw', v);
  return raw ? r : Object.assign({}, r, { v: JSON.stringify(maskDeep(v)) });
}

export async function staffApi(req, env, url, u) {
  const db = env.DB, p = url.pathname;
  if (p === '/api/staff/comments' || p === '/api/staff/comments/hist') return staffComments(req, env, url, u);
  if (p.startsWith('/api/staff/units/') || p.startsWith('/api/staff/tenancies')) return staffUnits(req, env, url, u);
  if (p === '/api/staff/conv' || p.startsWith('/api/staff/conv/')) return staffConv(req, env, url, u);   // R2 세대 전환 상태 · 공개 세대
  if (p === '/api/staff/consults' || p.startsWith('/api/staff/consults/')) return staffConsult(req, env, url, u);   // R2 상담카드 2종
  if (p === '/api/staff/report') return staffReport(req, env, url, u);   // R3-2 일일업무보고
  if (p === '/api/staff/claims' || p.startsWith('/api/staff/claims/')) return staffClaim(req, env, url, u);   // R3-3 수수료 청구서 · MGM
  if (p === '/api/staff/board' || p.startsWith('/api/staff/board/')) return staffBoard(req, env, url, u);   // R3-4 직원 소통 3종
  if (p === '/api/staff/prices' || p.startsWith('/api/staff/prices/')) return staffPrice(req, env, url);   // R3-5 분양가표 · 전세연장
  if (p === '/api/staff/ads' || /^\/api\/staff\/listings\/[0-9A-Z]{26}\/ads$/.test(p)) return staffAds(req, env, url, u);   // 광고 초안 · 게시기록 · 매칭 고객 (P6)
  if (p === '/api/staff/listings' || p.startsWith('/api/staff/listings/')) return staffListings(req, env, url, u);
  if (p === '/api/staff/broker' || p.startsWith('/api/staff/broker/')) return staffBroker(req, env, url, u);   // 공개 매물 중개요청 알림 · 첫 확인
  if (p.startsWith('/api/staff/notify/')) return staffNotify(req, env, url, u);   // 내 텔레그램 연결 (P5)
  if (p.startsWith('/api/staff/media/') && req.method === 'GET') return serveMedia(env, p.slice(17), true);   // 팝업 그림 · 첨부 (직원은 모두)
  const perms = await getOne(db, 'cfg', 'perms'), R = repo(env);

  if (p === '/api/staff/pull' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since')) || 0, LIM = 3000;
    // 설정 · 상담카드(kv) + 세대(units 표)를 동기화 번호 순으로 합침
    const rows = (await pullRows(db, since, LIM)).concat(await R.pullUnits(since, LIM)).sort((a, b) => a.sv - b.sv).slice(0, LIM);
    const sign = await pkSigner(env), out = [];   // 상담카드에 사람 표시 pk (시안 r66)
    for (const r of rows) { const x = await withPk(sign, r, view(u, r, perms)); if (x) out.push(x); }
    return J({ ok: true, now: rows.length ? rows[rows.length - 1].sv : since, more: rows.length === LIM, rows: out });
  }

  if (p === '/api/staff/push' && req.method === 'POST') {
    const b = await body(req);
    if (!b) return J({ ok: false, err: 'json' }, 400);
    const rows = (Array.isArray(b.rows) ? b.rows : []).filter(x => x && typeof x.s === 'string' && x.k != null).slice(0, 500);
    const cur = await getMany(db, rows.filter(x => x.s === 'c').map(x => [x.s, x.k]));
    const cu = await R.getUnits(rows.filter(x => x.s === 'u').map(x => String(x.k)));
    Object.keys(cu).forEach(k => { cur['u|' + k] = cu[k]; });
    const ok = [], rejected = [], logs = [], now = Date.now();
    for (const x of rows) {
      const k = String(x.k), stored = cur[x.s + '|' + k];
      let v = typeof x.v === 'string' ? parse(x.v) : x.v;
      if (x.s === 'c' && v && typeof v === 'object') delete v.pk;   // 사람 표시는 서버가 보낼 때마다 만듦 — 저장 안 함
      const del = v == null;
      let allow = false;
      if (x.s === 'cfg') allow = can(u, 'cfg.write', k, perms);
      else if (x.s === 'c') allow = stored == null ? !del && can(u, 'card.create', v) : can(u, 'card.edit', stored);
      else if (x.s === 'u') allow = del ? can(u, 'unit.delete') : can(u, 'unit.edit', stored, perms);
      // 상담카드 삭제 (숨김 · 되살리기 · 완전 삭제)는 대표 · 관리자만, 숨길 때는 사유 필수. 누가 · 언제는 서버가 적음
      let delAct = null;
      if (x.s === 'c' && stored != null) {
        const was = stored.deleted || null, now0 = del ? null : (v.deleted || null);
        if (del || JSON.stringify(was) !== JSON.stringify(now0)) {
          if (!can(u, 'card.delete')) { rejected.push(x.s + '|' + k); continue; }
          if (!del && now0 && !was) {
            const reason = String(now0.reason || '').trim().slice(0, 300);
            if (!reason) { rejected.push(x.s + '|' + k); continue; }
            v.deleted = { at: now, by: u.name, reason }; delAct = '상담 삭제';
          } else if (!del && !now0 && was) delAct = '상담 되살리기';
          else if (!del) v.deleted = was;   // 사유 · 지운 사람은 고칠 수 없음
        }
      }
      if (!allow) { rejected.push(x.s + '|' + k); continue; }
      // 계약관리 '계약완료 정리' 잠금 (시안 r48 확정 2026-11-17): 확정 · 확정된 소개 구분 · 이름 · 계약진행 직원 고치기는 대표 · 관리자만 (사유는 화면이 기록)
      if (x.s === 'c' && !del && v && v.kind === 'client' && v.ct && !['대표', '관리자'].includes(u.role)) {
        const prev = await lastClientCt(db, v.phone || (stored && stored.phone), k), pf = prev && prev.fixed, nf = v.ct.fixed;
        const same = (a, b) => ['intro', 'bk', 'side', 'staff', 'mgmFee'].every(f => String((a || {})[f] || '') === String((b || {})[f] || ''));
        if ((nf && !(pf && pf.by === nf.by && pf.at === nf.at)) || (pf && (!nf || !same(prev, v.ct)))) { rejected.push(x.s + '|' + k); continue; }
      }
      // 가린 채로 받은 칸은 원래 값으로
      if (!del && stored != null && ((x.s === 'c' && !can(u, 'card.raw', stored)) || (x.s === 'u' && !can(u, 'unit.raw', stored)))) v = unmask(v, stored);
      if (delAct) logs.push({ act: delAct, target: '상담카드 ' + k + ' · ' + [stored.unit ? unitLabel(stored.unit) : '', stored.name].filter(Boolean).join(' · '), detail: delAct === '상담 삭제' ? '사유: ' + v.deleted.reason : '지웠던 사유: ' + ((stored.deleted || {}).reason || ''), card: k, c: stored, reason: delAct === '상담 삭제' ? v.deleted.reason : '' });
      ok.push({ s: x.s, k, v: del ? 'null' : JSON.stringify(v), at: Math.min(Number(x.at) || now, now + 60e3), by: u.name });
      if (del && stored != null) logs.push({ act: '삭제', target: (x.s === 'c' ? '상담카드 ' : '세대 ') + k });
      if (x.s === 'cfg' && k === 'perms') logs.push({ act: '권한표 변경' });
    }
    const kvRows = ok.filter(x => x.s !== 'u'), uRows = ok.filter(x => x.s === 'u');
    const popRow = kvRows.find(x => x.s === 'cfg' && x.k === 'popups'), popBefore = popRow ? await getOne(db, 'cfg', 'popups') : null;
    if (kvRows.length) await putRows(db, kvRows);
    // 팝업을 지우거나 그림 · 첨부를 바꾸면 안 쓰게 된 파일을 저장소에서 바로 지움 (실제로 저장된 값 기준)
    if (popRow) { const now0 = await getOne(db, 'cfg', 'popups'); const n = await onPopupsSaved(env, popBefore, now0); if (n) logs.push({ act: '팝업 파일 지움', detail: n + '개' }); }
    if (uRows.length) await R.saveUnits(uRows.map(x => ({ id: x.k, v: parse(x.v), at: x.at, by: x.by })));
    if (uRows.length) await cleanupPub(db);   // 계약조건이 생긴 세대는 손님 공개 · 현재 매물에서 내림 (시안 r47)
    // 세대 옵션(확장 · 유상옵션)이 바뀌면 그 세대 공개 매물 카드의 '옵션' 줄도 새로 (시안 listing-public2)
    const optChanged = uRows.filter(x => { const a = parse(x.v) || {}, b = cur['u|' + x.k] || {}; return JSON.stringify([a.sel || null, a.expand]) !== JSON.stringify([b.sel || null, b.expand]); }).map(x => x.k);
    if (optChanged.length) await refreshUnits(db, optChanged, u.name);
    for (const l of logs) await audit(db, Object.assign({ who: u.name, ip: ip(req), dev: device(req) }, l));
    // 알림 (P5): 권한표 변경 → 긴급 · 상담카드 담당이 바뀌면 → 새 담당에게
    if (logs.some(l => l.act === '권한표 변경')) await notify(env, { kind: 'security', urgent: true, text: '[권한 변경] 역할별 권한표가 바뀌었습니다\n— ' + u.name, dm: await reps(db), actor: u.name, path: '?go=audit' });
    for (const l of logs) if (l.card) await notify(env, { kind: 'cardDel', text: '[' + l.act + '] ' + [l.c.unit ? unitLabel(l.c.unit) : '', l.c.name].filter(Boolean).join(' · ') + (l.reason ? '\n사유: ' + l.reason : '') + '\n— ' + u.name, dm: [], actor: u.name, path: '?go=audit' });
    for (const x of kvRows) {
      if (x.s !== 'c') continue;
      const v = parse(x.v), old = cur['c|' + x.k];
      if (v && v.mgr && !v.legacy && v.mgr !== (old && old.mgr) && (old || v.mgr !== u.name))   // 기존 이력 올리기(legacy) 줄은 알림 안 함 (시안 r53)
        await notify(env, { kind: 'assign', text: '[상담카드 담당] ' + [v.name, v.phone].filter(Boolean).join(' · ') + (v.unit ? ' · ' + unitLabel(v.unit) : '') + '\n' + ((old && old.mgr) || '미배정') + ' → ' + v.mgr + '\n— ' + u.name, dm: [v.mgr], actor: u.name, path: '?go=c:' + x.k });
    }
    // R1: 소유자 상담카드 '입주 후 거래' → 매물보드 (설계서 10.1) · 공개 설정이 바뀌면 공개 사본 다시 만들기
    for (const x of kvRows) if (x.s === 'c') await syncFromCard(db, parse(x.v), u.name);
    // 상담카드(신규분양 매수) '2. 계약관리 상담' 진행 → 계약할 호실 전환상태 (2026-11-17) — 바뀐 때만
    for (const x of kvRows) { if (x.s !== 'c') continue; const v = parse(x.v) || {}, ct = v.ct || {}, CTS = { 가계약: '가계약', 계약중: '계약중', 계약완료: '신규입주' };
      if (v.kind !== 'client' || !ct.unit || !UNIT[ct.unit] || !CTS[ct.prog]) continue;
      const cur0 = await getConv(db, ct.unit); if (cur0 && cur0.status === CTS[ct.prog]) continue;
      if (can(u, 'conv.edit', null, perms)) { await syncConv(db, ct.unit, CTS[ct.prog], u.name); await audit(db, { who: u.name, ip: ip(req), dev: device(req), act: '전환 상태', target: '세대 ' + ct.unit, detail: ((cur0 && cur0.status) || '미정') + ' → ' + CTS[ct.prog] + ' (상담카드 계약관리)' }); } }
    if (kvRows.some(x => x.s === 'cfg' && x.k === 'listingCfg')) await rebuildPublic(db, u.name);
    return J({ ok: true, n: ok.length, rejected });
  }

  if (p === '/api/staff/hist' && req.method === 'GET') {
    const s = url.searchParams.get('s') || '', k = url.searchParams.get('k') || '';
    const rows = await histRows(db, s, k);
    if (s === 'cfg' && !can(u, 'cfg.read', k)) return J({ ok: true, rows: [] });
    return J({ ok: true, rows: rows.map(r => { const x = view(u, { s, k, v: r.v }, perms); return x && { v: x.v, at: r.at, by: r.by }; }).filter(Boolean) });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
