// AI 客户端:只跟本站的 /api/ai 说话(DeepSeek Key 只在服务端,见 worker/)
// 站点没有 /api(如 GitHub Pages 镜像)或没登录 Access 时 → AI 不可用,各处自动降级。
import { meProbe } from '../sync.js';
import { parseJSONLoose } from './tutor.js';

export const ai = { available: null, email: '', quota: null, lastError: '' };

export async function aiAvailable(force = false) {
  const me = await meProbe(force);
  ai.available = !!(me.ok && me.ai);
  ai.email = me.email || '';
  ai.quota = me.quota || null;
  return ai.available;
}

export class AIError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

// 发一轮对话,要求模型只回一个 JSON 对象;返回解析后的对象
export async function chatJSON(messages, { temperature = 0.4, maxTokens = 1500, timeoutMs = 90000 } = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let r;
  try {
    r = await fetch('api/ai', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature, max_tokens: maxTokens, json: true }),
      signal: ctl ? ctl.signal : undefined,
    });
  } catch (e) {
    throw new AIError(e.name === 'AbortError' ? 'AI 老师想得太久了,稍后再试' : '网络不通,AI 老师暂时联系不上', 'network');
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data = null;
  try { data = await r.json(); } catch (e) { /* 非 JSON */ }
  if (data && data.quota) ai.quota = data.quota;
  if (r.status === 429) throw new AIError('今天的 AI 额度用完了,明天再来(或请家长调高上限)', 'quota');
  if (r.status === 401 || r.status === 403) throw new AIError('需要先登录(刷新页面走一遍登录)', 'auth');
  if (!r.ok || !data) throw new AIError((data && data.error) || `AI 服务出错(HTTP ${r.status})`, 'upstream');
  return parseJSONLoose(data.content);
}

// ── 本地缓存:同一道错题、同样的作答不重复花 Token ─────────
const CACHE_KEY = 'wpc_ai_cache_v1';
const CACHE_CAP = 150;

function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = (h2 * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
}

export function cacheGet(keySrc) {
  const c = readCache()[hash(keySrc)];
  return c ? c.v : null;
}

export function cachePut(keySrc, v) {
  try {
    const c = readCache();
    c[hash(keySrc)] = { ts: Date.now(), v };
    const keys = Object.keys(c);
    if (keys.length > CACHE_CAP) {
      keys.sort((a, b) => c[a].ts - c[b].ts).slice(0, keys.length - CACHE_CAP).forEach(k => delete c[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch (e) { /* 存不下就不缓存 */ }
}
