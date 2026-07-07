// 打印中心:筛选/勾选题目 → 每题可附同类变式 → A4 卷面 + 答案页
// 屏幕上的纸面预览和打印输出完全一致(@media print 只隐藏控制区)。
import { QUESTIONS, QMAP, METHODS, TAG_LIST } from '../data.js';
import { generate, regenerate, GENERATORS } from '../gen/generators.js';
import { esc } from '../ui.js';
import { state, profile, nextSeed, dueErrors, weakestTags } from '../store.js';
import { statusMap, statusIcon, STATUS_META } from '../status.js';
import { buildSheetsHTML, todayStr } from '../print-sheet.js';

const BANKS = [
  { id: 'all', name: '全部册' }, { id: 'core', name: 'Core' },
  { id: 'book3', name: 'Book 3' }, { id: 'book4', name: 'Book 4' },
  { id: 'book5', name: 'Book 5' }, { id: 'book6', name: 'Book 6' },
];
const BANK_LEVEL = { core: 1, book3: 1, book4: 2, book5: 2, book6: 3 };

// 选择集跨渲染保留(切页面后清空)
let selected = new Map(); // key(qid) -> { kind:'bank'|'gen', q, level }

export function renderPrint(el) {
  const ui = { bank: 'all', tag: '', st: 'all', genTag: TAG_LIST[0], genLevel: 1, genN: 3, hideFigure: true };
  const opts = { en: true, key: true, work: 'm', variants: 0 };

  draw();

  function filtered() {
    const sm = statusMap();
    return QUESTIONS.filter(q =>
      (ui.bank === 'all' || q.bank === ui.bank) &&
      (!ui.tag || q.tag === ui.tag) &&
      (!ui.hideFigure || !q.needsFigure) &&
      (ui.st === 'all' || (ui.st === 'none' ? !sm[q.id] : sm[q.id] === ui.st)));
  }

  function draw() {
    const sm = statusMap();
    const list = filtered();
    const modelOpts = t => ['', ...TAG_LIST].map(x =>
      `<option value="${x}" ${t === x ? 'selected' : ''}>${x ? esc(METHODS[x].name) : '全部模型'}</option>`).join('');

    el.innerHTML = `
    <div class="print-view">
      <div class="no-print">
        <a class="crumb" href="#/">← 返回首页</a>
        <h1>🖨 打印中心</h1>
        <p class="paper-note">勾选想打的题(或直接生成新题),可为每道题自动附上同类变式;下面的纸面预览就是打印效果。</p>

        <div class="card" style="margin-bottom:14px">
          <h3 style="margin-bottom:8px">⚡ 一键组卷</h3>
          <div class="model-actions">
            <button class="btn" id="preset-daily">📅 今日特训卷(6 道薄弱模型新题)</button>
            <button class="btn" id="preset-due">🔁 到期错题卷(原题 + 每题 2 变式)</button>
            <button class="btn" id="preset-model">🎯 模型专项卷(下方所选模型 10 道)</button>
          </div>
        </div>

        <div class="card print-controls">
          <div class="pc-row">
            <label>从题库选:</label>
            <select class="select" id="f-bank">${BANKS.map(b => `<option value="${b.id}" ${ui.bank === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}</select>
            <select class="select" id="f-tag">${modelOpts(ui.tag)}</select>
            <select class="select" id="f-st">
              <option value="all" ${ui.st === 'all' ? 'selected' : ''}>全部状态</option>
              <option value="none" ${ui.st === 'none' ? 'selected' : ''}>⚪ 未做</option>
              <option value="train" ${ui.st === 'train' ? 'selected' : ''}>🔴 还要训练</option>
              <option value="right" ${ui.st === 'right' ? 'selected' : ''}>✅ 做对了</option>
              <option value="master" ${ui.st === 'master' ? 'selected' : ''}>🏆 已掌握</option>
            </select>
            <button class="btn btn-sm" id="sel-all">全选筛出的 ${list.length} 道</button>
            <button class="btn btn-sm btn-ghost" id="sel-clear">清空已选</button>
            <label style="font-weight:500"><input type="checkbox" id="f-fig" ${ui.hideFigure ? 'checked' : ''}> 排除需配图的题 🖼</label>
          </div>
          <div class="pc-list">
            ${list.map(q => `
              <label class="pc-item">
                <input type="checkbox" data-q="${q.id}" ${selected.has(q.id) ? 'checked' : ''}>
                <span class="st">${statusIcon(sm[q.id])}</span>
                <span>${q.needsFigure ? '🖼 ' : ''}${esc(q.zh.slice(0, 40))}${q.zh.length > 40 ? '…' : ''}</span>
                <span class="bank-src">${esc(q.source || q.bank)}</span>
              </label>`).join('') || '<p class="empty">筛选下没有题。</p>'}
          </div>
          <div class="pc-row">
            <label>再生成新题:</label>
            <select class="select" id="g-tag">${TAG_LIST.filter(x => GENERATORS[x]).map(x => `<option value="${x}" ${ui.genTag === x ? 'selected' : ''}>${esc(METHODS[x].name)}</option>`).join('')}</select>
            <select class="select" id="g-level">
              ${[1, 2, 3].map(l => `<option value="${l}" ${ui.genLevel === l ? 'selected' : ''}>${'⭐'.repeat(l)}</option>`).join('')}
            </select>
            <input class="num-input" id="g-n" type="number" min="1" max="20" value="${ui.genN}"> 道
            <button class="btn btn-sm btn-primary" id="g-add">➕ 加入</button>
          </div>
          <div class="pc-row">
            <label>每题附变式:</label>
            ${[0, 1, 2].map(n => `<button class="btn btn-sm ${opts.variants === n ? 'btn-primary' : ''}" data-var="${n}">${n === 0 ? '不附' : n + ' 道'}</button>`).join('')}
            <span class="sec-sub">变式 = 同模型同难度的新生成题,跟在原题后面</span>
          </div>
          <div class="pc-row">
            <label>卷面选项:</label>
            <label><input type="checkbox" id="o-en" ${opts.en ? 'checked' : ''}> 印英文</label>
            <label><input type="checkbox" id="o-key" ${opts.key ? 'checked' : ''}> 带答案页</label>
            <span>作答空间:</span>
            ${[['s', '紧凑'], ['m', '标准'], ['l', '宽松']].map(([v, n]) => `<button class="btn btn-sm ${opts.work === v ? 'btn-primary' : ''}" data-work="${v}">${n}</button>`).join('')}
          </div>
        </div>

        <div class="pc-bar">
          <span class="pc-count">已选 ${selected.size} 道${opts.variants ? ` + 变式 ${selected.size * opts.variants} 道` : ''}</span>
          <button class="btn btn-primary" id="build">📄 生成纸面预览</button>
          <button class="btn btn-big btn-alert hidden" id="doprint">🖨 打印</button>
        </div>
      </div>
      <div id="sheets" style="margin-top:18px"></div>
    </div>`;

    bind();
  }

  function bind() {
    const $ = id => el.querySelector('#' + id);
    // 一键组卷
    $('preset-daily').addEventListener('click', () => {
      selected = new Map();
      const weak = weakestTags(TAG_LIST.filter(t => GENERATORS[t]), 3);
      for (let i = 0; i < 6; i++) {
        const t = weak[i % weak.length];
        const q = generate(t, 1 + (i % 2), nextSeed(t));
        selected.set(q.id, { kind: 'gen', q, level: q.level });
      }
      opts.variants = 0;
      draw(); build();
    });
    $('preset-due').addEventListener('click', () => {
      selected = new Map();
      for (const e of dueErrors().slice(0, 12)) {
        const q = QMAP.get(e.qid) || regenerate(e.qid);
        if (q) selected.set(e.qid, { kind: QMAP.has(e.qid) ? 'bank' : 'gen', q, level: e.level || 1 });
      }
      opts.variants = 2;
      draw();
      if (selected.size) build();
      else el.querySelector('#sheets').innerHTML = '<p class="empty no-print">当前没有到期的错题。</p>';
    });
    $('preset-model').addEventListener('click', () => {
      const t = $('g-tag').value;
      selected = new Map();
      const levels = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3];
      for (const lv of levels) {
        const q = generate(t, lv, nextSeed(t));
        selected.set(q.id, { kind: 'gen', q, level: lv });
      }
      opts.variants = 0;
      draw(); build();
    });
    $('f-bank').addEventListener('change', e => { ui.bank = e.target.value; draw(); });
    $('f-tag').addEventListener('change', e => { ui.tag = e.target.value; draw(); });
    $('f-st').addEventListener('change', e => { ui.st = e.target.value; draw(); });
    $('f-fig').addEventListener('change', e => { ui.hideFigure = e.target.checked; draw(); });
    $('sel-all').addEventListener('click', () => { filtered().forEach(q => selected.set(q.id, { kind: 'bank', q, level: BANK_LEVEL[q.bank] || 1 })); draw(); });
    $('sel-clear').addEventListener('click', () => { selected = new Map(); draw(); });
    el.querySelectorAll('[data-q]').forEach(cb => cb.addEventListener('change', () => {
      const q = QMAP.get(cb.dataset.q);
      if (cb.checked) selected.set(q.id, { kind: 'bank', q, level: BANK_LEVEL[q.bank] || 1 });
      else selected.delete(q.id);
      el.querySelector('.pc-count').textContent = `已选 ${selected.size} 道${opts.variants ? ` + 变式 ${selected.size * opts.variants} 道` : ''}`;
    }));
    $('g-add').addEventListener('click', () => {
      ui.genTag = $('g-tag').value; ui.genLevel = Number($('g-level').value);
      ui.genN = Math.max(1, Math.min(20, Number($('g-n').value) || 1));
      for (let i = 0; i < ui.genN; i++) {
        const q = generate(ui.genTag, ui.genLevel, nextSeed(ui.genTag));
        selected.set(q.id, { kind: 'gen', q, level: ui.genLevel });
      }
      draw();
    });
    el.querySelectorAll('[data-var]').forEach(b => b.addEventListener('click', () => { opts.variants = Number(b.dataset.var); draw(); }));
    el.querySelectorAll('[data-work]').forEach(b => b.addEventListener('click', () => { opts.work = b.dataset.work; draw(); }));
    $('o-en').addEventListener('change', e => { opts.en = e.target.checked; });
    $('o-key').addEventListener('change', e => { opts.key = e.target.checked; });
    $('build').addEventListener('click', build);
    $('doprint').addEventListener('click', () => window.print());
  }

  function build() {
    if (!selected.size) {
      el.querySelector('#sheets').innerHTML = '<p class="empty no-print">还没选题——先勾选上面的题,或生成几道新题。</p>';
      return;
    }
    // 组卷:原题 + 紧跟变式
    const items = [];
    let n = 0;
    for (const { kind, q, level } of selected.values()) {
      n++;
      items.push({ num: n, q, kind, variantOf: null });
      if (!GENERATORS[q.tag]) continue; // 基础综合类没有变式生成器
      for (let v = 0; v < opts.variants; v++) {
        n++;
        const vq = generate(q.tag, level, nextSeed(q.tag));
        items.push({ num: n, q: vq, kind: 'gen', variantOf: items.find(x => x.q === q).num });
      }
    }
    el.querySelector('#sheets').innerHTML = buildSheetsHTML(items, opts, { student: state.student, dateStr: todayStr() }, METHODS);
    el.querySelector('#doprint').classList.remove('hidden');
    el.querySelector('#sheets').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 供错题本/题库跳转:预选一批题再进打印中心
export function preselectForPrint(qids) {
  selected = new Map();
  for (const qid of qids) {
    const q = QMAP.get(qid) || regenerate(qid);
    if (q) selected.set(q.id || qid, { kind: QMAP.has(qid) ? 'bank' : 'gen', q, level: q.level || BANK_LEVEL[q.bank] || 1 });
  }
}
