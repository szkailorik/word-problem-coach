// 多设备同步(v2.0):两种后端,自动选择
//   cloud —— 站点部署在 Cloudflare(Access 登录门后),PUT /api/sync 把整份本地状态交给服务端,
//            服务端(Durable Object,单线程串行)与云端文档合并后写回并返回结果,再并入本地。
//            登录 Access 即自动同步,不用贴任何令牌;合并在服务端串行完成,没有"读-改-写"竞态。
//   gist  —— 后备(GitHub Pages 镜像等没有 /api 的地方):用户自己的 PAT + 私有 Gist,先拉再推。
// 合并规则见 merge.js(并集、幂等、可交换,前后端同一份代码)。
import { state, save, KEY, absorbExternal } from './store.js';
import { mergeInto } from './merge.js';

const TOKEN_KEY = 'wpc_gist_token';
const GIST_ID_KEY = 'wpc_gist_id';
const GIST_DESC = 'word-problem-coach-sync-v1';
const FILE = 'wpc_state.json';
const API = 'https://api.github.com';

export const sync = {
  backend: 'none',   // none | cloud | gist
  status: 'local',   // local | syncing | ok | error
  error: '',
  lastSyncAt: null,
  user: '',          // cloud 模式下的登录邮箱
  onChange: null,    // UI 回调
};

function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function isConnected() { return sync.backend !== 'none'; }
export function gistConnected() { return !!token(); }

function setStatus(s, err = '') {
  sync.status = s; sync.error = err;
  if (s === 'ok') sync.lastSyncAt = Date.now();
  sync.onChange && sync.onChange();
}

// 合并远端结果进本地;只有真的有变化才落盘(且不触发再次推送)
function absorb(remote) {
  const before = JSON.stringify(state.students);
  mergeInto(state, remote);
  if (JSON.stringify(state.students) !== before) save({ fromSync: true });
}

// ── cloud 后端 ───────────────────────────────────────
// /api/me 由 meProbe 统一探测(ai.js 也用),这里只关心能否同步
let meCache = null;
export async function meProbe(force = false) {
  if (meCache && !force) return meCache;
  meCache = (async () => {
    try {
      const r = await fetch('api/me', { cache: 'no-store', credentials: 'same-origin' });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !ct.includes('json')) return { ok: false, status: r.status };
      return { ok: true, ...(await r.json()) };
    } catch (e) {
      return { ok: false, status: 0 };
    }
  })();
  return meCache;
}

async function cloudSync() {
  const r = await fetch('api/sync', {
    method: 'PUT',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ students: state.students }),
  });
  if (!r.ok) throw new Error(`云同步失败(HTTP ${r.status}${r.status === 401 || r.status === 403 ? ',登录已过期,请刷新页面重新登录' : ''})`);
  const merged = await r.json();
  absorb(merged);
}

// ── gist 后端 ────────────────────────────────────────
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    cache: 'no-store', // GET gist 响应带 max-age=60,不加会在一分钟内拿到旧数据
    headers: {
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}${res.status === 401 ? '(token 无效或过期)' : ''}`);
  return res.json();
}

async function gistPull() {
  const id = localStorage.getItem(GIST_ID_KEY);
  if (!id) return;
  const g = await gh('/gists/' + id);
  const f = g.files && g.files[FILE];
  if (!f) return;
  let content = f.content;
  if (f.truncated) content = await fetch(f.raw_url, { cache: 'no-store' }).then(r => r.text());
  absorb(JSON.parse(content));
}

async function gistPush() {
  const id = localStorage.getItem(GIST_ID_KEY);
  if (!id) return;
  await gh('/gists/' + id, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(state) } } }),
  });
}

// 连接 Gist:验证 token,找到或创建同步 Gist
export async function connect(newToken) {
  localStorage.setItem(TOKEN_KEY, newToken.trim());
  setStatus('syncing');
  try {
    const gists = await gh('/gists?per_page=100');
    let g = gists.find(x => x.description === GIST_DESC);
    if (!g) {
      g = await gh('/gists', {
        method: 'POST',
        body: JSON.stringify({ description: GIST_DESC, public: false, files: { [FILE]: { content: JSON.stringify(state) } } }),
      });
    }
    localStorage.setItem(GIST_ID_KEY, g.id);
    if (sync.backend !== 'cloud') sync.backend = 'gist';
    await syncNow();
    return true;
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    setStatus('error', e.message);
    throw e;
  }
}

export function disconnect() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(GIST_ID_KEY);
  if (sync.backend === 'gist') sync.backend = 'none';
  setStatus('local');
}

// ── 统一入口:一次完整同步 = 拉取合并 + 推送 ─────────────
let running = null;
let again = false;
export async function syncNow() {
  if (!isConnected()) return;
  if (running) { again = true; return running; } // 同步进行中又有新改动:跑完再补一轮
  running = (async () => {
    setStatus('syncing');
    try {
      if (sync.backend === 'cloud') await cloudSync();
      else { await gistPull(); await gistPush(); } // 先拉再推:推上去的永远是合并后的全集
      setStatus('ok');
    } catch (e) {
      setStatus('error', e.message);
    }
  })();
  await running;
  running = null;
  if (again) { again = false; return syncNow(); }
}

let pushTimer = null;
export function schedulePush() {
  if (!isConnected()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 2500);
}

// ── 挂接自动同步 ─────────────────────────────────────
export async function initSync() {
  window.addEventListener('wpc:saved', e => { if (!e.detail || !e.detail.fromSync) schedulePush(); });
  window.addEventListener('focus', () => syncNow());
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  // 同一设备多个标签页互相合并
  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue && absorbExternal(e.newValue)) sync.onChange && sync.onChange('external');
  });

  const me = await meProbe();
  if (me.ok && me.sync) {
    sync.backend = 'cloud';
    sync.user = me.email || '';
  } else if (token()) {
    sync.backend = 'gist';
  }
  sync.onChange && sync.onChange();
  if (isConnected()) syncNow();
}

export { mergeInto as _mergeInto }; // 兼容旧测试
