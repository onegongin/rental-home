// D1 통역기 — 세대 · 사람 · 소유 · 임대차 정식 표 (설계서 8.1 · 8.2)
//   화면은 지금처럼 세대 덩어리(u)를 주고받고, 여기서 소유자 · 임대차 표로 나눠 이력까지 남긴다
//   소유자 · 임차인이 바뀌면 이전 줄은 is_current=0 으로 닫고 새 줄을 더한다 (지우지 않음)
import { UNITS } from '../core/units.js';
import { ulid } from '../lib/id.js';
import { occOf, ownerOf, leaseOf, samePerson, phoneDigits, today, dday } from '../core/tenancy.js';

const COMMON = 'created_at TEXT, created_by TEXT, updated_at TEXT, updated_by TEXT, deleted_at TEXT, ver INTEGER DEFAULT 1';
const TABLES = [
  `CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, dong INTEGER, ho INTEGER, floor INTEGER, line INTEGER, type TEXT, block TEXT, occupancy TEXT DEFAULT '미확인', checked_at TEXT, checked_by TEXT, data TEXT, at INTEGER DEFAULT 0, by TEXT, sv INTEGER DEFAULT 0, ${COMMON})`,
  'CREATE INDEX IF NOT EXISTS units_sv ON units (sv)',
  `CREATE TABLE IF NOT EXISTS persons (id TEXT PRIMARY KEY, name TEXT, phone TEXT, phone_d TEXT, carrier TEXT, contacts TEXT, memo TEXT, ${COMMON})`,
  'CREATE INDEX IF NOT EXISTS persons_phone ON persons (phone_d)',
  `CREATE TABLE IF NOT EXISTS unit_owners (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, person_id TEXT, share TEXT, since TEXT, cause TEXT, is_current INTEGER DEFAULT 1, until TEXT, ${COMMON})`,
  'CREATE INDEX IF NOT EXISTS owners_unit ON unit_owners (unit_id, is_current)',
  `CREATE TABLE IF NOT EXISTS tenancies (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, person_id TEXT, kind TEXT, deposit INTEGER, rent INTEGER, contract_date TEXT, move_in TEXT, end_date TEXT, moved_out TEXT, renewal_right TEXT, implicit_renewal INTEGER DEFAULT 0, ours INTEGER DEFAULT 0, party TEXT, party_name TEXT, memo TEXT, is_current INTEGER DEFAULT 1, ${COMMON})`,
  'CREATE INDEX IF NOT EXISTS ten_unit ON tenancies (unit_id, is_current)',
  // 엑셀 가져오기 기록 (되돌리기용: 만든 줄 · 바꾸기 전 줄)
  'CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, at INTEGER, by TEXT, kind TEXT, file TEXT, mode TEXT, n INTEGER, undo TEXT, undone INTEGER DEFAULT 0)'
];
// 직원이 직접 고칠 수 있는 임대차 칸
export const TEN_EDIT = ['kind', 'deposit', 'rent', 'contract_date', 'move_in', 'end_date', 'moved_out', 'renewal_right', 'implicit_renewal', 'ours', 'party', 'party_name', 'memo'];

const iso = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + '+09:00';
let svN = 0;
const nextSv = () => Date.now() * 1000 + (svN = (svN + 1) % 1000);
const parse = v => { try { return JSON.parse(v); } catch (e) { return null; } };

const ready = new Set();   // DB마다 한 번

export function d1(db) {
  const all = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
  const run = async st => { for (let i = 0; i < st.length; i += 100) await db.batch(st.slice(i, i + 100)); };
  // id 목록으로 여러 줄 (90개씩 나눠서)
  const inIds = async (sql, ids) => {
    const out = [], u = [...new Set(ids)].filter(Boolean);
    for (let i = 0; i < u.length; i += 90) { const p = u.slice(i, i + 90); out.push(...await all(sql.replace('(?)', '(' + p.map(() => '?').join(',') + ')'), ...p)); }
    return out;
  };

  const R = {
    async ready() {
      if (ready.has(db.key || 'd1')) return;
      await db.batch(TABLES.map(s => db.prepare(s)));
      const n = (await db.prepare('SELECT COUNT(*) n FROM units').first()).n;
      if (n < UNITS.length) {
        const t = iso();
        await run(UNITS.map(u => db.prepare('INSERT OR IGNORE INTO units (id, dong, ho, floor, line, type, block, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(u.id, u.dong, u.ho, u.floor, u.line, u.type, u.block, t, '시스템')));
      }
      // P2까지 kv 보관함(s='u')에 있던 세대 자료를 정식 표로 한 번 옮김
      const old = await all("SELECT k, v, at, by FROM kv WHERE s = 'u'");
      if (old.length) {
        await R.saveUnits(old.map(r => ({ id: r.k, v: parse(r.v), at: r.at, by: r.by || '옮김' })), { force: true, noHist: true });
        await db.prepare("DELETE FROM kv WHERE s = 'u'").run();
      }
      ready.add(db.key || 'd1');
    },

    // 화면 동기화: 바뀐 세대 덩어리 (kv 줄과 같은 모양)
    async pullUnits(since, lim) {
      return (await all('SELECT id k, data v, at, by, sv FROM units WHERE sv > ? ORDER BY sv LIMIT ?', since, lim)).map(r => Object.assign({ s: 'u' }, r));
    },
    async getUnits(ids) {
      const out = {};
      (await inIds('SELECT id, data FROM units WHERE id IN (?)', ids)).forEach(r => { if (r.data != null) out[r.id] = parse(r.data); });
      return out;
    },

    // 세대 덩어리 저장 + 소유자 · 임대차 표 맞추기
    //   rows: [{ id, v(덩어리 또는 null=삭제), at, by, ex: { owner: { share, since, cause }, lease: { kind, contract_date, move_in, memo }, checked_at } }]
    //   opt.force: 시각 비교 없이 덮어씀 (가져오기 · 옮기기) · 돌려주는 값: 되돌리기 기록 { created, before }
    async saveUnits(rows, opt = {}) {
      const log = { created: [], before: [] };
      if (!rows.length) return Object.assign(log, { n: 0 });
      const ids = rows.map(r => r.id);
      const units = {}; (await inIds('SELECT * FROM units WHERE id IN (?)', ids)).forEach(r => { units[r.id] = r; });
      const owners = {}; (await inIds('SELECT * FROM unit_owners WHERE is_current = 1 AND deleted_at IS NULL AND unit_id IN (?)', ids)).forEach(r => { owners[r.unit_id] = r; });
      const tens = {}; (await inIds('SELECT * FROM tenancies WHERE is_current = 1 AND deleted_at IS NULL AND unit_id IN (?)', ids)).forEach(r => { tens[r.unit_id] = r; });
      const people = {};
      (await inIds('SELECT * FROM persons WHERE id IN (?)', Object.values(owners).concat(Object.values(tens)).map(r => r.person_id))).forEach(p => { people[p.id] = p; });
      // 같은 번호 · 같은 이름이면 기존 사람을 다시 씀
      const phones = rows.flatMap(r => { const b = r.v || {}; return [phoneDigits(b.phone), phoneDigits((b.own || {}).ocTenPh)]; }).filter(Boolean);
      const byPhone = {};
      (await inIds('SELECT * FROM persons WHERE deleted_at IS NULL AND phone_d IN (?)', phones)).forEach(p => { people[p.id] = p; (byPhone[p.phone_d] = byPhone[p.phone_d] || []).push(p); });

      const st = [], now = iso(), day = today();
      let n = 0;
      const ins = (t, o) => {
        const k = Object.keys(o);
        st.push(db.prepare('INSERT INTO ' + t + ' (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => o[x] ?? null)));
        log.created.push([t, o.id]);
      };
      const upd = (t, row, patch, by) => {
        const k = Object.keys(patch).filter(x => (patch[x] ?? null) !== (row[x] ?? null));
        if (!k.length) return;
        log.before.push([t, Object.assign({}, row)]);
        st.push(db.prepare('UPDATE ' + t + ' SET ' + k.map(x => x + ' = ?').join(', ') + ', updated_at = ?, updated_by = ?, ver = ver + 1 WHERE id = ?').bind(...k.map(x => patch[x] ?? null), now, by, row.id));
        Object.assign(row, patch);
      };
      const person = (name, phone, extra, by) => {
        const d = phoneDigits(phone);
        const hit = d && (byPhone[d] || []).find(p => samePerson(p, { name, phone }));
        if (hit) { upd('persons', hit, Object.assign({ name: name || hit.name }, extra), by); return hit.id; }
        const p = Object.assign({ id: ulid(), name, phone, phone_d: d, created_at: now, created_by: by, ver: 1 }, extra);
        ins('persons', p); people[p.id] = p;
        if (d) (byPhone[d] = byPhone[d] || []).push(p);
        return p.id;
      };

      for (const r of rows) {
        const u = units[r.id];
        if (!u) continue;                                     // 없는 호실
        const at = Number(r.at) || Date.now(), by = r.by || '';
        if (!opt.force && at < (u.at || 0)) continue;        // 나중 시각이 이김 (예전 방식 그대로)
        const b = r.v, ex = r.ex || {};
        const occ = b ? occOf(b) : '미확인';
        log.before.push(['units', { id: u.id, data: u.data, occupancy: u.occupancy, checked_at: u.checked_at, checked_by: u.checked_by }]);
        const sv = nextSv(), data = b == null ? 'null' : JSON.stringify(b);
        const chk = ex.checked_at || (occ !== u.occupancy ? day : u.checked_at);
        st.push(db.prepare('UPDATE units SET data = ?, at = ?, by = ?, sv = ?, occupancy = ?, checked_at = ?, checked_by = ?, updated_at = ?, updated_by = ?, ver = ver + 1 WHERE id = ?')
          .bind(data, at, by, sv, occ, chk, chk !== u.checked_at ? by : u.checked_by, now, by, u.id));
        if (!opt.noHist) st.push(db.prepare("INSERT INTO hist (s, k, v, at, by, sv) VALUES ('u', ?, ?, ?, ?, ?)").bind(u.id, data, at, by, sv));
        Object.assign(u, { data, at, occupancy: occ });
        n++;

        // 소유자
        const o = ownerOf(b), co = owners[u.id], cp = co && people[co.person_id];
        const pex = { carrier: o.carrier || null, contacts: o.contacts.length ? JSON.stringify(o.contacts) : null };
        const oex = ex.owner || {};
        if (!o.name && !o.phone) { if (co) upd('unit_owners', co, { is_current: 0, until: day }, by); }
        else if (co && cp && samePerson(cp, o)) {
          upd('persons', cp, Object.assign({ name: o.name || cp.name, phone: o.phone || cp.phone, phone_d: phoneDigits(o.phone || cp.phone) }, pex), by);
          const op = {}; ['share', 'since', 'cause'].forEach(k => { if (oex[k]) op[k] = oex[k]; });
          upd('unit_owners', co, op, by);
        } else {
          if (co) upd('unit_owners', co, { is_current: 0, until: oex.since || day }, by);
          const pid = person(o.name, o.phone, pex, by);
          const row = { id: ulid(), unit_id: u.id, person_id: pid, share: oex.share, since: oex.since, cause: oex.cause, is_current: 1, created_at: now, created_by: by, ver: 1 };
          ins('unit_owners', row); owners[u.id] = row;
        }

        // 임대차
        const l = leaseOf(b), ct = tens[u.id], tp = ct && people[ct.person_id];
        const lex = ex.lease || {};
        if (!l) { if (ct) upd('tenancies', ct, { is_current: 0, moved_out: ct.moved_out || day }, by); continue; }
        const kind = lex.kind || l.kind;
        const terms = { deposit: l.deposit, rent: l.rent, end_date: l.end_date, renewal_right: l.renewal_right || null, party: l.party || null, party_name: l.party_name || null };
        ['contract_date', 'move_in', 'memo'].forEach(k => { if (lex[k]) terms[k] = lex[k]; });
        const sameKind = ct && (ct.kind === kind || (ct.kind === '반전세' && kind === '월세'));
        if (ct && sameKind && samePerson({ name: tp ? tp.name : '', phone: tp ? tp.phone : '' }, { name: l.tenant, phone: l.tenant_phone })) {
          if (tp) upd('persons', tp, { name: l.tenant || tp.name, phone: l.tenant_phone || tp.phone, phone_d: phoneDigits(l.tenant_phone || tp.phone) }, by);
          const pid = !tp && (l.tenant || l.tenant_phone) ? person(l.tenant, l.tenant_phone, {}, by) : ct.person_id;
          upd('tenancies', ct, Object.assign({ person_id: pid, kind: lex.kind || ct.kind }, terms), by);
        } else {
          if (ct) upd('tenancies', ct, { is_current: 0, moved_out: ct.moved_out || lex.move_in || day }, by);
          const pid = l.tenant || l.tenant_phone ? person(l.tenant, l.tenant_phone, {}, by) : null;
          const row = Object.assign({ id: ulid(), unit_id: u.id, person_id: pid, kind, is_current: 1, created_at: now, created_by: by, ver: 1 }, terms);
          ins('tenancies', row); tens[u.id] = row;
        }
      }
      await run(st);
      return Object.assign(log, { n });
    },

    // 세대 상세: 호실 · 소유자 이력 · 임대차 이력 (새 것부터)
    async unitDetail(id) {
      const unit = await db.prepare('SELECT id, dong, ho, floor, line, type, block, occupancy, checked_at, checked_by FROM units WHERE id = ?').bind(id).first();
      if (!unit) return null;
      const owners = await all('SELECT o.id, o.share, o.since, o.cause, o.is_current, o.until, o.created_at, o.created_by, p.name, p.phone, p.carrier, p.contacts FROM unit_owners o LEFT JOIN persons p ON p.id = o.person_id WHERE o.unit_id = ? AND o.deleted_at IS NULL ORDER BY o.is_current DESC, o.created_at DESC, o.id DESC', id);
      const tenancies = await all('SELECT t.*, p.name, p.phone FROM tenancies t LEFT JOIN persons p ON p.id = t.person_id WHERE t.unit_id = ? AND t.deleted_at IS NULL ORDER BY t.is_current DESC, t.created_at DESC, t.id DESC', id);
      owners.forEach(o => { o.contacts = parse(o.contacts) || []; });
      return { unit, owners, tenancies };
    },

    // 현재 임대차 전체 + 남은 날 (임차만기 화면)
    async currentTenancies(now = today()) {
      const rows = await all('SELECT t.id, t.unit_id, t.kind, t.deposit, t.rent, t.contract_date, t.move_in, t.end_date, t.renewal_right, t.implicit_renewal, t.ours, t.party, t.party_name, t.memo, p.name, p.phone, u.dong, u.ho, u.type, u.block FROM tenancies t JOIN units u ON u.id = t.unit_id LEFT JOIN persons p ON p.id = t.person_id WHERE t.is_current = 1 AND t.deleted_at IS NULL');
      rows.forEach(r => { r.dday = r.end_date ? dday(r.end_date, now) : null; });
      return rows.sort((a, b) => (a.dday ?? 1e9) - (b.dday ?? 1e9) || a.dong - b.dong || a.ho - b.ho);
    },

    async getTenancy(id) { return db.prepare('SELECT * FROM tenancies WHERE id = ?').bind(id).first(); },
    // 지난 임대차 직접 고치기 (현재 임대차는 세대 덩어리로 고친다)
    async updateTenancy(row, patch, by) {
      const k = Object.keys(patch); if (!k.length) return;
      await db.prepare('UPDATE tenancies SET ' + k.map(x => x + ' = ?').join(', ') + ', updated_at = ?, updated_by = ?, ver = ver + 1 WHERE id = ?').bind(...k.map(x => patch[x] ?? null), iso(), by, row.id).run();
    },

    // 가져오기 기록 · 되돌리기
    async addImport(o) {
      await db.prepare('INSERT INTO imports (id, at, by, kind, file, mode, n, undo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(o.id, Date.now(), o.by, o.kind, o.file, o.mode, o.n, JSON.stringify(o.undo)).run();
    },
    async listImports(lim = 20) { return all('SELECT id, at, by, kind, file, mode, n, undone FROM imports ORDER BY at DESC LIMIT ?', lim); },
    async lastImport() { return db.prepare('SELECT * FROM imports WHERE undone = 0 ORDER BY at DESC LIMIT 1').first(); },
    async undoImport(imp, by) {
      const L = parse(imp.undo) || { created: [], before: [] }, st = [], seen = new Set();
      // 만든 줄 지우기
      for (const [t, id] of L.created) st.push(db.prepare('DELETE FROM ' + t + ' WHERE id = ?').bind(id));
      // 바꾸기 전 줄로 (같은 줄은 처음 모습만)
      for (const [t, row] of L.before) {
        if (seen.has(t + row.id)) continue; seen.add(t + row.id);
        if (t === 'units') {
          const sv = nextSv(), data = row.data == null ? 'null' : row.data;
          st.push(db.prepare('UPDATE units SET data = ?, occupancy = ?, checked_at = ?, checked_by = ?, at = ?, by = ?, sv = ? WHERE id = ?').bind(data, row.occupancy, row.checked_at, row.checked_by, Date.now(), by, sv, row.id));
          st.push(db.prepare("INSERT INTO hist (s, k, v, at, by, sv) VALUES ('u', ?, ?, ?, ?, ?)").bind(row.id, data, Date.now(), by, sv));
        } else {
          const k = Object.keys(row).filter(x => x !== 'id');
          st.push(db.prepare('UPDATE ' + t + ' SET ' + k.map(x => x + ' = ?').join(', ') + ' WHERE id = ?').bind(...k.map(x => row[x] ?? null), row.id));
        }
      }
      st.push(db.prepare('UPDATE imports SET undone = 1 WHERE id = ?').bind(imp.id));
      await run(st);
    }
  };
  return R;
}
