// 极简断言工具(各 v2.0 测试共用)
let fails = 0;
export function check(name, cond, extra = '') {
  if (!cond) { fails++; console.error('FAIL:', name, extra); }
  else console.log('ok:', name);
}
export function done() {
  if (fails) { console.error(`\n${fails} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
}
