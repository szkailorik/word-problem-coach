// v1.5 数据合入脚本(幂等):
//   node tests/apply-v15.mjs
// ① data/methods-v2.patch.json → data/methods.json(families 换 v2、新增 9 词条、旧词条字段修正、写入 confusable)
// ② tests/retag-v15.json → data/questions.json(65 道 basic 重归类)
import { readFileSync, writeFileSync } from 'node:fs';

const read = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const write = (f, obj) => writeFileSync(new URL('../' + f, import.meta.url), JSON.stringify(obj, null, 1) + '\n');

// ── ① 词条 ──
const patch = read('data/methods-v2.patch.json');
const md = read('data/methods.json');

md.families = patch.familiesV2;
for (const [id, entry] of Object.entries(patch.methodsNew)) md.methods[id] = entry;
for (const [id, fix] of Object.entries(patch.methodsFix)) {
  if (!md.methods[id]) throw new Error('fix target missing: ' + id);
  Object.assign(md.methods[id], fix);
}
for (const [id, list] of Object.entries(patch.confusable)) {
  if (!md.methods[id]) throw new Error('confusable target missing: ' + id);
  md.methods[id].confusable = list;
}
// 自检:families 引用完整
const famIds = md.families.flatMap(f => f.ids);
for (const id of famIds) if (!md.methods[id]) throw new Error('family id missing in methods: ' + id);
write('data/methods.json', md);
console.log(`methods.json: ${md.families.length} families, ${Object.keys(md.methods).length} methods`);

// ── ② 重归类 ──
const retag = read('tests/retag-v15.json');
const qs = read('data/questions.json');
const qmap = new Map(qs.map(q => [q.id, q]));
let applied = 0, skipped = 0;
for (const c of retag.changes) {
  const q = qmap.get(c.id);
  if (!q) throw new Error('question missing: ' + c.id);
  if (q.tag === c.to) { skipped++; continue; } // 幂等:已应用
  if (q.tag !== 'basic') throw new Error(`${c.id} tag is ${q.tag}, expected basic`);
  if (!md.methods[c.to]) throw new Error('unknown target tag: ' + c.to);
  q.tag = c.to;
  applied++;
}
write('data/questions.json', qs);
const counts = {};
for (const q of qs) counts[q.tag] = (counts[q.tag] || 0) + 1;
console.log(`questions.json: applied ${applied}, already-done ${skipped}; basic 剩 ${counts.basic}, geometry ${counts.geometry || 0}`);
