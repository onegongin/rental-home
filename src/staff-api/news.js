// 분양 소식 (시안 r79 확정 2026-11-25) — 직원 화면 staff/news.html · 대표 · 관리자만
//   GET  /api/staff/news                 → 글 전체 (임시 · 공개) + 점검 · 개인정보 경고
//   POST /api/staff/news                 { cat, title, lead, blocks, tags, slug } 새 글 (임시 저장)
//   POST /api/staff/news/upload          ?name= 본문 = JPEG (화면이 로고 새김 · 1600px) → { id }
//   POST /api/staff/news/:id             고치기
//   POST /api/staff/news/:id/pub         공개 (개인정보 있으면 막음) · 텔레그램 알림
//   POST /api/staff/news/:id/unpub       내리기 (임시로)
//   POST /api/staff/news/:id/del         지우기 (숨김)
import { J, body, ip, device } from '../lib/http.js';
import { CAT, CATS, LINKS, cleanNews, blocksOf, textOf, privacy, checks } from '../core/news.js';
import * as N from '../repo/news.js';
import { audit } from '../repo/audit.js';
import { notify } from '../notify/index.js';
import { MAX_IMG, keyOf } from '../popups/public.js';
import { baseOf } from '../seo/index.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

const NAME = (SITE.site || {}).name || '', TEL = [(SITE.office || {}).tel].filter(Boolean);
const view = n => Object.assign({}, n, { blocks: blocksOf(n), tags: n.tags ? n.tags.split(',') : [], checks: checks(Object.assign({}, n), NAME), bad: privacy(textOf(n), TEL), body: undefined });

export async function staffNews(req, env, url, u) {
  const db = env.DB, p = url.pathname, who = { who: u.name, ip: ip(req), dev: device(req) };
  if (!(u.role === '대표' || u.role === '관리자')) return J({ ok: false, err: 'perm', msg: '분양 소식은 대표 · 관리자만 씁니다' }, 403);

  if (p === '/api/staff/news' && req.method === 'GET')
    return J({ ok: true, cats: CATS, links: Object.fromEntries(Object.entries(LINKS).map(([k, v]) => [k, v[1]])), name: NAME, base: baseOf(env, url), list: (await N.listAll(db)).map(view) });

  if (p === '/api/staff/news/upload' && req.method === 'POST') {
    if (!env.MEDIA) return J({ ok: false, err: 'nor2', msg: '파일 저장소가 연결되지 않았습니다' }, 501);
    const name = (String(url.searchParams.get('name') || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 150).replace(/\.[^.]+$/, '') || '사진') + '.jpg';
    const buf = new Uint8Array(await req.arrayBuffer());
    if (!buf.length) return J({ ok: false, err: 'empty' }, 400);
    if (buf.length > MAX_IMG) return J({ ok: false, err: 'size', msg: '사진이 너무 큽니다' }, 413);
    if (!(buf[0] === 0xff && buf[1] === 0xd8)) return J({ ok: false, err: 'type', msg: '사진 파일이 아닙니다' }, 400);
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    await env.MEDIA.put(keyOf(id), buf, { httpMetadata: { contentType: 'image/jpeg' } });
    await N.addMedia(db, id, name, buf.length, u.name);
    return J({ ok: true, id, name });
  }

  if (p === '/api/staff/news' && req.method === 'POST') {
    const b = await body(req) || {}, x = cleanNews(b, true);
    if (x.err) return J({ ok: false, err: 'input', field: x.err }, 400);
    if (await N.slugTaken(db, x.slug)) return J({ ok: false, err: 'slug', msg: '같은 글 주소가 이미 있습니다' }, 409);
    const id = await N.insert(db, Object.assign({ author: u.name }, x));
    await audit(db, Object.assign({ act: '분양 소식 저장', target: id, detail: CAT[x.cat] + ' · ' + x.title.slice(0, 60) }, who));
    return J({ ok: true, id });
  }

  const m = p.match(/^\/api\/staff\/news\/([0-9A-Z]{26})(\/pub|\/unpub|\/del)?$/);
  if (!m || req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const n = await N.get(db, m[1]);
  if (!n) return J({ ok: false, err: 'notfound' }, 404);

  if (m[2] === '/pub') {
    const bad = privacy(textOf(n), TEL);
    if (bad.length) return J({ ok: false, err: 'privacy', msg: '공개 글에 개인정보가 있습니다: ' + bad.join(', '), bad }, 409);
    await N.setStatus(db, n.id, 'pub');
    await audit(db, Object.assign({ act: '분양 소식 공개', target: n.id, detail: n.title.slice(0, 60) }, who));
    if (n.status !== 'pub') await notify(env, { kind: 'news', text: '[분양 소식 공개] ' + n.title + '\n' + baseOf(env, url) + '/news/' + n.slug + '\n— ' + u.name + ' (블로그 · 카페에 공유해 주세요)', actor: u.name, path: 'news.html' });
    return J({ ok: true });
  }
  if (m[2] === '/unpub') { await N.setStatus(db, n.id, 'draft'); await audit(db, Object.assign({ act: '분양 소식 내림', target: n.id, detail: n.title.slice(0, 60) }, who)); return J({ ok: true }); }
  if (m[2] === '/del') { await N.hide(db, n.id, u.name); await audit(db, Object.assign({ act: '분양 소식 지움', target: n.id, detail: n.title.slice(0, 60) }, who)); return J({ ok: true }); }

  const b = await body(req) || {}, x = cleanNews(b, false);
  if (x.err) return J({ ok: false, err: 'input', field: x.err }, 400);
  if (x.slug && x.slug !== n.slug && await N.slugTaken(db, x.slug, n.id)) return J({ ok: false, err: 'slug', msg: '같은 글 주소가 이미 있습니다' }, 409);
  if (n.status === 'pub') { const bad = privacy(textOf(Object.assign({}, n, x)), TEL); if (bad.length) return J({ ok: false, err: 'privacy', msg: '공개 글에 개인정보가 있습니다: ' + bad.join(', '), bad }, 409); }
  await N.edit(db, n.id, x);
  return J({ ok: true });
}
