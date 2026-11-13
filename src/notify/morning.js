// 아침 요약 (설계서 12.2) — 매일 08:30 Cloudflare Cron(정해진 시간 자동 실행). 직원 API · Cron 에서만 import
//   그룹방: 밤사이 보류 알림 + 어제 게스트 등록 · 미배정 · 오늘 방문 · 중개요청 미확인 · 만기 D-90/60/30 · 30일 미갱신 매물
//   (P6) 내려야 할 외부 광고 — 내림 완료 전까지 매일
//   개인: 그 직원 담당 것만 (오늘 방문 · 담당 매물 미갱신 · 담당 소유자 세대 만기 · 밤사이 내 알림)
import { loadNotifyCfg, sendText, tgIds, listingLine, unitLabel } from './index.js';
import { ACTIVE } from '../core/listings.js';
import { livePosts } from '../repo/ads.js';
import { MEDIA } from '../ads/templates.js';

const DAY = 864e5, kst = t => new Date(t + 9 * 3600e3), ymd = t => kst(t).toISOString().slice(0, 10);
const WD = '일월화수목금토';
const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
const first = t => String(t || '').split('\n')[0];

export async function morning(env, { by = '자동', preview = false, now = Date.now() } = {}) {
  const db = env.DB, cfg = await loadNotifyCfg(db, env), today = ymd(now), off = new Set(cfg.off || []);
  const yStart = Date.parse(ymd(now - DAY) + 'T00:00:00+09:00'), yEnd = yStart + DAY;

  // 상담카드 (화면 공유 kv). 게스트 카드 번호 'g' + 등록 시각
  const cards = (await all(db, "SELECT k, v FROM kv WHERE s = 'c'")).map(r => { try { return JSON.parse(r.v); } catch (e) { return null; } }).filter(c => c && typeof c === 'object' && !c.deleted);
  const gAt = c => /^g\d{10,16}$/.test(c.id || '') ? Number(c.id.slice(1)) : 0;
  const newG = cards.filter(c => c.guest && gAt(c) >= yStart && gAt(c) < yEnd);
  const noMgr = cards.filter(c => c.guest && !c.mgr && gAt(c) > now - 30 * DAY);
  const visitOf = c => String((c.inflow && c.inflow.visitAt) || '');
  const visits = cards.filter(c => visitOf(c).slice(0, 10) === today).sort((a, b) => visitOf(a).localeCompare(visitOf(b)));
  const ownerMgr = {}; cards.forEach(c => { if (c.kind === 'owner' && c.unit && c.mgr) ownerMgr[c.unit] = c.mgr; });

  const bk = await all(db, 'SELECT label, name, at FROM broker_reqs WHERE claim_by IS NULL AND at > ? ORDER BY at', now - 14 * DAY);
  const days = [90, 60, 30].map(n => [n, ymd(now + n * DAY)]);
  const ten = off.has('expiry') ? [] : await all(db, 'SELECT unit_id, kind, end_date FROM tenancies WHERE is_current = 1 AND deleted_at IS NULL AND end_date IN (?, ?, ?)', ...days.map(d => d[1]));
  const dOf = e => (days.find(d => d[1] === e) || [0])[0];
  const stale = await all(db, `SELECT * FROM listings WHERE deleted_at IS NULL AND status IN (${ACTIVE.map(() => '?').join(',')}) AND at < ? ORDER BY at`, ...ACTIVE, now - 30 * DAY);
  const due = off.has('ad') ? [] : (await livePosts(db)).filter(p => p.due);   // 내려야 할 외부 광고 (P6, 내림 완료 전까지 매일)
  const held = await all(db, "SELECT id, to_kind, to_name, text FROM notifications WHERE status = 'held' ORDER BY id");

  const d = kst(now), head = '🌅 아침 요약 ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' (' + WD[d.getUTCDay()] + ')';
  const sec = (title, list, line, max = 8) => list.length ? ['', '▸ ' + title + ' ' + list.length + '건', ...list.slice(0, max).map(x => '  · ' + line(x)), ...(list.length > max ? ['  · 외 ' + (list.length - max) + '건'] : [])] : [];
  const vLine = c => visitOf(c).slice(11, 16) + ' ' + (c.name || '') + (c.mgr ? ' (담당 ' + c.mgr + ')' : ' (미배정)');
  const tLine = t => unitLabel(t.unit_id) + ' ' + (t.kind || '임대') + ' 만기 ' + t.end_date + ' (D-' + dOf(t.end_date) + ')';
  const sLine = l => listingLine(l) + ' · ' + Math.floor((now - l.at) / DAY) + '일 · ' + (l.mgr || l.writer || '');
  const aLine = p => (MEDIA[p.media] || p.media) + ' · ' + (p.unit_id ? listingLine(p) : '삭제된 매물') + ' · ' + (p.status || '') + ' · ' + (p.mgr || p.writer || '');
  const gHeld = held.filter(h => h.to_kind === 'group');

  const group = [head,
    '어제 게스트 등록 ' + newG.length + '건 · 미배정 ' + noMgr.length + '건 · 중개요청 미확인 ' + bk.length + '건',
    ...sec('밤사이 알림', gHeld, h => first(h.text), 15),
    ...sec('오늘 방문', visits, vLine),
    ...sec('미배정 관심등록', noMgr, c => (c.name || '') + ' · ' + (c.phone || '') + (c.unit ? ' · ' + unitLabel(c.unit) : '')),
    ...sec('중개요청 미확인', bk, r => r.label + ' · ' + r.name),
    ...sec('임대차 만기 (D-90 · 60 · 30)', ten, tLine),
    ...sec('30일 넘게 안 고친 매물', stale, sLine),
    ...sec('내려야 할 광고', due, aLine)
  ].join('\n') + (cfg.base ? '\n\n' + cfg.base + '/staff/' : '');

  // 개인: 그 직원 것이 하나라도 있을 때만
  const ids = await tgIds(db, (await all(db, 'SELECT name FROM staff WHERE active = 1 AND tg_id IS NOT NULL')).map(x => x.name));
  const dms = {};
  for (const name of Object.keys(ids)) {
    const mine = {
      held: held.filter(h => h.to_kind === 'dm' && h.to_name === name),
      visits: visits.filter(c => c.mgr === name),
      ten: ten.filter(t => ownerMgr[t.unit_id] === name),
      stale: stale.filter(l => (l.mgr || l.writer) === name),
      due: due.filter(p => (p.mgr || p.writer) === name)
    };
    if (!mine.held.length && !mine.visits.length && !mine.ten.length && !mine.stale.length && !mine.due.length) continue;
    dms[name] = [head + ' · ' + name + '님 담당',
      ...sec('밤사이 내 알림', mine.held, h => first(h.text), 15),
      ...sec('오늘 방문', mine.visits, vLine),
      ...sec('담당 세대 임대차 만기', mine.ten, tLine),
      ...sec('30일 넘게 안 고친 내 매물', mine.stale, sLine),
      ...sec('내려야 할 내 광고', mine.due, aLine)
    ].join('\n');
  }
  if (preview) return { text: group, dms };

  // 보내기 + 기록. 보류했던 알림은 'merged'(요약에 합침)
  const rec = async (to_kind, to_name, chat, text) => {
    const r = !chat || !env.TG_TOKEN ? { ok: false, err: 'nobot' } : await sendText(env, chat, text);
    await db.prepare('INSERT INTO notifications (at, kind, to_kind, to_name, chat, text, urgent, status, tries, err, sent_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
      .bind(Date.now(), 'morning', to_kind, to_name, chat || '', text, r.ok ? 'sent' : (r.err === 'nobot' ? 'skip' : 'fail'), r.tries || (r.err === 'nobot' ? 0 : 3), r.ok ? null : r.err, r.ok ? Date.now() : null).run();
    return r.ok;
  };
  let sent = 0;
  if (!off.has('morning') || gHeld.length) sent += await rec('group', cfg.groupTitle || '그룹방', cfg.group, group) ? 1 : 0;
  for (const name of Object.keys(dms)) sent += await rec('dm', name, ids[name], dms[name]) ? 1 : 0;
  if (held.length) await db.prepare("UPDATE notifications SET status = 'merged', sent_at = ? WHERE status = 'held'").bind(Date.now()).run();
  // 어제 못 보낸 알림 한 번 더
  const failed = await all(db, "SELECT id, chat, text FROM notifications WHERE status = 'fail' AND at > ? AND kind != 'morning' ORDER BY id LIMIT 30", now - DAY);
  for (const x of failed) {
    const s = await sendText(env, x.chat, x.text);
    await db.prepare('UPDATE notifications SET status = ?, tries = tries + ?, err = ?, sent_at = ? WHERE id = ?').bind(s.ok ? 'sent' : 'fail', s.tries || 3, s.ok ? null : s.err, s.ok ? Date.now() : null, x.id).run();
  }
  return { text: group, dms, sent, merged: held.length, by };
}
