// Cloudflare Access JWT 校验(与 mini2.kailorik.com 同一个 Access 团队)
// Access 已在边缘拦截未登录请求;这里再验一次签名,防止绕过(比如直接访问 *.workers.dev 地址)。
// 没配置 ACCESS_AUD / TEAM_DOMAIN 时一律拒绝(fail closed)。

const certCache = new Map(); // teamDomain -> { at, keys }
const CERT_TTL = 60 * 60 * 1000;

function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJSON = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

function tokenFrom(request) {
  const h = request.headers.get('cf-access-jwt-assertion');
  if (h) return h;
  const cookie = request.headers.get('cookie') || '';
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? m[1] : '';
}

async function getKeys(team, fetchImpl, force = false) {
  const c = certCache.get(team);
  if (c && !force && Date.now() - c.at < CERT_TTL) return c.keys;
  const r = await fetchImpl(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs ' + r.status);
  const keys = (await r.json()).keys || [];
  certCache.set(team, { at: Date.now(), keys });
  return keys;
}

export function _clearCertCache() { certCache.clear(); }

// 返回 { email } 或 null
export async function verifyAccess(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const url = new URL(request.url);
  if (env.DEV_AUTH_BYPASS === '1' && ['localhost', '127.0.0.1'].includes(url.hostname)) return { email: 'dev@localhost' };
  const team = env.TEAM_DOMAIN, auds = String(env.ACCESS_AUD || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!team || !auds.length) return null;
  const token = tokenFrom(request);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = b64urlJSON(parts[0]);
    const payload = b64urlJSON(parts[1]);
    if (header.alg !== 'RS256') return null;
    let keys = await getKeys(team, fetchImpl);
    let jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) { keys = await getKeys(team, fetchImpl, true); jwk = keys.find(k => k.kid === header.kid); } // 密钥轮换
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const t = now / 1000;
    if (typeof payload.exp !== 'number' || payload.exp < t - 30) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > t + 30) return null;
    if (payload.iss !== `https://${team}`) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.some(a => auds.includes(a))) return null;
    const email = String(payload.email || payload.common_name || '').toLowerCase();
    const allow = String(env.ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(email)) return null;
    return { email: email || 'service-token' };
  } catch (e) {
    return null;
  }
}
