// 本地状态:双学生档案、练习记录、错题本(莱特纳盒间隔复习)、模型掌握度
// 数据只存 localStorage,可导出/导入 JSON 备份。

import { SHEET_CAP, QUIZ_CAP, AIQ_CAP, CHAIN_CAP, mergeInto } from './merge.js';

export const KEY = 'wpc_state_v1';
const DAY = 24 * 60 * 60 * 1000;
// node 测试环境没有可用的 localStorage(新版 node 有个残缺的全局对象),用内存兜底
const LS = (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') ? localStorage
  : { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
// 莱特纳盒:第 n 盒答对后间隔天数;走完全部盒子 = 彻底掌握
export const BOX_DAYS = [1, 3, 7, 14];

function emptyProfile() {
  return {
    attempts: [],      // { ts, qid, tag, correct, mode, level }
    errorBook: {},     // qid -> { qid, tag, level, wrongCount, firstTs, lastTs, due, box, mastered, streak }
    mastery: {},       // tag -> { seen, correct, streak }
    lastDrillSeed: {}, // tag -> 已用过的最大 seed,保证刷题不重复
    sheets: [],        // 打印过的卷子档案 { id, code, ts, title, items:[{num,qid,tag,level,variantOf}], grades, gradedAt }
    quizLog: [],       // 辨题快闪记录 { ts, tag, pick, correct }
    aiQ: {},           // v2.0 AI 变式题 id -> question(可复现、可打印、可同步)
    aiNotes: { tricks: {} }, // v2.0 AI 学情报告 report:{ts,data} / 套路卡 tricks[tag]:{ts,data}
    removed: {},       // v2.0 删除墓碑 qid -> ts(让删除跨设备传播)
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

// opts.fromSync:同步合并后的落盘,不再触发推送(避免同步→保存→再同步的回环)
export function save(opts = {}) {
  // 练习日志封顶,防止 localStorage 膨胀
  const p = profile();
  if (p.attempts.length > 2000) p.attempts = p.attempts.slice(-1500);
  LS.setItem(KEY, JSON.stringify(state));
  // 通知云同步(若已连接则防抖推送)
  try { window.dispatchEvent(new CustomEvent('wpc:saved', { detail: { fromSync: !!opts.fromSync } })); } catch (e) { /* node 测试环境无 window */ }
}

// 同一设备多个标签页:别的标签页写了 localStorage,把它并进本页内存(不回写,下次保存自然带上)
export function absorbExternal(text) {
  try {
    const other = JSON.parse(text);
    if (other && other.students) mergeInto(state, other);
    return true;
  } catch (e) { return false; }
}

export function profile() { return profileOf(state.student); }

// 指定学生的档案(异步 AI 结果回来时用发起时的学生,中途切学生也不会记错人)
export function profileOf(name) {
  if (!state.students[name]) state.students[name] = emptyProfile();
  const p = state.students[name];
  if (!p.sheets) p.sheets = [];   // v1.4 之前的老数据没有这个字段
  if (!p.quizLog) p.quizLog = []; // v1.5 之前的老数据没有这个字段
  if (!p.aiQ) p.aiQ = {};         // v2.0
  if (!p.aiNotes) p.aiNotes = { tricks: {} };
  if (!p.aiNotes.tricks) p.aiNotes.tricks = {};
  if (!p.removed) p.removed = {};
  return p;
}

export function setStudent(name) { state.student = name; save(); }
export function setLang(lang) { state.lang = lang; save(); }

// ── 练习记录 ──────────────────────────────────────────
// apply* 只改内存不落盘,供批量操作(纸卷批改)复用后统一 save 一次
let lastTs = 0; // 同一毫秒内连续记录也保证 ts 唯一(合并按 ts+qid 去重)
function uniqTs() { const t = Math.max(Date.now(), lastTs + 1); lastTs = t; return t; }

function applyAttempt(p, { qid, tag, correct, mode, level = 1, ans }) {
  const rec = { ts: uniqTs(), qid, tag, correct, mode, level };
  if (ans !== undefined && ans !== null && ans !== '') rec.ans = ans; // v2.0 孩子的作答,诊断用
  p.attempts.push(rec);
  const m = p.mastery[tag] || (p.mastery[tag] = { seen: 0, correct: 0, streak: 0 });
  m.seen++;
  if (correct) { m.correct++; m.streak++; } else { m.streak = 0; }
}

export function recordAttempt(rec) {
  applyAttempt(profile(), rec);
  save();
}

// ── 错题本 ────────────────────────────────────────────
function applyError(p, qid, tag, level = 1) {
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
}

export function addError(qid, tag, level = 1) {
  applyError(profile(), qid, tag, level);
  save();
}

// 复习结果:做同类变式题,对 → 升盒,错 → 回到第 0 盒
function applyReview(p, qid, correct) {
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
}

export function reviewResult(qid, correct) {
  applyReview(profile(), qid, correct);
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

export function removeError(qid) {
  const p = profile();
  delete p.errorBook[qid];
  p.removed[qid] = Date.now(); // 墓碑:同步时让其他设备也删掉
  save();
}

// ── v2.0 错因诊断 / 变式闯关链 ─────────────────────────
// diag = { type, note, source:'rule'|'ai', ts }
export function setDiag(qid, diag, student = state.student) {
  const e = profileOf(student).errorBook[qid];
  if (!e) return;
  e.diag = { ...diag, ts: Date.now() };
  save();
}

// 闯关链:原题之后每一道变式的结果。当场闯关不改间隔节奏(当场做对 ≠ 记住了)
export function pushChain(rootQid, { qid, correct, by }) {
  const e = profile().errorBook[rootQid];
  if (!e) return;
  e.chain = [...(e.chain || []), { qid, correct, by, ts: uniqTs() }].slice(-CHAIN_CAP);
  if (!correct) e.wrongCount++;
  e.lastTs = Date.now();
  save();
}

// 当前这一轮闯关(最近一次做对之后)连错了几次
export function chainFails(e) {
  let n = 0;
  for (const c of [...(e?.chain || [])].reverse()) { if (c.correct) break; n++; }
  return n;
}

// ── v2.0 AI 变式题存档 / AI 笔记 ───────────────────────
export function saveAIQuestion(q, student = state.student) {
  const p = profileOf(student);
  p.aiQ[q.id] = q;
  const list = Object.values(p.aiQ);
  if (list.length > AIQ_CAP) {
    p.aiQ = Object.fromEntries(list.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, AIQ_CAP).map(x => [x.id, x]));
  }
  save();
}

export function getAIQuestion(id) {
  for (const s of Object.values(state.students)) if (s.aiQ && s.aiQ[id]) return s.aiQ[id];
  return null;
}

export function setAiNote(kind, data, tag = null, student = state.student) {
  const n = profileOf(student).aiNotes;
  if (kind === 'trick') n.tricks[tag] = { ts: Date.now(), data };
  else n.report = { ts: Date.now(), data };
  save();
}

export function getAiNote(kind, tag = null) {
  const n = profile().aiNotes;
  return kind === 'trick' ? n.tricks[tag] || null : n.report || null;
}

// 最近一次作答(诊断用)
export function lastAttemptOf(qid) {
  const a = profile().attempts;
  for (let i = a.length - 1; i >= 0; i--) if (a[i].qid === qid) return a[i];
  return null;
}

// ── 卷子档案:打印落库 → 批改中心逐题回录 ───────────────
export { SHEET_CAP, QUIZ_CAP }; // 只留最近 60 张卷 / 1000 条辨题记录(合并同用此值,定义在 merge.js)
let sheetSeq = 0; // 同一毫秒内连续存卷也不撞 id

// 卷号印在纸上,家长凭它在批改中心找到这张卷;字符表避开易混的 I/L/O/0/1
function sheetCode(ts, id) {
  const d = new Date(ts);
  const mmdd = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let code = '';
  for (let i = 0; i < 3; i++) { code += A[h % A.length]; h = Math.floor(h / A.length); }
  return `${mmdd}-${code}`;
}

export function saveSheet({ title, items }) {
  const p = profile();
  // 同一份内容重复打印(比如再点一次打印按钮)不重复建档,直接复用未批改的旧卷
  const key = items.map(it => it.qid).join(',');
  const dup = p.sheets.find(s => !s.gradedAt && s.items.map(it => it.qid).join(',') === key);
  if (dup) return dup;
  const ts = Date.now();
  const id = 's_' + ts.toString(36) + '_' + (sheetSeq++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const sheet = { id, code: sheetCode(ts, id), ts, title, items, grades: null, gradedAt: null };
  p.sheets.push(sheet);
  if (p.sheets.length > SHEET_CAP) p.sheets = p.sheets.slice(-SHEET_CAP);
  save();
  return sheet;
}

export function allSheets() { return profile().sheets.slice().sort((a, b) => b.ts - a.ts); }
export function getSheet(id) { return profile().sheets.find(s => s.id === id); }
export function removeSheet(id) {
  const p = profile();
  p.sheets = p.sheets.filter(s => s.id !== id);
  save();
}
export function ungradedSheetCount() { return profile().sheets.filter(s => !s.gradedAt).length; }

// 批改回录:marks = { 题号 -> true/false },只含本次新标记的题。
// 已录过的题号跳过(防止重复计入 attempts);对错写入与屏上判分同一套规则:
// 错 → 入错题本/重置到第 0 盒;对且该题在错题本闯关中 → 正常升盒。
export function gradeSheet(id, marks) {
  const s = getSheet(id);
  if (!s) return null;
  if (!s.grades) s.grades = {};
  const p = profile();
  let applied = 0;
  for (const it of s.items) {
    const mark = marks[it.num];
    if (typeof mark !== 'boolean') continue;
    if (typeof s.grades[it.num] === 'boolean') continue;
    s.grades[it.num] = mark;
    applied++;
    applyAttempt(p, { qid: it.qid, tag: it.tag, correct: mark, mode: 'paper', level: it.level || 1 });
    const e = p.errorBook[it.qid];
    if (e && !e.mastered) applyReview(p, it.qid, mark);
    else if (!mark) applyError(p, it.qid, it.tag, it.level || 1);
  }
  // 没录新东西就不盖时间戳:gradedAt 同时是同步合并的裁决键,乱盖会让空提交赢过真批改
  if (applied) s.gradedAt = Date.now();
  save();
  return s;
}

// ── 辨题快闪:只认题型不解题,单独记账(不进错题本)────

export function recordQuiz({ tag, pick, correct }) {
  const p = profile();
  p.quizLog.push({ ts: uniqTs(), tag, pick, correct });
  if (p.quizLog.length > QUIZ_CAP) p.quizLog = p.quizLog.slice(-QUIZ_CAP);
  save();
}

// tag -> { seen, correct }
export function quizStats() {
  const m = {};
  for (const a of profile().quizLog) {
    const t = m[a.tag] || (m[a.tag] = { seen: 0, correct: 0 });
    t.seen++;
    if (a.correct) t.correct++;
  }
  return m;
}

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
