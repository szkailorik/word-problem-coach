// 小工具:HTML 转义、题干双语渲染、通用组件
import { state } from './store.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 按语言设置渲染题干
export function stemHTML(q) {
  const zh = `<p class="stem-zh">${esc(q.zh)}</p>`;
  const en = `<p class="stem-en">${esc(q.en)}</p>`;
  if (state.lang === 'zh') return zh;
  if (state.lang === 'en') return en;
  return zh + en;
}

export function stepsHTML(steps) {
  return steps.map((s, i) => `
    <div class="step">
      <span class="step-num">${i + 1}</span>
      <div><b>${esc(s.label)}</b><br>${esc(s.text)}</div>
    </div>`).join('');
}

export function famClass(famId) {
  return { invariant: 'fam-invariant', unitize: 'fam-unitize', gap: 'fam-gap', process: 'fam-process' }[famId] || '';
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function boxDots(box, total, mastered) {
  let s = '';
  for (let i = 0; i < total; i++) s += `<span class="dot ${i < box || mastered ? 'on' : ''}"></span>`;
  return `<span class="box-dots" title="复习进度">${s}</span>`;
}
