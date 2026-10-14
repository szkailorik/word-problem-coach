// AI 老师:提示词 + 结果归一化 + 变式题验算流水线(纯逻辑,调用函数由外部注入,node 可测)
//   diagnose   错因诊断 + 解题思路 + 线段图
//   makeAIVariant  出变式题 → 表达式验算 → 独立解题复核 → 不过就重出(最多 3 次)
//   trickCard  我的套路卡(结合孩子在该模型上的错题)
//   report     学情分析报告
import { evalExpr, nearlyEqual } from './expr.js';
import { normalizeDiagram } from '../diagram.js';
import { ERROR_TYPES, isErrorType, errorTypeOf } from '../diagnose.js';

const SYSTEM = `你是一位经验丰富、温和耐心的小学数学老师,擅长新加坡 SAP 应用题和中国小学数学经典解题套路。学生是 9~12 岁的孩子。
- 只用小学方法:线段图、份数、假设、倒推、列表、画图;除非题目要求,不要用方程和字母 x。
- 说话简短、具体、鼓励,直接对孩子说("你")。
- 始终只输出一个 JSON 对象,不要 markdown,不要代码块,不要多余文字。`;

export const DIAGRAM_SPEC = `diagram 画图规则(能用图说明数量关系时必须给;纯计算题给 null):
- 线段图:{"kind":"bars","title":"线段图","bars":[{"label":"哥哥","parts":[{"size":1,"text":"1份"},{"size":1,"text":"1份"},{"size":0.5,"text":"多20","style":"extra"}],"total":"?个"},{"label":"弟弟","parts":[{"size":1,"text":"1份"}]}],"braces":[{"from":0,"to":1,"text":"共 120 个"}],"note":"一句话说明"}
  size 是相对长度,尽量按真实比例;style 可选 unit(普通份)/extra(多出来的部分)/unknown(要求的未知部分)/gap(差距);label 不超过 4 个字;text 不超过 8 个字;braces 用来把几条线段合起来标总数(from/to 是线段序号,从 0 开始)。
- 数轴/路程图(行程、植树、周期):{"kind":"line","title":"路程图","marks":[{"at":0,"text":"A地"},{"at":300,"text":"B地"}],"spans":[{"from":0,"to":120,"text":"甲走 2 小时"}],"note":"..."}
- 只有几何图形题才用:{"kind":"svg","svg":"<svg viewBox='0 0 400 260' xmlns='http://www.w3.org/2000/svg'>...</svg>"},只用 rect/line/path/polygon/circle/text,标出边长。`;

const sys = () => ({ role: 'system', content: SYSTEM });

// 宽松解析:去掉 ```json 包裹,截取第一个 { 到最后一个 }
export function parseJSONLoose(text) {
  if (text && typeof text === 'object') return text;
  let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI 回复不是 JSON');
  s = s.slice(a, b + 1);
  return JSON.parse(s);
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const listOf = (v, n, len) => (Array.isArray(v) ? v : []).map(x => clip(typeof x === 'object' && x ? (x.text || x.title || JSON.stringify(x)) : x, len)).filter(Boolean).slice(0, n);

function methodBrief(m) {
  if (!m) return '(未分类)';
  const mem = m.memory || {};
  return [`${m.name}`, mem.mantra ? `口诀:${mem.mantra}` : '', mem.beats ? `步骤:${mem.beats.join(' → ')}` : '',
    m.pitfalls ? `常见坑:${m.pitfalls.slice(0, 3).join(';')}` : ''].filter(Boolean).join('\n');
}

function solutionText(q) {
  const steps = (q.steps || []).map((s, i) => `${i + 1}. ${s.label}:${s.text}`).join('\n');
  const ans = q.answer && q.answer.sentence ? `答案:${q.answer.sentence}` : (q.model && q.model.text ? `要点:${q.model.text}` : '');
  return [steps, ans].filter(Boolean).join('\n');
}

function answersText(ctx) {
  if (ctx.gaveUp) return '孩子直接点了"不会,看讲解",没有作答。';
  const xs = (ctx.answers || []).filter(x => x !== null && x !== undefined && x !== '');
  if (!xs.length) return '孩子自评做错了,没有填写算出的答案。';
  return xs.map((x, i) => `第 ${i + 1} 次作答:${x}`).join(';');
}

// ── 1. 诊断 ─────────────────────────────────────────
export function diagnoseMessages(q, ctx) {
  const correct = q.answer && typeof q.answer.value === 'number' ? `${q.answer.value}${q.answer.unit || ''}` : '(见标准讲解)';
  const user = `【题目】${q.zh}
【正确答案】${correct}
【标准讲解】
${solutionText(q)}
【所属套路】
${methodBrief(ctx.method)}
【孩子的作答】${answersText(ctx)}
【规则初判】${ctx.rule && isErrorType(ctx.rule.type) ? `${errorTypeOf(ctx.rule.type).name}:${ctx.rule.note}` : '无'}

请诊断孩子的错因,并重新讲清这道题。输出 JSON:
{"errorType":"read|model|relation|calc|question|partial|stuck 之一(read=审题不清,model=没认出套路,relation=数量关系错,calc=计算失误,question=答非所问,partial=只做了一半,stuck=不会下手)",
"diagnosis":"一句话说清你可能错在哪(不超过 60 字;如果能从作答数字推断出孩子算了什么,要点出来)",
"thinking":["解题思路第 1 步(不超过 45 字,说清为什么这样做)","第 2 步","…共 3~5 步"],
"keyIdea":"这类题的套路一句话(不超过 30 字)",
"checkTip":"下次做题时的一个检查动作(不超过 30 字)",
"diagram":画图对象或 null}
${DIAGRAM_SPEC}`;
  return [sys(), { role: 'user', content: user }];
}

export function normalizeDiagnosis(raw, rule) {
  const type = raw && Object.hasOwn(ERROR_TYPES, raw.errorType) && raw.errorType !== 'unknown' ? raw.errorType : (rule && rule.type) || 'unknown';
  return {
    type,
    diagnosis: clip(raw && raw.diagnosis, 120) || (rule && rule.note) || '',
    thinking: listOf(raw && raw.thinking, 6, 90),
    keyIdea: clip(raw && raw.keyIdea, 60),
    checkTip: clip(raw && raw.checkTip, 60),
    diagram: normalizeDiagram(raw && raw.diagram),
  };
}

export async function diagnose(q, ctx, call) {
  const raw = await call(diagnoseMessages(q, ctx), { temperature: 0.3, maxTokens: 1600 });
  return normalizeDiagnosis(raw, ctx.rule);
}

// ── 2. 变式题 ───────────────────────────────────────
const LEVEL_TEXT = [
  '难度与原题相当。',
  '难度与原题相当,但数字更友好一些。',
  '比原题简单一档:数字更小、少一步,但套路和关键一步不变——先帮孩子把关键一步走通。',
];

export function variantMessages(src, ctx) {
  const depth = Math.min(ctx.depth || 0, 2);
  const avoid = (ctx.avoid || []).slice(-4).map(s => `- ${clip(s, 60)}`).join('\n');
  const err = ctx.diag ? `${(isErrorType(ctx.diag.type) ? errorTypeOf(ctx.diag.type).name : '')}:${ctx.diag.note || ctx.diag.diagnosis || ''}` : '(未知)';
  const user = `请根据原题出一道"变式题"给孩子练习。
【原题】${src.zh}
【原题解法】
${solutionText(src)}
【所属套路】
${methodBrief(ctx.method)}
【孩子在这类题上的错因】${err}
${ctx.retryReason ? `【上一次出的题没通过验算】${ctx.retryReason}——这次务必自己先算一遍再给答案。\n` : ''}
要求:
1. 和原题用同一个套路、同样的数量关系结构;换一个生活情境和人物名字,数字全部换掉。
2. 题目要让孩子必须走对"错因"对应的那一步才能做对。
3. ${LEVEL_TEXT[depth]}
4. 最终答案必须是正整数(实在需要最多两位小数),每一步中间结果也要是干净的数。
5. 题干只问一个问题;不要和下面这些题重复:
${avoid || '- (无)'}
输出 JSON:
{"zh":"中文题干","en":"English version of the same problem","unit":"答案单位,如 个/元/米,没有就空字符串","answer":数字,
"expression":"只含数字和 + - × ÷ ( ) 的一个综合算式,计算结果必须等于 answer",
"steps":[{"label":"不超过 6 字","text":"不超过 60 字,写出这一步的算式和结果"}],
"hint1":"认题型的提示(不超过 30 字)","hint2":"第一步怎么下手的提示(不超过 40 字)","sentence":"完整答句",
"diagram":画图对象或 null}
${DIAGRAM_SPEC}`;
  return [sys(), { role: 'user', content: user }];
}

export function solveMessages(stem) {
  return [
    { role: 'system', content: '你是严谨的小学数学解题者。独立解题,每一步都验算。只输出 JSON。' },
    { role: 'user', content: `请独立解答下面这道小学数学应用题,仔细验算后给出最终数值答案。\n【题目】${stem}\n输出 JSON:{"work":"简要解题算式","answer":数字}` },
  ];
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const m = /-?\d+(?:\.\d+)?/.exec(String(v ?? '').replace(/,/g, ''));
  return m ? Number(m[0]) : NaN;
}

let aiSeq = 0;
// 校验 AI 给的变式题;不合格抛错(错误信息会反馈给下一次重出)
export function normalizeVariant(raw, src) {
  if (!raw || typeof raw !== 'object') throw new Error('不是 JSON 对象');
  const zh = clip(raw.zh, 500);
  if (zh.length < 12) throw new Error('题干太短');
  if (zh === clip(src.zh, 500)) throw new Error('和原题一模一样');
  const answer = toNumber(raw.answer);
  if (!Number.isFinite(answer) || answer <= 0) throw new Error(`答案 ${raw.answer} 不是正数`);
  if (Math.abs(answer * 100 - Math.round(answer * 100)) > 1e-6) throw new Error(`答案 ${answer} 超过两位小数`);
  let ev;
  try { ev = evalExpr(raw.expression); } catch (e) { throw new Error(`综合算式"${clip(raw.expression, 60)}"无法计算`); }
  if (!nearlyEqual(ev, answer)) throw new Error(`综合算式算出来是 ${+ev.toFixed(4)},和答案 ${answer} 不一致`);
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map(s => ({
    label: clip(s && s.label, 12) || '这一步', text: clip(s && (s.text || s), 160),
  })).filter(s => s.text).slice(0, 8);
  if (steps.length < 2) throw new Error('讲解步骤太少');
  const unit = clip(raw.unit, 6);
  const id = 'ai_' + Date.now().toString(36) + (aiSeq++).toString(36) + Math.floor(Math.random() * 46656).toString(36);
  return {
    id, ai: true, tag: src.tag, level: src.level || 1, srcQid: src.id || null, ts: Date.now(),
    zh, en: clip(raw.en, 700) || zh,
    answer: { value: Math.round(answer * 100) / 100, unit, sentence: clip(raw.sentence, 120) || `答案是 ${answer}${unit}。` },
    expression: clip(raw.expression, 200),
    steps,
    hint1: clip(raw.hint1, 80) || '先想想这道题和原题哪里一样。',
    hint2: clip(raw.hint2, 100) || (steps[0] ? steps[0].text : ''),
    diagram: normalizeDiagram(raw.diagram),
  };
}

// 出题 → 验算 → 独立复核;不过就带着原因重出,最多 tries 次;全失败抛错(外部用本地生成器兜底)
export async function makeAIVariant(src, ctx, call, { tries = 3, onStage = () => {} } = {}) {
  let reason = '';
  for (let i = 0; i < tries; i++) {
    onStage(i === 0 ? 'write' : 'retry', i);
    let v;
    try {
      const raw = await call(variantMessages(src, { ...ctx, retryReason: reason }), { temperature: 0.8, maxTokens: 1800 });
      v = normalizeVariant(raw, src);
    } catch (e) {
      if (e && e.code) throw e; // 网络/额度/登录问题,重试也没用
      reason = e.message;
      continue;
    }
    onStage('verify', i);
    let solved;
    try {
      solved = toNumber((await call(solveMessages(v.zh), { temperature: 0, maxTokens: 800 })).answer);
    } catch (e) {
      if (e && e.code) throw e;
      reason = '复核时出错';
      continue;
    }
    if (Number.isFinite(solved) && nearlyEqual(solved, v.answer.value)) return v;
    reason = `独立解题得到 ${solved},而你给的答案是 ${v.answer.value},题目可能有歧义或答案算错`;
  }
  throw new Error('变式题没有通过验算:' + reason);
}

// ── 3. 我的套路卡 ───────────────────────────────────
export function trickMessages(method, errs) {
  const list = errs.slice(0, 8).map((e, i) => `${i + 1}. ${clip(e.stem, 80)}${e.diag ? `(错因:${(isErrorType(e.diag.type) ? errorTypeOf(e.diag.type).name : '')} ${clip(e.diag.note, 50)})` : ''}`).join('\n');
  const user = `请为孩子写一张"我的套路卡",帮他掌握下面这个解题套路。
【套路】
${methodBrief(method)}
${method && method.signals ? `识别信号:${method.signals.join(';')}` : ''}
【孩子在这个套路上做错过的题】
${list || '(还没有错题)'}
输出 JSON:
{"title":"套路名","mantra":"一句好记的口诀(不超过 16 字)",
"signals":["看到什么就想到它(2~3 条,每条不超过 25 字)"],
"steps":["解题第 1 步(不超过 30 字)","…共 3~4 步"],
"myPitfalls":["根据孩子的错题总结他自己的易错点(2~3 条,每条不超过 40 字;没有错题就写常见易错点)"],
"checklist":["做完后的检查动作(2~3 条)"],
"example":{"zh":"一道最典型的小例题(数字简单)","solution":"两三句话的解法"}}`;
  return [sys(), { role: 'user', content: user }];
}

export function normalizeTrick(raw) {
  return {
    title: clip(raw && raw.title, 30),
    mantra: clip(raw && raw.mantra, 40),
    signals: listOf(raw && raw.signals, 4, 60),
    steps: listOf(raw && raw.steps, 5, 70),
    myPitfalls: listOf(raw && raw.myPitfalls, 4, 80),
    checklist: listOf(raw && raw.checklist, 4, 60),
    example: raw && raw.example && raw.example.zh ? { zh: clip(raw.example.zh, 200), solution: clip(raw.example.solution, 240) } : null,
  };
}

export async function trickCard(method, errs, call) {
  return normalizeTrick(await call(trickMessages(method, errs), { temperature: 0.5, maxTokens: 1400 }));
}

// ── 4. 学情分析报告 ─────────────────────────────────
export function reportMessages(student, stats, errs) {
  const typeLine = Object.entries(stats.byType || {}).filter(([, n]) => n).map(([k, n]) => `${(isErrorType(k) ? errorTypeOf(k).name : k)} ${n}`).join(',');
  const tagLine = (stats.byTag || []).map(t => `${t.name} ${t.n}`).join(',');
  const list = errs.slice(0, 15).map((e, i) => `${i + 1}. [${e.method}] ${clip(e.stem, 70)} —— 错 ${e.wrongCount} 次${e.diag ? `,错因:${(isErrorType(e.diag.type) ? errorTypeOf(e.diag.type).name : '')} ${clip(e.diag.note, 40)}` : ''}${e.chain ? `,变式闯关 ${e.chain}` : ''}`).join('\n');
  const user = `下面是学生 ${student} 的数学应用题学习数据,请写一份给家长和孩子看的学情分析。
【总体】做题 ${stats.total} 道,正确率 ${stats.acc}%;错题本在库 ${stats.active} 道,已彻底掌握 ${stats.mastered} 道,顽固错题 ${stats.stubborn} 道。
【错因分布】${typeLine || '暂无'}
【错题最多的套路】${tagLine || '暂无'}
【最近的错题】
${list || '(暂无)'}
输出 JSON:
{"summary":"两三句话的总体判断",
"weaknesses":[{"title":"问题(不超过 15 字)","evidence":"从数据里看到的证据","advice":"具体怎么练"}],
"plan":["接下来一周每天可以做的事(3~5 条,具体到套路和题量)"],
"praise":"一句真诚具体的鼓励,对孩子说"}`;
  return [sys(), { role: 'user', content: user }];
}

export function normalizeReport(raw) {
  return {
    summary: clip(raw && raw.summary, 300),
    weaknesses: (Array.isArray(raw && raw.weaknesses) ? raw.weaknesses : []).slice(0, 5).map(w => ({
      title: clip(w && w.title, 30), evidence: clip(w && w.evidence, 160), advice: clip(w && w.advice, 160),
    })).filter(w => w.title),
    plan: listOf(raw && raw.plan, 6, 100),
    praise: clip(raw && raw.praise, 120),
  };
}

export async function report(student, stats, errs, call) {
  return normalizeReport(await call(reportMessages(student, stats, errs), { temperature: 0.5, maxTokens: 1800 }));
}
