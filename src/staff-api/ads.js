// 광고 API (설계서 11장, P6) — 직원용
//   GET  /api/staff/listings/:id/ads    매체별 마지막 초안 · 게시기록 · 매칭 고객(수신 동의만) · 금지 표현
//   POST /api/staff/listings/:id/ads    op: draft 초안 만들기(전 매체) · save 직원이 고친 글 · ai AI로 다듬기 · post 게시주소 기록 · down 내림 완료
//   GET  /api/staff/ads                 광고 탭: 게시 중 · 내려야 할 광고 · 매체별 문의 수 · 검색 노출(사이트맵 · IndexNow 기록) · AI 다듬기 상태
//   GET  /api/staff/ads?models=1        Gemini 모델 목록 (대표 · 관리자) · POST /api/staff/ads op aiTest 시험 한 번 (대표 · 관리자)
// 초안은 공개 중(pub on)인 매물만 — 필수 항목 검사와 공개 승인을 거친 매물만 밖으로 나가게
import { J, body } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { maskName, maskPhone } from '../core/mask.js';
import { publicRow } from '../core/listings.js';
import { matchCards } from '../core/match.js';
import { MEDIA, MEDIA_KEYS, WRITE_URL, BAN0, draft, withBlock, banHits } from '../ads/templates.js';
import { polish, pickProvider, geminiModel, geminiModels, AI_NAME, AI_CODE } from '../ads/ai.js';
import { hit } from '../repo/rate.js';
import * as LR from '../repo/listings.js';
import * as AR from '../repo/ads.js';
import { getOne } from '../repo/kv.js';
import { notify, listingLine } from '../notify/index.js';
import { seoStatus } from '../seo/index.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

const DAY = 864e5;
const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
const tags = v => { try { return JSON.parse(v || '[]'); } catch (e) { return []; } };
export const loadCards = async db => (await all(db, "SELECT v FROM kv WHERE s = 'c'")).map(r => { try { return JSON.parse(r.v); } catch (e) { return null; } }).filter(c => c && typeof c === 'object' && !c.deleted);
const banList = async db => { const v = await getOne(db, 'cfg', 'adBan'); return Array.isArray(v) && v.length ? v : BAN0; };
const AI_DAY = 30;   // 한 사람 하루 AI 다듬기 횟수 (무료 한도 아끼기)
const aiCfg = db => getOne(db, 'cfg', 'aiCfg');
const isTop = u => u.role === '대표' || u.role === '관리자';
// 광고 탭 'AI 다듬기' 칸 (시안 ai-provider 가 확정 2026-11-04)
async function aiStatus(env, db, u) {
  const cfg = Object.assign({ provider: 'auto', model: '' }, await aiCfg(db) || {}), by = pickProvider(env, cfg);
  const kst = new Date(Date.now() + 9 * 3600e3), day0 = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600e3, mon0 = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600e3;
  const n = async t => ((await db.prepare('SELECT COUNT(*) n FROM ad_drafts WHERE ai > 0 AND at >= ?').bind(t).first()) || {}).n || 0;
  return { by, name: AI_NAME[by] || '', keys: { gemini: !!env.GEMINI_API_KEY, claude: !!env.ANTHROPIC_API_KEY }, provider: cfg.provider, model: geminiModel(env, cfg), month: Number(await n(mon0)), today: Number(await n(day0)), perDay: AI_DAY, edit: isTop(u) };
}

// 광고용 한 줄 (공개 사본과 같은 값). 안 되면 { why }
async function adRow(db, l, cfg) {
  if (l.pub !== 'on') return { why: '공개 중인 매물만 광고 초안을 만들 수 있습니다 (공개 승인 먼저).' };
  const row = publicRow(l, cfg, await LR.staffRow(db, l.mgr || l.writer), Date.now());
  return row ? { row } : { why: '필수 항목이 빠져 광고할 수 없습니다.' };
}

// 공개된 매물에 맞는 고객 (알림 한 줄)
export async function matchNote(db, l) {
  const m = matchCards(l, await loadCards(db));
  return m.list.length || m.noConsent ? '연락할 고객 ' + m.list.length + '명' + (m.noConsent ? ' (수신 동의 없음 ' + m.noConsent + '명 제외)' : '') + ' — 매물 창 › 광고' : '';
}

// 매물이 비공개 · 끝난 상태가 되면 게시 중인 외부 광고 내리기 알림 (설계서 10.3-3)
export async function adsDown(env, l, who) {
  const live = await AR.liveOf(env.DB, l.id);
  if (!live.length) return 0;
  await notify(env, { kind: 'ad', text: '[광고 내리기] ' + listingLine(l) + ' · ' + live.length + '건\n' + live.map(p => '· ' + (MEDIA[p.media] || p.media) + ' ' + p.url).join('\n') + '\n내린 뒤 매물 창 › 광고에서 [내림 완료]\n— ' + who, dm: [l.mgr || l.writer], actor: '', path: '?go=l:' + l.id });
  return live.length;
}

function shapeDraft(d, ban, urgent) {
  return { media: d.media, ver: d.ver, title: d.title, body: d.body, tags: tags(d.tags), ai: !!d.ai, aiBy: Number(d.ai) === AI_CODE.gemini ? 'Gemini' : d.ai ? 'Claude' : '', by: d.by, at: d.at, ban: banHits(d.title + '\n' + d.body, ban, urgent) };
}

export async function staffAds(req, env, url, u) {
  const db = env.DB, p = url.pathname;

  if (p === '/api/staff/ads' && req.method === 'POST') {
    const b = await body(req) || {};
    if (!isTop(u)) return J({ ok: false, err: 'perm' }, 403);
    if (b.op !== 'aiTest') return J({ ok: false, err: 'input' }, 400);
    const t0 = Date.now(), r = await polish(env, 'naver', (SITE.seo || {}).aiSample || '', await aiCfg(db));
    return J({ ok: r.ok, err: r.err, msg: r.msg, by: AI_NAME[r.by] || '', ms: Date.now() - t0, sample: r.ok ? r.text.slice(0, 120) : '' });
  }
  if (p === '/api/staff/ads' && req.method === 'GET') {
    if (u.role === '열람') return J({ ok: false, err: 'perm' }, 403);
    if (url.searchParams.get('models')) return isTop(u) ? J({ ok: true, models: await geminiModels(env) }) : J({ ok: false, err: 'perm' }, 403);
    const live = await AR.livePosts(db), now = Date.now();
    const cards = await loadCards(db), cnt = {};
    const at = c => /^g\d{10,16}$/.test(c.id || '') ? Number(c.id.slice(1)) : Date.parse(String(c.at || '').slice(0, 10) + 'T00:00:00+09:00') || 0;
    cards.forEach(c => { const t = at(c); ((c.inflow || {}).media || []).forEach(m => { cnt[m] = cnt[m] || { d30: 0, d90: 0 }; if (t > now - 30 * DAY) cnt[m].d30++; if (t > now - 90 * DAY) cnt[m].d90++; }); });
    const posts = await all(db, 'SELECT media, COUNT(*) n FROM ad_posts WHERE posted_at > ? GROUP BY media', now - 90 * DAY);
    return J({ ok: true, media: MEDIA, seo: await seoStatus(env, url),
      live: live.map(x => ({ id: x.id, listing_id: x.listing_id, media: x.media, url: x.url, posted_at: x.posted_at, by: x.by, due: x.due, status: x.status || '삭제됨', pub: x.pub, line: x.unit_id ? listingLine(x) : '', mgr: x.mgr || x.writer || '' })),
      inflow: Object.entries(cnt).map(([m, v]) => ({ media: m, d30: v.d30, d90: v.d90 })).sort((a, b) => b.d90 - a.d90),
      posts90: Object.fromEntries(posts.map(r => [r.media, r.n])), ai: await aiStatus(env, db, u) });
  }

  const m = p.match(/^\/api\/staff\/listings\/([0-9A-Z]{26})\/ads$/);
  if (!m) return J({ ok: false, err: 'notfound' }, 404);
  const id = m[1], cur = await LR.getListing(db, id);
  if (!cur) return J({ ok: false, err: 'notfound' }, 404);
  const it = Object.assign({}, cur, { grant: await LR.grantOf(db, id, u.name) });
  const edit = can(u, 'listing.edit', it);
  if (!edit && !can(u, 'listing.raw', it)) return J({ ok: false, err: 'perm' }, 403);
  const cfg = await LR.loadCfg(db), ban = await banList(db), ar = await adRow(db, cur, cfg);
  const state = async () => {
    const mt = matchCards(cur, await loadCards(db));
    return {
      ok: true, media: MEDIA, write: WRITE_URL, can: edit && !ar.why, canEdit: edit, why: ar.why || '', ban, ai: AI_NAME[pickProvider(env, await aiCfg(db))] || '',
      drafts: (await AR.draftsOf(db, id)).map(d => shapeDraft(d, ban, cur.urgent)),
      posts: await AR.postsOf(db, id),
      matches: { noConsent: mt.noConsent, list: mt.list.slice(0, 30).map(({ c, why }) => {
        const raw = can(u, 'card.raw', c);
        return { id: c.id, name: raw ? c.name : maskName(c.name), phone: raw ? c.phone : maskPhone(c.phone), masked: !raw, mgr: c.mgr || '', why, at: c.at || '' };
      }) }
    };
  };
  if (req.method === 'GET') return J(await state());
  if (req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  if (!edit) return J({ ok: false, err: 'perm' }, 403);
  const b = await body(req) || {}, op = b.op, media = String(b.media || '');

  if (op === 'down') {
    const post = await AR.getPost(db, String(b.post || ''));
    if (!post || post.listing_id !== id) return J({ ok: false, err: 'notfound' }, 404);
    if (!post.down_at) await AR.downPost(db, post, u.name);
    return J(await state());
  }
  // 그 밖은 광고할 수 있는 매물에서만
  if (ar.why) return J({ ok: false, err: 'state', msg: ar.why }, 409);

  if (op === 'draft') {
    const list = MEDIA_KEYS.includes(media) ? [media] : MEDIA_KEYS, seed = Number(b.seed) || Math.floor(Math.random() * 1000);
    await AR.saveDrafts(db, id, list.map(k => draft(k, ar.row, seed)), u.name);
    return J(await state());
  }
  if (!MEDIA_KEYS.includes(media)) return J({ ok: false, err: 'input' }, 400);

  if (op === 'save') {
    const text = String(b.body || '').slice(0, 6000);
    if (!text.trim()) return J({ ok: false, err: 'input' }, 400);
    const tg = Array.isArray(b.tags) ? b.tags.map(x => String(x).replace(/^#/, '').trim().slice(0, 30)).filter(Boolean).slice(0, 30) : undefined;
    const last = (await AR.draftsOf(db, id)).find(d => d.media === media);
    await AR.saveDrafts(db, id, [{ media, title: String(b.title ?? (last && last.title) ?? '').slice(0, 120), body: withBlock(media, text, ar.row), tags: tg || (last ? tags(last.tags) : []) }], u.name);
    return J(await state());
  }
  if (op === 'ai') {
    const last = (await AR.draftsOf(db, id)).find(d => d.media === media) || draft(media, ar.row, 0);
    const cfgA = await aiCfg(db);
    if (pickProvider(env, cfgA) && !(await hit(db, 'ai:' + u.name, AI_DAY, DAY))) return J({ ok: false, err: 'busy', msg: '오늘 AI 다듬기를 ' + AI_DAY + '번 다 썼습니다. 내일 다시 쓸 수 있습니다.' }, 429);
    const r = await polish(env, media, (last.title ? last.title + '\n\n' : '') + last.body, cfgA);
    if (!r.ok) return J({ ok: false, err: r.err, msg: r.msg }, r.err === 'nokey' ? 501 : r.err === 'busy' ? 503 : 502);
    // 블로그는 첫 줄이 제목
    let title = last.title || '', text = r.text;
    if (media === 'blog') { const ls = text.split('\n'); title = ls[0].replace(/^#+\s*|^제목\s*[:：]\s*/g, '').slice(0, 120); text = ls.slice(1).join('\n').trim(); }
    await AR.saveDrafts(db, id, [{ media, title, body: withBlock(media, text, ar.row), tags: tags(last.tags), ai: AI_CODE[r.by] || 1 }], u.name);
    return J(await state());
  }
  if (op === 'post') {
    const link = String(b.url || '').trim();
    if (!/^https?:\/\/\S{3,490}$/.test(link)) return J({ ok: false, err: 'input', msg: 'http 로 시작하는 게시 주소를 붙여 넣으세요.' }, 400);
    await AR.addPost(db, id, media, link, u.name);
    return J(await state());
  }
  return J({ ok: false, err: 'input' }, 400);
}
