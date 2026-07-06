// 预渲染打印测试页(node tests/build-print-test.mjs <输出路径>)
// 混合最长/中等/最短题干 + 每题一道变式,覆盖分页边界情况
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { generate, GENERATORS } from '../js/gen/generators.js';
import { buildSheetsHTML } from '../js/print-sheet.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUESTIONS = JSON.parse(readFileSync(root + '/data/questions.json', 'utf8'));
const METHODS = JSON.parse(readFileSync(root + '/data/methods.json', 'utf8')).methods;

const sorted = [...QUESTIONS].sort((a, b) => b.zh.length - a.zh.length);
const picks = [sorted[0], sorted[1], sorted[2], sorted[200], sorted[201], sorted[202], sorted.at(-1), sorted.at(-2)];
const items = [];
let n = 0;
for (const q of picks) {
  n++; const orig = n;
  items.push({ num: n, q, kind: 'bank', variantOf: null });
  if (!GENERATORS[q.tag]) continue; // basic 类无变式
  n++;
  items.push({ num: n, q: generate(q.tag, 2, 1000 + n), kind: 'gen', variantOf: orig });
}
const body = buildSheetsHTML(items, { en: true, key: true, work: 'm' }, { student: 'KAI', dateStr: '2026-07-06' }, METHODS);
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>print-test</title>
<link rel="stylesheet" href="file://${root}/css/style.css"></head><body><main>${body}</main></body></html>`;
const out = process.argv[2] || root + '/tests/print-test-static.html';
writeFileSync(out, html);
console.log('written:', out, '| items:', items.length);
