// 打印中心:筛选/勾选题目 → 每题可附同类变式 → A4 卷面 + 答案页
// 屏幕上的纸面预览和打印输出完全一致(@media print 只隐藏控制区)。
import { QUESTIONS, QMAP, METHODS, TAG_LIST, BANKS, BANK_LEVEL } from '../data.js';
import { generate, regenerate, GENERATORS } from '../gen/generators.js';
import { esc } from '../ui.js';
import { state, nextSeed, dueErrors, weakestTags, saveSheet } from '../store.js';
import { statusMap, statusIcon } from '../status.js';
import { buildSheetsHTML, todayStr } from '../print-sheet.js';

// 选择集跨渲染保留;打印存档后清空
let selected = new Map(); // key(qid) -> { kind:'bank'|'gen', q, level }
let presetTitle = null;   // 一键组卷/快速出题带来的卷名,手动改选后失效
let pendingAuto = false;  // 仅"刚被预选跳转进来"这一次自动出预览,防旧选择集借尸还魂

export function renderPrint(el) {
  const ui = { bank: 'all', tag: '', st: 'all', genTag: TAG_LIST[0], genLevel: 1, genN: 3, hideFigure: true };
  const opts = { en: true, key: true, work: 'm', variants: 0 };
  let current = null; // 本次预览 { items, title, sheet:落库后的卷子 }

  draw();
  if (pendingAuto && selected.size) build(); // 从错题本/快速出题预选跳转过来:直接出预览
  pendingAuto = false;

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
      presetTitle = '今日特训卷';
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
      presetTitle = '到期错题卷';
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
      presetTitle = `模型专项卷·${(METHODS[t]?.name || t).replace(/^\d+\.\s*/, '')}`;
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
    $('sel-all').addEventListener('click', () => { presetTitle = null; filtered().forEach(q => selected.set(q.id, { kind: 'bank', q, level: BANK_LEVEL[q.bank] || 1 })); draw(); });
    $('sel-clear').addEventListener('click', () => { selected = new Map(); presetTitle = null; draw(); });
    el.querySelectorAll('[data-q]').forEach(cb => cb.addEventListener('change', () => {
      presetTitle = null;
      const q = QMAP.get(cb.dataset.q);
      if (cb.checked) selected.set(q.id, { kind: 'bank', q, level: BANK_LEVEL[q.bank] || 1 });
      else selected.delete(q.id);
      el.querySelector('.pc-count').textContent = `已选 ${selected.size} 道${opts.variants ? ` + 变式 ${selected.size * opts.variants} 道` : ''}`;
    }));
    $('g-add').addEventListener('click', () => {
      presetTitle = null;
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
    $('doprint').addEventListener('click', doPrint);
  }

  function build() {
    el.querySelector('.archived-note')?.remove(); // 新预览了,上一份的存档提示别再挂着
    if (!selected.size) {
      el.querySelector('#sheets').innerHTML = '<p class="empty no-print">还没选题——先勾选上面的题,或生成几道新题。</p>';
      return;
    }
    // 组卷:原题 + 紧跟变式
    const items = [];
    let n = 0;
    for (const { kind, q, level } of selected.values()) {
      n++;
      items.push({ num: n, q, kind, level: level || q.level || 1, variantOf: null });
      if (!GENERATORS[q.tag]) continue; // 基础综合类没有变式生成器
      for (let v = 0; v < opts.variants; v++) {
        n++;
        const vq = generate(q.tag, level, nextSeed(q.tag));
        items.push({ num: n, q: vq, kind: 'gen', level, variantOf: items.find(x => x.q === q).num });
      }
    }
    current = { items, title: presetTitle || `自选 ${items.length} 题`, sheet: null };
    renderSheets();
    el.querySelector('#doprint').classList.remove('hidden');
    el.querySelector('#sheets').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSheets() {
    const meta = { student: state.student, dateStr: todayStr(), code: current.sheet?.code };
    el.querySelector('#sheets').innerHTML = buildSheetsHTML(current.items, opts, meta, METHODS);
  }

  // 点打印才落库(生成预览不落库,避免垃圾卷)。
  // 重复打印不会重复存档:同一预览走 current.sheet,重建后内容没变则 saveSheet 内部去重复用旧卷。
  function doPrint() {
    if (!current) return;
    if (!current.sheet) {
      current.sheet = saveSheet({
        title: current.title,
        items: current.items.map(it => ({ num: it.num, qid: it.q.id, tag: it.q.tag, level: it.level, variantOf: it.variantOf })),
      });
      renderSheets(); // 把卷号印上纸面再打印
      el.querySelector('.archived-note')?.remove();
      el.querySelector('.pc-bar').insertAdjacentHTML('afterend',
        `<p class="archived-note no-print">📥 已存档为卷 <b>${esc(current.sheet.code)}</b> · 孩子做完后去 <a href="#/grade/${current.sheet.id}">📝 批改中心</a> 录入对错</p>`);
      // 这批题的使命完成了:清掉选择集,下次进打印中心是干净的,也不会误存到另一位学生名下
      selected = new Map();
      presetTitle = null;
    }
    window.print();
  }
}

// 供错题本/快速出题跳转:预选一批题再进打印中心(进入后自动出预览)
export function preselectForPrint(qids, title = null) {
  selected = new Map();
  presetTitle = title;
  pendingAuto = true;
  for (const qid of qids) {
    const q = QMAP.get(qid) || regenerate(qid);
    if (q) selected.set(q.id || qid, { kind: QMAP.has(qid) ? 'bank' : 'gen', q, level: q.level || BANK_LEVEL[q.bank] || 1 });
  }
}
