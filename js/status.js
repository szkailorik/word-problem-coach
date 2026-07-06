// 题目训练状态(题库通关图 / 打印中心共用)
// right  = 最近一次做对且不在错题闯关中
// train  = 还要训练(最近做错,或在错题本尚未掌握)
// master = 曾经错过,但已连闯 4 关彻底掌握
// null   = 未做
import { profile } from './store.js';

export function statusMap() {
  const p = profile();
  const map = {};
  for (const a of p.attempts) map[a.qid] = a.correct ? 'right' : 'train';
  for (const e of Object.values(p.errorBook)) {
    map[e.qid] = e.mastered ? 'master' : 'train';
  }
  return map;
}

export const STATUS_META = {
  right: { icon: '✅', label: '做对了' },
  train: { icon: '🔴', label: '还要训练' },
  master: { icon: '🏆', label: '错过但已掌握' },
  none: { icon: '⚪', label: '未做' },
};

export function statusIcon(st) { return (STATUS_META[st || 'none']).icon; }
