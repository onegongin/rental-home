// 백업 보관 (설계서 14장, P7) — R2 파일 저장소(env.BACKUP)에 gzip 백업
//   auto/날짜.json.gz  매일 03:00 자동 (30일 보관)
//   hand/시각.json.gz  대표 [지금 백업]
//   pre/시각.json.gz   복구 직전 자동 (잘못 복구해도 다시 되돌릴 수 있게, 30일 보관)
import { dump } from '../repo/backup.js';
import { gzip } from './pack.js';
import { notify, reps } from '../notify/index.js';

export const KEEP_DAYS = 30;
export const KIND_KO = { auto: '자동', hand: '수동', pre: '복구 직전' };
const kst = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString();
const stamp = t => kst(t).slice(0, 19).replace(/[-:]/g, '').replace('T', '-');   // 20261103-030000

export async function saveBackup(env, kind, by) {
  if (!env.BACKUP) throw new Error('nor2');
  const data = await dump(env.DB, by);
  const body = await gzip(JSON.stringify(data));
  const key = kind + '/' + (kind === 'auto' ? kst(data.at).slice(0, 10) : stamp(data.at)) + '.json.gz';
  const n = Object.values(data.tables).reduce((s, t) => s + t.rows.length, 0);
  await env.BACKUP.put(key, body, { customMetadata: { at: String(data.at), by: by || '', rows: String(n), tables: String(Object.keys(data.tables).length) } });
  return { key, at: data.at, size: body.length, rows: n };
}

export async function listBackups(env) {
  if (!env.BACKUP) return [];
  const out = [];
  let cursor;
  do {
    const r = await env.BACKUP.list({ cursor, include: ['customMetadata'] });
    r.objects.forEach(o => { const m = o.customMetadata || {}; out.push({ key: o.key, kind: o.key.split('/')[0], at: Number(m.at) || o.uploaded.getTime(), by: m.by || '', rows: Number(m.rows) || 0, size: o.size }); });
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.at - a.at);
}

export async function readBackup(env, key) {
  if (!env.BACKUP || !/^(auto|hand|pre)\/[\w.-]+\.json\.gz$/.test(String(key || ''))) return null;
  const o = await env.BACKUP.get(key);
  return o ? new Uint8Array(await o.arrayBuffer()) : null;
}

// 30일 지난 자동 · 복구 직전 백업 지우기 (수동 백업은 대표가 지울 때까지)
export async function prune(env, now = Date.now()) {
  const old = (await listBackups(env)).filter(b => b.kind !== 'hand' && b.at < now - KEEP_DAYS * 86400e3).map(b => b.key);
  if (old.length) await env.BACKUP.delete(old);
  return old.length;
}

// 매일 03:00 (wrangler.jsonc crons "0 18 * * *" = 한국 03:00) — 실패하면 대표에게 바로 알림
export async function autoBackup(env) {
  try {
    const r = await saveBackup(env, 'auto', '자동');
    await prune(env);
    return r;
  } catch (e) {
    const why = e.message === 'nor2' ? '백업 저장소(R2) 연결 없음 — wrangler.jsonc r2_buckets 확인' : String(e && e.message || e).slice(0, 200);
    await notify(env, { kind: 'backup', urgent: true, text: '[자동 백업 실패] ' + why, dm: await reps(env.DB), path: '?go=backup' });
    return null;
  }
}
