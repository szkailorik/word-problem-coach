// 首页:今日概览 + 快速出题 + 套路掌握地图(四大母套路 × 15 模型)
import { FAMILIES, METHODS, TAG_LIST } from '../data.js';
import { totals, tagStats, weakestTags, nextSeed, ungradedSheetCount, quizStats } from '../store.js';
import { esc, famClass } from '../ui.js';
import { masteryLevel, MASTERY_META, openErrorTagSet } from '../status.js';
import { GENERATORS, generate } from '../gen/generators.js';
import { setCustomPlaylist, levelForTag } from './drill.js';
import { preselectForPrint } from './print.js';

export function renderHome(el) {
  // 快速出题面板状态(留在闭包里,面板内操作只重绘面板)
  const ui = { scope: 'weak', level: 'auto', n: 6 };

  draw();

  function genTags() { return TAG_LIST.filter(t => GENERATORS[t]); }

  function pickTags() {
    if (ui.scope === 'weak') return weakestTags(genTags(), 3);
    if (ui.scope.startsWith('fam:')) {
      const f = FAMILIES.find(x => x.id === ui.scope.slice(4));
      return f ? f.ids.filter(t => GENERATORS[t]) : genTags();
    }
    return [ui.scope.slice(4)];
  }

  function scopeName() {
    if (ui.scope === 'weak') return '薄弱优先';
    if (ui.scope.startsWith('fam:')) return FAMILIES.find(x => x.id === ui.scope.slice(4))?.name || '';
    return (METHODS[ui.scope.slice(4)]?.name || '').replace(/^\d+\.\s*/, '');
  }

  // 上屏刷题和组卷打印共用同一份选题计划,保证两个出口出的题一致
  function pickPlan() {
    const tags = pickTags();
    const plan = [];
    for (let i = 0; i < ui.n; i++) {
      const tag = tags[i % tags.length];
      plan.push({ tag, level: ui.level === 'auto' ? levelForTag(tag) : ui.level });
    }
    return plan;
  }

  function quickPanelHTML() {
    const famChips = FAMILIES.map(f =>
      `<button class="chip ${ui.scope === 'fam:' + f.id ? 'chip-on' : ''}" data-scope="fam:${f.id}">${esc(f.name.replace(/^[一二三四]、\s*/, ''))}</button>`).join('');
    const tagSel = `<select class="select" id="qp-tag">
      <option value="">选单个模型…</option>
      ${genTags().map(t => `<option value="tag:${t}" ${ui.scope === 'tag:' + t ? 'selected' : ''}>${esc(METHODS[t].name)}</option>`).join('')}
    </select>`;
    return `
    <div class="card quick-pick" id="quick-pick">
      <h3>⚡ 快速出题</h3>
      <div class="pc-row">
        <label>范围:</label>
        <button class="chip ${ui.scope === 'weak' ? 'chip-on' : ''}" data-scope="weak">🎯 薄弱优先</button>
        ${famChips}
        ${tagSel}
      </div>
      <div class="pc-row">
        <label>难度:</label>
        ${[['auto', '自适应'], ['1', '⭐'], ['2', '⭐⭐'], ['3', '⭐⭐⭐']].map(([v, n]) =>
          `<button class="chip ${String(ui.level) === v ? 'chip-on' : ''}" data-level="${v}">${n}</button>`).join('')}
        <label style="margin-left:10px">数量:</label>
        ${[4, 6, 8, 10].map(n => `<button class="chip ${ui.n === n ? 'chip-on' : ''}" data-n="${n}">${n}</button>`).join('')}
      </div>
      <div class="pc-row">
        <button class="btn btn-primary" id="qp-drill">▶ 上屏刷题</button>
        <button class="btn" id="qp-print">🖨 组卷打印</button>
        <span class="sec-sub">${esc(scopeName())} · ${ui.n} 题</span>
      </div>
    </div>`;
  }

  function bindQuickPanel() {
    const qp = el.querySelector('#quick-pick');
    qp.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { ui.scope = b.dataset.scope; redrawPanel(); }));
    qp.querySelector('#qp-tag').addEventListener('change', e => { if (e.target.value) { ui.scope = e.target.value; redrawPanel(); } });
    qp.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => { ui.level = b.dataset.level === 'auto' ? 'auto' : Number(b.dataset.level); redrawPanel(); }));
    qp.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { ui.n = Number(b.dataset.n); redrawPanel(); }));
    qp.querySelector('#qp-drill').addEventListener('click', () => {
      const items = pickPlan().map(({ tag, level }) => ({ kind: 'gen', tag, level, seed: nextSeed(tag) }));
      setCustomPlaylist(items, `⚡ 快速训练 · ${scopeName()}`);
      location.hash = '#/drill/custom';
    });
    qp.querySelector('#qp-print').addEventListener('click', () => {
      const ids = pickPlan().map(({ tag, level }) => generate(tag, level, nextSeed(tag)).id);
      preselectForPrint(ids, `快速出题卷·${scopeName()}`);
      location.hash = '#/print';
    });
  }

  function redrawPanel() {
    el.querySelector('#quick-pick').outerHTML = quickPanelHTML();
    bindQuickPanel();
  }

  function draw() {
    const t = totals();
    const acc = t.total ? Math.round(t.correct / t.total * 100) : 0;
    const pendingSheets = ungradedSheetCount();

    const openTags = openErrorTagSet(); // 一次扫描,全页共用
    const qs = quizStats();
    const familyBlocks = FAMILIES.map(f => {
      const levels = f.ids.map(tag => masteryLevel(tag, openTags));
      const pct = Math.round(levels.reduce((a, b) => a + b, 0) / (levels.length * 3) * 100);
      const skilled = levels.filter(l => l >= 2).length;
      const cards = f.ids.map((tag, i) => {
        const m = METHODS[tag];
        const s = tagStats(tag);
        const lv = levels[i];
        const accT = s.seen ? Math.round(s.correct / s.seen * 100) : null;
        const qz = qs[tag];
        return `
        <div class="model-card ${famClass(f.id)}">
          <span class="m-lv m-lv-${lv}" title="${MASTERY_META[lv].name}">${MASTERY_META[lv].icon} ${MASTERY_META[lv].name}</span>
          <a class="model-thumb" href="#/learn/${tag}">${m.img
            ? `<img src="${m.img}" alt="${esc(m.name)}" loading="lazy">`
            : `<span class="thumb-emoji">${esc(m.memory?.emoji || '🧩')}</span>`}</a>
          <div class="model-body">
            <a class="model-name" href="#/learn/${tag}">${esc(m.name)}</a>
            <div class="model-mantra">${esc(m.memory ? m.memory.mantra : '')}</div>
            <div class="model-meta">${s.seen ? `练过 ${s.seen} 题 · 正确率 ${accT}%${s.streak >= 3 ? ` · 🔥连对${s.streak}` : ''}` : '还没练过'}${qz ? ` · 辨题 ${Math.round(qz.correct / qz.seen * 100)}%` : ''}</div>
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
          <span class="fam-progress" title="套路掌握度"><i style="width:${pct}%"></i></span>
          <span class="fam-skilled">${skilled}/${f.ids.length} 已熟练</span>
        </div>
        <p class="family-line">${esc(f.teacherLine)}</p>
        <div class="model-grid">${cards}</div>
      </section>`;
    }).join('');

    // 题库直练分类(基础综合 / 图形与度量):无生成器,一行入口
    const HEADLINES = { basic: '纯计算、单位换算……看清问句按步就班', geometry: '周长、面积、体积……先认图形再选公式' };
    const basicBlock = ['basic', 'geometry'].filter(t => METHODS[t]).map(t => {
      const lv = masteryLevel(t, openTags);
      const s = tagStats(t);
      return `
    <section class="family">
      <div class="family-head">
        <h2>${esc(METHODS[t].name)}</h2>
        <span class="family-headline">${HEADLINES[t]}</span>
        <span class="m-lv m-lv-${lv}" style="position:static">${MASTERY_META[lv].icon} ${MASTERY_META[lv].name}</span>
        <span class="fam-skilled">${s.seen ? `练过 ${s.seen} 题` : '还没练过'}</span>
        <a class="btn btn-sm btn-primary" href="#/bank?tag=${t}">📚 去题库练</a>
      </div>
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
        ${pendingSheets ? `<a class="btn btn-big btn-alert" href="#/grade">📝 批改（${pendingSheets} 张卷待批）</a>` : ''}
        <a class="btn btn-big" href="#/quiz">🧠 辨题快闪</a>
        <a class="btn btn-big" href="#/bank">📚 SAP 101 题库</a>
        <a class="btn btn-big" href="#/errors">📕 错题本</a>
        <a class="btn btn-big" href="#/log">📅 训练档案</a>
        <a class="btn btn-big" href="#/print">🖨 打印中心</a>
        ${pendingSheets ? '' : '<a class="btn btn-big" href="#/grade">📝 批改中心</a>'}
      </div>
    </div>
    ${quickPanelHTML()}
    ${familyBlocks}
    ${basicBlock}`;

    bindQuickPanel();
  }
}
