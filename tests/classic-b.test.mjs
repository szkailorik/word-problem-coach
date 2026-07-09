// B 组生成器压力测试:node tests/classic-b.test.mjs
// 4 tag × 3 难度 × 400 种子,校验答案为正整数、双语非空、steps≥3、可复现、无模板残留;
// 并对每一道题按题面文字独立重算答案(周期题重点验余数边界、植树题重点验 ±1)。

import { CLASSIC_B } from '../js/gen/classic-b.js';
import { Rng } from '../js/gen/engine.js';

// 重试逻辑仿 generators.js 的 generate():内部 seed+1,至多 25 次
function generateB(tag, level, seed) {
  const fn = CLASSIC_B[tag];
  if (!fn) throw new Error('unknown tag: ' + tag);
  for (let s = seed, i = 0; i < 25; s++, i++) {
    try {
      const r = new Rng(s * 2654435761 + level * 97);
      const question = fn(r, level, s);
      question.id = `g_${tag}_${level}_${seed}`;
      return question;
    } catch (e) { /* try next internal seed */ }
  }
  throw new Error('generation failed for ' + tag + ' seed ' + seed);
}

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
function lcm(a, b) { return a / gcd(a, b) * b; }

const DISC_PCT = { '九折': 90, '八折': 80, '七五折': 75, '五折': 50 };
const ZHDAY = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7 };

// —— 按题面文字独立重算答案(与生成器内部公式无关的"人肉验算"自动化版) ——
// 返回 number(期望答案)或 null(模板不认识 → 视为失败)
function recompute(tag, zh) {
  let m;
  const num = (x) => Number(x);

  if (tag === 'age_diff') {
    // L3:年龄和 S,k 年后 n 倍 → (S+2k)/(n+1) − k
    if ((m = zh.match(/年龄和是 (\d+) 岁。(\d+) 年后，(?:爸爸|妈妈)的年龄正好是 .+? 的 (\d+) 倍/))) {
      const S = num(m[1]), k = num(m[2]), n = num(m[3]);
      const then = S + 2 * k;
      if (then % (n + 1) !== 0) return null;
      return then / (n + 1) - k;
    }
    if ((m = zh.match(/今年 (\d+) 岁，(?:爸爸|妈妈)今年 (\d+) 岁。多少年后，(?:爸爸|妈妈)的年龄正好是 .+? 的 (\d+) 倍/))) {
      const c = num(m[1]), d = num(m[2]), n = num(m[3]);
      const diff = d - c;
      if (diff % (n - 1) !== 0) return null;
      return diff / (n - 1) - c;   // 未来孩子年龄 − 现在孩子年龄
    }
    if ((m = zh.match(/今年 (\d+) 岁，(?:爸爸|妈妈)今年 (\d+) 岁。多少年前，(?:爸爸|妈妈)的年龄正好是 .+? 的 (\d+) 倍/))) {
      const c = num(m[1]), d = num(m[2]), n = num(m[3]);
      const diff = d - c;
      if (diff % (n - 1) !== 0) return null;
      return c - diff / (n - 1);
    }
    if ((m = zh.match(/今年 (\d+) 岁，(?:爸爸|妈妈)今年 (\d+) 岁。当(?:爸爸|妈妈)的年龄正好是 .+? 的 (\d+) 倍时/))) {
      const c = num(m[1]), d = num(m[2]), n = num(m[3]);
      const diff = d - c;
      if (diff % (n - 1) !== 0) return null;
      return diff / (n - 1);
    }
    return null;
  }

  if (tag === 'profit_discount') {
    // L3 逆向:加价 p% 打 d 折赚 R 元 → C = R / ((1+p%)·d% − 1)
    if ((m = zh.match(/按成本加价 (\d+)% 定价，再按定价打(九折|八折|七五折|五折)卖出，结果赚了 (\d+) 元/))) {
      const p = num(m[1]), pct = DISC_PCT[m[2]], R = num(m[3]);
      const ratePermille = (100 + p) * pct / 10; // 千分数,避免浮点
      const marginPermille = ratePermille - 1000;
      if (marginPermille <= 0 || (R * 1000) % marginPermille !== 0) return null;
      return R * 1000 / marginPermille;
    }
    // L2 先加价再打折求利润
    if ((m = zh.match(/成本是 (\d+) 元，商店先按成本加价 (\d+)% 定价，再按定价打(九折|八折|七五折|五折)出售/))) {
      const C = num(m[1]), p = num(m[2]), pct = DISC_PCT[m[3]];
      const marked = C * (100 + p) / 100;
      const sale = marked * pct / 100;
      if (!Number.isInteger(marked) || !Number.isInteger(sale)) return null;
      return sale - C;
    }
    // L1a 成本加价求定价
    if ((m = zh.match(/成本 (\d+) 元，按成本加价 (\d+)% 定价。这/))) {
      const C = num(m[1]), p = num(m[2]);
      const marked = C * (100 + p) / 100;
      return Number.isInteger(marked) ? marked : null;
    }
    // L1b 定价打折求现价
    if ((m = zh.match(/定价 (\d+) 元，现在打(九折|八折|七五折|五折)出售/))) {
      const P = num(m[1]), pct = DISC_PCT[m[2]];
      const sale = P * pct / 100;
      return Number.isInteger(sale) ? sale : null;
    }
    return null;
  }

  if (tag === 'interval') {
    // L1a 两端都栽求棵数:+1
    if ((m = zh.match(/小路长 (\d+) 米，在路的一侧从一端到另一端每隔 (\d+) 米栽一棵树，两端都要栽/))) {
      const L = num(m[1]), d = num(m[2]);
      return L % d === 0 ? L / d + 1 : null;
    }
    // L1b 反问路长
    if ((m = zh.match(/每隔 (\d+) 米栽一棵树，两端都栽，一共栽了 (\d+) 棵。这条小路长多少米/))) {
      const d = num(m[1]), T = num(m[2]);
      return d * (T - 1);
    }
    // L1c 反问间隔
    if ((m = zh.match(/小路长 (\d+) 米，在路的一侧从一端到另一端等距离栽了 (\d+) 棵树（两端都栽）/))) {
      const L = num(m[1]), T = num(m[2]);
      return L % (T - 1) === 0 ? L / (T - 1) : null;
    }
    // L2 一端栽一端不栽:不加不减
    if ((m = zh.match(/走廊长 (\d+) 米，从一端到另一端每隔 (\d+) 米放一盆花，一端放、另一端不放/))) {
      const L = num(m[1]), d = num(m[2]);
      return L % d === 0 ? L / d : null;
    }
    // L2 两端都不栽:−1
    if ((m = zh.match(/相距 (\d+) 米，在两楼之间每隔 (\d+) 米栽一棵树，紧挨两楼的两端都不栽/))) {
      const L = num(m[1]), d = num(m[2]);
      return L % d === 0 ? L / d - 1 : null;
    }
    // L2 锯木头:m 段锯 m−1 次
    if ((m = zh.match(/锯成 (\d+) 段，每锯一次要用 (\d+) 分钟/))) {
      return (num(m[1]) - 1) * num(m[2]);
    }
    // L2 敲钟:n 下 n−1 个间隔
    if ((m = zh.match(/一共敲 (\d+) 下，相邻两下之间间隔 (\d+) 秒/))) {
      return (num(m[1]) - 1) * num(m[2]);
    }
    // L3 环形:棵数 = 段数,复合算花费
    if ((m = zh.match(/一圈长 (\d+) 米，沿着边每隔 (\d+) 米栽一棵树，每棵树苗 (\d+) 元/))) {
      const L = num(m[1]), d = num(m[2]), c = num(m[3]);
      return L % d === 0 ? (L / d) * c : null;
    }
    // L3 爬楼梯:1 到 a 楼走 a−1 层
    if ((m = zh.match(/从 1 楼走到 (\d+) 楼一共用了 (\d+) 秒。照这样的速度，.+? 从 1 楼走到 (\d+) 楼/))) {
      const a = num(m[1]), T = num(m[2]), b = num(m[3]);
      if (T % (a - 1) !== 0) return null;
      return (T / (a - 1)) * (b - 1);
    }
    return null;
  }

  if (tag === 'cycle') {
    // L1 前 N 个里某颜色几个
    if ((m = zh.match(/按“(.+?)”的顺序不断循环摆.+?。前 (\d+) .里一共有多少.(.)色/))) {
      const seq = m[1].split('、');
      const N = num(m[2]), color = m[3];
      const len = seq.length;
      const full = Math.floor(N / len), rem = N % len;
      const cIn = seq.filter(x => x === color).length;
      const inRem = seq.slice(0, rem).filter(x => x === color).length;
      return full * cIn + inRem;
    }
    // L2 位置:第 N 个是组里第几个(余 0 → 组尾)
    if ((m = zh.match(/按“(.+?)”的顺序不断循环摆.+?。第 (\d+) .+?是一组中的第几个/))) {
      const len = m[1].split('、').length;
      const N = num(m[2]);
      const rem = N % len;
      return rem === 0 ? len : rem;
    }
    // L2 星期:今天星期 x,再过 N 天
    if ((m = zh.match(/^今天是星期(.)。再过 (\d+) 天是星期几/))) {
      const x = ZHDAY[m[1]], N = num(m[2]);
      return ((x - 1 + N) % 7) + 1;
    }
    // L3 lcm 叠加
    if ((m = zh.match(/每 (\d+) 秒闪一次，音乐盒每 (\d+) 秒响一次/))) {
      return lcm(num(m[1]), num(m[2]));
    }
    // L3 跨月推星期(题面自带本月天数)
    if ((m = zh.match(/^(\d+) 月 (\d+) 日是星期(.)。同一年 (\d+) 月 (\d+) 日是星期几.+?已知 (\d+) 月有 (\d+) 天/))) {
      const mo = num(m[1]), day1 = num(m[2]), x = ZHDAY[m[3]];
      const mo2 = num(m[4]), day2 = num(m[5]), dimMo = num(m[6]), dim = num(m[7]);
      if (mo2 !== mo + 1 || dimMo !== mo) return null;
      const N = dim - day1 + day2;
      return ((x - 1 + N) % 7) + 1;
    }
    return null;
  }
  return null;
}

// —— 主循环 ——
const tags = Object.keys(CLASSIC_B);
let total = 0, failed = 0;
const samples = {};   // 每 tag 每级抽 3 题打印,供人工复查

for (const tag of tags) {
  for (let level = 1; level <= 3; level++) {
    for (let seed = 1; seed <= 400; seed++) {
      total++;
      try {
        const q1 = generateB(tag, level, seed);
        // 基本合法性(q() 内部已断言整数/正数;这里再显式验一遍)
        if (!Number.isInteger(q1.answer.value) || q1.answer.value <= 0) throw new Error('answer not positive int: ' + q1.answer.value);
        if (!q1.zh || !q1.en || !q1.hint1 || !q1.hint2) throw new Error('missing text fields');
        if (!q1.answer.sentence) throw new Error('missing answer sentence');
        if (!Array.isArray(q1.steps) || q1.steps.length < 3) throw new Error('need >= 3 steps, got ' + q1.steps.length);
        if (q1.steps[q1.steps.length - 1].label !== '验一验') throw new Error('last step must be 验一验');
        if (/undefined|NaN|\$\{/.test(q1.zh + q1.en + JSON.stringify(q1.steps))) {
          throw new Error('template residue: ' + q1.zh.slice(0, 80));
        }
        // 可复现性
        const q2 = generateB(tag, level, seed);
        if (JSON.stringify(q1) !== JSON.stringify(q2)) throw new Error('not reproducible');
        // 独立重算:按题面文字重新算一遍答案
        const expect = recompute(tag, q1.zh);
        if (expect === null) throw new Error('template not recognized by checker: ' + q1.zh.slice(0, 60));
        if (expect !== q1.answer.value) throw new Error(`recompute mismatch: expect ${expect}, got ${q1.answer.value} | ${q1.zh}`);
        // 周期题:星期/位置答案必须落在合法区间(余数边界)
        if (tag === 'cycle' && /星期几/.test(q1.zh) && (q1.answer.value < 1 || q1.answer.value > 7)) {
          throw new Error('weekday out of 1~7: ' + q1.answer.value);
        }
        const key = `${tag}_${level}`;
        if (!samples[key]) samples[key] = [];
        if (samples[key].length < 3 && seed % 37 === 1) samples[key].push(q1);  // 抽 seed 1/38/75...前 3 题
      } catch (e) {
        failed++;
        if (failed <= 20) console.error(`FAIL ${tag} L${level} seed=${seed}: ${e.message}`);
      }
    }
  }
}

console.log(`\n${total} generated, ${failed} failed`);

// 抽样打印:每 tag 每级 3 题,人工复查题面与步骤
for (const tag of tags) {
  for (let level = 1; level <= 3; level++) {
    const list = samples[`${tag}_${level}`] || [];
    for (const s of list) {
      console.log(`\n—— ${tag} L${level} (${s.id}) ——`);
      console.log('题:', s.zh);
      console.log('EN:', s.en);
      console.log('答:', s.answer.value, s.answer.unit, '|', s.answer.sentence);
      console.log('步:', s.steps.map(x => `[${x.label}] ${x.text}`).join(' | '));
    }
  }
}
process.exit(failed ? 1 : 0);
