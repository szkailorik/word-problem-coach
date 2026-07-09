// classic-a 生成器压力测试:node tests/classic-a.test.mjs
// 4 个 tag × 3 难度 × 400 种子全量生成,校验:不抛错、答案正整数、中英题干非空、steps≥3;
// 另外每个 tag 每档难度抽 3 题,按"题面里的数字"独立重算答案核对(不复读生成器内部逻辑)。

import { CLASSIC_A } from '../js/gen/classic-a.js';
import { Rng } from '../js/gen/engine.js';

// 模仿 generators.js 的 generate():同一 seed 失败则内部 seed+1 重试,至多 25 次
function generate(tag, level, seed) {
  const fn = CLASSIC_A[tag];
  if (!fn) throw new Error('unknown tag: ' + tag);
  for (let s = seed, i = 0; i < 25; s++, i++) {
    try {
      const r = new Rng(s * 2654435761 + level * 97);
      const question = fn(r, level, s);
      question.id = `g_${tag}_${level}_${seed}`;
      return question;
    } catch (e) { /* try next internal seed */ }
  }
  throw new Error('generation failed for ' + tag + ' L' + level + ' seed ' + seed);
}

// ---------- 独立解题器:只看中文题面里的数字与关键词,按题型重新解题 ----------
function resolveFromText(question) {
  const zh = question.zh;
  const nums = (zh.match(/\d+/g) || []).map(Number);
  const firstName = /^(\w+)/.exec(zh)?.[1];

  switch (question.tag) {
    case 'sum_diff': {
      if (question.level === 1) {
        const [S, D] = nums;
        const asked = /。(\w+) 有多少/.exec(zh)[1];
        return asked === firstName ? (S + D) / 2 : (S - D) / 2;
      }
      if (question.level === 2) {
        const [S, D1, D2] = nums; // 乙比甲少 D1,丙比甲多 D2
        return (S + D1 - D2) / 3;
      }
      const [S, k, m] = nums;     // 给 k 后还多 m → 原差 = m + 2k
      const D = m + 2 * k;
      const asked = /。(\w+) 原来有多少/.exec(zh)[1];
      return asked === firstName ? (S + D) / 2 : (S - D) / 2;
    }
    case 'ratio_units': {
      if (question.level === 1) {
        const [n, S] = nums;
        const u = S / (n + 1);
        const asked = /。(\w+) 有多少/.exec(zh)[1];
        return asked === firstName ? n * u : u;
      }
      if (question.level === 2) {
        const [n, D] = nums;
        const u = D / (n - 1);
        const asked = /。(\w+) 有多少/.exec(zh)[1];
        return asked === firstName ? n * u : u;
      }
      const [n, m, X] = nums;     // 甲 = n×乙 ± m,X 是和或差,问乙
      const plus = zh.includes('倍多');
      const trimmed = plus ? X - m : X + m;
      return zh.includes('一共') ? trimmed / (n + 1) : trimmed / (n - 1);
    }
    case 'unit_rate': {
      if (question.level === 1) {
        const [a, b, c, d, e] = nums;
        return (c / a / b) * d * e;
      }
      if (question.level === 2) {
        const [x, y, z] = nums;
        return (x * y) / z;
      }
      const [a, b, c, t, W] = nums;
      return W / (t * (c / a / b));
    }
    case 'average': {
      if (question.level === 1) {
        if (zh.includes('平均每次')) {
          const [s1, s2, s3] = nums;
          return (s1 + s2 + s3) / 3;
        }
        const [avg, cnt] = nums;
        return avg * cnt;
      }
      if (question.level === 2) {
        const n = nums[0], a = nums[1], b = nums[3]; // nums[2] 是题面里的 n+1
        return (n + 1) * b - n * a;
      }
      if (zh.includes('全班')) {
        const [n1, a1, n2, a2] = nums;
        return (n1 * a1 + n2 * a2) / (n1 + n2);
      }
      const [aa, kk, bb] = nums;  // 人均 aa → 来 kk 人 → 人均 bb
      return (kk * bb) / (aa - bb);
    }
  }
  throw new Error('no resolver for ' + question.tag);
}

// ---------- 1) 全量生成校验 ----------
const tags = Object.keys(CLASSIC_A);
let total = 0, failed = 0;

for (const tag of tags) {
  for (let level = 1; level <= 3; level++) {
    for (let seed = 1; seed <= 400; seed++) {
      total++;
      try {
        const q1 = generate(tag, level, seed);
        if (!Number.isInteger(q1.answer.value) || q1.answer.value <= 0) {
          throw new Error('answer not positive integer: ' + q1.answer.value);
        }
        if (!q1.zh || !q1.en || !q1.hint1 || !q1.hint2 || !q1.answer.sentence) {
          throw new Error('missing text fields');
        }
        if (q1.steps.length < 3) throw new Error('steps < 3');
        if (/undefined|NaN|\$\{/.test(q1.zh + q1.en + JSON.stringify(q1.steps))) {
          throw new Error('template residue: ' + q1.zh.slice(0, 80));
        }
        // 可复现性:同一 id 再生成一次应完全一致
        const q2 = generate(tag, level, seed);
        if (JSON.stringify(q1) !== JSON.stringify(q2)) throw new Error('not reproducible');
        // 独立重算(全量顺带做,比抽样更严)
        const solved = resolveFromText(q1);
        if (solved !== q1.answer.value) {
          throw new Error(`independent re-solve mismatch: got ${solved}, expected ${q1.answer.value} | ${q1.zh}`);
        }
      } catch (e) {
        failed++;
        if (failed <= 20) console.error(`FAIL ${tag} L${level} seed=${seed}: ${e.message}`);
      }
    }
  }
}

console.log(`\n[全量] ${total} generated, ${failed} failed`);

// ---------- 2) 每个 tag 每档难度抽 3 题,展示独立重算核对 ----------
const SAMPLE_SEEDS = [7, 123, 321];
let sampleChecks = 0, sampleFails = 0;
for (const tag of tags) {
  for (let level = 1; level <= 3; level++) {
    for (const seed of SAMPLE_SEEDS) {
      sampleChecks++;
      const question = generate(tag, level, seed);
      const solved = resolveFromText(question);
      const ok = solved === question.answer.value;
      if (!ok) sampleFails++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${tag} L${level} seed=${seed} 独立重算=${solved} 生成答案=${question.answer.value}`);
    }
  }
}
console.log(`\n[抽样重算] ${sampleChecks} checked, ${sampleFails} failed`);

// ---------- 3) 每个 tag 打印一道样题供人工过目 ----------
for (const tag of tags) {
  const s = generate(tag, 2, 1);
  console.log(`\n—— ${tag} ——`);
  console.log('题:', s.zh);
  console.log('EN:', s.en);
  console.log('答:', s.answer.value, s.answer.sentence);
  console.log('步:', s.steps.map(x => `[${x.label}] ${x.text}`).join(' | '));
}

const bad = failed + sampleFails;
console.log(bad ? `\n✗ ${bad} failures` : '\n✓ all green');
process.exit(bad ? 1 : 0);
