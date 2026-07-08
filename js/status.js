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

// ── 套路掌握四级阶梯(首页掌握地图用)───────────────────
// 阈值是起始值,可按孩子实际情况调。
const LV2_SEEN = 10, LV2_ACC = 0.7;   // 熟练
const LV3_SEEN = 20, LV3_ACC = 0.85;  // 精通(还要求该模型没有未掌握的错题)

export const MASTERY_META = [
  { icon: '⚪', name: '未学' },
  { icon: '🌱', name: '学习中' },
  { icon: '💪', name: '熟练' },
  { icon: '🏆', name: '精通' },
];

// 有未掌握错题的模型集合;批量算多个 tag 时先取一次,传给 masteryLevel 免得反复扫错题本
export function openErrorTagSet() {
  return new Set(Object.values(profile().errorBook).filter(e => !e.mastered).map(e => e.tag));
}

export function masteryLevel(tag, openTags = null) {
  const m = profile().mastery[tag];
  if (!m || !m.seen) return 0;
  const acc = m.correct / m.seen;
  const hasOpenErrors = (openTags || openErrorTagSet()).has(tag);
  if (m.seen >= LV3_SEEN && acc >= LV3_ACC && !hasOpenErrors) return 3;
  if (m.seen >= LV2_SEEN && acc >= LV2_ACC) return 2;
  return 1;
}
