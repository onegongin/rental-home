// 팝업 그림 · 첨부파일 자동 테스트 (시안 popup-image 확정 2026-11-04)
//   올리기 · 팝업 저장은 대표 · 관리자만 / 공개 팝업 파일은 켜져 있을 때만 누구나 · 직원 팝업 파일은 로그인한 직원만
//   팝업 지우기 · 첨부 빼기 · 그림 바꾸기 → 저장소에서도 바로 지움 / 기간 끝 정리
// 실행: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from './harness.js';
import { keepPops } from '../src/popups/index.js';

const KEY = 'test-office-code';
let mf;
before(async () => { mf = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { STAFF_KEY: KEY, TURNSTILE_SECRET: '' } }] }); await mf.listen(); });
after(() => mf && mf.close());

function agent(ipAddr) {
  const jar = {};
  return async (path, opt = {}) => {
    const headers = { 'cf-connecting-ip': ipAddr };
    if (!opt.raw) headers['content-type'] = 'application/json';
    const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (c) headers.cookie = c;
    const r = await mf.fetch('http://localhost' + path, { method: opt.method || (opt.body || opt.raw ? 'POST' : 'GET'), headers, body: opt.raw || (opt.body ? JSON.stringify(opt.body) : undefined) });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(s => { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (/Max-Age=0/.test(s)) delete jar[m[1]]; else jar[m[1]] = m[2]; } });
    const buf = new Uint8Array(await r.arrayBuffer()), text = new TextDecoder().decode(buf);
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, text, json, buf, headers: r.headers };
  };
}
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]), PDF = new TextEncoder().encode('%PDF-1.4 무순위 공고');
const up = (a, kind, aud, name, data) => a('/api/admin/media?kind=' + kind + '&aud=' + aud + '&name=' + encodeURIComponent(name), { raw: data });
let t0 = Date.now();
const savePops = (a, v) => a('/api/staff/push', { body: { rows: [{ s: 'cfg', k: 'popups', v: JSON.stringify(v), at: (t0 += 1000) }] } });

let boss, top, staff, guest, img, pdf, sfile;
test('준비: 대표 · 권한자 · 직원', async () => {
  boss = agent('7.7.1.1');
  await boss('/api/auth/device', { body: { code: KEY } });
  assert.equal((await boss('/api/auth/setup', { body: { name: '대표', pin: '1234' } })).status, 200);
  const mk = async (name, role, ipA) => {
    await boss('/api/admin/staff', { body: { op: 'add', name, role, license: '중개보조원' } });
    await boss('/api/admin/staff', { body: { op: 'pin', name, pin: '0000' } });
    const x = agent(ipA);
    await x('/api/auth/device', { body: { code: KEY } });
    await x('/api/auth/login', { body: { name, pin: '0000' } });
    await x('/api/auth/pin', { body: { pin: '4321' } });
    return x;
  };
  top = await mk('권한나', '권한자', '7.7.1.2');
  staff = await mk('직원다', '직원', '7.7.1.3');
  guest = agent('7.7.1.9');
});

test('올리기: 대표 · 관리자만, 종류 · 그림 검사', async () => {
  for (const x of [top, staff, guest]) assert.notEqual((await up(x, 'file', 'guest', '공고.pdf', PDF)).status, 200);
  assert.equal((await up(boss, 'file', 'guest', '악성.html', PDF)).status, 400, '웹페이지는 못 올림');
  assert.equal((await up(boss, 'file', 'guest', '실행.exe', PDF)).status, 400);
  assert.equal((await up(boss, 'img', 'guest', '가짜.jpg', PDF)).status, 400, 'JPEG 가 아니면 그림으로 안 받음');
  img = (await up(boss, 'img', 'guest', '전세안내.png', JPG)).json;
  pdf = (await up(boss, 'file', 'guest', '무순위 모집공고.pdf', PDF)).json;
  sfile = (await up(boss, 'file', 'staff', '직원공지.xlsx', PDF)).json;
  assert.ok(img.ok && pdf.ok && sfile.ok);
  assert.equal(img.name, '전세안내.jpg');
  const u = (await boss('/api/admin/media')).json;
  assert.equal(u.n, 3);
  assert.equal((await top('/api/admin/media')).status, 403);
});

test('팝업 저장은 대표 · 관리자만 · 공개 목록에는 켜진 공개 팝업만 (관리용 이름 없이)', async () => {
  const pops = [
    { id: 'p1', aud: 'guest', kind: 'img', title: '관리용 이름', img: { id: img.id }, files: [{ id: pdf.id, name: pdf.name, size: pdf.size }], link: 'javascript:alert(1)', on: true, from: '', to: '' },
    { id: 'p2', aud: 'staff', kind: 'text', title: '직원 공지', head: '11월 공지', body: '내용', files: [{ id: sfile.id, name: sfile.name, size: sfile.size }], on: true },
    { id: 'p3', aud: 'guest', kind: 'text', title: '꺼진 것', head: '안 보임', body: 'x', on: false }
  ];
  assert.deepEqual((await savePops(top, pops)).json.rejected, ['cfg|popups'], '권한자는 팝업 저장 못 함');
  assert.equal((await savePops(boss, pops)).json.n, 1);
  const l = (await guest('/api/public/popups')).json.list;
  assert.equal(l.length, 1);
  assert.equal(l[0].title, undefined);
  assert.equal(l[0].link, '', '이상한 링크는 버림');
  assert.equal(l[0].img, '/api/public/media/' + img.id);
  assert.equal(l[0].files[0].name, '무순위 모집공고.pdf');
});

test('파일 받기: 공개는 누구나 (원래 이름 · 받은 수), 직원 파일은 로그인한 직원만', async () => {
  const r = await guest('/api/public/media/' + pdf.id);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.match(r.headers.get('content-disposition'), new RegExp(encodeURIComponent('무순위 모집공고.pdf').replace(/[.%]/g, '\\$&')));
  assert.equal(r.text, '%PDF-1.4 무순위 공고');
  assert.equal((await guest('/api/public/media/' + img.id)).headers.get('content-type'), 'image/jpeg');
  assert.equal((await guest('/api/public/media/' + sfile.id)).status, 404, '직원 팝업 파일은 공개 주소로 못 받음');
  assert.equal((await guest('/api/staff/media/' + sfile.id)).status, 401);
  assert.equal((await staff('/api/staff/media/' + sfile.id)).status, 200);
  assert.equal((await boss('/api/admin/media')).json.dl[pdf.id], 1);
});

test('끄면 공개 파일도 못 받음 · 첨부 빼기 / 팝업 지우기 → 저장소에서도 지움', async () => {
  const p1 = { id: 'p1', aud: 'guest', kind: 'img', title: '관리용 이름', img: { id: img.id }, files: [{ id: pdf.id, name: pdf.name, size: pdf.size }], on: false };
  const p2 = { id: 'p2', aud: 'staff', kind: 'text', head: '11월 공지', body: '내용', files: [], on: true };
  await savePops(boss, [p1, p2]);
  assert.equal((await guest('/api/public/media/' + pdf.id)).status, 404, '꺼진 팝업 파일');
  assert.equal((await staff('/api/staff/media/' + sfile.id)).status, 404, '뺀 첨부는 바로 지워짐');
  await savePops(boss, [Object.assign({}, p1, { files: [] })]);
  assert.equal((await boss('/api/staff/media/' + pdf.id)).status, 404);
  assert.equal((await boss('/api/staff/media/' + img.id)).status, 200, '그림은 아직 씀');
  await savePops(boss, []);
  assert.equal((await boss('/api/staff/media/' + img.id)).status, 404, '팝업을 지우면 그림도');
  assert.equal((await boss('/api/admin/media')).json.n, 0);
  const log = (await boss('/api/admin/audit')).json.rows.map(x => x.act);
  assert.ok(log.includes('팝업 파일 올림') && log.includes('팝업 파일 지움'));
});

test('기간 정리: 종료일이 보관 일수보다 더 지난 팝업만 뺌', () => {
  const now = Date.parse('2026-12-31T03:00:00+09:00');
  const pops = [{ id: 'a', to: '2026-11-30' }, { id: 'b', to: '2026-12-01' }, { id: 'c', to: '' }, { id: 'd' }];
  assert.deepEqual(keepPops(pops, 30, now).map(p => p.id), ['b', 'c', 'd']);
  assert.deepEqual(keepPops(pops, 7, now).map(p => p.id), ['c', 'd']);
});
