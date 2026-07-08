// 云同步合并逻辑测试:node tests/sync.test.mjs
// 模拟两台设备各自做题后合并,验证去重、新者胜、种子最大、mastery 重算。
import { state, save } from '../js/store.js';
import * as syncMod from '../js/sync.js';

// mergeInto 未导出,通过模块内部测试:改为直接构造两个 state 走一遍合并逻辑
// 这里通过 pull 的合并路径不可行(需网络),所以直接 import 内部函数——
// 为了可测,sync.js 导出 _mergeInto 供测试使用。
const { _mergeInto } = syncMod;

let fails = 0;
function check(name, cond) {
  if (!cond) { fails++; console.error('FAIL:', name); }
  else console.log('ok:', name);
}

// 设备 A(local):做了 2 题,错题 e1(box 1, lastTs 100)
const local = {
  version: 1, student: 'KAI', lang: 'both',
  students: {
    KAI: {
      attempts: [
        { ts: 1, qid: 'q1', tag: 'work_rate', correct: true, mode: 'drill', level: 1 },
        { ts: 2, qid: 'q2', tag: 'work_rate', correct: false, mode: 'drill', level: 1 },
      ],
      errorBook: { q2: { qid: 'q2', tag: 'work_rate', level: 1, wrongCount: 1, firstTs: 2, lastTs: 100, box: 1, due: 500, mastered: false, streak: 1 } },
      mastery: {}, lastDrillSeed: { work_rate: 5 },
    },
    Lorik: { attempts: [], errorBook: {}, mastery: {}, lastDrillSeed: {} },
  },
};
// 设备 B(remote):同一道 q2 复习过(box 2, lastTs 200 更新),另做了 q3;种子更大;Lorik 也做了题
const remote = {
  version: 1, student: 'Lorik', lang: 'zh',
  students: {
    KAI: {
      attempts: [
        { ts: 2, qid: 'q2', tag: 'work_rate', correct: false, mode: 'drill', level: 1 }, // 重复,应去重
        { ts: 3, qid: 'q3', tag: 'speed_catchup', correct: true, mode: 'drill', level: 1 },
      ],
      errorBook: { q2: { qid: 'q2', tag: 'work_rate', level: 1, wrongCount: 2, firstTs: 2, lastTs: 200, box: 2, due: 900, mastered: false, streak: 2 } },
      mastery: {}, lastDrillSeed: { work_rate: 9, base_mapping: 3 },
    },
    Lorik: {
      attempts: [{ ts: 10, qid: 'q9', tag: 'logic_overlap', correct: true, mode: 'drill', level: 1 }],
      errorBook: {}, mastery: {}, lastDrillSeed: {},
    },
  },
};

_mergeInto(local, remote);
const K = local.students.KAI;

check('attempts 去重合并为 3 条', K.attempts.length === 3);
check('attempts 按时间排序', K.attempts[0].ts === 1 && K.attempts[2].ts === 3);
check('errorBook 取 lastTs 新的(box 2)', K.errorBook.q2.box === 2 && K.errorBook.q2.due === 900);
check('wrongCount 取大', K.errorBook.q2.wrongCount === 2);
check('种子取最大', K.lastDrillSeed.work_rate === 9 && K.lastDrillSeed.base_mapping === 3);
check('mastery 重算:work_rate 2题1对', K.mastery.work_rate.seen === 2 && K.mastery.work_rate.correct === 1);
check('mastery 重算:speed 1题1对 streak1', K.mastery.speed_catchup.streak === 1);
check('Lorik 合并进来', local.students.Lorik.attempts.length === 1);
check('本地偏好不被覆盖', local.student === 'KAI' && local.lang === 'both');

// 幂等:再合并一次不应有变化
const snapshot = JSON.stringify(local);
_mergeInto(local, remote);
check('合并幂等', JSON.stringify(local) === snapshot);

// ── v1.4:卷子档案合并 ─────────────────────────
const mkSheet = (id, gradedAt = null, grades = null) =>
  ({ id, code: '0708-AAA', ts: Number(id.slice(1)), title: '卷' + id, items: [{ num: 1, qid: 'q1', tag: 'work_rate', level: 1, variantOf: null }], grades, gradedAt });
const emptyP = () => ({ attempts: [], errorBook: {}, mastery: {}, lastDrillSeed: {} });
const A = { version: 1, student: 'KAI', lang: 'both', students: { KAI: { ...emptyP(), sheets: [mkSheet('s1'), mkSheet('s2')] } } };
const B = { version: 1, student: 'KAI', lang: 'both', students: { KAI: { ...emptyP(), sheets: [mkSheet('s1', 999, { 1: true }), mkSheet('s3')] } } };
_mergeInto(A, B);
const sheets = A.students.KAI.sheets;
check('卷子并集去重为 3 张', sheets.length === 3);
check('同卷取已批改的一侧', sheets.find(s => s.id === 's1').gradedAt === 999 && sheets.find(s => s.id === 's1').grades[1] === true);
check('卷子按时间排序', sheets[0].id === 's1' && sheets[2].id === 's3');
const snap2 = JSON.stringify(A);
_mergeInto(A, B);
check('卷子合并幂等', JSON.stringify(A) === snap2);

// 双设备各批一部分:两侧已录的题号("锁")都要保住
const pa = { ...mkSheet('s7', 100, { 1: true, 2: false }) };
const pb = { ...mkSheet('s7', 200, { 3: true }) };
const A2 = { version: 1, students: { KAI: { ...emptyP(), sheets: [pa] } } };
_mergeInto(A2, { version: 1, students: { KAI: { ...emptyP(), sheets: [pb] } } });
const m7 = A2.students.KAI.sheets.find(s => s.id === 's7');
check('分批批改逐题并集', m7.grades[1] === true && m7.grades[2] === false && m7.grades[3] === true);
check('gradedAt 取较新', m7.gradedAt === 200);
// 同一题号两侧冲突:gradedAt 新的一侧说了算
const c1 = { ...mkSheet('s8', 100, { 1: true }) };
const c2 = { ...mkSheet('s8', 300, { 1: false }) };
const A3 = { version: 1, students: { KAI: { ...emptyP(), sheets: [c1] } } };
_mergeInto(A3, { version: 1, students: { KAI: { ...emptyP(), sheets: [c2] } } });
check('同题冲突新者胜', A3.students.KAI.sheets.find(s => s.id === 's8').grades[1] === false);
// 老档案(无 sheets 字段)合并不报错
const C = { version: 1, student: 'KAI', lang: 'both', students: { KAI: emptyP() } };
_mergeInto(C, { version: 1, students: { KAI: emptyP() } });
check('老档案无 sheets 也能合并', Array.isArray(C.students.KAI.sheets));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
