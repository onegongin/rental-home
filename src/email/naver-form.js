// 네이버 폼 '새 답변' 알림 메일 → 텔레그램 + 직원 화면 종(🔔) (C안 알림만, 2026-11-20 대표)
//   흐름: 네이버 폼 → 대표 네이버 메일 → 자동 전달 → form@rental-home.kr (Cloudflare Email Routing → 이 Worker 의 email())
//   네이버 알림 메일에는 응답 내용(이름 · 연락처)이 없음 → 폼 이름 · 몇 번째 답변 · [새 답변 보기] 링크만 알림
//   종(🔔): 상담이력대장 '새 손님 등록' 줄(손님 카드, 이름 = '[네이버 폼] n번째 답변') — 직원이 눌러 네이버에서 답변 보고 상담카드 작성
import { insertGuestCard } from '../repo/guest.js';
import { notify } from '../notify/index.js';
import { hit } from '../repo/rate.js';

// 메일 머리 글자 풀기 (=?UTF-8?B?…?= · =?UTF-8?Q?…?=)
export function decodeWord(s) {
  return String(s || '').replace(/\s*=\?([^?]+)\?([BbQq])\?([^?]*)\?=\s*/g, (m, cs, enc, txt) => {
    try {
      let bytes;
      if (/b/i.test(enc)) bytes = Uint8Array.from(atob(txt), c => c.charCodeAt(0));
      else { const t = txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))); bytes = Uint8Array.from(t, c => c.charCodeAt(0)); }
      return new TextDecoder(/utf-?8/i.test(cs) ? 'utf-8' : cs).decode(bytes);
    } catch (e) { return txt; }
  });
}

// 본문(raw)에서 네이버 폼 링크 찾기 — quoted-printable · base64 섞여 있어도
function bodyText(raw) {
  let t = String(raw || '').replace(/=\r?\n/g, '').replace(/=3D/gi, '=');
  // base64 덩어리도 풀어서 붙임 (html 부분이 base64 일 때)
  const b64 = t.match(/Content-Transfer-Encoding:\s*base64\s*\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/gi) || [];
  for (const blk of b64) { try { const d = blk.replace(/^[\s\S]*?\r?\n\r?\n/, '').replace(/\s+/g, ''); t += '\n' + new TextDecoder('utf-8').decode(Uint8Array.from(atob(d), c => c.charCodeAt(0))); } catch (e) {} }
  return t;
}

// 알림 메일 → { title, nth, link } (네이버 폼 메일이 아니면 null)
export function parseNaverForm(subject, from, raw) {
  const subj = decodeWord(subject);
  if (!/naverform|navercorp|naver\.com/i.test(String(from || '')) && !/\[네이버 폼\]/.test(subj)) return null;
  const m = subj.match(/\[네이버 폼\]\s*(\d+)\s*번째 답변[^']*'(.+)'/) || subj.match(/\[네이버 폼\][^']*'(.+)'/);
  if (!/\[네이버 폼\]/.test(subj)) return null;
  const nth = m && m.length > 2 ? m[1] : '';
  const title = m ? m[m.length - 1] : subj.replace(/^\s*\[네이버 폼\]\s*/, '');
  const t = bodyText(raw), links = (t.match(/https?:\/\/[^\s"'<>]*form\.naver\.com[^\s"'<>]*/g) || []).map(x => x.replace(/&amp;/g, '&'));
  const link = links.find(x => /result|answer|response|respond/i.test(x)) || links[0] || 'https://form.naver.com';
  return { title, nth, link };
}

export async function naverFormMail(message, env) {
  const raw = await new Response(message.raw).text();
  const f = parseNaverForm(message.headers.get('subject'), message.headers.get('from') || message.from, raw);
  if (!f) return;   // 네이버 폼 알림이 아니면 무시
  const db = env.DB;
  if (!(await hit(db, 'naverform', 30, 3600e3))) return;   // 이상하게 많으면 막음 (1시간 30건)
  const n = new Date(Date.now() + 9 * 3600e3), p2 = x => String(x).padStart(2, '0');
  const at = n.getUTCFullYear() + '-' + p2(n.getUTCMonth() + 1) + '-' + p2(n.getUTCDate()) + ' ' + p2(n.getUTCHours()) + ':' + p2(n.getUTCMinutes());
  const label = '[네이버 폼]' + (f.nth ? ' ' + f.nth + '번째 답변' : ' 새 답변');
  const card = { id: 'g' + Date.now(), kind: 'client', at, name: label, phone: '', interest: '', text: '「' + f.title + '」 새 답변이 왔습니다 · 네이버에서 답변 확인 후 상담카드를 작성하세요\n새 답변 보기: ' + f.link,
    writer: '네이버 폼', guest: true, synced: true, tags: ['상담'], inflow: { ch: ['사이트'], visitAt: '', visitBy: '', media: ['네이버 폼'], brokers: [], friend: '' }, inflowText: '네이버 폼', naverForm: true };
  await insertGuestCard(db, card);
  await notify(env, { kind: 'lead', text: '📝 ' + label + '\n「' + f.title + '」\n새 답변 보기: ' + f.link, actor: '네이버 폼' });
}
