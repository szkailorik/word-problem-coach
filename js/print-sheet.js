// 组卷渲染(纯函数,无浏览器依赖,node 测试可直接 import):
// items:   [{ num, q, kind:'bank'|'gen', variantOf: number|null }]
// opts:    { en, key, work: 's'|'m'|'l' }
// meta:    { student, dateStr, code? }  code = 卷号(打印存档后才有,批改时凭它找卷)
// methods: METHODS 词典(tag -> {name})
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function buildSheetsHTML(items, opts, meta, METHODS) {
  const paper = `
  <div class="sheet">
    <div class="sheet-head">
      <h2>🧮 应用题训练卷</h2>
      <div class="sheet-meta"><span>姓名:${esc(meta.student)}</span><span>日期:${esc(meta.dateStr)}</span>${meta.code ? `<span>卷号:<b>${esc(meta.code)}</b></span>` : ''}<span>得分:____ / ${items.length}</span></div>
    </div>
    <div class="sheet-sub">共 ${items.length} 题${items.some(i => i.variantOf) ? `(含变式 ${items.filter(i => i.variantOf).length} 道)` : ''} · 先在空白处列式计算,再把答案写在横线上</div>
    ${items.map(it => `
      <div class="p-q">
        <span class="p-num">第 ${it.num} 题</span>
        <span class="p-badge">${esc((METHODS[it.q.tag]?.name || '').replace(/^\d+\.\s*/, ''))}</span>
        ${it.variantOf ? `<span class="p-badge p-badge-variant">变式 · 源自第 ${it.variantOf} 题</span>` : ''}
        ${it.kind === 'bank' && it.q.source ? `<span class="p-badge">${esc(it.q.source)}</span>` : ''}
        ${it.q.needsFigure ? `<span class="p-badge p-badge-variant">🖼 需对照原书配图</span>` : ''}
        <div class="p-stem">${esc(it.q.zh)}</div>
        ${opts.en ? `<div class="p-en">${esc(it.q.en)}</div>` : ''}
        <div class="p-work h-${opts.work}"></div>
        <div class="p-ansline">答:<span></span></div>
      </div>`).join('')}
  </div>`;

  const key = !opts.key ? '' : `
  <div class="sheet sheet-key">
    <div class="sheet-head">
      <h2>📖 答案与讲解</h2>
      <div class="sheet-meta"><span>${esc(meta.dateStr)}</span>${meta.code ? `<span>卷号:${esc(meta.code)}</span>` : ''}<span>共 ${items.length} 题</span></div>
    </div>
    ${items.map(it => `
      <div class="p-q">
        <span class="p-num">第 ${it.num} 题</span>
        ${it.variantOf ? `<span class="p-badge p-badge-variant">变式</span>` : ''}
        <div class="key-steps">
          ${(it.q.steps || []).map((s, i) => `<div>${i + 1}. <b>${esc(s.label)}</b> ${esc(s.text)}</div>`).join('')}
        </div>
        <div class="key-final">📌 ${esc(it.q.answer ? it.q.answer.sentence : (it.q.model && it.q.model.text) || '见讲解')}</div>
      </div>`).join('')}
  </div>`;

  return paper + key;
}

export function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
