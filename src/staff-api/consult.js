// 상담카드 2종 (R2, 시안 r2-consult-card 확정 2026-11-13) — 직원용
//   GET  /api/staff/consults?kind=tenant|new[&del=1]   목록 (+ 신규고객이면 관심등록 대기)
//   GET  /api/staff/consults?unit=101-1502              그 세대 임차인 카드 번호 (없으면 null)
//   GET  /api/staff/consults/:id                        카드 + 상담 기록
//   POST /api/staff/consults                            새 카드 { kind, unit | lead, name, phone, progress, mgr, data, log }
//   POST /api/staff/consults/:id                        고치기 + 상담 기록 한 줄 { …, log }
//   POST /api/staff/consults/:id/del                    지우기(숨김) · 되살리기 { on, reason } — 대표 · 관리자, 사유 필수
//   이름 · 전화번호 · 메모는 권한(card.raw = 관리자급 · 본인 작성 · 담당) 없으면 서버에서 가려서 보냄
//   진행상태가 바뀌면 세대 전환 상태도 자동 (임차인 → 그 세대, 신규고객 → 계약할 호실 · 계약완료 = 신규입주)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { maskName, maskPhone, maskDeep, maskText } from '../core/mask.js';
import { KINDS, PROG, PROBS, CHANNELS, DOCS, SEL, cleanCard, cleanLog, convTarget, unitId, fund } from '../core/consult.js';
import { UNIT } from '../core/units.js';
import * as C from '../repo/consult.js';
import { getConv, syncConv } from '../repo/conv.js';
import { audit } from '../repo/audit.js';

const own = c => ({ writer: c.writer, mgr: c.mgr });
function view(u, c) {
  const raw = can(u, 'card.raw', own(c));
  const x = Object.assign({}, c, { raw, fund: fund(c.data) });
  if (!raw) Object.assign(x, { name: maskName(c.name), phone: maskPhone(c.phone), data: maskDeep(c.data) });
  return x;
}
const viewLog = (raw, l) => raw ? l : Object.assign({}, l, { memo: l.memo ? maskText(l.memo) : l.memo });
const leadView = (u, c) => { const raw = can(u, 'card.raw', {}); return { k: c.k, at: c.at, name: raw ? c.name : maskName(c.name), phone: raw ? c.phone : maskPhone(c.phone), interest: c.interest || '', text: raw ? (c.text || '') : maskText(c.text || '') }; };

// 진행상태 → 전환 상태 맞추기. 바뀐 내용 한 줄 (없으면 '')
async function sync(db, kind, card, by, who) {
  const unit = kind === 'tenant' ? card.unit_id : (card.data || {}).contractUnit;
  if (!unit) return '';
  const cur = await getConv(db, unit), t = convTarget(kind, card, cur && cur.status);
  if (!t) return '';
  const r = await syncConv(db, t.unit, t.status, by, kind === 'tenant' && t.status === '퇴거확정' ? card.data.moveOut : null);
  await audit(db, Object.assign({ act: '전환 상태', target: '세대 ' + t.unit, detail: (r.old || '미정') + ' → ' + t.status + ' (상담카드 진행상태)' + (r.off ? ' · 공개 자동 내림' : '') }, who));
  return t.unit + ' → ' + t.status + (r.off ? ' (공개 내림)' : '');
}

export async function staffConsult(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };

  if (p === '/api/staff/consults' && req.method === 'GET') {
    const unit = url.searchParams.get('unit');
    if (unit) { const c = await C.tenantCardOf(db, unit); return J({ ok: true, id: c ? c.id : null }); }
    const kind = url.searchParams.get('kind') || 'tenant', del = url.searchParams.get('del') === '1';
    if (!KINDS.includes(kind)) return J({ ok: false, err: 'input' }, 400);
    if (del && !can(u, 'card.delete')) return J({ ok: false, err: 'perm' }, 403);
    const rows = (await C.listConsults(db, kind, del)).map(c => view(u, c));
    const leads = kind === 'new' && !del ? (await C.pendingLeads(db)).map(c => leadView(u, c)) : [];
    return J({ ok: true, rows, leads, opts: { PROG, PROBS, CHANNELS, DOCS, SEL }, canCreate: can(u, 'card.create'), canDelete: can(u, 'card.delete'), me: u.name });
  }

  if (p === '/api/staff/consults' && req.method === 'POST') {
    if (!can(u, 'card.create')) return J({ ok: false, err: 'perm' }, 403);
    const b = await body(req) || {}, kind = b.kind;
    const c = cleanCard(kind, b);
    if (c.err) return J({ ok: false, err: 'input', field: c.err }, 400);
    let unit_id = null, lead_id = null;
    if (kind === 'tenant') {
      unit_id = unitId(b.unit);
      if (!unit_id) return J({ ok: false, err: 'input', field: 'unit' }, 400);
      const ex = await C.tenantCardOf(db, unit_id);
      if (ex) return J({ ok: false, err: 'exists', id: ex.id, msg: '이 세대 상담카드가 이미 있습니다' }, 409);
    } else if (b.lead) {
      const g = await C.leadCard(db, String(b.lead));
      if (!g) return J({ ok: false, err: 'notfound' }, 404);
      if (await C.cardOfLead(db, String(b.lead))) return J({ ok: false, err: 'exists', msg: '이미 카드로 만든 관심등록입니다' }, 409);
      lead_id = String(b.lead);
      c.name = c.name || g.name; c.phone = c.phone || g.phone;
      c.data = Object.assign({ inflow: '관심등록', interest: String(g.interest || '').slice(0, 200) || null, memo: g.text ? String(g.text).slice(0, 3000) : null }, c.data);
    }
    if (!c.name && !c.phone) return J({ ok: false, err: 'input', field: 'name', msg: '성명이나 연락처 중 하나는 적어 주세요' }, 400);
    const card = Object.assign({ kind, unit_id, lead_id, progress: c.progress || '상담중' }, c);
    const id = await C.insertConsult(db, card, u.name);
    const l = cleanLog(b.log);
    if (l) await C.addLog(db, id, l, card.progress, u.name);
    await audit(db, Object.assign({ act: '상담카드 만듦', target: (kind === 'tenant' ? '임차인 ' + unit_id : '신규고객') + ' · ' + id, detail: lead_id ? '관심등록에서' : '' }, who));
    const synced = await sync(db, kind, card, u.name, who);
    return J({ ok: true, id, synced });
  }

  let m = p.match(/^\/api\/staff\/consults\/([0-9A-Z]{26})$/);
  if (m && req.method === 'GET') {
    const c = await C.getConsult(db, m[1]);
    if (!c || (c.deleted_at && !can(u, 'card.delete'))) return J({ ok: false, err: 'notfound' }, 404);
    const x = view(u, c), unit = c.kind === 'tenant' ? c.unit_id : c.data.contractUnit, conv = unit ? await getConv(db, unit) : null;
    return J({ ok: true, card: x, canEdit: !c.deleted_at && can(u, 'card.edit', own(c)), logs: (await C.logsOf(db, c.id)).map(l => viewLog(x.raw, l)), conv: conv ? { unit, status: conv.status, move_out: conv.move_out } : unit ? { unit, status: null } : null, unit: c.unit_id ? UNIT[c.unit_id] : null });
  }

  if (m && req.method === 'POST') {
    const c = await C.getConsult(db, m[1]);
    if (!c || c.deleted_at) return J({ ok: false, err: 'notfound' }, 404);
    if (!can(u, 'card.edit', own(c))) return J({ ok: false, err: 'perm' }, 403);
    const b = await body(req) || {}, x = cleanCard(c.kind, b);
    if (x.err) return J({ ok: false, err: 'input', field: x.err }, 400);
    const patch = {};
    ['name', 'phone', 'progress', 'mgr'].forEach(k => { if (k in x && x[k] !== c[k]) patch[k] = x[k]; });
    if (Object.keys(x.data).length) {
      const d = Object.assign({}, c.data, x.data);
      Object.keys(d).forEach(k => { if (d[k] == null) delete d[k]; });
      if (JSON.stringify(d) !== JSON.stringify(c.data)) patch.data = d;
    }
    const l = cleanLog(b.log);
    if (!Object.keys(patch).length && !l) return J({ ok: true, synced: '' });
    if (Object.keys(patch).length) await C.updateConsult(db, c.id, patch, u.name);
    const after = Object.assign({}, c, patch);
    if (l) await C.addLog(db, c.id, l, after.progress, u.name);
    if (patch.mgr !== undefined) await audit(db, Object.assign({ act: '상담카드 담당', target: c.id, detail: (c.mgr || '미배정') + ' → ' + (patch.mgr || '미배정') }, who));
    // 진행상태 · 계약할 호실 · 퇴거일이 바뀐 때만 전환 상태를 맞춤 (다른 칸만 고칠 땐 직원이 직접 바꾼 상태를 덮지 않게)
    const touched = 'progress' in patch || (patch.data && (patch.data.contractUnit !== c.data.contractUnit || patch.data.moveOut !== c.data.moveOut));
    const synced = touched ? await sync(db, c.kind, after, u.name, who) : '';
    return J({ ok: true, synced });
  }

  m = p.match(/^\/api\/staff\/consults\/([0-9A-Z]{26})\/del$/);
  if (m && req.method === 'POST') {
    if (!can(u, 'card.delete')) return J({ ok: false, err: 'perm' }, 403);
    const c = await C.getConsult(db, m[1]);
    if (!c) return J({ ok: false, err: 'notfound' }, 404);
    const b = await body(req) || {}, on = b.on !== false, reason = String(b.reason || '').trim().slice(0, 300);
    if (on && !reason) return J({ ok: false, err: 'input', field: 'reason', msg: '지우는 사유를 적어 주세요' }, 400);
    if (!on && c.kind === 'tenant' && await C.tenantCardOf(db, c.unit_id)) return J({ ok: false, err: 'exists', msg: '이 세대에 새 상담카드가 있어 되살릴 수 없습니다' }, 409);
    await C.setDeleted(db, c.id, on, u.name, reason);
    await audit(db, Object.assign({ act: on ? '상담카드 지움' : '상담카드 되살림', target: (c.kind === 'tenant' ? '임차인 ' + c.unit_id : '신규고객') + ' · ' + c.id, detail: on ? '사유: ' + reason : '지웠던 사유: ' + (c.del_reason || '') }, who));
    return J({ ok: true });
  }

  return J({ ok: false, err: 'notfound' }, 404);
}
