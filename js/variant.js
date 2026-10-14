// 变式闯关出题:优先 AI(针对错因、过三道验算闸),不行就用本地生成器(答案构造式保证正确)
import { METHODS, BANK_LEVEL } from './data.js';
import { GENERATORS, generate } from './gen/generators.js';
import { nextSeed, saveAIQuestion, profile, state } from './store.js';
import { findQuestion } from './qlookup.js';
import { aiAvailable, chatJSON } from './ai/client.js';
import { makeAIVariant } from './ai/tutor.js';

export function levelOf(q) {
  return q.level || BANK_LEVEL[q.bank] || 1;
}

// root:闯关的原题;depth:这一轮已经连错几次(0 = 原题刚错);diag:最近一次诊断
// onStage(stage):'write' | 'retry' | 'verify',给界面显示进度
// 返回 { q, by:'ai'|'gen'|null, note }
export async function produceVariant(root, { depth = 0, diag = null, onStage = () => {} } = {}) {
  const student = state.student;
  const e = profile().errorBook[root.id];
  const avoid = [root.zh, ...((e && e.chain) || []).map(c => findQuestion(c.qid)).filter(Boolean).map(q => q.zh)];
  let note = '';
  if (await aiAvailable()) {
    try {
      const v = await makeAIVariant(root, { depth, diag: diag || (e && e.diag), avoid, method: METHODS[root.tag] }, chatJSON, { onStage });
      v.level = levelOf(root);
      saveAIQuestion(v, student);
      return { q: v, by: 'ai', note: '' };
    } catch (err) {
      note = err.message;
    }
  }
  if (GENERATORS[root.tag]) {
    const lv = depth >= 2 ? Math.max(1, levelOf(root) - 1) : levelOf(root);
    return { q: generate(root.tag, lv, nextSeed(root.tag)), by: 'gen', note };
  }
  return { q: null, by: null, note: note || '这一类题要靠 AI 老师出变式(登录后可用)。先把原题讲解看懂,过两天错题本会安排重做。' };
}
