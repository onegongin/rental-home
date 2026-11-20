// 상담카드 → 일일업무보고 · 청구서 상담 목록 (유입경로 예전 목록 · 지금 묶음 둘 다, 2026-11-21 못 불러오던 것)
import test from 'node:test';
import assert from 'node:assert/strict';
import { asConsults } from '../src/repo/dash-cards.js';

test('유입경로가 묶음({ ch: [...] })이어도 · 목록이어도 · 없어도 멈추지 않음', () => {
  const cards = [
    { id: 'c1', kind: 'client', at: '2026-11-20 10:00', phone: '010-1111-2222', name: '가', inflow: { ch: ['방문', '사이트'], media: [] } },
    { id: 'c2', kind: 'client', at: '2026-11-20 11:00', phone: '010-3333-4444', name: '나', inflow: ['방문'] },
    { id: 'c3', kind: 'seller', at: '2026-11-20 12:00', phone: '', name: '다', unit: '101-401' },
    { id: 'g1', kind: 'client', at: '2026-11-20 13:00', phone: '010-5555-6666', name: '손님', guest: true, inflow: { ch: ['사이트'] } }
  ];
  const r = asConsults(cards);
  assert.equal(r.consults.length, 4);
  assert.equal(r.logs.find(l => l.consult_id === 'c1').channel, '방문상담');
  assert.equal(r.logs.find(l => l.consult_id === 'c2').channel, '방문상담');
  assert.equal(r.consults.find(c => c.id === 'c1').ctype, '방문');
});
