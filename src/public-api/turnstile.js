// Cloudflare Turnstile (로봇 확인) 검사. 비밀키(TURNSTILE_SECRET)가 없으면 내 PC(localhost)에서만 건너뜀
export async function verifyTurnstile(env, token, remoteip, host) {
  if (!env.TURNSTILE_SECRET) return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const f = new FormData();
  f.append('secret', env.TURNSTILE_SECRET);
  f.append('response', token);
  if (remoteip !== 'local') f.append('remoteip', remoteip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f });
    return !!(await r.json()).success;
  } catch (e) { return false; }
}
