// 공지사항 (시안 r77 확정 2026-11-25) — 직원 화면 '공지사항' 탭 (staff/notice.html, 대시보드 안 iframe)
//   GET  /api/staff/notice               → 목록 (확인한 직원 · 확인 수 = 대표 · 관리자에게만) + 내가 볼 수(n)
//   GET  /api/staff/notice/count         → { n, pop } 탭 숫자 · 접속 알림 창 (대시보드가 부름)
//   POST /api/staff/notice               { cat, title, body, files, pin, popup, tg } 새 글 (업무 · 교육 · 일정 = 대표 · 관리자)
//   POST /api/staff/notice/upload        ?name=&img=1 본문 = 파일 (사진 = JPEG · PDF) → { id }
//   POST /api/staff/notice/:id           고치기 (쓴 사람 · 대표 · 관리자, 직원 요청은 답변 대기일 때만)
//   POST /api/staff/notice/:id/del       지우기 (숨김)
//   POST /api/staff/notice/:id/ack       [확인했습니다] (업무 · 일정 · 요청)
//   POST /api/staff/notice/:id/seen      글 열어 봄 (NEW 지움)
//   POST /api/staff/notice/:id/reply     { body, done } 요청 글 답변 (누구나) · done = 답변 완료 (대표 · 관리자)
//   POST /api/staff/notice/:id/status    { status } 답변 대기 ↔ 완료 (대표 · 관리자)
//   POST /api/staff/notice/reply/:rid/del 답변 지우기 (쓴 사람 · 대표 · 관리자)
import { J, body, ip, device } from '../lib/http.js';
import { CATS, ST, isBoss, canWrite, ackOn, cleanNotice, sortNotices, todo, popOf, cleanFiles } from '../core/notice.js';
import * as N from '../repo/notice.js';
import { audit } from '../repo/audit.js';
import { notify } from '../notify/index.js';
import { FILE_TYPES, MAX_FILE, MAX_IMG, keyOf, extOf } from '../popups/public.js';

const cut = (t, n) => { t = String(t || '').replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const byNid = rows => rows.reduce((m, r) => ((m[r.nid] = m[r.nid] || []).push(r), m), {});
const filesOf = n => { try { return cleanFiles(JSON.parse(n.files || '[]')); } catch (e) { return []; } };

export async function staffNotice(req, env, url, u) {
  const db = env.DB, p = url.pathname, me = u.name, boss = isBoss(u.role), who = { who: me, ip: ip(req), dev: device(req) };

  if ((p === '/api/staff/notice' || p === '/api/staff/notice/count') && req.method === 'GET') {
    const [rows, rd, rp] = await Promise.all([N.list(db), N.reads(db), N.replies(db)]);
    const R = byNid(rd), X = byNid(rp), mine = id => (R[id] || []).find(r => r.who === me);
    const n = rows.filter(x => todo(x, me, mine(x.id), X[x.id])).length;
    if (p.endsWith('/count')) {
      const pop = sortNotices(rows.filter(x => popOf(x, me, mine(x.id)))).slice(0, 3).map(x => ({ id: x.id, cat: x.cat, title: x.title, body: cut(x.body, 300), author: x.author, at: x.at }));
      return J({ ok: true, n, pop });
    }
    const staff = await N.staff(db), total = staff.length, roles = Object.fromEntries(staff.map(s => [s.name, s.role]));
    const list = sortNotices(rows).map(x => {
      const my = mine(x.id) || {}, acks = (R[x.id] || []).filter(r => r.ack_at), o = {
        id: x.id, cat: x.cat, title: x.title, body: x.body, pin: x.pin ? 1 : 0, popup: x.popup ? 1 : 0, author: x.author, at: x.at, edited_at: x.edited_at || null,
        status: x.cat === '요청' ? (x.status || ST[0]) : null, files: filesOf(x), ackOn: ackOn(x.cat), ack: !!my.ack_at, isNew: x.author !== me && !my.seen_at && !my.ack_at,
        todo: todo(x, me, my, X[x.id]), mine: x.author === me, canEdit: x.author === me || boss,
        replies: x.cat === '요청' ? (X[x.id] || []).map(r => ({ id: r.id, who: r.who, body: r.body, at: r.at, boss: isBoss(roles[r.who]), canDel: r.who === me || boss })) : []
      };
      if (boss && o.ackOn) { o.ackN = acks.length; o.ackOf = acks.map(r => ({ who: r.who, at: r.ack_at })).sort((a, b) => a.at - b.at); o.total = total; }
      return o;
    });
    return J({ ok: true, me, boss, cats: CATS, writeCats: CATS.filter(c => canWrite(u.role, c)), staff: boss ? staff.map(s => s.name) : [], n, list });
  }

  if (p === '/api/staff/notice/upload' && req.method === 'POST') {
    if (!env.MEDIA) return J({ ok: false, err: 'nor2', msg: '파일 저장소가 연결되지 않았습니다' }, 501);
    if (u.role === '열람') return J({ ok: false, err: 'perm' }, 403);
    const img = url.searchParams.get('img') === '1';
    let name = String(url.searchParams.get('name') || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 150);
    if (img) name = (name.replace(/\.[^.]+$/, '') || '사진') + '.jpg';
    if (!img && extOf(name) !== 'pdf') return J({ ok: false, err: 'type', msg: '사진 · PDF 만 올릴 수 있습니다' }, 400);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (!buf.length) return J({ ok: false, err: 'empty' }, 400);
    if (buf.length > (img ? MAX_IMG : MAX_FILE)) return J({ ok: false, err: 'size', msg: img ? '사진이 너무 큽니다' : 'PDF 하나는 20MB까지입니다' }, 413);
    const okSig = img ? (buf[0] === 0xff && buf[1] === 0xd8) : (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);
    if (!okSig) return J({ ok: false, err: 'type', msg: img ? '사진 파일이 아닙니다' : 'PDF 파일이 아닙니다' }, 400);
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    await env.MEDIA.put(keyOf(id), buf, { httpMetadata: { contentType: img ? 'image/jpeg' : FILE_TYPES.pdf } });
    await N.addMedia(db, id, img ? 'img' : 'file', name, buf.length, me);
    return J({ ok: true, id, name, img: img ? 1 : 0 });
  }

  if (p === '/api/staff/notice' && req.method === 'POST') {
    const b = await body(req) || {}, x = cleanNotice(b, u.role, true);
    if (x.err === 'perm') return J({ ok: false, err: 'perm', msg: '업무 · 교육 · 일정은 대표 · 관리자만 씁니다' }, 403);
    if (x.err) return J({ ok: false, err: 'input', field: x.err }, 400);
    if (!ackOn(x.cat)) x.popup = 0;
    if (x.cat === '요청') x.status = ST[0];
    const id = await N.insert(db, Object.assign({ author: me }, x));
    await N.mark(db, id, me, 'ack');
    await audit(db, Object.assign({ act: '공지 올림', target: id, detail: x.cat + ' · ' + cut(x.title, 60) }, who));
    if (b.tg) {
      const st = await N.staff(db), to = boss ? st.map(s => s.name) : st.filter(s => isBoss(s.role)).map(s => s.name);
      await notify(env, { kind: 'notice', text: '[공지 · ' + x.cat + '] ' + x.title + '\n' + cut(x.body, 200) + '\n— ' + me, dm: to, actor: me, path: '?tab=notice' });
    }
    return J({ ok: true, id });
  }

  const rm = p.match(/^\/api\/staff\/notice\/reply\/([0-9A-Z]{26})\/del$/);
  if (rm && req.method === 'POST') {
    const r = await N.getReply(db, rm[1]);
    if (!r) return J({ ok: false, err: 'notfound' }, 404);
    if (r.who !== me && !boss) return J({ ok: false, err: 'perm' }, 403);
    await N.hideReply(db, r.id);
    await audit(db, Object.assign({ act: '공지 답변 지움', target: r.nid, detail: (r.who !== me ? r.who + ' 답변 · ' : '') + cut(r.body, 60) }, who));
    return J({ ok: true });
  }

  const m = p.match(/^\/api\/staff\/notice\/([0-9A-Z]{26})(\/del|\/ack|\/seen|\/reply|\/status)?$/);
  if (!m || req.method !== 'POST') return J({ ok: false, err: 'notfound' }, 404);
  const n = await N.get(db, m[1]);
  if (!n) return J({ ok: false, err: 'notfound' }, 404);
  const b = await body(req) || {}, mine = n.author === me;

  if (m[2] === '/seen') { await N.mark(db, n.id, me, 'seen'); return J({ ok: true }); }
  if (m[2] === '/ack') {
    if (!ackOn(n.cat)) return J({ ok: false, err: 'noack' }, 400);
    await N.mark(db, n.id, me, 'ack'); return J({ ok: true });
  }
  if (m[2] === '/reply') {
    if (n.cat !== '요청') return J({ ok: false, err: 'noreply', msg: '답변은 요청 글에만 답니다' }, 400);
    if (u.role === '열람') return J({ ok: false, err: 'perm' }, 403);
    const t = String(b.body || '').replace(/\r\n/g, '\n').trim().slice(0, 2000);
    if (!t) return J({ ok: false, err: 'input', field: 'body' }, 400);
    const rid = await N.addReply(db, n.id, me, t);
    await N.mark(db, n.id, me, 'ack');
    if (boss && b.done) await N.setStatus(db, n.id, ST[1]);
    const to = mine ? (await N.staff(db)).filter(s => isBoss(s.role)).map(s => s.name) : [n.author];
    await notify(env, { kind: 'notice', text: '[요청 답변' + (boss && b.done ? ' · 완료' : '') + '] ' + cut(n.title, 60) + '\n' + cut(t, 200) + '\n— ' + me, dm: to, actor: me, path: '?tab=notice' });
    return J({ ok: true, id: rid });
  }
  if (m[2] === '/status') {
    if (!boss || n.cat !== '요청' || !ST.includes(b.status)) return J({ ok: false, err: 'perm' }, 403);
    await N.setStatus(db, n.id, b.status); return J({ ok: true });
  }

  if (!mine && !boss) return J({ ok: false, err: 'perm', msg: '쓴 사람 · 대표 · 관리자만 고칠 수 있습니다' }, 403);
  if (m[2] === '/del') {
    await N.hide(db, n.id, me);
    await audit(db, Object.assign({ act: '공지 지움', target: n.id, detail: (mine ? '' : n.author + ' 글 · ') + n.cat + ' · ' + cut(n.title, 60) }, who));
    return J({ ok: true });
  }
  if (!boss && n.cat === '요청' && n.status === ST[1]) return J({ ok: false, err: 'done', msg: '답변 완료된 요청은 고칠 수 없습니다' }, 409);
  const x = cleanNotice(b, u.role, false);
  if (x.err === 'perm') return J({ ok: false, err: 'perm' }, 403);
  if (x.err) return J({ ok: false, err: 'input', field: x.err }, 400);
  const cat = x.cat || n.cat;
  if (!ackOn(cat)) x.popup = 0;
  if (x.cat && x.cat !== n.cat) x.status = cat === '요청' ? ST[0] : null;
  await N.edit(db, n.id, x);
  return J({ ok: true });
}
