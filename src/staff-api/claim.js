// 수수료 청구서 + MGM (R3-3, 시안 r3-claim 확정 2026-11-13) — 대표 · 관리자만 (claim.use), 잠금 해제는 대표만
//   GET  /api/staff/claims                   → 예상청구 · 날짜별 청구서 · 담당자별 기본 수수료 · MGM 부동산별
//   POST /api/staff/claims/item  { key, fee, tax, memo, excluded, back }  호실 한 줄 고치기 (key = 'u:101-401' 또는 청구 줄 번호)
//   POST /api/staff/claims/extra { unit, reason, fee, tax }   추가 호실 (사유 필수) · /extra/:id/del 지우기
//   POST /api/staff/claims/claim                             예상청구 → 오늘 날짜 청구서
//   POST /api/staff/claims/lock  { date, locked }            잠그기(대표 · 관리자) · 풀기(대표)
//   POST /api/staff/claims/staff { name, fee, tax }          담당자별 기본 수수료 (fee 비우면 기본값 100만 · 3.3%)
//   POST /api/staff/claims/mgm   { id, fixed }               신규고객 카드 MGM 확정 · 취소
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { FEE0, TAXES, TAX_KO, MGM_FEES, kindOf, cleanItem, totals, mgmGroups, finAmt, taxAmt } from '../core/claim.js';
import { unitId } from '../core/consult.js';
import * as Q from '../repo/claim.js';
import { getConsult, updateConsult } from '../repo/consult.js';
import { audit } from '../repo/audit.js';

const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// 화면에 보낼 모양 만들기 (예상청구 · 청구서 · MGM)
export function buildClaims(R) {
  const tenant = {}, buyer = {};
  R.cards.forEach(c => { if (c.kind === 'tenant') tenant[c.unit_id] = c; else if (c.contractUnit) buyer[c.contractUnit] = c; });
  const who = (unit, status) => (status === '신규입주' ? buyer[unit] || tenant[unit] : tenant[unit] || buyer[unit]) || {};
  const SF = Object.fromEntries(R.staff.map(s => [s.name, s]));
  const dflt = staff => SF[staff] ? { fee: SF[staff].fee, tax: SF[staff].tax || FEE0.tax } : FEE0;
  const conv = Object.fromEntries(R.conv.map(c => [c.unit_id, c]));
  const byUnit = {}; R.claims.filter(c => !c.extra).forEach(c => { byUnit[c.unit_id] = c; });
  const row = (c, unit, extra) => {
    const cv = conv[unit], w = extra ? {} : who(unit, cv && cv.status), d = dflt(w.mgr);
    const fee = c && c.fee != null ? c.fee : extra ? null : d.fee, tax = (c && c.tax) || (extra ? FEE0.tax : d.tax);
    return { key: c ? c.id : 'u:' + unit, unit, extra: !!extra, reason: (c && c.reason) || '', who: w.name || '', kind: extra ? '추가' : kindOf(cv ? cv.status : '', cv ? cv.done_from : ''),
      staff: w.mgr || '', fee, tax, tx: fee == null ? 0 : taxAmt(fee, tax), fin: fee == null ? 0 : finAmt(fee, tax), memo: (c && c.memo) || '', excluded: !!(c && c.excluded), date: (c && c.date) || null };
  };
  const rows = [];
  R.conv.forEach(cv => { const c = byUnit[cv.unit_id]; rows.push(row(c, cv.unit_id, false)); });
  R.claims.filter(c => !c.extra && c.date && !conv[c.unit_id]).forEach(c => rows.push(row(c, c.unit_id, false)));   // 청구 뒤 상태가 바뀐 호실도 청구서엔 남김
  R.claims.filter(c => c.extra).forEach(c => rows.push(row(c, c.unit_id, true)));
  const sortU = (a, b) => a.unit.localeCompare(b.unit, 'ko', { numeric: true }) || (a.extra - b.extra);
  const est = rows.filter(r => !r.date).sort(sortU);
  const L = Object.fromEntries(R.locks.map(l => [l.date, l]));
  const dates = [...new Set(rows.filter(r => r.date).map(r => r.date))].sort().reverse();
  const invoices = dates.map(d => { const rs = rows.filter(r => r.date === d).sort(sortU); return { date: d, locked: !!(L[d] && L[d].locked), lockBy: L[d] ? L[d].by : '', rows: rs, sum: totals(rs) }; });
  const mgm = mgmGroups(R.cards.filter(c => c.kind === 'new'));
  const mgmWait = R.cards.filter(c => c.kind === 'new' && c.mgmAgency && !c.mgmFixed).map(c => ({ id: c.id, name: c.name || '', unit: c.contractUnit || '', agency: c.mgmAgency, fee: c.mgmFee || '' }));
  return { today: today(), est: { rows: est, sum: totals(est) }, invoices, staff: R.staff, staffNames: [...new Set(R.cards.map(c => c.mgr).filter(Boolean))].sort(), mgm, mgmWait, fee0: FEE0, taxes: TAXES, taxKo: TAX_KO, mgmFees: Object.keys(MGM_FEES) };
}

export async function staffClaim(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };
  if (!can(u, 'claim.use')) return J({ ok: false, err: 'perm', msg: '청구서는 대표 · 관리자만 볼 수 있습니다' }, 403);
  const load = async () => buildClaims(await Q.claimRows(db));

  if (p === '/api/staff/claims' && req.method === 'GET') return J(Object.assign({ ok: true, canUnlock: can(u, 'claim.unlock') }, await load()));
  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const b = await body(req) || {};

  if (p === '/api/staff/claims/item') {
    const key = String(b.key || ''), x = cleanItem(b);
    if (!x) return J({ ok: false, err: 'input' }, 400);
    let c;
    if (key.startsWith('u:')) {
      const unit = key.slice(2), V = await load();
      if (!V.est.rows.some(r => r.key === key)) return J({ ok: false, err: 'notfound' }, 404);
      c = await Q.unitClaim(db, unit);
      if (!c) { await Q.insertClaim(db, Object.assign({ unit_id: unit }, x), u.name); return J({ ok: true }); }
    } else c = await Q.getClaim(db, key);
    if (!c) return J({ ok: false, err: 'notfound' }, 404);
    if (await Q.isLocked(db, c.date)) return J({ ok: false, err: 'locked', msg: '잠긴 청구서입니다' }, 409);
    if (b.back) x.date = null;   // 청구서 → 예상청구로 되돌리기
    await Q.updateClaim(db, c.id, x, u.name);
    if (b.back) await audit(db, Object.assign({ act: '청구 되돌림', target: c.unit_id, detail: c.date + ' 청구서 → 예상청구' }, who));
    return J({ ok: true });
  }

  if (p === '/api/staff/claims/extra') {
    const unit = unitId(b.unit), reason = String(b.reason || '').trim().slice(0, 200), x = cleanItem({ fee: b.fee, tax: b.tax || FEE0.tax });
    if (!unit || !x) return J({ ok: false, err: 'input', field: 'unit' }, 400);
    if (!reason) return J({ ok: false, err: 'input', field: 'reason', msg: '추가하는 사유를 적어 주세요' }, 400);
    const id = await Q.insertClaim(db, { unit_id: unit, extra: 1, reason, fee: x.fee, tax: x.tax }, u.name);
    await audit(db, Object.assign({ act: '청구 호실 추가', target: unit, detail: '사유: ' + reason }, who));
    return J({ ok: true, id });
  }
  let m = p.match(/^\/api\/staff\/claims\/extra\/([0-9A-Z]{26})\/del$/);
  if (m) {
    const c = await Q.getClaim(db, m[1]);
    if (!c || !c.extra) return J({ ok: false, err: 'notfound' }, 404);
    if (await Q.isLocked(db, c.date)) return J({ ok: false, err: 'locked', msg: '잠긴 청구서입니다' }, 409);
    await Q.deleteClaim(db, c.id);
    await audit(db, Object.assign({ act: '청구 추가 호실 지움', target: c.unit_id, detail: '사유였던 것: ' + (c.reason || '') }, who));
    return J({ ok: true });
  }

  if (p === '/api/staff/claims/claim') {
    const d = today();
    if (await Q.isLocked(db, d)) return J({ ok: false, err: 'locked', msg: '오늘 청구서가 잠겨 있습니다' }, 409);
    const V = await load(), go = V.est.rows.filter(r => !r.excluded && r.fee != null);
    if (!go.length) return J({ ok: false, err: 'empty', msg: '청구할 호실이 없습니다 (금액 미지정 · 제외 호실은 빠짐)' }, 409);
    for (const r of go) {   // 금액 · 세금을 그때 값으로 굳혀 둠 (나중에 담당자 기본값이 바뀌어도 청구서는 그대로)
      if (r.key.startsWith('u:')) await Q.insertClaim(db, { unit_id: r.unit, date: d, fee: r.fee, tax: r.tax, memo: r.memo }, u.name);
      else await Q.updateClaim(db, r.key, { date: d, fee: r.fee, tax: r.tax }, u.name);
    }
    const s = totals(go);
    await audit(db, Object.assign({ act: '수수료 청구', target: d + ' 청구서', detail: go.length + '호실 · 최종 ' + s.fin.toLocaleString('ko-KR') + '원' }, who));
    return J({ ok: true, date: d, n: go.length });
  }

  if (p === '/api/staff/claims/lock') {
    if (!DATE.test(b.date || '')) return J({ ok: false, err: 'input' }, 400);
    if (!b.locked && !can(u, 'claim.unlock')) return J({ ok: false, err: 'perm', msg: '잠금 해제는 대표만 할 수 있습니다' }, 403);
    await Q.setLock(db, b.date, !!b.locked, u.name);
    await audit(db, Object.assign({ act: b.locked ? '청구서 잠금' : '청구서 잠금 해제', target: b.date + ' 청구서' }, who));
    return J({ ok: true });
  }

  if (p === '/api/staff/claims/staff') {
    const name = String(b.name || '').trim().slice(0, 20), x = cleanItem({ fee: b.fee, tax: b.tax || FEE0.tax });
    if (!name || !x) return J({ ok: false, err: 'input' }, 400);
    await Q.setStaffFee(db, name, x.fee, x.tax, u.name);
    await audit(db, Object.assign({ act: '담당자 기본 수수료', target: name, detail: x.fee == null ? '기본값(100만 · 3.3%)으로' : x.fee + '만 · ' + TAX_KO[x.tax] }, who));
    return J({ ok: true });
  }

  if (p === '/api/staff/claims/mgm') {
    const c = await getConsult(db, String(b.id || ''));
    if (!c || c.deleted_at || c.kind !== 'new') return J({ ok: false, err: 'notfound' }, 404);
    if (b.fixed && !(c.data.mgmAgency && MGM_FEES[c.data.mgmFee])) return J({ ok: false, err: 'input', msg: 'MGM 지급 부동산과 금액을 먼저 적어 주세요' }, 400);
    const d = Object.assign({}, c.data);
    if (b.fixed) d.mgmFixed = { by: u.name, at: Date.now() }; else delete d.mgmFixed;
    await updateConsult(db, c.id, { data: d }, u.name);
    await audit(db, Object.assign({ act: b.fixed ? 'MGM 확정' : 'MGM 확정 취소', target: (c.data.contractUnit || '신규고객') + ' · ' + c.id, detail: (c.data.mgmAgency || '') + ' · ' + (c.data.mgmFee || '') }, who));
    return J({ ok: true });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
