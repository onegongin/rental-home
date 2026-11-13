// 응답 · 요청 도우미 (모든 API 공용)
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

// cookies: Set-Cookie 줄 목록 (출입증 · 기기증 발급/삭제)
export function J(o, s = 200, cookies) {
  const h = new Headers(H);
  (cookies || []).forEach(c => h.append('set-cookie', c));
  return new Response(JSON.stringify(o), { status: s, headers: h });
}

export async function body(req) { try { const b = await req.json(); return b && typeof b === 'object' ? b : null; } catch (e) { return null; } }

export function cookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// HttpOnly = 화면의 자바스크립트가 못 읽는 쿠키. maxAge 0 이면 삭제
export function setCookie(req, name, val, maxAge) {
  const secure = new URL(req.url).protocol === 'https:';
  return name + '=' + encodeURIComponent(val) + '; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secure ? '; Secure' : '');
}

export const ip = req => req.headers.get('cf-connecting-ip') || 'local';
export const device = req => String(req.headers.get('user-agent') || '').slice(0, 160);

// 다른 사이트에서 몰래 보내는 요청 막기: Origin 이 있으면 우리 주소와 같아야 함
export function sameOrigin(req, url) {
  const o = req.headers.get('origin');
  if (!o) return true;
  try { return new URL(o).host === url.host; } catch (e) { return false; }
}
