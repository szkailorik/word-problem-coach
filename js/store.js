// 本地状态:双学生档案、练习记录、错题本(莱特纳盒间隔复习)、模型掌握度
// 数据只存 localStorage,可导出/导入 JSON 备份。

const KEY = 'wpc_state_v1';
const DAY = 24 * 60 * 60 * 1000;
// node 测试环境没有 localStorage,用内存兜底
const LS = typeof localStorage !== 'undefined' ? localStorage
  : { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
// 莱特纳盒:第 n 盒答对后间隔天数;走完全部盒子 = 彻底掌握
export const BOX_DAYS = [1, 3, 7, 14];

function emptyProfile() {
  return {
    attempts: [],      // { ts, qid, tag, correct, mode, level }
    errorBook: {},     // qid -> { qid, tag, level, wrongCount, firstTs, lastTs, due, box, mastered, streak }
    mastery: {},       // tag -> { seen, correct, streak }
    lastDrillSeed: {}, // tag -> 已用过的最大 seed,保证刷题不重复
  };
}

function load() {
  try {
    const s = JSON.parse(LS.getItem(KEY));
    if (s && s.students) return s;
  } catch (e) { /* fresh start */ }
  return {
    version: 1,
    student: 'KAI',
    lang: 'both', // both | zh | en
    students: { KAI: emptyProfile(), Lorik: emptyProfile() },
  };
}

export const state = load();

export function save() {
  // 练习日志封顶,防止 localStorage 膨胀
  const p = profile();
  if (p.attempts.length > 2000) p.attempts = p.attempts.slice(-1500);
  LS.setItem(KEY, JSON.stringify(state));
  // 通知云同步(若已连接则防抖推送)
  try { window.dispatchEvent(new Event('wpc:saved')); } catch (e) { /* node 测试环境无 window */ }
}

export function profile() {
  if (!state.students[state.student]) state.students[state.student] = emptyProfile();
  return state.students[state.student];
}

export function setStudent(name) { state.student = name; save(); }
export function setLang(lang) { state.lang = lang; save(); }

// ── 练习记录 ──────────────────────────────────────────
export function recordAttempt({ qid, tag, correct, mode, level = 1 }) {
  const p = profile();
  p.attempts.push({ ts: Date.now(), qid, tag, correct, mode, level });
  const m = p.mastery[tag] || (p.mastery[tag] = { seen: 0, correct: 0, streak: 0 });
  m.seen++;
  if (correct) { m.correct++; m.streak++; } else { m.streak = 0; }
  save();
}

// ── 错题本 ────────────────────────────────────────────
export function addError(qid, tag, level = 1) {
  const p = profile();
  const now = Date.now();
  const e = p.errorBook[qid];
  if (e) {
    e.wrongCount++; e.lastTs = now;
    e.box = 0; e.due = now + BOX_DAYS[0] * DAY;
    e.mastered = false; e.streak = 0;
  } else {
    p.errorBook[qid] = {
      qid, tag, level, wrongCount: 1, firstTs: now, lastTs: now,
      box: 0, due: now + BOX_DAYS[0] * DAY, mastered: false, streak: 0,
    };
  }
  save();
}

// 复习结果:做同类变式题,对 → 升盒,错 → 回到第 0 盒
export function reviewResult(qid, correct) {
  const p = profile();
  const e = p.errorBook[qid];
  if (!e) return;
  const now = Date.now();
  e.lastTs = now;
  if (correct) {
    e.streak++;
    e.box++;
    if (e.box >= BOX_DAYS.length) { e.mastered = true; e.due = null; }
    else e.due = now + BOX_DAYS[e.box] * DAY;
  } else {
    e.streak = 0; e.box = 0; e.wrongCount++;
    e.due = now + BOX_DAYS[0] * DAY;
  }
  save();
}

export function dueErrors() {
  const now = Date.now();
  return Object.values(profile().errorBook)
    .filter(e => !e.mastered && e.due && e.due <= now)
    .sort((a, b) => a.due - b.due);
}

export function allErrors() {
  return Object.values(profile().errorBook).sort((a, b) => b.lastTs - a.lastTs);
}

export function removeError(qid) { delete profile().errorBook[qid]; save(); }

// ── 刷题种子:每个 tag 单调递增,保证新题不重复 ──────────
export function nextSeed(tag) {
  const p = profile();
  const s = (p.lastDrillSeed[tag] || 0) + 1;
  p.lastDrillSeed[tag] = s;
  save();
  return s;
}

// ── 统计 ─────────────────────────────────────────────
export function tagStats(tag) {
  return profile().mastery[tag] || { seen: 0, correct: 0, streak: 0 };
}

export function totals() {
  const p = profile();
  const today = new Date().toDateString();
  const todayCount = p.attempts.filter(a => new Date(a.ts).toDateString() === today).length;
  const errCount = Object.values(p.errorBook).filter(e => !e.mastered).length;
  const masteredCount = Object.values(p.errorBook).filter(e => e.mastered).length;
  return {
    total: p.attempts.length,
    correct: p.attempts.filter(a => a.correct).length,
    today: todayCount,
    activeErrors: errCount,
    mastered: masteredCount,
    due: dueErrors().length,
  };
}

// 最薄弱的模型(做过且正确率低,或从没做过)
export function weakestTags(allTags, n = 3) {
  const scored = allTags.map(tag => {
    const m = tagStats(tag);
    const acc = m.seen ? m.correct / m.seen : 0.5; // 没做过的排中间
    return { tag, score: acc + m.seen * 0.001 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, n).map(x => x.tag);
}

// ── 备份 ─────────────────────────────────────────────
export function exportJSON() { return JSON.stringify(state, null, 1); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s.students) throw new Error('格式不对');
  Object.assign(state, s);
  save();
}
