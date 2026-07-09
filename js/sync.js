// GitHub Gist 跨设备云同步(沿用旧项目方案:用户自己的 PAT + 私有 Gist,零后端)
// 数据流:打开/回到页面 → pull 并合并;每次本地保存 → 3 秒防抖 push。
// 合并规则:attempts 按 (ts,qid) 去重合并,errorBook 按 lastTs 新者胜,
//           lastDrillSeed 取最大,mastery 由合并后的 attempts 重放重算。
import { state, save, SHEET_CAP, QUIZ_CAP } from './store.js';

const TOKEN_KEY = 'wpc_gist_token';
const GIST_ID_KEY = 'wpc_gist_id';
const GIST_DESC = 'word-problem-coach-sync-v1';
const FILE = 'wpc_state.json';
const API = 'https://api.github.com';

export const sync = {
  status: 'local',   // local | syncing | ok | error
  error: '',
  lastSyncAt: null,
  onChange: null,    // UI 回调
};

function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function isConnected() { return !!token(); }

function setStatus(s, err = '') {
  sync.status = s; sync.error = err;
  if (s === 'ok') sync.lastSyncAt = Date.now();
  sync.onChange && sync.onChange();
}

async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}${res.status === 401 ? '(token 无效或过期)' : ''}`);
  return res.json();
}

// ── 连接:验证 token,找到或创建同步 Gist ─────────────
export async function connect(newToken) {
  localStorage.setItem(TOKEN_KEY, newToken.trim());
  setStatus('syncing');
  try {
    const gists = await gh('/gists?per_page=100');
    let g = gists.find(x => x.description === GIST_DESC);
    if (!g) {
      g = await gh('/gists', {
        method: 'POST',
        body: JSON.stringify({
          description: GIST_DESC,
          public: false,
          files: { [FILE]: { content: JSON.stringify(state) } },
        }),
      });
    }
    localStorage.setItem(GIST_ID_KEY, g.id);
    await pull();
    schedulePush();
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
  setStatus('local');
}

// ── 拉取 + 合并 ──────────────────────────────────────
export async function pull() {
  if (!isConnected()) return;
  const id = localStorage.getItem(GIST_ID_KEY);
  if (!id) return;
  setStatus('syncing');
  try {
    const g = await gh('/gists/' + id);
    const f = g.files && g.files[FILE];
    if (f) {
      let content = f.content;
      if (f.truncated) content = await fetch(f.raw_url).then(r => r.text());
      const remote = JSON.parse(content);
      mergeInto(state, remote);
      save();
    }
    setStatus('ok');
  } catch (e) {
    setStatus('error', e.message);
  }
}

// ── 推送(防抖)──────────────────────────────────────
let pushTimer = null;
export function schedulePush() {
  if (!isConnected()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 3000);
}

export async function pushNow() {
  if (!isConnected()) return;
  const id = localStorage.getItem(GIST_ID_KEY);
  if (!id) return;
  setStatus('syncing');
  try {
    await gh('/gists/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(state) } } }),
    });
    setStatus('ok');
  } catch (e) {
    setStatus('error', e.message);
  }
}

export async function syncNow() { await pull(); await pushNow(); }

// ── 合并逻辑 ─────────────────────────────────────────
export { mergeInto as _mergeInto }; // 供 node 测试
function mergeInto(local, remote) {
  if (!remote || !remote.students) return;
  const names = new Set([...Object.keys(local.students), ...Object.keys(remote.students)]);
  for (const name of names) {
    const L = local.students[name];
    const R = remote.students[name];
    if (!R) continue;
    if (!L) { local.students[name] = R; continue; }

    // attempts:按 ts+qid 去重合并
    const seen = new Set();
    const merged = [];
    for (const a of [...L.attempts, ...R.attempts]) {
      const k = a.ts + '_' + a.qid;
      if (seen.has(k)) continue;
      seen.add(k); merged.push(a);
    }
    merged.sort((a, b) => a.ts - b.ts);
    L.attempts = merged.slice(-2000);

    // errorBook:每题 lastTs 新者胜,错误次数取大
    for (const [qid, re] of Object.entries(R.errorBook || {})) {
      const le = L.errorBook[qid];
      if (!le) { L.errorBook[qid] = re; continue; }
      const newer = re.lastTs > le.lastTs ? re : le;
      const wrongCount = Math.max(le.wrongCount, re.wrongCount);
      L.errorBook[qid] = { ...newer, wrongCount, firstTs: Math.min(le.firstTs, re.firstTs) };
    }

    // 刷题种子:取最大,避免两台设备出重复题
    for (const [tag, s] of Object.entries(R.lastDrillSeed || {})) {
      L.lastDrillSeed[tag] = Math.max(L.lastDrillSeed[tag] || 0, s);
    }

    // 卷子档案:按 id 并集去重;同一张卷两侧都批过一部分时,逐题并集
    // (已录的题号是"锁",两侧的锁都要保住;同一题号冲突时取 gradedAt 新的一侧)
    const sheetMap = new Map();
    for (const sh of [...(L.sheets || []), ...(R.sheets || [])]) {
      const prev = sheetMap.get(sh.id);
      if (!prev) { sheetMap.set(sh.id, sh); continue; }
      const [older, newer] = (sh.gradedAt || 0) > (prev.gradedAt || 0) ? [prev, sh] : [sh, prev];
      const grades = (older.grades || newer.grades) ? { ...older.grades, ...newer.grades } : null;
      sheetMap.set(sh.id, { ...newer, grades, gradedAt: Math.max(older.gradedAt || 0, newer.gradedAt || 0) || null });
    }
    L.sheets = [...sheetMap.values()].sort((a, b) => a.ts - b.ts).slice(-SHEET_CAP);

    // 辨题记录:按 ts+tag 去重合并(与 attempts 同思路)
    const qseen = new Set();
    const qmerged = [];
    for (const a of [...(L.quizLog || []), ...(R.quizLog || [])]) {
      const k = a.ts + '_' + a.tag;
      if (qseen.has(k)) continue;
      qseen.add(k);
      qmerged.push(a);
    }
    qmerged.sort((a, b) => a.ts - b.ts);
    L.quizLog = qmerged.slice(-QUIZ_CAP);

    // mastery:用合并后的 attempts 重放,保证跨设备一致
    L.mastery = replayMastery(L.attempts);
  }
}

function replayMastery(attempts) {
  const m = {};
  for (const a of attempts) {
    const t = m[a.tag] || (m[a.tag] = { seen: 0, correct: 0, streak: 0 });
    t.seen++;
    if (a.correct) { t.correct++; t.streak++; } else { t.streak = 0; }
  }
  return m;
}

// ── 挂接自动同步 ─────────────────────────────────────
export function initSync() {
  window.addEventListener('wpc:saved', schedulePush);
  window.addEventListener('focus', () => pull());
  window.addEventListener('online', () => pull());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  if (isConnected()) pull();
}
