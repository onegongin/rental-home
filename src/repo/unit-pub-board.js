// 손님 화면 공개 세대 → 매물보드 카드 (시안 r56 A안 확정 2026-11-17)
//   공개 거래 구분(public_units.deal) 매매 · 전세 · 둘 다 → listings 줄 (source 'unitpub', 상태 '광고중')
//   매매 = 매입보장가(ask, 만원) · 전세 = 임대보증금(dep, 만원, 직원 화면만). 공개 사본은 이 줄이 아니라 public_units · 'nu' 줄이 맡음 (pub 'off' 그대로)
//   공개가 꺼지면 카드는 '철회', 계약조건이 생겼거나 계약완료 · 신규입주면 '계약'
import { ulid } from '../lib/id.js';
import * as LR from './listings.js';
import { priceOf } from '../core/price.js';
import { UNIT } from '../core/units.js';

export const SRC = 'unitpub';
export const LIVE = ['접수', '확인중', '광고중', '협의중', '가계약'];
export const dealsOf = d => d === '둘 다' ? ['sale', 'jeonse'] : d === '전세' ? ['jeonse'] : d === '매매' ? ['sale'] : [];
export const dealKo = ds => ds.includes('sale') && ds.includes('jeonse') ? '둘 다' : ds.includes('sale') ? '매매' : ds.includes('jeonse') ? '전세' : '';
const terms = (id, deal) => { const p = priceOf(id) || {}; return deal === 'sale' ? { ask: p.hedge ? Math.round(p.hedge / 1e4) : null } : { dep: p.dep ? Math.round(p.dep / 1e4) : null }; };

async function contracted(db, id) {
  const u = await db.prepare("SELECT json_extract(data, '$.cond') AS c FROM units WHERE id = ?").bind(id).first();
  const c = await db.prepare('SELECT status FROM unit_conv WHERE unit_id = ?').bind(id).first();
  return !!(u && u.c && u.c !== '-') || !!(c && ['계약완료', '신규입주'].includes(c.status));
}

export async function syncUnitBoard(db, id, by) {
  if (!UNIT[id]) return;
  try {
    const pu = await db.prepare('SELECT deal, by FROM public_units WHERE unit_id = ?').bind(id).first();
    const want = pu ? dealsOf(pu.deal || '매매') : [];
    const rows = (await db.prepare('SELECT * FROM listings WHERE unit_id = ? AND source = ? AND deleted_at IS NULL ORDER BY created_at DESC').bind(id, SRC).all()).results || [];
    if (!want.length && !rows.some(r => LIVE.includes(r.status))) return;
    const cfg = await LR.loadCfg(db), who = by || '자동', now = Date.now();
    let done = null;
    for (const deal of ['sale', 'jeonse']) {
      const cur = rows.find(r => r.deal === deal), t = terms(id, deal);
      if (want.includes(deal)) {
        if (!cur || ['계약', '잔금완료'].includes(cur.status)) {
          const lid = ulid(), mgr = (pu && pu.by) || who, row = Object.assign({ id: lid, unit_id: id, deal, status: '광고중', pub: 'off', source: SRC, writer: mgr, mgr, mgmt_items: '[]', urgent: 0, at: now, created_at: now, ver: 1 }, t), k = Object.keys(row);
          await db.batch([db.prepare('INSERT INTO listings (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => row[x] ?? null)),
            db.prepare('INSERT INTO listing_events (listing_id, at, who, act, detail) VALUES (?, ?, ?, ?, ?)').bind(lid, now, who, '광고중', '손님 화면 공개 (' + (deal === 'sale' ? '신규분양' : '전세') + ')')]);
        } else {
          const patch = {}, ev = [];
          if (!LIVE.includes(cur.status)) { patch.status = '광고중'; ev.push(['상태', cur.status + ' → 광고중 · 손님 화면 공개']); }
          Object.keys(t).forEach(k => { if (t[k] != null && t[k] !== cur[k]) patch[k] = t[k]; });
          if (Object.keys(patch).length) await LR.commit(db, cur, patch, { who, cfg, events: ev.length ? ev : [['금액 갱신', Object.keys(patch).join(', ')]] });
        }
      } else if (cur && LIVE.includes(cur.status)) {
        if (done === null) done = await contracted(db, id);
        const st = done ? '계약' : '철회';
        await LR.commit(db, cur, { status: st }, { who, cfg, events: [['상태', cur.status + ' → ' + st + ' · 손님 화면 공개 ' + (done ? '내림 (계약)' : '끔')]] });
      }
    }
  } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
}

// 공개 중인데 카드가 없는 세대 (이 기능 전에 공개한 세대 등) → 카드 만들기. 보드를 열 때
export async function fillUnitBoard(db) {
  const r = (await db.prepare("SELECT p.unit_id, p.by FROM public_units p WHERE NOT EXISTS (SELECT 1 FROM listings l WHERE l.unit_id = p.unit_id AND l.source = 'unitpub' AND l.deleted_at IS NULL AND l.status IN ('접수', '확인중', '광고중', '협의중', '가계약'))").all()).results || [];
  for (const x of r) await syncUnitBoard(db, x.unit_id, x.by);
  return r.length;
}
