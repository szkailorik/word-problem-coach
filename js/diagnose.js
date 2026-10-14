// 错因诊断(规则版,离线即时):拿孩子的错答和标准讲解里的数比对,猜错因类型。
// AI 诊断(ai/tutor.js)会在此基础上细化;没有 AI 时这就是错题本的错因来源。

export const ERROR_TYPES = {
  read:     { icon: '👀', name: '审题不清', tip: '圈出关键词:谁和谁比?问的到底是什么?' },
  model:    { icon: '🧩', name: '没认出套路', tip: '先对照信号词判断是哪种模型,再动笔。' },
  relation: { icon: '🔗', name: '数量关系错', tip: '画线段图,把"谁比谁多、几倍"画出来再列式。' },
  calc:     { icon: '🧮', name: '计算失误', tip: '列竖式算,算完把答案代回题目验一验。' },
  question: { icon: '❓', name: '答非所问', tip: '写答案前再读一遍问句,看是不是题目要的那个量。' },
  partial:  { icon: '🪜', name: '只做了一半', tip: '算出一个数后问自己:这是最后要的吗?还差哪一步?' },
  stuck:    { icon: '🤔', name: '不会下手', tip: '先用提示 1 认题型,再画图找第一步。' },
  unknown:  { icon: '❔', name: '待分析', tip: '' },
};
export const ERROR_TYPE_KEYS = Object.keys(ERROR_TYPES).filter(k => k !== 'unknown');
export const isErrorType = k => typeof k === 'string' && Object.hasOwn(ERROR_TYPES, k);
export const errorTypeOf = k => (isErrorType(k) ? ERROR_TYPES[k] : ERROR_TYPES.unknown);

// 从文本里抽数字(支持千分位逗号、小数);去重保序
export function numbersIn(text) {
  const out = [];
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const v = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

const eq = (a, b) => Math.abs(a - b) < 1e-9;

function isCalcSlip(ans, v) {
  if (v === 0) return false;
  if (eq(ans * 10, v) || eq(ans, v * 10) || eq(ans * 100, v) || eq(ans, v * 100)) return true; // 数位/小数点
  const d = Math.abs(ans - v);
  if ([1, 2, 10, 100, 1000].some(k => eq(d, k))) return true; // 进退位
  if (d / Math.abs(v) <= 0.06) return true; // 很接近
  // 数字颠倒/错位:位数相同、数字多重集相同
  const sa = String(ans), sv = String(v);
  if (sa.length === sv.length && sa !== sv && [...sa].sort().join('') === [...sv].sort().join('')) return true;
  return false;
}

// q:题目对象(stem 用 zh;answer.value 可能没有——题库真题)
// ans:孩子的作答(数字或 null);opts.gaveUp:点了"不会"
export function ruleDiagnose(q, ans, opts = {}) {
  const T = (type, note) => ({ type, note, source: 'rule' });
  if (opts.selfGraded && (ans === null || ans === undefined || ans === '')) return T('unknown', ''); // 题库自评没填数,规则无从判断
  if (opts.gaveUp || ans === null || ans === undefined || ans === '' || Number.isNaN(Number(ans))) {
    return T('stuck', opts.gaveUp ? '直接点了"不会"——先认题型、画图,找到第一步。' : '没有留下作答,先从认题型开始。');
  }
  ans = Number(ans);
  const v = q && q.answer && typeof q.answer.value === 'number' ? q.answer.value : null;
  if (v === null) return T('unknown', '');
  if (eq(ans, v)) return T('unknown', '');

  const stemNums = numbersIn(q.zh);
  const stepNums = numbersIn((q.steps || []).map(s => s.text).join(' ')).filter(x => !eq(x, v));
  const inStem = stemNums.some(x => eq(x, ans));
  const inSteps = stepNums.some(x => eq(x, ans));

  // 正确答案 ± 题干里的某个量 → 求成了另一个量(比如问小的求成了大的)
  if (!inStem && stemNums.some(k => k !== 0 && (eq(ans, v + k) || eq(ans, v - k)))) {
    return T('question', `${ans} 和答案正好差题目里的一个量——你求出的可能是另一个量,再读一遍问句:问的是谁?`);
  }
  if (inSteps && !inStem) return T('partial', `你得到的 ${ans} 是讲解里中间一步的结果,离最终答案还差一步。`);
  if (isCalcSlip(ans, v)) return T('calc', `思路基本对了,${ans} 和正确答案 ${v} 只差一点,多半是算错了。`);
  if (inStem) return T('read', `${ans} 是题目里直接给的数——还没理清数量关系就把它当答案了。`);
  // 和中间量差一步(多乘/多除一个已知量)→ 也是没对准问句
  const known = [...stemNums, ...stepNums];
  if (known.some(k => k !== 0 && k !== 1 && (eq(ans, v * k) || eq(ans * k, v) || eq(ans, v + k) || eq(ans, v - k)))) {
    return T('question', `${ans} 和答案差一个已知量,可能多算或少算了一步。`);
  }
  return T('relation', `${ans} 和正确答案 ${v} 差得较远,数量关系可能找错了——画个线段图再看看。`);
}

// 错题本统计:按错因类型计数(没诊断过的算 unknown)
export function countByType(errors) {
  const c = Object.fromEntries(Object.keys(ERROR_TYPES).map(k => [k, 0]));
  for (const e of errors) c[(e.diag && isErrorType(e.diag.type)) ? e.diag.type : 'unknown']++;
  return c;
}

// 顽固错题:错 ≥3 次,或变式闯关里错过 ≥2 次
export function isStubborn(e) {
  const chainWrong = (e.chain || []).filter(c => !c.correct).length;
  return (e.wrongCount || 0) >= 3 || chainWrong >= 2;
}
