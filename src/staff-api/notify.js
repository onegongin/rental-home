// 알림 설정 API (P5)
//   직원 본인 — 내 텔레그램 연결 (일회용 코드 → 봇에서 [시작] → [확인]. 사이트를 띄우기 전에도 됨: 봇에 온 글을 서버가 가져와 봄)
//     GET  /api/staff/notify/me       연결 여부 · 봇 아이디
//     POST /api/staff/notify/link     코드 만들기 → 봇 주소 (t.me/봇?start=코드)
//     POST /api/staff/notify/check    봇에 그 코드가 왔는지 확인 → 연결
//     POST /api/staff/notify/test     나에게 시험 알림
//     POST /api/staff/notify/unlink   연결 끊기
//   관리 (대표 · 관리자) — /api/admin/notify
//     GET   봇 상태 · 설정 · 직원 연결 · 발송기록 최근 100건 · 실패 수
//     POST  op: find 그룹방 찾기 · group 그룹방 정하기 · test 시험 보내기 · set 조용한 시간 · 끈 알림 · morning 아침 요약 지금 · retry 실패 다시
import { J, body, ip, device } from '../lib/http.js';
import { randomHex } from '../auth/crypto.js';
import { can } from '../core/permissions.js';
import { audit } from '../repo/audit.js';
import { KINDS, tg, sendText, loadNotifyCfg, saveNotifyCfg } from '../notify/index.js';
import { morning } from '../notify/morning.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

const BRAND = (SITE.site || {}).brand || '';

// 봇 아이디 (getMe) — 설정에 한 번 저장해 둠
async function botName(env, cfg, by) {
  if (cfg.bot || !env.TG_TOKEN) return cfg.bot;
  const r = await tg(env, 'getMe');
  if (r.ok && r.result && r.result.username) { cfg.bot = r.result.username; await saveNotifyCfg(env.DB, cfg, by); }
  return cfg.bot;
}
// 봇에 온 글 (최근 24시간 · 100개). 웹훅을 안 쓰므로 그대로 읽힘
async function updates(env) {
  const r = await tg(env, 'getUpdates', { limit: 100, allowed_updates: ['message', 'my_chat_member'] });
  return r.ok ? r.result || [] : null;
}

export async function staffNotify(req, env, url, u) {
  const db = env.DB, p = url.pathname, cfg = await loadNotifyCfg(db, env);
  const me = async () => (await db.prepare('SELECT tg_id FROM staff WHERE name = ?').bind(u.name).first()) || {};

  if (p === '/api/staff/notify/me' && req.method === 'GET') {
    const m = await me();
    return J({ ok: true, linked: !!m.tg_id, bot: await botName(env, cfg, u.name), hasBot: !!env.TG_TOKEN });
  }
  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);

  if (p === '/api/staff/notify/link') {
    if (!env.TG_TOKEN) return J({ ok: false, err: 'nobot', msg: '봇이 아직 연결되지 않았습니다 (대표에게 문의)' }, 409);
    const bot = await botName(env, cfg, u.name);
    if (!bot) return J({ ok: false, err: 'nobot', msg: '봇 정보를 가져오지 못했습니다' }, 502);
    const code = randomHex(6);
    await db.batch([db.prepare('DELETE FROM tg_links WHERE name = ? OR exp < ?').bind(u.name, Date.now()), db.prepare('INSERT INTO tg_links (code, name, exp) VALUES (?, ?, ?)').bind(code, u.name, Date.now() + 10 * 60e3)]);
    return J({ ok: true, url: 'https://t.me/' + bot + '?start=' + code, bot, code });
  }

  if (p === '/api/staff/notify/check') {
    const l = await db.prepare('SELECT code FROM tg_links WHERE name = ? AND exp > ?').bind(u.name, Date.now()).first();
    if (!l) return J({ ok: false, err: 'expired', msg: '10분이 지났습니다. [텔레그램 연결]을 다시 누르세요' }, 409);
    const ups = await updates(env);
    if (!ups) return J({ ok: false, err: 'tg', msg: '텔레그램에 연결하지 못했습니다' }, 502);
    const hit = ups.map(x => x.message).find(m => m && m.chat && m.chat.type === 'private' && String(m.text || '').trim() === '/start ' + l.code);
    if (!hit) return J({ ok: true, linked: false });
    const id = String(hit.chat.id);
    await db.batch([db.prepare('UPDATE staff SET tg_id = NULL WHERE tg_id = ?').bind(id), db.prepare('UPDATE staff SET tg_id = ? WHERE name = ?').bind(id, u.name), db.prepare('DELETE FROM tg_links WHERE name = ?').bind(u.name)]);
    await audit(db, { who: u.name, act: '텔레그램 연결', detail: '개인 알림', ip: ip(req), dev: device(req) });
    await sendText(env, id, '✅ ' + u.name + '님, ' + BRAND + ' 알림이 연결되었습니다.\n본인 담당 매물 · 고객 알림만 이 대화로 옵니다.');
    return J({ ok: true, linked: true });
  }

  if (p === '/api/staff/notify/test') {
    const m = await me();
    if (!m.tg_id) return J({ ok: false, err: 'nochat' }, 409);
    const r = await sendText(env, m.tg_id, '🔔 시험 알림 — ' + u.name + '님 개인 알림이 잘 옵니다.');
    return J({ ok: r.ok, err: r.err });
  }

  if (p === '/api/staff/notify/unlink') {
    await db.prepare('UPDATE staff SET tg_id = NULL WHERE name = ?').bind(u.name).run();
    await audit(db, { who: u.name, act: '텔레그램 연결 끊음', ip: ip(req), dev: device(req) });
    return J({ ok: true, linked: false });
  }
  return J({ ok: false, err: 'notfound' }, 404);
}

export async function notifyAdmin(req, env, url, u) {
  if (!can(u, 'notify.admin')) return J({ ok: false, err: 'perm' }, 403);
  const db = env.DB, cfg = await loadNotifyCfg(db, env), log = (act, detail) => audit(db, { who: u.name, act, detail, ip: ip(req), dev: device(req) });

  if (req.method === 'GET') {
    const [staff, rows, fails] = await Promise.all([
      db.prepare('SELECT name, role, tg_id IS NOT NULL AS linked FROM staff WHERE active = 1 ORDER BY at').all(),
      db.prepare('SELECT id, at, kind, to_kind, to_name, text, urgent, status, tries, err, sent_at FROM notifications ORDER BY id DESC LIMIT 100').all(),
      db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE status = 'fail' AND at > ?").bind(Date.now() - 7 * 864e5).first()
    ]);
    return J({ ok: true, cfg, kinds: KINDS, hasBot: !!env.TG_TOKEN, bot: await botName(env, cfg, u.name), staff: (staff.results || []).map(x => ({ name: x.name, role: x.role, linked: !!x.linked })), rows: rows.results || [], fails: (fails && fails.n) || 0 });
  }
  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const b = await body(req) || {};

  if (b.op === 'find') {   // 봇이 들어가 있는 그룹방 목록 (그룹방에 /start 한 번 입력해 두면 나옴)
    const ups = await updates(env);
    if (!ups) return J({ ok: false, err: env.TG_TOKEN ? 'tg' : 'nobot' }, 409);
    const o = {};
    ups.forEach(x => { const c = (x.message && x.message.chat) || (x.my_chat_member && x.my_chat_member.chat); if (c && /group/.test(c.type)) o[c.id] = { id: String(c.id), title: c.title || '' }; });
    return J({ ok: true, groups: Object.values(o) });
  }
  if (b.op === 'group') {
    const id = String(b.id || '').trim();
    if (id && !/^-?\d{5,20}$/.test(id)) return J({ ok: false, err: 'input' }, 400);
    cfg.group = id; cfg.groupTitle = String(b.title || '').slice(0, 60);
    if (b.base && /^https?:\/\/[\w.:-]+\/?$/.test(b.base)) cfg.base = String(b.base).replace(/\/$/, '');
    await saveNotifyCfg(db, cfg, u.name);
    await log('알림 그룹방 설정', id ? cfg.groupTitle + ' (' + id + ')' : '해제');
    return J({ ok: true, cfg });
  }
  if (b.op === 'test') {
    const to = b.to === 'me' ? ((await db.prepare('SELECT tg_id FROM staff WHERE name = ?').bind(u.name).first()) || {}).tg_id : cfg.group;
    if (!to) return J({ ok: false, err: 'nochat' }, 409);
    const r = await sendText(env, to, '🔔 시험 알림 — ' + BRAND + ' 알림 봇이 잘 연결되었습니다. (' + u.name + ')');
    return J({ ok: r.ok, err: r.err });
  }
  if (b.op === 'set') {
    if (b.quiet !== undefined) {
      const q = Array.isArray(b.quiet) ? b.quiet.map(Number) : [];
      if (q.length !== 2 || !q.every(h => Number.isInteger(h) && h >= 0 && h <= 24)) return J({ ok: false, err: 'input' }, 400);
      cfg.quiet = q;
    }
    if (b.off !== undefined) cfg.off = (Array.isArray(b.off) ? b.off : []).filter(k => KINDS[k] && k !== 'security');   // 보안 알림은 못 끔
    if (b.base !== undefined) { if (!/^https?:\/\/[\w.:-]+\/?$/.test(b.base || '')) return J({ ok: false, err: 'input' }, 400); cfg.base = String(b.base).replace(/\/$/, ''); }
    await saveNotifyCfg(db, cfg, u.name);
    await log('알림 설정 변경', '조용한 시간 ' + cfg.quiet.join('~') + '시 · 끈 알림 ' + (cfg.off.map(k => KINDS[k]).join(', ') || '없음'));
    return J({ ok: true, cfg });
  }
  if (b.op === 'morning') return J(Object.assign({ ok: true }, await morning(env, { by: u.name, preview: !!b.preview })));
  if (b.op === 'retry') {
    const r = await db.prepare("SELECT id, chat, text FROM notifications WHERE status = 'fail' AND at > ? ORDER BY id LIMIT 30").bind(Date.now() - 7 * 864e5).all();
    let n = 0;
    for (const x of r.results || []) {
      const s = await sendText(env, x.chat, x.text);
      await db.prepare('UPDATE notifications SET status = ?, tries = tries + ?, err = ?, sent_at = ? WHERE id = ?').bind(s.ok ? 'sent' : 'fail', s.tries || 3, s.ok ? null : s.err, s.ok ? Date.now() : null, x.id).run();
      if (s.ok) n++;
    }
    return J({ ok: true, sent: n, left: (r.results || []).length - n });
  }
  return J({ ok: false, err: 'input' }, 400);
}
