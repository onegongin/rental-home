// 네이버 폼 알림 메일 읽기 (C안 알림만, 2026-11-20)
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWord, parseNaverForm } from '../src/email/naver-form.js';

const b64 = s => '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
test('네이버 폼 알림 메일 → 폼 이름 · 몇 번째 · 새 답변 링크', () => {
  const subj = "[네이버 폼] 1번째 답변 추가! '첨단대라수1차 분양전환 및 신규분양 관심'";
  assert.equal(decodeWord(b64(subj)), subj);
  const raw = 'Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<a href=3D"https://form.naver.com/respon=\r\nse/CWUEFeZEcXq/result?x=3D1&amp;y=3D2">새 답변 보기</a>';
  const f = parseNaverForm(b64(subj), '네이버 폼 <naverform_noreply@navercorp.com>', raw);
  assert.equal(f.nth, '1'); assert.equal(f.title, '첨단대라수1차 분양전환 및 신규분양 관심');
  assert.equal(f.link, 'https://form.naver.com/response/CWUEFeZEcXq/result?x=1&y=2');
  assert.equal(parseNaverForm('광고 메일입니다', 'spam@x.com', ''), null, '다른 메일은 무시');
  const base64Html = Buffer.from('<a href="https://form.naver.com/answer/abc">보기</a>', 'utf8').toString('base64');
  const f2 = parseNaverForm(b64("[네이버 폼] 12번째 답변 추가! '폼'"), 'naverform_noreply@navercorp.com', 'Content-Transfer-Encoding: base64\r\n\r\n' + base64Html + '\r\n');
  assert.equal(f2.nth, '12'); assert.equal(f2.link, 'https://form.naver.com/answer/abc');
});
