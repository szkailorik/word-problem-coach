// 应用 2026-07-06 模型归类审计结果(4 个审核 agent + 人工抽查确认)
// generic → 归入 basic(基础综合);retag → 改为正确模型;ambiguous 保持不动。
// 运行:node tests/apply-audit.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 纯计算/几何/单位换算等,15 模型都不贴切 → basic
const GENERIC = [
  // core+book3
  'b3_q1','b3_q2','b3_q7','b3_q8','b3_q9','b3_q11','b3_q12','b3_q13','b3_q14','b3_q15',
  'b3_q16','b3_q18','b3_q22','b3_q24','b3_q25','b3_q26','b3_q27','b3_q28','b3_q30','b3_q31',
  'b3_q32','b3_q35','b3_q36','b3_q37','b3_q41','b3_q42','b3_q43','b3_q44','b3_q47','b3_q48',
  'b3_q49','b3_q50','b3_q51','b3_q52','b3_q53','b3_q54','b3_q56','b3_q57','b3_q58','b3_q59',
  'b3_q60','b3_q61','b3_q62','b3_q63','b3_q64','b3_q65','b3_q66','b3_q69','b3_q70','b3_q71',
  'b3_q72','b3_q73','b3_q74','b3_q75','b3_q76','b3_q77','b3_q78','b3_q79','b3_q80','b3_q82',
  'b3_q83','b3_q84','b3_q86','b3_q87','b3_q88','b3_q90','b3_q91','b3_q92','b3_q93','b3_q94',
  'b3_q95','b3_q101',
  // book4
  'b4_q11','b4_q14','b4_q18','b4_q19','b4_q21','b4_q35','b4_q39','b4_q43','b4_q44','b4_q46',
  'b4_q52','b4_q57','b4_q58','b4_q60','b4_q61','b4_q63','b4_q66','b4_q68','b4_q70','b4_q71',
  'b4_q72','b4_q75','b4_q76','b4_q77','b4_q78','b4_q87','b4_q90','b4_q92',
  // book5
  'b5_q14','b5_q20','b5_q30','b5_q31','b5_q36','b5_q39','b5_q42','b5_q44','b5_q45','b5_q49',
  'b5_q52','b5_q56','b5_q61','b5_q68','b5_q69','b5_q74','b5_q75','b5_q77','b5_q78','b5_q79',
  'b5_q96','b5_q97',
  // book6
  'b6_q5','b6_q10','b6_q15','b6_q24','b6_q28','b6_q32','b6_q34','b6_q37','b6_q41','b6_q50',
  'b6_q91','b6_q96','b6_q99',
];

// 明确错标 → 正确模型
const RETAG = {
  b3_q4: 'base_mapping', b3_q45: 'unify_sub_diff', b3_q68: 'base_mapping', b3_q81: 'base_mapping',
  b4_q6: 'anchor_diff', b4_q15: 'unify_ratio', b4_q36: 'base_mapping', b4_q37: 'base_mapping',
  b4_q38: 'base_mapping', b4_q41: 'base_mapping', b4_q47: 'unify_ratio', b4_q53: 'anchor_single',
  b4_q67: 'base_mapping', b4_q79: 'unify_ratio', b4_q93: 'anchor_total', b4_q97: 'unify_ratio',
  b4_q99: 'base_mapping',
  b5_q2: 'base_mapping', b5_q12: 'base_mapping', b5_q26: 'base_mapping', b5_q37: 'base_mapping',
  b5_q38: 'unify_ratio', b5_q46: 'anchor_total', b5_q54: 'base_mapping', b5_q57: 'anchor_double',
  b5_q64: 'base_mapping', b5_q81: 'work_rate', b5_q85: 'base_mapping', b5_q89: 'base_mapping',
  b5_q91: 'unify_ratio', b5_q98: 'work_rate',
  b6_q8: 'base_mapping', b6_q9: 'anchor_double', b6_q13: 'base_mapping', b6_q21: 'base_mapping',
  b6_q29: 'base_mapping', b6_q40: 'base_mapping', b6_q42: 'base_mapping', b6_q48: 'anchor_diff',
  b6_q52: 'base_mapping', b6_q62: 'unify_ratio',
};

const file = root + '/data/questions.json';
const qs = JSON.parse(readFileSync(file, 'utf8'));
let g = 0, r = 0;
for (const q of qs) {
  if (GENERIC.includes(q.id)) { q.tag = 'basic'; g++; }
  else if (RETAG[q.id]) { q.tag = RETAG[q.id]; r++; }
}
writeFileSync(file, JSON.stringify(qs));
const dist = {};
for (const q of qs) dist[q.tag] = (dist[q.tag] || 0) + 1;
console.log(`generic→basic: ${g}, retag: ${r}`);
console.log('新分布:', JSON.stringify(dist, null, 0));
