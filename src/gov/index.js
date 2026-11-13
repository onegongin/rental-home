// 국토교통부 공공데이터 (A안, 2026-11-13 대표 결정) — 서버가 매일 받아 DB에 두고 화면은 DB만 읽는다
//   실거래가: 아파트 매매 실거래가 상세 · 아파트 전월세 실거래가 (시군구 LAWD_CD + 연월) → gov_trades 표
//   건축물대장: 건축HUB 총괄표제부 · 표제부 (지번) → kv cfg 'govBldg' + 공개 설정(listingCfg) 사용승인일 · 주차 빈칸 채움 ([확인] 은 대표가)
//   설정: site.json site.gov (지번 · 법정동 코드 · 단지명) · 비밀값 DATA_GO_KR_KEY (공공데이터포털 '일반 인증키(Decoding)')
//   시험: GOV_API 로 가짜 서버 주소를 넣음 (tests/gov.test.js)
//   59B · 59C 처럼 전용면적이 같은 타입은 실거래(동 · 호 비공개)로 구분할 수 없어 '59B·59C' 로 묶는다
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };
import { getOne, putRows } from '../repo/kv.js';

const G0 = (SITE.site || {}).gov || {};
// 설정 = site.json site.gov (+ 환경값 GOV_CFG JSON 이 있으면 덮어씀 — 시험 · 임시 값용)
const cfg = env => { let o = {}; try { o = env && env.GOV_CFG ? JSON.parse(env.GOV_CFG) : {}; } catch (e) { o = {}; } return Object.assign({}, G0, o); };
const TYPES = SITE.types || {};
const BLOCK = Object.keys((SITE.site || {}).blocks || {})[0] || '';
export const SOURCE = '국토교통부 실거래가 공개시스템';
const BASE = env => (env.GOV_API || 'https://apis.data.go.kr').replace(/\/$/, '');
const PATH = {
  sale: '/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  rent: '/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
  recap: '/1613000/BldRgstHubService/getBrRecapTitleInfo',
  title: '/1613000/BldRgstHubService/getBrTitleInfo'
};

export const ready = env => !!env.DATA_GO_KR_KEY && !!cfg(env).lawdCd;            // 실거래가 받을 수 있나
export const bldgReady = env => { const G = cfg(env); return !!env.DATA_GO_KR_KEY && !!G.bjdongCd && !!G.bun; };

export async function initGov(db) {
  await db.batch([
    // 실거래 1건 = 1줄. id = 거래 내용으로 만든 값(같은 거래를 다시 받아도 한 줄) · kind: sale 매매 | jeonse 전세 | wolse 월세
    //   price = 매매가 (만원) · dep = 보증금 (만원) · rent = 월세 (만원) · cancel = 해제된 거래 1
    db.prepare('CREATE TABLE IF NOT EXISTS gov_trades (id TEXT PRIMARY KEY, kind TEXT, ymd TEXT, type TEXT, area REAL, floor INTEGER, price INTEGER, dep INTEGER, rent INTEGER, cancel INTEGER DEFAULT 0, at INTEGER)'),
    db.prepare('CREATE INDEX IF NOT EXISTS gov_trades_ymd ON gov_trades (ymd)')
  ]);
}

// XML 응답 → [{ 태그: 값 }] (Workers 에는 DOMParser 가 없어 글자로 나눔)
export function parseItems(xml) {
  const s = String(xml || '');
  const code = (s.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1];
  if (code && !/^0+$/.test(code)) throw new Error('국토부 응답 오류 ' + code + ' ' + ((s.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1] || ''));
  const out = [];
  for (const m of s.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const o = {};
    for (const f of m[1].matchAll(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g)) o[f[1]] = f[2].trim();
    out.push(o);
  }
  return out;
}

const num = v => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const p2 = n => String(n).padStart(2, '0');

// 전용면적 → 타입 이름. 같은 면적 타입이 여럿이면 '59B·59C'. 맞는 게 없으면 '전용 59.6㎡'
export function typeOfArea(area) {
  const a = num(area);
  const hit = Object.entries(TYPES).filter(([, t]) => Object.values(t.byBlock || {}).some(b => Math.abs((b.exclusive || 0) - a) < 0.05)).map(([k]) => k);
  return hit.length ? hit.join('·') : '전용 ' + a.toFixed(1) + '㎡';
}

// 우리 단지 거래인가: 지번이 같거나 단지 이름에 aptName 이 들어 있음
const mine = (G, it) => (G.jibun && it.jibun === G.jibun) || (G.aptName && String(it.aptNm || '').replace(/\s/g, '').includes(G.aptName));

export function tradeRow(it, kind) {
  const ymd = num(it.dealYear) + '-' + p2(num(it.dealMonth)) + '-' + p2(num(it.dealDay));
  const area = num(it.excluUseAr), floor = num(it.floor);
  let k = kind, price = 0, dep = 0, rent = 0;
  if (kind === 'sale') price = num(it.dealAmount);
  else { dep = num(it.deposit); rent = num(it.monthlyRent); k = rent > 0 ? 'wolse' : 'jeonse'; }
  const cancel = it.cdealType && it.cdealType !== '' ? 1 : 0;
  const id = [k, ymd, area.toFixed(2), floor, price, dep, rent].join('|');
  return { id, kind: k, ymd, type: typeOfArea(area), area, floor, price, dep, rent, cancel };
}

async function call(env, path, q) {
  const u = new URL(BASE(env) + path);
  u.searchParams.set('serviceKey', env.DATA_GO_KR_KEY);
  Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error('국토부 연결 실패 ' + r.status);
  return parseItems(await r.text());
}

// 최근 months 개월 실거래를 받아 저장. { months, saved, seen }
export async function syncTrades(env, months = 3, now = Date.now()) {
  if (!ready(env)) return { skip: true };
  const db = env.DB, G = cfg(env); await initGov(db);
  const d = new Date(now + 9 * 3600e3);
  const yms = [];
  for (let i = 0; i < months; i++) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); yms.push(x.getUTCFullYear() + p2(x.getUTCMonth() + 1)); }
  let seen = 0; const rows = [];
  for (const ym of yms) {
    for (const kind of ['sale', 'rent']) {
      const items = await call(env, PATH[kind], { LAWD_CD: G.lawdCd, DEAL_YMD: ym, numOfRows: '1000', pageNo: '1' });
      seen += items.length;
      items.filter(it => mine(G, it)).forEach(it => rows.push(tradeRow(it, kind)));
    }
  }
  const at = Date.now(), st = rows.map(r => db.prepare('INSERT INTO gov_trades (id, kind, ymd, type, area, floor, price, dep, rent, cancel, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET cancel = excluded.cancel, type = excluded.type')
    .bind(r.id, r.kind, r.ymd, r.type, r.area, r.floor, r.price, r.dep, r.rent, r.cancel, at));
  for (let i = 0; i < st.length; i += 100) await db.batch(st.slice(i, i + 100));
  return { months, saved: rows.length, seen };
}

// 건축물대장 → govBldg + 공개 설정 빈칸 채우기
const day = v => { const s = String(v || '').replace(/\D/g, ''); return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) : ''; };
export async function syncBuilding(env) {
  if (!bldgReady(env)) return { skip: true };
  const G = cfg(env), db = env.DB, q = { sigunguCd: String(G.lawdCd || '').slice(0, 5), bjdongCd: G.bjdongCd, bun: String(G.bun).padStart(4, '0'), ji: String(G.ji || '0').padStart(4, '0'), numOfRows: '100', pageNo: '1' };
  const recap = (await call(env, PATH.recap, q))[0] || {};
  const titles = await call(env, PATH.title, q);
  const pk = x => num(x.totPkngCnt) || (num(x.indrAutoUtcnt) + num(x.oudrAutoUtcnt) + num(x.indrMechUtcnt) + num(x.oudrMechUtcnt));
  const parking = pk(recap) || titles.reduce((a, t) => a + pk(t), 0);
  const hh = num(recap.hhldCnt) || titles.reduce((a, t) => a + num(t.hhldCnt), 0);
  const useApr = day(recap.useAprDay) || titles.map(t => day(t.useAprDay)).filter(Boolean).sort()[0] || '';
  const b = { useAprDay: useApr, parking, households: hh, floors: Math.max(0, ...titles.map(t => num(t.grndFlrCnt))), basement: Math.max(0, ...titles.map(t => num(t.ugrndFlrCnt))),
    platPlc: recap.platPlc || (titles[0] || {}).platPlc || '', newPlatPlc: recap.newPlatPlc || (titles[0] || {}).newPlatPlc || '', dongs: titles.length, at: Date.now() };
  const rows = [{ s: 'cfg', k: 'govBldg', v: JSON.stringify(b), at: b.at, by: '건축물대장' }];
  // 공개 설정: 비어 있는 칸만 채우고 [확인] 은 그대로 (대표가 눌러야 공개에 씀)
  const cur = (await getOne(db, 'cfg', 'listingCfg')) || {};
  const next = Object.assign({}, cur), parkTxt = parking ? '총 ' + parking + '대' + (hh ? ' (세대당 약 ' + (Math.round(parking / hh * 100) / 100) + '대)' : '') + ' · 건축물대장' : '';
  let changed = false;
  if (!String(cur.approval || '').trim() && useApr) { next.approval = useApr + ' 사용승인 (건축물대장)'; changed = true; }
  if (BLOCK && parkTxt && !String((cur.parking || {})[BLOCK] || '').trim()) { next.parking = Object.assign({}, cur.parking, { [BLOCK]: parkTxt }); changed = true; }
  if (changed) rows.push({ s: 'cfg', k: 'listingCfg', v: JSON.stringify(next), at: b.at, by: '건축물대장' });
  await putRows(db, rows);
  return { bldg: b, filled: changed };
}

// 매일 새벽 자동 (worker.js scheduled) · 관리자 '지금 받기'. 결과는 cfg 'govSync'
export async function govSync(env, opt = {}) {
  const out = { at: Date.now() };
  try { out.trades = await syncTrades(env, opt.months || 3); } catch (e) { out.tradeErr = String(e.message || e).slice(0, 200); }
  // 건축물대장은 자주 안 바뀜 — 처음 · 월 1회(1일) · 직접 누를 때
  const d = new Date(Date.now() + 9 * 3600e3);
  const prev = await getOne(env.DB, 'cfg', 'govBldg');
  if (opt.force || !prev || d.getUTCDate() === 1) { try { out.building = await syncBuilding(env); } catch (e) { out.bldgErr = String(e.message || e).slice(0, 200); } }
  await putRows(env.DB, [{ s: 'cfg', k: 'govSync', v: JSON.stringify(out), at: out.at, by: '국토부' }]);
  return out;
}

// 손님 화면 '최근 실거래' — 해제 거래 빼고 최근 순. 호수 정보는 원래 없음 (국토부 공개 범위: 층까지)
export async function publicTrades(env) {
  const db = env.DB; await initGov(db);
  const rows = ((await db.prepare('SELECT kind, ymd, type, area, floor, price, dep, rent FROM gov_trades WHERE cancel = 0 ORDER BY ymd DESC, floor DESC LIMIT 30').all()).results) || [];
  const sync = await getOne(db, 'cfg', 'govSync');
  return { ok: true, source: SOURCE, on: ready(env), updated: sync ? sync.at : null, rows };
}

// 관리자 (대표 · 관리자): GET 상태 · POST { op: 'sync' } 지금 받기
export async function govAdmin(req, env, u) {
  if (!['대표', '관리자'].includes(u.role)) return new Response(JSON.stringify({ ok: false, err: 'perm' }), { status: 403, headers: { 'content-type': 'application/json' } });
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });
  if (req.method === 'POST') {
    if (!env.DATA_GO_KR_KEY) return J({ ok: false, err: 'nokey', msg: '공공데이터포털 인증키(DATA_GO_KR_KEY)가 아직 없습니다' }, 501);
    return J({ ok: true, result: await govSync(env, { force: true, months: 12 }) });
  }
  return J({ ok: true, key: !!env.DATA_GO_KR_KEY, cfg: cfg(env), last: await getOne(env.DB, 'cfg', 'govSync'), bldg: await getOne(env.DB, 'cfg', 'govBldg') });
}
