// 팝업 그림 · 첨부파일 (시안 popup-image 확정 2026-11-04)
//   팝업 목록 = cfg 'popups' (화면 공유 설정 그대로) · 파일 = R2 저장소(env.MEDIA, 버킷 hwip-media) · 파일 정보 = media 표
//   팝업 삭제 · 그림 바꾸기 · 첨부 빼기 → 저장하는 순간 저장소에서도 지움 (dropMedia)
//   매일 03:00 (백업 Cron): 기간 끝나고 cfg popKeep 일(기본 30) 지난 팝업 지움 + 어떤 팝업에도 안 쓰이는 파일(하루 지난 것) 지움
//   손님은 켜져 있고 기간 안인 공개 팝업의 파일만 받을 수 있음. 직원 팝업 파일은 로그인한 직원만
// 고객 · 소유자 · 임차인 표는 읽지 않는다 (공개 API 에서도 import 함)
import { J, ip, device } from '../lib/http.js';
import { getOne, putRows } from '../repo/kv.js';
import { audit } from '../repo/audit.js';

import { FILE_TYPES, MAX_FILE, MAX_IMG, KEEP0, extOf, kstDay, keyOf, refsOf } from './public.js';
export { publicPopups, serveMedia, out, isOn, idsOf } from './public.js';
const DAY = 864e5;

// 올리기 (대표 · 관리자). 본문 = 파일 그대로, ?kind=img|file&aud=guest|staff&name=파일이름
export async function uploadMedia(req, env, url, u) {
  if (!env.MEDIA) return J({ ok: false, err: 'nor2', msg: '그림 · 파일 저장소(R2 hwip-media)가 연결되지 않았습니다' }, 501);
  const kind = url.searchParams.get('kind') === 'img' ? 'img' : 'file', aud = url.searchParams.get('aud') === 'staff' ? 'staff' : 'guest';
  let name = String(url.searchParams.get('name') || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 150);
  if (kind === 'img') name = (name.replace(/\.[^.]+$/, '') || '팝업그림') + '.jpg';
  const ext = extOf(name);
  if (kind === 'file' && !FILE_TYPES[ext]) return J({ ok: false, err: 'type', msg: '올릴 수 없는 종류입니다 (PDF · 한글 · 엑셀 · 워드 · 그림 · ZIP)' }, 400);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return J({ ok: false, err: 'empty' }, 400);
  if (buf.length > (kind === 'img' ? MAX_IMG : MAX_FILE)) return J({ ok: false, err: 'size', msg: kind === 'img' ? '그림이 너무 큽니다' : '파일 하나는 20MB까지입니다' }, 413);
  if (kind === 'img' && !(buf[0] === 0xff && buf[1] === 0xd8)) return J({ ok: false, err: 'type', msg: '그림 파일이 아닙니다' }, 400);
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  await env.MEDIA.put(keyOf(id), buf, { httpMetadata: { contentType: kind === 'img' ? 'image/jpeg' : FILE_TYPES[ext] } });
  await env.DB.prepare('INSERT INTO media (id, kind, aud, name, size, at, by, dl) VALUES (?, ?, ?, ?, ?, ?, ?, 0)').bind(id, kind, aud, name, buf.length, Date.now(), u.name).run();
  await audit(env.DB, { who: u.name, act: '팝업 파일 올림', target: (aud === 'guest' ? '공개 · ' : '직원 · ') + name, detail: Math.round(buf.length / 1024) + 'KB', ip: ip(req), dev: device(req) });
  return J({ ok: true, id, name, size: buf.length, url: '/api/staff/media/' + id });
}

// 저장소 사용량 · 받은 수 (설정 화면)
export async function mediaUsage(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) n, COALESCE(SUM(size), 0) bytes FROM media').first();
  const dl = (await env.DB.prepare('SELECT id, dl FROM media WHERE dl > 0').all()).results || [];
  return J({ ok: true, r2: !!env.MEDIA, n: r.n, bytes: r.bytes, limit: 10 * 1024 ** 3, dl: Object.fromEntries(dl.map(x => [x.id, x.dl])) });
}

// 파일 지우기 (저장소 + 표)
export async function dropMedia(env, ids) {
  const list = [...new Set(ids)].filter(x => /^[a-z0-9]{8,40}$/.test(x));
  if (!list.length) return 0;
  if (env.MEDIA) await env.MEDIA.delete(list.map(keyOf));
  for (let i = 0; i < list.length; i += 90) { const part = list.slice(i, i + 90); await env.DB.prepare('DELETE FROM media WHERE id IN (' + part.map(() => '?').join(',') + ')').bind(...part).run(); }
  return list.length;
}

// cfg popups 가 바뀔 때: 예전 목록에만 있던 파일 = 지운 팝업 · 바꾼 그림 · 뺀 첨부 → 바로 지움
export async function onPopupsSaved(env, before, after) {
  const keep = refsOf(after), gone = [...refsOf(before)].filter(id => !keep.has(id));
  return dropMedia(env, gone);
}

// 기간(종료일)이 keep 일보다 더 지난 팝업은 뺌 — 종료일 없는 팝업은 그대로
export const keepPops = (pops, keep, now = Date.now()) => { const cut = kstDay(now - keep * DAY); return pops.filter(p => !(p && p.to && p.to < cut)); };

// 매일 정리 (03:00 백업 Cron 과 같이)
export async function popCleanup(env, now = Date.now()) {
  const db = env.DB, pops0 = (await getOne(db, 'cfg', 'popups')) || [], pops = Array.isArray(pops0) ? pops0 : [];
  const kv = await getOne(db, 'cfg', 'popKeep'), keep = kv == null ? KEEP0 : Number(kv) || 0;
  let removed = 0, after = pops;
  if (keep > 0) {
    after = keepPops(pops, keep, now);
    removed = pops.length - after.length;
    if (removed) await putRows(db, [{ s: 'cfg', k: 'popups', v: JSON.stringify(after), at: now, by: '자동 정리' }]);
  }
  const refs = refsOf(after);
  const old = (await db.prepare('SELECT id FROM media WHERE at < ?').bind(now - DAY).all()).results || [];
  let files = await dropMedia(env, old.map(x => x.id).filter(id => !refs.has(id)));
  // 표에 없는 저장소 파일 (올리다 끊긴 것 등)
  if (env.MEDIA) {
    const known = new Set(((await db.prepare('SELECT id FROM media').all()).results || []).map(x => x.id));
    let cursor;
    do {
      const l = await env.MEDIA.list({ prefix: 'm/', cursor, limit: 500 });
      const stray = l.objects.filter(o => !known.has(o.key.slice(2)) && (!o.uploaded || +new Date(o.uploaded) < now - DAY)).map(o => o.key);
      if (stray.length) { await env.MEDIA.delete(stray); files += stray.length; }
      cursor = l.truncated ? l.cursor : null;
    } while (cursor);
  }
  if (removed || files) await audit(db, { who: '자동 정리', act: '팝업 정리', detail: '기간 끝난 팝업 ' + removed + '개 · 파일 ' + files + '개 지움' });
  return { removed, files };
}
