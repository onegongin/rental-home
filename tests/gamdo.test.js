// 감도 (시안 r71 A안 확정 2026-11-22): 상담카드 계약관리 감도 → 상담이력대장 성명 앞 = 손님별 가장 최근에 고른 감도
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/daelasoo/dashboard.dc.html', import.meta.url), 'utf8');
const pick = name => { const m = src.match(new RegExp(String.raw`\n  ` + name + String.raw`\([^)]*\) \{[\s\S]*?(?=\n  [a-zA-Z_]+\(|\n  //)`)); assert.ok(m, name); return m[0].trim(); };
const field = name => { const m = src.match(new RegExp(String.raw`\n  ` + name + String.raw` = ([^;]+);`)); assert.ok(m, name); return name + ': ' + m[1]; };

function fns(cards) {
  const o = new Function('return { ' + [field('GDK'), field('GDC')].concat(['gDig', 'gTs', 'pAlias', 'pKey', 'seqKeyOf', 'seqMap'].map(pick), [src.match(/\n  (gdMap\(SQ\) \{[^\n]*)\n/)[1]]).join(',\n') + ' }')();
  o.state = { cards };
  return o;
}

test('감도: 손님별 가장 최근에 고른 값 · 비워 두면 그 전 값 · 다른 손님은 따로', () => {
  const C = [
    { id: 'c1763000000001', at: '2026-11-15 10:00', kind: 'client', name: '김민수', phone: '010-1111-2222', ct: { gd: '중' } },
    { id: 'c1763000000002', at: '2026-11-20 10:00', kind: 'client', name: '김민수', phone: '01011112222', ct: { gd: '상' } },
    { id: 'c1763000000003', at: '2026-11-22 10:00', kind: 'client', name: '김민수', phone: '010-1111-2222', ct: { prog: '가계약' } },
    { id: 'c1763000000004', at: '2026-11-21 10:00', kind: 'client', name: '이영희', phone: '010-3333-4444', ct: { gd: '중하' } },
    { id: 'c1763000000005', at: '2026-11-19 10:00', kind: 'seller', unit: '102-803', name: '박철수', phone: '010-5555-6666' },
    { id: 'c1763000000006', at: '2026-11-23 10:00', kind: 'client', name: '이영희', phone: '010-3333-4444', ct: { gd: '없는값' } }
  ];
  const o = fns(C), SQ = o.seqMap(), m = o.gdMap(SQ), g = i => (m[SQ[C[i].id].k] || {}).gd;
  assert.equal(g(0), '상'); assert.equal(g(2), '상');
  assert.equal(g(3), '중하');
  assert.equal(g(4), undefined);
  assert.deepEqual(o.GDK, ['최상', '상', '상하', '중상', '중', '중하', '하']);
});

test('화면: 계약관리 줄에 감도 · 성명 두 곳(손님 등록 · 일반) 앞에 표시', () => {
  assert.match(src, /감도<select value="\{\{ f\.ctGd \}\}" onChange="\{\{ f\.onCtGd \}\}"/);
  assert.equal((src.match(/\{\{ l\.gd \}\}<\/span><\/sc-if>\{\{ l\.name \}\}/g) || []).length, 2);
});
