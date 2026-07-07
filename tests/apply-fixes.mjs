// 应用 2026-07-07 讲解补全 + 缺图标记(4 个解题 agent 结果,人工抽查验算后合入)
// 用法:node tests/apply-fixes.mjs <fix-json 目录>
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixDir = process.argv[2];
if (!fixDir) { console.error('用法:node tests/apply-fixes.mjs <fix-json 目录>'); process.exit(1); }

const qs = JSON.parse(readFileSync(root + '/data/questions.json', 'utf8'));
const map = new Map(qs.map(q => [q.id, q]));

// 题干/EN 明确引用图表的题(正则扫描,人工过目)
const FIGURE_IDS = [
  'b3_q87','b3_q88','b3_q90','b3_q91','b3_q92','b3_q94','b4_q101','b5_q40','b5_q55',
  'b5_q36','b5_q43','b5_q44','b5_q60','b5_q68','b6_q39','b6_q50','b6_q96',
];

let steps = 0, figs = 0, stems = 0, models = 0;
const warns = [];

for (const f of readdirSync(fixDir).filter(x => /^fix-.*\.json$/.test(x))) {
  const fixes = JSON.parse(readFileSync(fixDir + '/' + f, 'utf8'));
  for (const fx of fixes) {
    const q = map.get(fx.id);
    if (!q) { warns.push('未找到 ' + fx.id); continue; }
    if (fx.needsFigure) { q.needsFigure = true; figs++; }
    if (fx.steps) { q.steps = fx.steps; steps++; }
    if (fx.finalAnswer) { q.model = { text: fx.finalAnswer }; models++; }
    else if (fx.fixModel) { q.model = { text: fx.fixModel }; models++; }
    if (fx.newZh) { q.zh = fx.newZh; stems++; }
    if (fx.newEn) { q.en = fx.newEn; }
    if (fx.fixZh) {
      if (q.zh.includes(fx.fixZh[0])) { q.zh = q.zh.split(fx.fixZh[0]).join(fx.fixZh[1]); stems++; }
      else warns.push(`${fx.id}: zh 中找不到 "${fx.fixZh[0]}"`);
    }
    if (fx.fixEn) {
      if (q.en.includes(fx.fixEn[0])) { q.en = q.en.split(fx.fixEn[0]).join(fx.fixEn[1]); }
      else warns.push(`${fx.id}: en 中找不到 "${fx.fixEn[0]}"`);
    }
  }
}

for (const id of FIGURE_IDS) {
  const q = map.get(id);
  if (q && !q.needsFigure) { q.needsFigure = true; figs++; }
}

writeFileSync(root + '/data/questions.json', JSON.stringify(qs));
const remainingStubs = qs.filter(q => /按原书|原书标答|依原书|参考原书/.test((q.steps || []).map(s => s.label + s.text).join(' ')));
console.log(`讲解替换 ${steps} 道 · 缺图标记 ${figs} 道 · 题干修正 ${stems} 处 · 答案卡更新 ${models} 处`);
console.log('剩余占位符讲解:', remainingStubs.length, remainingStubs.map(q => q.id).join(','));
if (warns.length) { console.log('警告:'); warns.forEach(w => console.log(' -', w)); }
