// 生成器压力测试:node tests/gen.test.mjs
// 每个模型 × 3 难度 × 400 种子,校验答案为正整数、可复现、文案无模板残留。

import { GENERATORS, generate, regenerate } from '../js/gen/generators.js';

const tags = Object.keys(GENERATORS);
let total = 0, failed = 0;
const samples = {};

for (const tag of tags) {
  for (let level = 1; level <= 3; level++) {
    for (let seed = 1; seed <= 400; seed++) {
      total++;
      try {
        const q1 = generate(tag, level, seed);
        // 基本合法性(q() 内部已断言整数/正数/步骤数)
        if (!q1.zh || !q1.en || !q1.hint1 || !q1.hint2) throw new Error('missing text fields');
        if (/undefined|NaN|\$\{/.test(q1.zh + q1.en + JSON.stringify(q1.steps))) {
          throw new Error('template residue: ' + q1.zh.slice(0, 80));
        }
        if (!q1.answer.sentence) throw new Error('missing answer sentence');
        // 可复现性
        const q2 = regenerate(q1.id);
        if (JSON.stringify(q1) !== JSON.stringify(q2)) throw new Error('not reproducible');
        if (seed === 1 && level === 2) samples[tag] = q1;
      } catch (e) {
        failed++;
        if (failed <= 20) console.error(`FAIL ${tag} L${level} seed=${seed}: ${e.message}`);
      }
    }
  }
}

console.log(`\n${total} generated, ${failed} failed`);
// 抽样人工检查每个模型一道题
for (const tag of tags) {
  const s = samples[tag];
  console.log(`\n—— ${tag} ——`);
  console.log('题:', s.zh);
  console.log('EN:', s.en);
  console.log('答:', s.answer.value, s.answer.sentence);
  console.log('步:', s.steps.map(x => `[${x.label}] ${x.text}`).join(' | '));
}
process.exit(failed ? 1 : 0);
