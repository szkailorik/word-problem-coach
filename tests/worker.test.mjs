// Worker:Access 验签 + /api 守卫 + AI 代理 + 服务端合并同步:node tests/worker.test.mjs
import { verifyAccess, _clearCertCache } from '../worker/access.js';
import { handleApi, LIMITS } from '../worker/api.js';
import { FamilyCore, dayKey } from '../worker/core.js';
import { check, done } from './_check.mjs';

const TEAM = 'team.cloudflareaccess.com', AUD = 'aud123';
const env = { TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, DEEPSEEK_API_KEY: 'sk-test', AI_DAILY_LIMIT: '3' };

// ── 自签 RS256 密钥,模拟 Access 的公钥端点 ──
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pub = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
const b64u = buf => Buffer.from(buf).toString('base64url');
async function jwt(payload, { key = kp.privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const h = b64u(JSON.stringify({ alg, kid, typ: 'JWT' })), p = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
  return `${h}.${p}.${b64u(sig)}`;
}
let certFetches = 0;
const certFetch = async url => { certFetches++; return new Response(JSON.stringify({ keys: url.includes(TEAM) ? [pub] : [] })); };
const now = Date.now();
const good = { aud: [AUD], email: 'Parent@Example.com', exp: now / 1000 + 600, iat: now / 1000, iss: `https://${TEAM}` };
const req = (token, { url = 'https://wp.kailorik.com/api/me', cookie = false, method = 'GET', body, ct } = {}) => new Request(url, {
  method, body,
  headers: { ...(token ? (cookie ? { cookie: `x=1; CF_Authorization=${token}` } : { 'cf-access-jwt-assertion': token }) : {}), ...(ct ? { 'content-type': ct } : {}) },
});
const V = (r, e = env) => verifyAccess(r, e, { fetchImpl: certFetch, now });

check('合法 JWT 通过,邮箱小写', (await V(req(await jwt(good))))?.email === 'parent@example.com');
check('Cookie 里的 JWT 也认', !!(await V(req(await jwt(good), { cookie: true }))));
check('证书有缓存', certFetches === 1);
check('无 token 拒绝', (await V(req(''))) === null);
check('别的密钥签名拒绝', (await V(req(await jwt(good, { key: other.privateKey })))) === null);
check('aud 不符拒绝', (await V(req(await jwt({ ...good, aud: ['zzz'] })))) === null);
check('过期拒绝', (await V(req(await jwt({ ...good, exp: now / 1000 - 3600 })))) === null);
check('iss 不符拒绝', (await V(req(await jwt({ ...good, iss: 'https://evil.cloudflareaccess.com' })))) === null);
check('alg none 拒绝', (await V(req(await jwt(good, { alg: 'none' })))) === null);
check('未知 kid 拒绝(并刷新一次证书)', (await V(req(await jwt(good, { kid: 'k9' })))) === null && certFetches === 2);
check('篡改载荷拒绝', await (async () => { const t = (await jwt(good)).split('.'); t[1] = b64u(JSON.stringify({ ...good, email: 'hacker@x.com' })); return (await V(req(t.join('.')))) === null; })());
check('未配置 AUD → fail closed', (await V(req(await jwt(good)), { ...env, ACCESS_AUD: '' })) === null);
check('邮箱白名单', (await V(req(await jwt(good)), { ...env, ALLOWED_EMAILS: 'kid@x.com' })) === null
  && !!(await V(req(await jwt(good)), { ...env, ALLOWED_EMAILS: 'kid@x.com, parent@example.com' })));
check('多个 AUD(逗号分隔)', !!(await V(req(await jwt(good)), { ...env, ACCESS_AUD: 'other, ' + AUD })));
check('开发旁路只认 localhost', !!(await V(req('', { url: 'http://localhost:8787/api/me' }), { DEV_AUTH_BYPASS: '1' }))
  && (await V(req(''), { DEV_AUTH_BYPASS: '1' })) === null);
_clearCertCache();

// ── /api 路由 ──
function memStore(t0 = now) {
  const m = new Map();
  let t = t0;
  const core = new FamilyCore({ get: k => m.get(k) ?? null, put: (k, v) => m.set(k, v) }, () => t);
  core.advance = ms => { t += ms; };
  return core;
}
const upstreamLog = [];
const deepseek = async (url, init) => {
  upstreamLog.push({ url, init });
  return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { total_tokens: 12 } }), { headers: { 'content-type': 'application/json' } });
};
const allow = async () => ({ email: 'p@x.com' }), deny = async () => null;
const store = memStore();
const call = (r, deps = {}) => handleApi(r, env, { verify: allow, store, fetch: deepseek, ...deps });
const aiReq = (body, ct = 'application/json') => new Request('https://wp.kailorik.com/api/ai', { method: 'POST', headers: { 'content-type': ct }, body: JSON.stringify(body) });
const msgs = [{ role: 'system', content: '只输出 JSON' }, { role: 'user', content: '1+1' }];

check('未登录 401', (await handleApi(req(''), env, { verify: deny, store })).status === 401);
const me = await (await call(req(''))).json();
check('/api/me', me.email === 'p@x.com' && me.ai === true && me.sync === true && me.quota.limit === 3);
check('没配 Key 时 ai=false', (await (await handleApi(req(''), { ...env, DEEPSEEK_API_KEY: '' }, { verify: allow, store })).json()).ai === false);

let r = await call(aiReq({ messages: msgs, temperature: 9, max_tokens: 99999, json: true }));
const body = await r.json();
const sent = JSON.parse(upstreamLog[0].init.body);
check('AI 代理返回内容', r.status === 200 && body.content === '{"ok":true}' && body.quota.used === 1);
check('Key 只在服务端请求头里', upstreamLog[0].init.headers.Authorization === 'Bearer sk-test' && !JSON.stringify(body).includes('sk-test'));
check('参数被夹住 + JSON 模式 + 固定模型', sent.temperature === 1.3 && sent.max_tokens === LIMITS.maxTokens && sent.response_format.type === 'json_object' && sent.model === 'deepseek-chat');
check('拒绝非 JSON 请求(防跨站)', (await call(aiReq({ messages: msgs }, 'text/plain'))).status === 415);
check('拒绝非法角色', (await call(aiReq({ messages: [{ role: 'tool', content: 'x' }] }))).status === 400);
check('拒绝超长内容', (await call(aiReq({ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.chars + 1) }] }))).status === 400);
check('拒绝 GET', (await call(req('', { url: 'https://wp.kailorik.com/api/ai' }))).status === 405);
await call(aiReq({ messages: msgs }));
await call(aiReq({ messages: msgs }));
r = await call(aiReq({ messages: msgs }));
check('每日额度用完 429', r.status === 429 && upstreamLog.length === 3);
store.advance(24 * 3600 * 1000);
check('第二天额度重置', (await call(aiReq({ messages: msgs }))).status === 200);
check('北京时间换日', dayKey(Date.UTC(2026, 0, 1, 15, 59)) === '2026-01-01' && dayKey(Date.UTC(2026, 0, 1, 16, 1)) === '2026-01-02');
const failUp = async () => new Response('boom', { status: 500 });
check('上游出错 502', (await call(aiReq({ messages: msgs }), { fetch: failUp })).status === 502);
check('没配 Key 503', (await handleApi(aiReq({ messages: msgs }), { ...env, DEEPSEEK_API_KEY: '' }, { verify: allow, store })).status === 503);

// ── 服务端合并同步:两台设备交替推送,谁也不覆盖谁 ──
const put = (students) => call(new Request('https://wp.kailorik.com/api/sync', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ students }) }));
const prof = (attempts, errorBook = {}) => ({ attempts, errorBook, mastery: {}, lastDrillSeed: {}, sheets: [], quizLog: [] });
let s1 = await (await put({ KAI: prof([{ ts: 1, qid: 'a', tag: 't', correct: true }]) })).json();
check('设备 A 首推', s1.students.KAI.attempts.length === 1);
let s2 = await (await put({ KAI: prof([{ ts: 2, qid: 'b', tag: 't', correct: false }], { b: { qid: 'b', tag: 't', wrongCount: 1, firstTs: 2, lastTs: 2 } }) })).json();
check('设备 B(没拉过 A 的数据)推送后是并集', s2.students.KAI.attempts.length === 2 && s2.students.KAI.errorBook.b);
let s3 = await (await put({ KAI: prof([{ ts: 1, qid: 'a', tag: 't', correct: true }]), Lorik: prof([{ ts: 5, qid: 'c', tag: 'u', correct: true }]) })).json();
check('设备 A 再推:不丢 B 的数据,新增学生', s3.students.KAI.attempts.length === 2 && s3.students.Lorik.attempts.length === 1);
const got = await (await call(new Request('https://wp.kailorik.com/api/sync'))).json();
check('GET 返回云端全集', got.students.KAI.errorBook.b && got.savedAt > 0);
check('坏状态 400', (await call(new Request('https://wp.kailorik.com/api/sync', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"students":[1]}' }))).status === 400);
check('学生数上限', (await put(Object.fromEntries([...Array(7)].map((_, i) => ['s' + i, prof([])])))).status === 400);
// 评审补充:伪装成简单请求 / 跨站 / 存储出错 / 大文档分片
check('text/plain;application/json 不算 JSON', (await call(aiReq({ messages: msgs }, 'text/plain;application/json'))).status === 415);
const xsite = new Request('https://wp.kailorik.com/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ messages: msgs }) });
check('跨站请求 415', (await call(xsite)).status === 415);
const badOrigin = new Request('https://wp.kailorik.com/api/ai', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', origin: 'https://evil.example' }, body: JSON.stringify({ messages: msgs }) });
check('Origin 不同源 415', (await call(badOrigin)).status === 415);
const okOrigin = new Request('https://wp.kailorik.com/api/ai', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', origin: 'https://wp.kailorik.com', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ messages: msgs }) });
check('同源 + charset 参数通过', (await call(okOrigin)).status === 200);
const brokenStore = { ...store, quota: l => store.quota(l), syncState: () => { throw new Error('SQLITE_TOOBIG'); } };
check('存储出错返回 500 而不是 400', (await handleApi(new Request('https://wp.kailorik.com/api/sync', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ students: { KAI: prof([]) } }) }), env, { verify: allow, store: brokenStore })).status === 500);
check('学生名不合法 400', (await put({ '<img>': prof([]) })).status === 400);
{
  const m = new Map(); let maxVal = 0;
  const big = new FamilyCore({ get: k => m.get(k) ?? null, put: (k, v) => { maxVal = Math.max(maxVal, v.length); m.set(k, v); } });
  const many = [...Array(1800)].map((_, i) => ({ ts: i + 1, qid: 'g_sum_diff_1_' + i, tag: 'sum_diff', correct: i % 3 > 0, mode: 'drill', level: 1, ans: i }));
  const aiQ = Object.fromEntries([...Array(200)].map((_, i) => ['ai_' + i, { id: 'ai_' + i, ts: i, zh: '中文题干'.repeat(150), steps: [{ label: '一步', text: '很长的讲解'.repeat(30) }] }]));
  const out = JSON.parse(big.syncState(JSON.stringify({ students: { KAI: { ...prof(many), aiQ } } })));
  check('大文档分片存储,单片不超上限', Number(m.get('s:KAI:n')) >= 2 && maxVal <= 300000);
  check('分片读回完整', out.students.KAI.attempts.length === 1800 && Object.keys(out.students.KAI.aiQ).length === 200);
}
check('未知路径 404', (await call(req('', { url: 'https://wp.kailorik.com/api/zzz' }))).status === 404);
done();
