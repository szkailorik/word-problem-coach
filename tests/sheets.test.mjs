// 卷子档案 + 批改回录测试:node tests/sheets.test.mjs
// 覆盖:落库/卷号、批改写入 attempts+错题本、已录锁定不重复计、纸卷复习升盒、60 张封顶、删除。
import { profile, saveSheet, getSheet, allSheets, removeSheet, gradeSheet, ungradedSheetCount, addError } from '../js/store.js';

let fails = 0;
function check(name, cond) {
  if (!cond) { fails++; console.error('FAIL:', name); }
  else console.log('ok:', name);
}

const p = profile();

// ── 1. 落库与卷号 ──────────────────────────────
const sh = saveSheet({
  title: '测试卷',
  items: [
    { num: 1, qid: 'g_work_rate_1_1', tag: 'work_rate', level: 1, variantOf: null },
    { num: 2, qid: 'g_work_rate_1_2', tag: 'work_rate', level: 1, variantOf: 1 },
    { num: 3, qid: 'b3_q1', tag: 'basic', level: 1, variantOf: null },
  ],
});
check('卷号格式 MMDD-XXX(无易混字符)', /^\d{4}-[A-HJ-NP-Z2-9]{3}$/.test(sh.code));
check('落库后可按 id 找到', getSheet(sh.id) === sh);
check('未批改计数 = 1', ungradedSheetCount() === 1);

// ── 2. 批改写入 ────────────────────────────────
const before = p.attempts.length;
gradeSheet(sh.id, { 1: true, 2: false });
check('两题写入 attempts', p.attempts.length === before + 2);
check('attempts 标记 paper 模式', p.attempts.at(-1).mode === 'paper');
check('错题自动入本(box 0)', p.errorBook['g_work_rate_1_2'] && p.errorBook['g_work_rate_1_2'].box === 0);
check('对题不入错题本', !p.errorBook['g_work_rate_1_1']);
check('卷子记录 gradedAt', !!getSheet(sh.id).gradedAt);
check('未批改计数归 0', ungradedSheetCount() === 0);

// 已录的题锁定:重复提交只有未录的第 3 题生效
gradeSheet(sh.id, { 1: false, 2: true, 3: true });
check('已录题不重复计(只多 1 条)', p.attempts.length === before + 3);
check('已录结果不被改写', getSheet(sh.id).grades[1] === true && getSheet(sh.id).grades[2] === false);
check('未录题可补录', getSheet(sh.id).grades[3] === true);
check('错题状态未被重复提交破坏', p.errorBook['g_work_rate_1_2'].box === 0);

// ── 3. 纸卷复习:到期错题在卷上做对 → 正常升盒 ──
addError('b4_q9', 'base_mapping', 2);
const sh2 = saveSheet({ title: '复习卷', items: [{ num: 1, qid: 'b4_q9', tag: 'base_mapping', level: 2, variantOf: null }] });
gradeSheet(sh2.id, { 1: true });
check('纸卷做对错题 → 升到第 1 盒', p.errorBook['b4_q9'].box === 1 && p.errorBook['b4_q9'].streak === 1);

// 纸上再错 → 回第 0 盒
const sh3 = saveSheet({ title: '复习卷2', items: [{ num: 1, qid: 'b4_q9', tag: 'base_mapping', level: 2, variantOf: null }] });
gradeSheet(sh3.id, { 1: false });
check('纸卷做错错题 → 回第 0 盒', p.errorBook['b4_q9'].box === 0 && p.errorBook['b4_q9'].wrongCount === 2);

// ── 4. 重复打印去重 + 空批改不盖章 ─────────────
const dupItems = [{ num: 1, qid: 'g_work_rate_2_9', tag: 'work_rate', level: 2, variantOf: null }];
const d1 = saveSheet({ title: '重打测试', items: dupItems });
const d2 = saveSheet({ title: '重打测试(再点一次打印)', items: dupItems });
check('同内容未批改的卷不重复建档', d1.id === d2.id);
gradeSheet(d1.id, {}); // 什么都没标就保存
check('没录任何题不盖 gradedAt', !getSheet(d1.id).gradedAt);
gradeSheet(d1.id, { 1: true });
const d3 = saveSheet({ title: '重打测试(已批过)', items: dupItems });
check('已批改的卷不参与去重(新打新档)', d3.id !== d1.id);

// ── 5. 封顶、id 唯一、删除 ─────────────────────
for (let i = 0; i < 70; i++) saveSheet({ title: `凑数 ${i}`, items: [{ num: 1, qid: `pad_${i}`, tag: 'basic', level: 1, variantOf: null }] });
check('卷子封顶 60 张', p.sheets.length === 60);
check('保留的是最近的卷', p.sheets.at(-1).title === '凑数 69');
check('同毫秒连续存卷 id 不碰撞', new Set(p.sheets.map(s => s.id)).size === p.sheets.length);

const last = allSheets()[0];
removeSheet(last.id);
check('删除卷子生效', !getSheet(last.id) && p.sheets.length === 59);
check('删除卷子不影响已录 attempts', p.attempts.length === before + 6);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
