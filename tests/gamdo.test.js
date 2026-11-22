// 감도 (시안 r71 A안 · r73 확정 2026-11-22): 상담카드 계약관리 감도 → 상담이력대장 '감도' 칸 = 줄마다 그 상담 때 감도 + 직전보다 ▲ 오름 · ▽ 내림
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/daelasoo/dashboard.dc.html', import.meta.url), 'utf8');
const pick = name => { const m = src.match(new RegExp(String.raw`\n  ` + name + String.raw`\([^)]*\) \{[\s\S]*?(?=\n  [a-zA-Z_]+\(|\n  [A-Z]+ = |\n  //)`)); assert.ok(m, name); return m[0].trim(); };
const field = name => { const m = src.match(new RegExp(String.raw`\n  ` + name + String.raw` = ([^;]+);`)); assert.ok(m, name); return name + ': ' + m[1]; };

function fns(cards) {
  const o = new Function('return { ' + [field('GDK'), field('GDC')].concat(['gDig', 'gTs', 'pAlias', 'pKey', 'seqKeyOf', 'seqMap', 'gdRows'].map(pick)).join(',\n') + ' }')();
  o.state = { cards };
  return o;
}

test('감도 칸: 그 상담 때 값 · 안 고르면 직전 값 연하게 · 직전 고른 값과 비교 ▲ ▽', () => {
  const C = [
    { id: 'c1763000000001', at: '2026-11-15 10:00', kind: 'client', name: '김민수', phone: '010-1111-2222', ct: { gd: '중' } },
    { id: 'c1763000000002', at: '2026-11-20 10:00', kind: 'client', name: '김민수', phone: '01011112222', ct: { gd: '상하' } },
    { id: 'c1763000000003', at: '2026-11-21 10:00', kind: 'client', name: '김민수', phone: '010-1111-2222', ct: { prog: '가계약' } },
    { id: 'c1763000000004', at: '2026-11-22 10:00', kind: 'client', name: '김민수', phone: '010-1111-2222', ct: { gd: '상' } },
    { id: 'c1763000000005', at: '2026-11-18 10:00', kind: 'client', name: '이영희', phone: '010-3333-4444', ct: { gd: '중' } },
    { id: 'c1763000000006', at: '2026-11-21 10:00', kind: 'client', name: '이영희', phone: '010-3333-4444', ct: { gd: '하' } },
    { id: 'c1763000000007', at: '2026-11-22 10:00', kind: 'client', name: '이영희', phone: '010-3333-4444', ct: { gd: '하' } },
    { id: 'c1763000000008', at: '2026-11-19 10:00', kind: 'seller', unit: '102-803', name: '박철수', phone: '010-5555-6666' }
  ];
  const o = fns(C), r = o.gdRows(o.seqMap()), v = i => { const x = r[C[i].id]; return x ? x.gd + (x.soft ? '(연)' : '') + (x.dir === 'up' ? '▲' : x.dir === 'dn' ? '▽' : '') : '-'; };
  assert.deepEqual(C.map((c, i) => v(i)), ['중', '상하▲', '상하(연)', '상▲', '중', '하▽', '하', '-']);
});

test('화면: 감도 칸 = 호실 / 희망 과 성명 사이 · 성명 앞 표시는 뺌 · 휴대폰 칸 순서', () => {
  assert.match(src, /호실 \/ 희망<\/div>\n\s*<div title="[^"]*"[^>]*>감도<\/div>\n\s*<div[^>]*>성명<\/div>/);
  assert.equal((src.match(/96px 64px 100px 110px 72px 90px 120px/g) || []).length, 2);
  assert.equal((src.match(/\{\{ l\.gd \}\}<\/span><\/sc-if>\{\{ l\.name \}\}/g) || []).length, 0);
  assert.match(src, /"unit gd name ed"/);
  assert.match(src, /감도<select value="\{\{ f\.ctGd \}\}"/);
});
