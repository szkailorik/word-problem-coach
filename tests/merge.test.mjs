// v2.0 合并规则 + 错题本新字段:node tests/merge.test.mjs
import { mergeProfile, mergeStates, mergeInto } from '../js/merge.js';
import { profile, addError, removeError, setDiag, pushChain, chainFails, saveAIQuestion, getAIQuestion, setAiNote, getAiNote, recordAttempt, lastAttemptOf, state } from '../js/store.js';
import { check, done } from './_check.mjs';

const base = () => ({ attempts: [], errorBook: {}, mastery: {}, lastDrillSeed: {}, sheets: [], quizLog: [], aiQ: {}, aiNotes: { tricks: {} }, removed: {} });

// ── 1. 墓碑:删除跨设备传播,但删除后又错的不会被误删 ──
{
  const A = base(), B = base();
  B.errorBook.q1 = { qid: 'q1', tag: 't', wrongCount: 1, firstTs: 10, lastTs: 100 };
  B.errorBook.q2 = { qid: 'q2', tag: 't', wrongCount: 1, firstTs: 10, lastTs: 300 };
  A.removed = { q1: 200, q2: 200 };
  const m = mergeProfile(A, B);
  check('墓碑删掉旧错题', !m.errorBook.q1);
  check('删除之后又错的保留', !!m.errorBook.q2);
  check('墓碑并集保留', m.removed.q1 === 200);
}
// ── 2. 诊断取新、闯关链并集去重 ──
{
  const A = base(), B = base();
  A.errorBook.q = { qid: 'q', tag: 't', wrongCount: 2, firstTs: 1, lastTs: 50, diag: { type: 'calc', ts: 40 }, chain: [{ qid: 'v1', correct: false, ts: 20 }] };
  B.errorBook.q = { qid: 'q', tag: 't', wrongCount: 3, firstTs: 5, lastTs: 60, chain: [{ qid: 'v1', correct: false, ts: 20 }, { qid: 'v2', correct: true, ts: 30 }] };
  const m = mergeProfile(A, B).errorBook.q;
  check('lastTs 新者胜 + 错次取大', m.lastTs === 60 && m.wrongCount === 3 && m.firstTs === 1);
  check('newer 缺诊断时保留另一侧诊断', m.diag && m.diag.type === 'calc');
  check('闯关链并集去重', m.chain.length === 2 && m.chain[1].qid === 'v2');
}
// ── 3. AI 题并集、AI 笔记新者胜 ──
{
  const A = base(), B = base();
  A.aiQ.a1 = { id: 'a1', ts: 1 }; B.aiQ.b1 = { id: 'b1', ts: 2 };
  A.aiNotes = { report: { ts: 5, data: 'old' }, tricks: { x: { ts: 9, data: 'A' } } };
  B.aiNotes = { report: { ts: 7, data: 'new' }, tricks: { x: { ts: 3, data: 'B' }, y: { ts: 1, data: 'Y' } } };
  const m = mergeProfile(A, B);
  check('AI 题并集', m.aiQ.a1 && m.aiQ.b1);
  check('报告新者胜', m.aiNotes.report.data === 'new');
  check('套路卡逐键新者胜', m.aiNotes.tricks.x.data === 'A' && m.aiNotes.tricks.y.data === 'Y');
}
// ── 4. 幂等 + 交换律(同步收敛的关键) ──
{
  const A = base(), B = base();
  A.attempts = [{ ts: 1, qid: 'a', tag: 't', correct: true }, { ts: 3, qid: 'c', tag: 't', correct: false }];
  B.attempts = [{ ts: 2, qid: 'b', tag: 't', correct: false }, { ts: 3, qid: 'c', tag: 't', correct: false }];
  A.errorBook.c = { qid: 'c', tag: 't', wrongCount: 1, firstTs: 3, lastTs: 3, box: 0 };
  B.errorBook.c = { qid: 'c', tag: 't', wrongCount: 1, firstTs: 3, lastTs: 9, box: 1, chain: [{ qid: 'v', correct: true, ts: 8 }] };
  B.removed = { zz: 4 };
  const sa = { students: { KAI: A } }, sb = { students: { KAI: B } };
  const ab = mergeStates(sa, sb), ba = mergeStates(sb, sa);
  const norm = s => JSON.stringify(s.students.KAI, Object.keys(s.students.KAI).sort());
  check('交换律:A∪B = B∪A(内容一致)', JSON.stringify(ab.students.KAI.attempts) === JSON.stringify(ba.students.KAI.attempts)
    && JSON.stringify(ab.students.KAI.errorBook) === JSON.stringify(ba.students.KAI.errorBook));
  const abab = mergeStates(ab, sb);
  check('幂等:再合并一次不变', norm(abab) === norm(ab));
  check('attempts 去重 + mastery 重放', ab.students.KAI.attempts.length === 3 && ab.students.KAI.mastery.t.seen === 3);
  check('mergeStates 不改入参', sa.students.KAI.attempts.length === 2);
  const loc = { student: 'KAI', lang: 'zh', students: { KAI: base() } };
  mergeInto(loc, { student: 'Lorik', lang: 'en', students: { Lorik: B } });
  check('设备偏好不被同步覆盖,新学生被加入', loc.student === 'KAI' && loc.lang === 'zh' && loc.students.Lorik);
}
// ── 4b. lastTs 平局也收敛(评审补充) ──
{
  const A = base(), B = base();
  A.errorBook.q = { qid: 'q', tag: 't', wrongCount: 1, firstTs: 1, lastTs: 50, box: 1 };
  B.errorBook.q = { qid: 'q', tag: 't', wrongCount: 1, firstTs: 1, lastTs: 50, box: 2 };
  const ab = mergeProfile(A, B).errorBook.q, ba = mergeProfile(B, A).errorBook.q;
  check('平局时两个方向选同一侧', ab.box === ba.box);
}
// ── 5. store:诊断/闯关链/墓碑/AI 题/笔记 ──
{
  state.student = 'KAI';
  const p = profile();
  addError('g_x_1_1', 'sum_diff', 1);
  setDiag('g_x_1_1', { type: 'partial', note: '中间步', source: 'rule' });
  check('setDiag 写入', p.errorBook.g_x_1_1.diag.type === 'partial' && p.errorBook.g_x_1_1.diag.ts > 0);
  const wc = p.errorBook.g_x_1_1.wrongCount, box = p.errorBook.g_x_1_1.box, due = p.errorBook.g_x_1_1.due;
  pushChain('g_x_1_1', { qid: 'ai_1', correct: false, by: 'ai' });
  pushChain('g_x_1_1', { qid: 'ai_2', correct: false, by: 'ai' });
  check('闯关连错计数', chainFails(p.errorBook.g_x_1_1) === 2 && p.errorBook.g_x_1_1.wrongCount === wc + 2);
  pushChain('g_x_1_1', { qid: 'g_x_1_9', correct: true, by: 'gen' });
  check('做对后连错清零', chainFails(p.errorBook.g_x_1_1) === 0);
  check('当场闯关不改间隔节奏', p.errorBook.g_x_1_1.box === box && p.errorBook.g_x_1_1.due === due);
  check('闯关链 ts 唯一', new Set(p.errorBook.g_x_1_1.chain.map(c => c.ts)).size === 3);
  removeError('g_x_1_1');
  check('删除留墓碑', !p.errorBook.g_x_1_1 && p.removed.g_x_1_1 > 0);
  saveAIQuestion({ id: 'ai_test', ts: Date.now(), zh: '题' });
  check('AI 题可按 id 找回', getAIQuestion('ai_test').zh === '题');
  setAiNote('trick', { mantra: 'm' }, 'sum_diff');
  setAiNote('report', { summary: 's' });
  check('AI 笔记存取', getAiNote('trick', 'sum_diff').data.mantra === 'm' && getAiNote('report').data.summary === 's');
  recordAttempt({ qid: 'q9', tag: 'sum_diff', correct: false, mode: 'drill', level: 1, ans: 42 });
  check('作答被记录', lastAttemptOf('q9').ans === 42);
  recordAttempt({ qid: 'q9', tag: 'sum_diff', correct: true, mode: 'drill', level: 1, ans: '' });
  check('空作答不写 ans', lastAttemptOf('q9').ans === undefined);
}
done();
