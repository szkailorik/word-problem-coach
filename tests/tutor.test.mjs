// AI 老师流水线(模拟 DeepSeek):node tests/tutor.test.mjs
import { makeAIVariant, normalizeVariant, diagnose, normalizeDiagnosis, parseJSONLoose, variantMessages, diagnoseMessages, trickCard, report } from '../js/ai/tutor.js';
import { check, done } from './_check.mjs';

const src = {
  id: 'g_sum_diff_1_3', tag: 'sum_diff', level: 1,
  zh: '哥哥和弟弟共有 120 个弹珠,哥哥比弟弟多 20 个。哥哥有多少个?',
  steps: [{ label: '去掉多的', text: '120 − 20 = 100' }, { label: '求弟弟', text: '100 ÷ 2 = 50' }, { label: '求哥哥', text: '50 + 20 = 70' }],
  answer: { value: 70, unit: '个', sentence: '哥哥有 70 个。' },
};
const goodV = {
  zh: '姐姐和妹妹一共有 90 张贴纸,姐姐比妹妹多 10 张。姐姐有多少张?', en: 'Sis and little sis have 90 stickers...',
  unit: '张', answer: 50, expression: '(90 + 10) ÷ 2',
  steps: [{ label: '补齐', text: '90 + 10 = 100' }, { label: '求姐姐', text: '100 ÷ 2 = 50' }],
  hint1: '和差问题', hint2: '先补齐', sentence: '姐姐有 50 张。',
  diagram: { kind: 'bars', bars: [{ label: '姐姐', parts: [{ size: 1 }, { size: 0.2, style: 'extra' }] }, { label: '妹妹', parts: [{ size: 1 }] }] },
};

// 脚本化的假 DeepSeek:按顺序返回预设回复,并记录请求
function fakeCall(script) {
  const log = [];
  const fn = async (messages, opts) => {
    log.push({ messages, opts });
    const r = script.shift();
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r(messages) : r;
  };
  fn.log = log;
  return fn;
}

check('parseJSONLoose 去代码块', parseJSONLoose('```json\n{"a":1}\n```').a === 1);
check('parseJSONLoose 前后有废话', parseJSONLoose('好的:{"a":{"b":2}} 完').a.b === 2);
let threw = false; try { parseJSONLoose('没有 json'); } catch (e) { threw = true; }
check('parseJSONLoose 非 JSON 抛错', threw);

// 1. 一次通过:出题 + 复核一致
{
  const call = fakeCall([goodV, { answer: 50 }]);
  const stages = [];
  const v = await makeAIVariant(src, { depth: 0 }, call, { onStage: s => stages.push(s) });
  check('一次通过', v.answer.value === 50 && v.ai && v.id.startsWith('ai_') && v.tag === 'sum_diff');
  check('调用两次(出题+复核)', call.log.length === 2);
  check('复核温度为 0', call.log[1].opts.temperature === 0);
  check('复核只给题干不给答案', !call.log[1].messages[1].content.includes('"answer":50') && call.log[1].messages[1].content.includes(goodV.zh));
  check('阶段回调', stages.join(',') === 'write,verify');
  check('图被归一化保留', v.diagram && v.diagram.kind === 'bars');
}
// 2. 表达式与答案不符 → 带原因重出
{
  const call = fakeCall([{ ...goodV, answer: 55 }, goodV, { answer: 50 }]);
  const v = await makeAIVariant(src, {}, call);
  check('表达式不符后重出成功', v.answer.value === 50 && call.log.length === 3);
  check('重出提示里带上了失败原因', call.log[1].messages[1].content.includes('不一致'));
}
// 3. 独立复核不一致 → 重出
{
  const call = fakeCall([goodV, { answer: 45 }, goodV, { answer: '50 张' }]);
  const v = await makeAIVariant(src, {}, call);
  check('复核不一致后重出成功(复核答案带单位也能读)', v.answer.value === 50 && call.log.length === 4);
  check('重出原因写明独立解题结果', call.log[2].messages[1].content.includes('独立解题得到 45'));
}
// 4. 三次都失败 → 抛错(外部兜底用生成器)
{
  const call = fakeCall([{ zh: '短' }, { ...goodV, answer: -3, expression: '-3' }, { ...goodV, zh: src.zh }]);
  let err = null;
  try { await makeAIVariant(src, {}, call); } catch (e) { err = e; }
  check('三次失败抛错', err && err.message.includes('验算'));
}
// 5. 网络/额度错误直接抛出,不重试
{
  const e = new Error('额度用完'); e.code = 'quota';
  const call = fakeCall([e]);
  let err = null;
  try { await makeAIVariant(src, {}, call); } catch (x) { err = x; }
  check('额度错误不重试', err && err.code === 'quota' && call.log.length === 1);
}
// 6. normalizeVariant 各种拒绝
const rej = (raw, why) => { let t = false; try { normalizeVariant(raw, src); } catch (e) { t = true; } check('拒绝:' + why, t); };
rej({ ...goodV, answer: 3.14159, expression: '3.14159' }, '超过两位小数');
rej({ ...goodV, expression: 'alert(1)' }, '非法算式');
rej({ ...goodV, steps: [{ text: '一步' }] }, '步骤太少');
rej({ ...goodV, answer: 0, expression: '0' }, '答案为 0');
check('答案字符串可解析', normalizeVariant({ ...goodV, answer: '50' }, src).answer.value === 50);
// 7. 深度 ≥2 时提示降难度,避免重复题
{
  const m = variantMessages(src, { depth: 3, avoid: ['旧题一', '旧题二'], diag: { type: 'partial', note: '只算到中间一步' } });
  const u = m[1].content;
  check('降一档提示', u.includes('简单一档'));
  check('避重复列表', u.includes('旧题一') && u.includes('旧题二'));
  check('带上错因', u.includes('只做了一半') && u.includes('只算到中间一步'));
  check('system 提示要求只输出 JSON', m[0].content.includes('JSON'));
}
// 8. 诊断:归一化 + 回退规则类型
{
  const dm = diagnoseMessages(src, { answers: [50, 100], rule: { type: 'partial', note: '中间步' } });
  check('诊断提示包含两次作答', dm[1].content.includes('第 1 次作答:50') && dm[1].content.includes('第 2 次作答:100'));
  const call = fakeCall([{ errorType: 'partial', diagnosis: '你算出了弟弟的数量就停了', thinking: ['先去掉多的', '再平分', '最后加回去'], keyIdea: '和差:大数=(和+差)÷2', checkTip: '问的是谁', diagram: { kind: 'line', marks: [{ at: 0, text: '0' }, { at: 120, text: '120' }] } }]);
  const d = await diagnose(src, { answers: [50], rule: { type: 'partial', note: '' } }, call);
  check('诊断归一化', d.type === 'partial' && d.thinking.length === 3 && d.diagram.kind === 'line');
  const d2 = normalizeDiagnosis({ errorType: '乱写', thinking: 'x' }, { type: 'calc', note: '规则说算错' });
  check('原型链键 errorType 被拒', normalizeDiagnosis({ errorType: 'constructor' }, { type: 'calc' }).type === 'calc');
  check('非法类型回退规则', d2.type === 'calc' && d2.diagnosis === '规则说算错' && d2.thinking.length === 0 && d2.diagram === null);
}
// 9. 套路卡 / 学情报告
{
  const t = await trickCard({ name: '和差问题', memory: { mantra: '大数=(和+差)÷2' }, signals: ['和与差'] }, [{ stem: '题', diag: { type: 'calc', note: 'x' } }],
    fakeCall([{ title: '和差', mantra: '和加差', signals: ['a'], steps: ['1', '2', '3'], myPitfalls: ['p'], checklist: ['c'], example: { zh: '例', solution: '解' } }]));
  check('套路卡归一化', t.mantra === '和加差' && t.steps.length === 3 && t.example.zh === '例');
  const r = await report('KAI', { total: 10, acc: 70, active: 3, mastered: 1, stubborn: 1, byType: { calc: 2 }, byTag: [{ name: '和差', n: 2 }] }, [],
    fakeCall([{ summary: 's', weaknesses: [{ title: 'w', evidence: 'e', advice: 'a' }, { evidence: '无标题被丢弃' }], plan: ['p1'], praise: '棒' }]));
  check('学情报告归一化', r.summary === 's' && r.weaknesses.length === 1 && r.plan[0] === 'p1');
}
done();
