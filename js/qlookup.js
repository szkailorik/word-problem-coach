// 由 qid 找题:题库真题 → AI 变式题(档案里存着)→ 生成题按 id 复现
import { QMAP } from './data.js';
import { regenerate } from './gen/generators.js';
import { getAIQuestion } from './store.js';

export function findQuestion(qid) {
  return QMAP.get(qid) || getAIQuestion(qid) || regenerate(qid);
}
