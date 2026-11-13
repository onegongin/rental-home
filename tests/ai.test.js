// AI로 다듬기 Gemini · Claude 고르기 (시안 ai-provider 가 확정 2026-11-04) — 진짜 Google 대신 가짜 Gemini 서버
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createTestHarness } from './harness.js';
import { pickProvider, readGemini, geminiErr, geminiModel, GEMINI_MODEL } from '../src/ads/ai.js';

const KEY = 'test-office-code';
let mf, fake, seen = [], mode = 'ok';
before(async () => {
  fake = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-goog-api-key'], body: b });
      res.setHeader('content-type', 'application/json');
      if (req.url.includes('/models?')) return res.end(JSON.stringify({ models: [{ name: 'models/gemini-x-flash', displayName: 'Gemini X Flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] }] }));
      if (mode === 'busy') { res.statusCode = 429; return res.end(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } })); }
      res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '다듬은 글입니다.' }] } }] }));
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: 'g-test', GEMINI_API: 'http://127.0.0.1:' + fake.address().port } }] });
  await mf.listen();
});
after(() => { mf && mf.close(); fake && fake.close(); });

function agent(ipAddr) {
  const jar = {};
  return async (path, opt = {}) => {
    const headers = { 'content-type': 'application/json', 'cf-connecting-ip': ipAddr };
    const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (c) headers.cookie = c;
    const r = await mf.fetch('http://localhost' + path, { method: opt.body ? 'POST' : 'GET', headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (/Max-Age=0/.test(s)) delete jar[m[1]]; else jar[m[1]] = m[2]; } });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json };
  };
}

test('고르기: auto 는 Gemini 먼저 · 고른 쪽 키가 없으면 다른 쪽 · off 는 없음', () => {
  const both = { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'c' };
  assert.equal(pickProvider(both, null), 'gemini');
  assert.equal(pickProvider(both, { provider: 'claude' }), 'claude');
  assert.equal(pickProvider({ ANTHROPIC_API_KEY: 'c' }, { provider: 'gemini' }), 'claude');
  assert.equal(pickProvider(both, { provider: 'off' }), '');
  assert.equal(pickProvider({}, null), '');
  assert.equal(geminiModel({}, null), GEMINI_MODEL);
  assert.equal(geminiModel({}, { model: 'models/gemini-x' }), 'gemini-x');
});

test('Gemini 답 해석: 글 · 막힘 · 빈 답 · 한도', () => {
  assert.deepEqual(readGemini({ candidates: [{ content: { parts: [{ text: '생각', thought: true }, { text: ' 글 ' }] } }] }), { ok: true, text: '글' });
  assert.equal(readGemini({ promptFeedback: { blockReason: 'SAFETY' } }).err, 'refusal');
  assert.equal(readGemini({ candidates: [{ finishReason: 'SAFETY' }] }).err, 'refusal');
  assert.equal(readGemini({ candidates: [] }).err, 'api');
  assert.equal(geminiErr(429, {}).err, 'busy');
  assert.match(geminiErr(404, {}).msg, /모델/);
});

test('광고 탭: AI 상태 · 모델 목록 · 시험 (대표만) — 키는 머리글로, 본문에 매물 조건만', async () => {
  const boss = agent('8.8.1.1');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  const st = (await boss('/api/staff/ads')).json.ai;
  assert.equal(st.by, 'gemini');
  assert.deepEqual(st.keys, { gemini: true, claude: false });
  assert.equal(st.edit, true);
  const ms = (await boss('/api/staff/ads?models=1')).json.models;
  assert.deepEqual(ms.map(m => m.id), ['gemini-x-flash'], '글 만드는 모델만');
  let t = await boss('/api/staff/ads', { body: { op: 'aiTest' } });
  assert.equal(t.json.ok, true);
  assert.equal(t.json.by, 'Gemini');
  const call = seen.find(x => x.url.includes(':generateContent'));
  assert.ok(call.url.includes('models/' + GEMINI_MODEL + ':generateContent') && call.key === 'g-test' && !call.url.includes('g-test'));
  assert.ok(JSON.parse(call.body).systemInstruction.parts[0].text.includes('과장'));
  mode = 'busy';
  t = await boss('/api/staff/ads', { body: { op: 'aiTest' } });
  assert.equal(t.json.err, 'busy');
  // 끄기
  await boss('/api/staff/push', { body: { rows: [{ s: 'cfg', k: 'aiCfg', v: JSON.stringify({ provider: 'off' }), at: Date.now() }] } });
  assert.equal((await boss('/api/staff/ads')).json.ai.by, '');
});
