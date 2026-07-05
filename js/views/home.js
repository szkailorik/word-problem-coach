// 首页:今日概览 + 四大母套路地图 + 15 模型卡
import { FAMILIES, METHODS } from '../data.js';
import { totals, tagStats } from '../store.js';
import { esc, famClass } from '../ui.js';

export function renderHome(el) {
  const t = totals();
  const acc = t.total ? Math.round(t.correct / t.total * 100) : 0;

  const familyBlocks = FAMILIES.map(f => {
    const cards = f.ids.map(tag => {
      const m = METHODS[tag];
      const s = tagStats(tag);
      const accT = s.seen ? Math.round(s.correct / s.seen * 100) : null;
      return `
      <div class="model-card ${famClass(f.id)}">
        <a class="model-thumb" href="#/learn/${tag}"><img src="${m.img}" alt="${esc(m.name)}" loading="lazy"></a>
        <div class="model-body">
          <a class="model-name" href="#/learn/${tag}">${esc(m.name)}</a>
          <div class="model-mantra">${esc(m.memory ? m.memory.mantra : '')}</div>
          <div class="model-meta">${s.seen ? `练过 ${s.seen} 题 · 正确率 ${accT}%${s.streak >= 3 ? ` · 🔥连对${s.streak}` : ''}` : '还没练过'}</div>
          <div class="model-actions">
            <a class="btn btn-sm" href="#/learn/${tag}">📖 学</a>
            <a class="btn btn-sm btn-primary" href="#/drill/${tag}">✏️ 练</a>
          </div>
        </div>
      </div>`;
    }).join('');
    return `
    <section class="family ${famClass(f.id)}">
      <div class="family-head">
        <h2>${esc(f.name)}</h2>
        <span class="family-headline">${esc(f.headline)}</span>
      </div>
      <p class="family-line">${esc(f.teacherLine)}</p>
      <div class="model-grid">${cards}</div>
    </section>`;
  }).join('');

  el.innerHTML = `
  <div class="hero">
    <div class="hero-stats">
      <div class="stat"><b>${t.today}</b><span>今日已练</span></div>
      <div class="stat ${t.due ? 'stat-alert' : ''}"><b>${t.due}</b><span>待复习错题</span></div>
      <div class="stat"><b>${t.activeErrors}</b><span>错题在库</span></div>
      <div class="stat"><b>${t.mastered}</b><span>已彻底掌握</span></div>
      <div class="stat"><b>${acc}%</b><span>总正确率</span></div>
    </div>
    <div class="hero-actions">
      <a class="btn btn-big btn-primary" href="#/drill/daily">🚀 每日特训（6 题）</a>
      ${t.due ? `<a class="btn btn-big btn-alert" href="#/drill/review">🔁 错题复习（${t.due} 道到期）</a>` : ''}
      <a class="btn btn-big" href="#/bank">📚 SAP 101 题库</a>
      <a class="btn btn-big" href="#/errors">📕 错题本</a>
    </div>
  </div>
  ${familyBlocks}`;
}
