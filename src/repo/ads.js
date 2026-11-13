// 광고 초안 · 외부 게시기록 (설계서 8.5 · 10.3 · 11장, P6) — 직원 API · 아침 요약 전용
//   ad_posts.down_at 이 비어 있으면 '게시 중'. 매물이 비공개 · 끝난 상태가 되면 '내려야 할 광고'
import { ulid } from '../lib/id.js';
import { OFF } from '../core/listings.js';

const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];

// 매체마다 마지막 초안
export const draftsOf = (db, id) => all(db, 'SELECT d.* FROM ad_drafts d JOIN (SELECT media, MAX(ver) v FROM ad_drafts WHERE listing_id = ? GROUP BY media) x ON x.media = d.media AND x.v = d.ver WHERE d.listing_id = ?', id, id);
export const postsOf = (db, id) => all(db, 'SELECT * FROM ad_posts WHERE listing_id = ? ORDER BY posted_at DESC', id);

export async function saveDrafts(db, id, rows, by) {
  const now = Date.now(), st = [];
  for (const r of rows) st.push(db.prepare('INSERT INTO ad_drafts (listing_id, media, ver, title, body, tags, ai, by, at) VALUES (?, ?, COALESCE((SELECT MAX(ver) FROM ad_drafts WHERE listing_id = ? AND media = ?), 0) + 1, ?, ?, ?, ?, ?, ?)')
    .bind(id, r.media, id, r.media, r.title || '', r.body, JSON.stringify(r.tags || []), Number(r.ai) || 0, by, now));
  if (st.length) await db.batch(st);
}

export async function addPost(db, id, media, url, by) {
  const pid = ulid(), now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO ad_posts (id, listing_id, media, url, posted_at, by) VALUES (?, ?, ?, ?, ?, ?)').bind(pid, id, media, url, now, by),
    db.prepare('INSERT INTO listing_events (listing_id, at, who, act, detail) VALUES (?, ?, ?, ?, ?)').bind(id, now, by, '광고 게시 기록', media + ' · ' + url.slice(0, 200))
  ]);
  return pid;
}
export const getPost = (db, pid) => db.prepare('SELECT * FROM ad_posts WHERE id = ?').bind(pid).first();
export async function downPost(db, p, by) {
  const now = Date.now();
  await db.batch([
    db.prepare('UPDATE ad_posts SET down_at = ?, down_by = ? WHERE id = ? AND down_at IS NULL').bind(now, by, p.id),
    db.prepare('INSERT INTO listing_events (listing_id, at, who, act, detail) VALUES (?, ?, ?, ?, ?)').bind(p.listing_id, now, by, '광고 내림 완료', p.media + ' · ' + String(p.url).slice(0, 200))
  ]);
}

// 게시 중인 외부 광고 + 그 매물 (광고 탭 · 아침 요약). due = 내려야 함 (비공개거나 끝난 상태)
export async function livePosts(db) {
  return (await all(db, 'SELECT p.*, l.unit_id, l.deal, l.status, l.pub, l.ask, l.dep, l.rent, l.mgr, l.writer, l.at AS l_at FROM ad_posts p LEFT JOIN listings l ON l.id = p.listing_id WHERE p.down_at IS NULL ORDER BY p.posted_at DESC LIMIT 500'))
    .map(p => Object.assign(p, { due: !p.status || p.pub !== 'on' || OFF.includes(p.status) }));
}
export const liveOf = (db, id) => all(db, 'SELECT * FROM ad_posts WHERE listing_id = ? AND down_at IS NULL', id);
