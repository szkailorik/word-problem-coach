// /api 路由(纯逻辑,依赖可注入,node 可测)
//   GET  /api/me    登录邮箱 + AI 是否可用 + 今日额度
//   GET  /api/sync  取云端状态      PUT /api/sync  服务端合并同步
//   POST /api/ai    DeepSeek 代理(Key 只在服务端;模型固定、长度/次数受限)
import { verifyAccess } from './access.js';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: HEADERS });
const raw = (text, status = 200) => new Response(text, { status, headers: HEADERS });

export const LIMITS = { messages: 8, chars: 24000, maxTokens: 2500, syncBytes: 4 * 1024 * 1024 };

// 写接口只接受同源的 application/json:
// MIME 本体必须恰好是 application/json(text/plain;application/json 这种"简单请求"不算),
// 浏览器带了 Sec-Fetch-Site / Origin 的,还必须是同源——跨站页面借登录 Cookie 刷额度行不通
function isSameOriginJSON(request, url) {
  const essence = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (essence !== 'application/json') return false;
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  return true;
}

export function checkMessages(msgs) {
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > LIMITS.messages) return 'messages 数量不对';
  let chars = 0;
  for (const m of msgs) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return 'messages 格式不对';
    chars += m.content.length;
  }
  if (chars > LIMITS.chars) return '内容太长';
  return '';
}

export const MAX_STUDENTS = 6;
export function checkState(s) {
  if (!s || typeof s.students !== 'object' || s.students === null || Array.isArray(s.students)) return '状态格式不对';
  const names = Object.keys(s.students);
  if (names.length > MAX_STUDENTS) return '学生太多';
  if (names.some(n => !/^[\w\u4e00-\u9fff -]{1,24}$/.test(n))) return '学生名不合法';
  return '';
}

export async function handleApi(request, env, deps = {}) {
  const url = new URL(request.url);
  const verify = deps.verify || verifyAccess;
  const user = await verify(request, env);
  if (!user) return json({ error: '需要登录' }, 401);
  const store = deps.store || env.FAMILY.get(env.FAMILY.idFromName('family'));
  const fetchImpl = deps.fetch || fetch;
  const limit = Number(env.AI_DAILY_LIMIT) || 300;
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/me' && request.method === 'GET') {
    return json({ email: user.email, ai: !!env.DEEPSEEK_API_KEY, sync: true, quota: await store.quota(limit) });
  }

  if (path === '/api/sync') {
    if (request.method === 'GET') return raw(await store.getState());
    if (request.method === 'PUT') {
      if (!isSameOriginJSON(request, url)) return json({ error: '需要同源 JSON' }, 415);
      const text = await request.text();
      if (new TextEncoder().encode(text).length > LIMITS.syncBytes) return json({ error: '数据太大' }, 413);
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { return json({ error: '状态格式不对' }, 400); }
      const bad = checkState(parsed);
      if (bad) return json({ error: bad }, 400);
      try {
        return raw(await store.syncState(text));
      } catch (e) {
        return json({ error: '云端存储出错:' + String(e && e.message || e).slice(0, 120) }, 500);
      }
    }
    return json({ error: 'method' }, 405);
  }

  if (path === '/api/ai') {
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (!isSameOriginJSON(request, url)) return json({ error: '需要同源 JSON' }, 415);
    if (!env.DEEPSEEK_API_KEY) return json({ error: '服务器还没配置 DeepSeek 密钥' }, 503);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'JSON 解析失败' }, 400); }
    const bad = checkMessages(body && body.messages);
    if (bad) return json({ error: bad }, 400);
    const temperature = Math.min(1.3, Math.max(0, Number(body.temperature ?? 0.4) || 0));
    const maxTokens = Math.min(LIMITS.maxTokens, Math.max(100, Math.floor(Number(body.max_tokens) || 1200)));
    const q = await store.useQuota(limit);
    if (!q.ok) return json({ error: '今日 AI 额度已用完', quota: { used: q.used, limit } }, 429);
    const payload = {
      model: env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: body.messages.map(m => ({ role: m.role, content: m.content })),
      temperature, max_tokens: maxTokens, stream: false,
    };
    if (body.json) payload.response_format = { type: 'json_object' };
    let up;
    try {
      up = await fetchImpl((env.DEEPSEEK_BASE || 'https://api.deepseek.com') + '/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json({ error: '连不上 DeepSeek', quota: { used: q.used, limit } }, 502);
    }
    if (!up.ok) {
      const detail = (await up.text()).slice(0, 300);
      return json({ error: `DeepSeek 返回 ${up.status}`, detail, quota: { used: q.used, limit } }, 502);
    }
    const data = await up.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content || '' : '';
    return json({ content, usage: data.usage || null, quota: { used: q.used, limit } });
  }

  return json({ error: 'not found' }, 404);
}
