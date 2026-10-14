// 四则求值器:node tests/expr.test.mjs
import { evalExpr, nearlyEqual } from '../js/ai/expr.js';
import { check, done } from './_check.mjs';

const ok = [
  ['(120-30)÷3', 30], ['3×(4+5)', 27], ['-2+5', 3], ['30%*200', 60], ['1/3*3', 1],
  ['（48 + 12）× 2', 120], ['1,200 ÷ 4', 300], ['2.5*4', 10], ['10 − 3 − 2', 5], ['2*-3', -6], ['8/2/2', 2],
  ['3 x 4', 12], ['((2))', 2],
];
for (const [e, v] of ok) {
  let got;
  try { got = evalExpr(e); } catch (err) { got = 'ERR ' + err.message; }
  check(`${e} = ${v}`, typeof got === 'number' && nearlyEqual(got, v), String(got));
}
const bad = ['', '2*(3', 'alert(1)', '2+', '1/0', '2**3', 'Math.max(1,2)', '3 4', '1..2', 'a+1', '9'.repeat(201)];
for (const e of bad) {
  let threw = false;
  try { evalExpr(e); } catch (err) { threw = true; }
  check(`非法表达式被拒:${e.slice(0, 20)}`, threw);
}
check('nearlyEqual 浮点', nearlyEqual(0.1 + 0.2, 0.3) && !nearlyEqual(1, 1.01));
done();
