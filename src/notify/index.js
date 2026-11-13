// 알림 (설계서 12장, P5) — 텔레그램 전용 봇. 2026-11-02 대표 결정:
//   그룹방 = 사이트 알림 전부 (원문 그대로, 대표가 초대한 사람만 있는 방)
//   개인 알림 = 그 직원 담당 건만 (+ 보안 긴급은 대표에게)
//   조용한 시간(기본 21:00~08:00)에 생긴 알림은 보류 → 08:30 아침 요약에 합침. 긴급(urgent)은 바로
// 고객 · 소유자 · 임차인 표는 읽지 않는다 (게스트 API 에서도 import 함)
import { getOne, putRows } from '../repo/kv.js';

export const KINDS = {
  lead: '관심등록 · 방문예약', sell: '내 집 내놓기', broker: '매물 중개요청', cmt: '게스트 댓글', pub: '매물 공개 · 비공개',
  deal: '가계약 · 계약 · 잔금', assign: '담당 배정 · 공유', security: '보안 (잠김 · 권한)', expiry: '임대차 만기', ad: '광고 내리기 · 매칭 고객', cardDel: '상담 기록 삭제', backup: '엑셀 내보내기 · 백업',
  req: '요청함 (접수 · 처리 결과)', fb: '사용 불편사항'   // R3-4 직원 소통 (시안 r3-board 2026-11-13) morning: '아침 요약'
};
// base(알림 속 직원 화면 주소) 기본값 = wrangler.jsonc SITE_URL
export const CFG0 = { group: '', groupTitle: '', quiet: [21, 8], off: [], bot: '', base: '' };
export const cfgOf = (v, env) => Object.assign({}, CFG0, { base: String((env && env.SITE_URL) || '').replace(/\/$/, '') }, v && typeof v === 'object' ? v : {});
export const loadNotifyCfg = async (db, env) => cfgOf(await getOne(db, 'cfg', 'notify'), env);
export const saveNotifyCfg = (db, c, by) => putRows(db, [{ s: 'cfg', k: 'notify', v: JSON.stringify(cfgOf(c)), at: Date.now(), by }]);

const kstHour = (t = Date.now()) => new Date(t + 9 * 3600e3).getUTCHours();
// [21, 8] → 21시 ~ 다음날 8시 전. 같은 숫자면 조용한 시간 없음
export function isQuiet(q, t = Date.now()) {
  const [a, b] = Array.isArray(q) ? q.map(Number) : [21, 8], h = kstHour(t);
  if (!(a >= 0 && b >= 0) || a === b) return false;
  return a < b ? h >= a && h < b : h >= a || h < b;
}

// ── 텔레그램 ────────────────────────────────────────
const api = (env, m) => (env.TG_API || 'https://api.telegram.org') + '/bot' + env.TG_TOKEN + '/' + m;
export async function tg(env, method, payload) {
  if (!env.TG_TOKEN) return { ok: false, description: 'nobot' };
  try {
    const r = await fetch(api(env, method), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) });
    return await r.json();
  } catch (e) { return { ok: false, description: String(e && e.message || e).slice(0, 200) }; }
}
// 3번까지 다시 시도 (설계서 12.2). 너무 많이 보냈다는 답(429)이면 알려 준 시간만큼 기다림
export async function sendText(env, chat, text) {
  let last = '';
  for (let i = 0; i < 3; i++) {
    const r = await tg(env, 'sendMessage', { chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true });
    if (r.ok) return { ok: true, tries: i + 1 };
    last = r.description || 'error';
    if (last === 'nobot' || /chat not found|blocked|kicked/i.test(last)) break;
    await new Promise(res => setTimeout(res, Math.min(((r.parameters && r.parameters.retry_after) || 1) * 1000, 3000)));
  }
  return { ok: false, err: last };
}

// ── 알림 남기기 · 보내기 ────────────────────────────
const ins = (db, n) => db.prepare('INSERT INTO notifications (at, kind, to_kind, to_name, chat, text, urgent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .bind(n.at, n.kind, n.to_kind, n.to_name || '', n.chat || '', n.text, n.urgent ? 1 : 0, n.status).run();

async function deliver(env, id, chat, text) {
  const r = await sendText(env, chat, text);
  await env.DB.prepare('UPDATE notifications SET status = ?, tries = tries + ?, err = ?, sent_at = ? WHERE id = ?')
    .bind(r.ok ? 'sent' : (r.err === 'nobot' ? 'skip' : 'fail'), r.tries || 3, r.ok ? null : r.err, r.ok ? Date.now() : null, id).run();
}

// 텔레그램 번호가 연결된 직원 { 이름: tg_id }
export async function tgIds(db, names) {
  const ns = [...new Set((names || []).filter(Boolean))];
  if (!ns.length) return {};
  const r = await db.prepare('SELECT name, tg_id FROM staff WHERE active = 1 AND tg_id IS NOT NULL AND name IN (' + ns.map(() => '?').join(',') + ')').bind(...ns).all();
  const o = {}; (r.results || []).forEach(x => { o[x.name] = x.tg_id; }); return o;
}
export async function reps(db) {
  const r = await db.prepare("SELECT name FROM staff WHERE active = 1 AND role = '대표'").all();
  return (r.results || []).map(x => x.name);
}

// e = { kind, text(그룹방 글), dm: [담당 직원 이름], dmText?(개인 글, 없으면 text), urgent, actor(한 사람 — 본인에겐 개인 알림 안 보냄), path(직원 화면 바로가기) }
//   그룹방 1줄 + 연결된 담당자 개인 1줄씩 기록 → 조용한 시간이 아니면(또는 긴급) 바로 보냄
export async function notify(env, e) {
  try {
    const db = env.DB, cfg = await loadNotifyCfg(db, env), now = Date.now();
    if ((cfg.off || []).includes(e.kind) && !e.urgent) return 0;
    const link = cfg.base ? '\n' + cfg.base.replace(/\/$/, '') + '/staff/' + (e.path || '') : '';
    const held = !e.urgent && isQuiet(cfg.quiet, now);
    const out = [{ to_kind: 'group', to_name: cfg.groupTitle || '그룹방', chat: cfg.group, text: e.text + link }];
    const ids = await tgIds(db, (e.dm || []).filter(n => n !== e.actor));
    for (const name of Object.keys(ids)) out.push({ to_kind: 'dm', to_name: name, chat: ids[name], text: (e.dmText || e.text) + link });
    const jobs = [];
    for (const o of out) {
      const status = !o.chat || !env.TG_TOKEN ? 'skip' : held ? 'held' : 'wait';
      const r = await ins(db, Object.assign({ at: now, kind: e.kind, urgent: e.urgent, status }, o));
      if (status === 'wait') jobs.push(deliver(env, r.meta.last_row_id, o.chat, o.text));
    }
    // 응답을 늦추지 않게 — 요청이 끝난 뒤에 보냄 (ctx.waitUntil). 없으면(아침 요약 · 테스트) 기다림
    const all = Promise.all(jobs);
    if (env.ctx && env.ctx.waitUntil) env.ctx.waitUntil(all); else await all;
    return out.length;
  } catch (err) { console.log('notify', err && err.message); return 0; }   // 알림 실패가 본래 일을 막지 않게
}

// 알림 글 도우미
export const DEAL_KO = { sale: '매매', jeonse: '전세', wolse: '월세', short: '단기' };
export const won = n => { n = Number(n) || 0; const e = Math.floor(n / 10000), m = n % 10000; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') || '0'; };
export const priceOf = l => l.deal === 'sale' ? won(l.ask) : l.deal === 'jeonse' ? won(l.dep) : won(l.dep) + '/' + (Number(l.rent) || 0) + '만';
export const unitLabel = id => { const m = String(id || '').match(/^(\d+)-(\d+)$/); return m ? m[1] + '동 ' + m[2] + '호' : String(id || ''); };
export const listingLine = l => [unitLabel(l.unit_id), DEAL_KO[l.deal] || l.deal, priceOf(l)].join(' · ');
