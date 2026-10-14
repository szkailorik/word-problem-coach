// 多设备状态合并(纯函数,前端同步 + 服务端 /api/sync 共用同一份代码)
// 设计要求:并集式、幂等、可交换——任意顺序、任意次数合并都收敛到同一结果。
//   attempts / quizLog  按 (ts, qid|tag) 去重
//   errorBook           每题 lastTs 新者胜,错误次数取大,闯关链并集;墓碑晚于 lastTs 的剔除
//   lastDrillSeed       取最大
//   sheets              按 id 并集;同卷两侧各批一部分时逐题并集,冲突取 gradedAt 新者
//   aiQ                 AI 变式题按 id 并集(题目一经生成不再改)
//   aiNotes             每个键 ts 新者胜
//   mastery             由合并后的 attempts 重放

export const ATTEMPT_CAP = 2000;
export const SHEET_CAP = 60;
export const QUIZ_CAP = 1000;
export const AIQ_CAP = 200;
export const TOMB_CAP = 500;
export const CHAIN_CAP = 12;

function dedupe(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const a of list) {
    const k = keyFn(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

export function mergeChain(a = [], b = []) {
  return dedupe([...a, ...b], c => c.ts + '_' + c.qid).sort((x, y) => x.ts - y.ts).slice(-CHAIN_CAP);
}

function mergeErrorEntry(le, re) {
  // lastTs 相同时按内容定序,保证 merge(a,b) 与 merge(b,a) 选中同一侧(否则两端各留各的、永不收敛)
  const lt = le.lastTs || 0, rt = re.lastTs || 0;
  const newer = rt > lt ? re : rt < lt ? le : (JSON.stringify(re) > JSON.stringify(le) ? re : le);
  const out = {
    ...newer,
    wrongCount: Math.max(le.wrongCount || 0, re.wrongCount || 0),
    firstTs: Math.min(le.firstTs ?? Infinity, re.firstTs ?? Infinity),
  };
  // 诊断取较新的那份;newer 没有就用 older 的
  const ld = le.diag, rd = re.diag;
  const diag = ld && rd ? ((rd.ts || 0) > (ld.ts || 0) ? rd : ld) : (ld || rd);
  if (diag) out.diag = diag; else delete out.diag;
  if (le.chain || re.chain) out.chain = mergeChain(le.chain, re.chain);
  if (!out.chain) delete out.chain;
  return out;
}

function mergeSheets(L = [], R = []) {
  const sheetMap = new Map();
  for (const sh of [...L, ...R]) {
    const prev = sheetMap.get(sh.id);
    if (!prev) { sheetMap.set(sh.id, sh); continue; }
    const [older, newer] = (sh.gradedAt || 0) > (prev.gradedAt || 0) ? [prev, sh] : [sh, prev];
    const grades = (older.grades || newer.grades) ? { ...older.grades, ...newer.grades } : null;
    sheetMap.set(sh.id, { ...newer, grades, gradedAt: Math.max(older.gradedAt || 0, newer.gradedAt || 0) || null });
  }
  return [...sheetMap.values()].sort((a, b) => a.ts - b.ts).slice(-SHEET_CAP);
}

function mergeAiNotes(L = {}, R = {}) {
  const pickNewer = (a, b) => (a && b) ? ((b.ts || 0) > (a.ts || 0) ? b : a) : (a || b);
  const out = {};
  const report = pickNewer(L.report, R.report);
  if (report) out.report = report;
  const tricks = {};
  for (const tag of new Set([...Object.keys(L.tricks || {}), ...Object.keys(R.tricks || {})])) {
    tricks[tag] = pickNewer((L.tricks || {})[tag], (R.tricks || {})[tag]);
  }
  out.tricks = tricks;
  return out;
}

function capTombs(t) {
  const entries = Object.entries(t);
  if (entries.length <= TOMB_CAP) return t;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, TOMB_CAP));
}

function capAiQ(m) {
  const list = Object.values(m);
  if (list.length <= AIQ_CAP) return m;
  return Object.fromEntries(list.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, AIQ_CAP).map(q => [q.id, q]));
}

export function replayMastery(attempts) {
  const m = {};
  for (const a of attempts) {
    const t = m[a.tag] || (m[a.tag] = { seen: 0, correct: 0, streak: 0 });
    t.seen++;
    if (a.correct) { t.correct++; t.streak++; } else { t.streak = 0; }
  }
  return m;
}

// 合并两份学生档案,返回新对象(不改入参)
export function mergeProfile(L, R) {
  if (!R) return L;
  if (!L) return R;
  const out = { ...L };

  out.attempts = dedupe([...(L.attempts || []), ...(R.attempts || [])], a => a.ts + '_' + a.qid)
    .sort((a, b) => a.ts - b.ts).slice(-ATTEMPT_CAP);

  // 墓碑:并集取最晚删除时间
  const removed = { ...(L.removed || {}) };
  for (const [qid, ts] of Object.entries(R.removed || {})) removed[qid] = Math.max(removed[qid] || 0, ts);
  out.removed = capTombs(removed);

  const eb = { ...(L.errorBook || {}) };
  for (const [qid, re] of Object.entries(R.errorBook || {})) {
    eb[qid] = eb[qid] ? mergeErrorEntry(eb[qid], re) : re;
  }
  for (const [qid, ts] of Object.entries(out.removed)) {
    if (eb[qid] && (eb[qid].lastTs || 0) <= ts) delete eb[qid];
  }
  out.errorBook = eb;

  const seeds = { ...(L.lastDrillSeed || {}) };
  for (const [tag, s] of Object.entries(R.lastDrillSeed || {})) seeds[tag] = Math.max(seeds[tag] || 0, s);
  out.lastDrillSeed = seeds;

  out.sheets = mergeSheets(L.sheets, R.sheets);

  out.quizLog = dedupe([...(L.quizLog || []), ...(R.quizLog || [])], a => a.ts + '_' + a.tag)
    .sort((a, b) => a.ts - b.ts).slice(-QUIZ_CAP);

  out.aiQ = capAiQ({ ...(R.aiQ || {}), ...(L.aiQ || {}) });
  out.aiNotes = mergeAiNotes(L.aiNotes, R.aiNotes);

  out.mastery = replayMastery(out.attempts);
  return out;
}

// 把 remote 合并进 local(原地修改 local.students;student/lang 是设备偏好,不同步)
export function mergeInto(local, remote) {
  if (!remote || !remote.students) return local;
  const names = new Set([...Object.keys(local.students || {}), ...Object.keys(remote.students)]);
  local.students = local.students || {};
  for (const name of names) {
    const R = remote.students[name];
    if (!R) continue;
    local.students[name] = mergeProfile(local.students[name], R);
  }
  return local;
}

// 服务端用:两份完整状态合并成新状态(不改入参)
export function mergeStates(a, b) {
  const base = a && a.students ? JSON.parse(JSON.stringify(a)) : { version: 1, students: {} };
  return mergeInto(base, b);
}
