// 호실 상세 분양가 칸: 보증금 = 현재 임대차(전세연장 인상 금액), 없으면 고객DB 처음 금액 (시안 r67 확정 2026-11-19)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/daelasoo/dashboard.dc.html', import.meta.url), 'utf8');

test('leaseDepOf: 현재 임대차 보증금(만원) → 원, 없으면 0', () => {
  const m = src.match(/\n  leaseDepOf\(id\) \{[^\n]*\n/); assert.ok(m);
  const o = new Function('return { ' + m[0].trim() + ' }')();
  o.state = { lease: { rows: [{ unit_id: '102-1501', deposit: 23220 }, { dong: 103, ho: 901, deposit: 0 }] } };
  assert.equal(o.leaseDepOf('102-1501'), 232200000);
  assert.equal(o.leaseDepOf('103-901'), 0);
  assert.equal(o.leaseDepOf('101-401'), 0);
});

test('필요금액은 고친 보증금(dp)으로 · 화면 두 곳 모두 이름 칸 연결', () => {
  assert.match(src, /need: w\(Math\.max\(v - dp, 0\)\)/);
  assert.equal((src.match(/\{\{ p\.pr\.depLbl \}\}/g) || []).length, 2);
  assert.equal((src.match(/임대보증금 \(고객DB\)<\/span>/g) || []).length, 0);
});
