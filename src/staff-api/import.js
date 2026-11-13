// 엑셀 가져오기 (설계서 13.2) — 화면이 엑셀을 읽어 표(줄 목록)로 보내면 서버가 검사 · 미리보기 · 적용 · 되돌리기
//   양식 3가지: units 세대현황 · owners 소유자 · tenancies 임대차
//   방식: fill 빈 칸만 채우기 · over 덮어쓰기 (엑셀의 빈 칸은 어느 쪽이든 지우지 않음)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { UNIT } from '../core/units.js';
import { normDate, normMan, normMobile, normTel, normCarrier, normRel } from '../core/tenancy.js';
import { repo } from '../repo/index.js';
import { getOne } from '../repo/kv.js';
import { audit } from '../repo/audit.js';
import { ulid } from '../lib/id.js';

const COLS = {
  units: { occ: ['거주형태', '거주', '계약형태'], chk: ['확인일', '최근확인일'] },
  owners: { name: ['성명', '이름', '소유자', '계약자'], phone: ['핸드폰', '휴대폰', '연락처', '전화'], carrier: ['통신사'], r1: ['관계1', '관계'], p1: ['연락처1'], r2: ['관계2'], p2: ['연락처2'], share: ['지분'], since: ['취득일', '소유시작일'], cause: ['취득원인'] },
  tenancies: { kind: ['유형', '임대유형', '계약형태'], ten: ['임차인', '임차인명'], tph: ['임차인연락처', '임차인 연락처', '연락처'], dep: ['보증금'], rent: ['월세'], con: ['계약일'], mi: ['입주일'], end: ['만기일', '종료일'], right: ['갱신청구권'], party: ['계약주체'], memo: ['메모'] }
};
export const KIND_LABEL = { units: '세대현황', owners: '소유자', tenancies: '임대차' };
const OC_IN = { 자가거주: '실거주', 자가: '실거주', 실거주: '실거주', 전세: '전세', 월세: '월세', 반전세: '월세', 공실: '공실', 미확인: '미확인' };
const RIGHTS = { 사용: '사용', 미사용: '미사용(합의갱신)', '미사용(합의갱신)': '미사용(합의갱신)', 합의갱신: '미사용(합의갱신)', 확인필요: '확인필요' };
const PARTIES = ['본사', '공동중개', '타부동산', '갱신연장'];
const CAUSES = ['분양', '매매', '상속', '증여'];
const LABEL = { owner: '성명', phone: '핸드폰', carrier: '통신사', c1Rel: '관계1', c1Phone: '연락처1', c2Rel: '관계2', c2Phone: '연락처2', 'own.ocType': '계약형태', 'own.ocTen': '임차인', 'own.ocTenPh': '임차인 연락처', 'own.ocDep': '보증금', 'own.ocRent': '월세', 'own.ocEnd': '만기일', 'own.ocRight': '갱신청구권', 'own.ocParty': '계약주체', 'own.ocPartyName': '계약주체 상호' };

const get = (b, k) => k.startsWith('own.') ? ((b.own || {})[k.slice(4)]) : b[k];
const empty = (k, v) => v == null || v === '' || (k === 'own.ocType' && v === '미확인');

// 줄 하나 → { id, set: [[칸, 값]], ex } 또는 오류 글
function readRow(kind, raw) {
  const set = [], ex = {};
  if (kind === 'units') {
    const o = raw('occ'); if (o) { if (!OC_IN[o]) return '거주형태는 자가거주 · 전세 · 월세 · 반전세 · 공실 · 미확인'; set.push(['own.ocType', OC_IN[o]]); if (o === '반전세') ex.lease = { kind: '반전세' }; }
    const c = normDate(raw('chk')); if (c === null) return '확인일 날짜 형식 오류'; if (c) ex.checked_at = c;
  } else if (kind === 'owners') {
    const ph = normMobile(raw('phone')); if (ph === null) return '핸드폰 자릿수 오류';
    const cr = normCarrier(raw('carrier')); if (cr === null) return '통신사 인식 불가 (' + raw('carrier') + ')';
    set.push(['owner', raw('name')], ['phone', ph], ['carrier', cr]);
    for (const n of [1, 2]) {
      const r = normRel(raw('r' + n)), t = normTel(raw('p' + n));
      if (t === null) return '연락처' + n + ' 자릿수 오류';
      set.push(['c' + n + 'Rel', r.rel], ['c' + n + 'Etc', r.etc], ['c' + n + 'Phone', t]);
    }
    const since = normDate(raw('since')); if (since === null) return '취득일 날짜 형식 오류';
    const cause = raw('cause'); if (cause && !CAUSES.includes(cause)) return '취득원인은 ' + CAUSES.join(' · ');
    ex.owner = { share: raw('share') || undefined, since: since || undefined, cause: cause || undefined };
  } else {
    const k = raw('kind'); if (!['전세', '월세', '반전세'].includes(k)) return '유형은 전세 · 월세 · 반전세';
    const tph = normMobile(raw('tph')); if (tph === null) return '임차인 연락처 자릿수 오류';
    const dep = normMan(raw('dep')), rent = normMan(raw('rent'));
    if (dep === null || rent === null) return '금액은 만원 단위 숫자 (예: 30000 또는 3억)';
    if (k !== '전세' && !rent) return k + '는 월세 금액이 필요합니다';
    const d = {}; for (const f of ['con', 'mi', 'end']) { d[f] = normDate(raw(f)); if (d[f] === null) return { con: '계약일', mi: '입주일', end: '만기일' }[f] + ' 날짜 형식 오류'; }
    if (d.mi && d.end && d.end <= d.mi) return '만기일이 입주일보다 빠름';
    const right = raw('right'); if (right && !RIGHTS[right]) return '갱신청구권은 사용 · 미사용 · 확인필요';
    const party = raw('party');
    set.push(['own.ocType', k === '전세' ? '전세' : '월세'], ['own.ocTen', raw('ten')], ['own.ocTenPh', tph], ['own.ocDep', dep === '' ? '' : String(dep)], ['own.ocRent', k === '전세' ? '' : String(rent)],
      ['own.ocEnd', d.end], ['own.ocRight', right ? RIGHTS[right] : ''], ['own.ocParty', PARTIES.includes(party) ? party : party ? '타부동산' : ''], ['own.ocPartyName', party && !PARTIES.includes(party) ? party : '']);
    ex.lease = { kind: k, contract_date: d.con || undefined, move_in: d.mi || undefined, memo: raw('memo') || undefined };
  }
  return { set: set.filter(([, v]) => v !== '' && v != null), ex };
}

export function parseSheet(kind, aoa) {
  const C = COLS[kind];
  const hi = aoa.findIndex(r => Array.isArray(r) && r.some(c => String(c).trim() === '동') && r.some(c => String(c).trim() === '호'));
  if (hi < 0) return { err: '첫 줄에 동 · 호 제목이 필요합니다' };
  const H = aoa[hi].map(c => String(c).trim()), col = names => H.findIndex(h => names.includes(h));
  const ci = { b: col(['동']), h: col(['호']) };
  Object.keys(C).forEach(k => { ci[k] = col(C[k]); });
  const rows = [], seen = {};
  aoa.slice(hi + 1).forEach((r, i) => {
    if (!Array.isArray(r)) return;
    const raw = k => ci[k] >= 0 ? String(r[ci[k]] ?? '').trim() : '';
    if (/^※/.test(String(r[0] || ''))) return;
    const bs = raw('b').replace(/\D/g, ''), hs = raw('h').replace(/\D/g, '');
    if (!bs && !hs && r.every(c => String(c ?? '').trim() === '')) return;
    const line = hi + i + 2, id = bs + '-' + hs, row = { line, id, unit: bs + '동 ' + hs + '호', st: 'ok', msg: '' };
    if (!UNIT[id]) return rows.push(Object.assign(row, { st: 'err', msg: '없는 호실' }));
    if (seen[id]) return rows.push(Object.assign(row, { st: 'err', msg: seen[id] + '행과 호실 중복' }));
    seen[id] = line;
    const x = readRow(kind, raw);
    if (typeof x === 'string') return rows.push(Object.assign(row, { st: 'err', msg: x }));
    if (!x.set.length && !x.ex.checked_at) return rows.push(Object.assign(row, { st: 'err', msg: '입력된 칸이 없음' }));
    rows.push(Object.assign(row, x));
  });
  return { rows };
}

// 지금 덩어리에 적용한 결과 + 바뀌는 칸 설명
function merge(cur, r, mode, by, stamp) {
  const b = JSON.parse(JSON.stringify(cur || { status: '미확인' })), diffs = [];
  let changed = false;
  for (const [k, v] of r.set) {
    const old = get(b, k);
    if (mode === 'fill' && !empty(k, old)) continue;
    if (String(old ?? '') === String(v)) continue;
    if (!empty(k, old)) diffs.push((LABEL[k] || k) + ' ' + (/phone|Ph$/i.test(k) ? '변경' : old + '→' + v));
    if (k.startsWith('own.')) { b.own = Object.assign({}, b.own); b.own[k.slice(4)] = v; } else b[k] = v;
    changed = true;
  }
  if (changed) Object.assign(b, { dbAt: stamp, dbBy: by, srcXl: true });
  return { b, changed, diffs };
}

export async function importApi(req, env, u) {
  const db = env.DB, R = repo(env), perms = await getOne(db, 'cfg', 'perms');
  if (!can(u, 'unit.import', null, perms)) return J({ ok: false, err: 'perm' }, 403);
  const b = await body(req) || {}, who = { who: u.name, ip: ip(req), dev: device(req) };

  if (b.op === 'list') return J({ ok: true, list: await R.listImports(), canUndo: !!(await R.lastImport()) });

  if (b.op === 'undo') {
    const imp = await R.lastImport();
    if (!imp) return J({ ok: false, err: 'none' }, 404);
    await R.undoImport(imp, u.name);
    await audit(db, Object.assign({ act: '엑셀 가져오기 되돌림', target: KIND_LABEL[imp.kind] || imp.kind, detail: imp.file + ' · ' + imp.n + '세대' }, who));
    return J({ ok: true, n: imp.n });
  }

  const kind = b.kind, mode = b.mode === 'over' ? 'over' : 'fill';
  if (!COLS[kind] || !Array.isArray(b.rows) || b.rows.length > 3000) return J({ ok: false, err: 'input' }, 400);
  const P = parseSheet(kind, b.rows);
  if (P.err) return J({ ok: false, err: 'sheet', msg: P.err }, 400);
  const good = P.rows.filter(r => r.st !== 'err');
  const cur = await R.getUnits(good.map(r => r.id));
  const d = new Date(Date.now() + 9 * 3600e3).toISOString(), stamp = d.slice(0, 10) + ' ' + d.slice(11, 16);
  const out = [];
  for (const r of good) {
    const m = merge(cur[r.id], r, mode, u.name, stamp);
    r.next = m; r.st = !m.changed && !r.ex.checked_at ? 'same' : !cur[r.id] ? 'new' : m.diffs.length ? 'diff' : 'ok';
    r.msg = r.st === 'same' ? '바뀌는 칸 없음' : m.diffs.join(' · ');
    if (r.st !== 'same') out.push(r);
  }
  const view = P.rows.map(r => ({ line: r.line, unit: r.unit, st: r.st, msg: r.msg }));
  const cnt = { new: 0, ok: 0, diff: 0, same: 0, err: 0 };
  P.rows.forEach(r => { cnt[r.st]++; });

  if (b.op !== 'apply') return J({ ok: true, rows: view, cnt });

  const log = await R.saveUnits(out.map(r => ({ id: r.id, v: r.next.b, at: Date.now(), by: u.name, ex: r.ex })), { force: true });
  if (log.n) await R.addImport({ id: ulid(), by: u.name, kind, file: String(b.file || '').slice(0, 120), mode, n: log.n, undo: { created: log.created, before: log.before } });
  await audit(db, Object.assign({ act: '엑셀 가져오기', target: KIND_LABEL[kind], detail: String(b.file || '') + ' · ' + log.n + '세대 · ' + (mode === 'fill' ? '빈칸만' : '덮어쓰기') }, who));
  return J({ ok: true, n: log.n, cnt });
}
