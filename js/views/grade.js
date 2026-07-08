// 批改中心:纸卷做完后,家长凭卷号找到卷子,逐题点 ✓/✗ 回录。
// 保存后写入 attempts/错题本(与屏上判分同规则);已录过的题锁定,未录的可补录。
import { METHODS } from '../data.js';
import { esc, stemOf, hhmm, clip, fmtDate } from '../ui.js';
import { allSheets, getSheet, removeSheet, gradeSheet } from '../store.js';

function dateStr(ts) { return `${fmtDate(ts)} ${hhmm(ts)}`; }
function scoreOf(s) {
  const marks = Object.values(s.grades || {});
  return { done: marks.length, right: marks.filter(Boolean).length, total: s.items.length };
}

export function renderGrade(el, sheetId) {
  if (sheetId) return renderSheet(el, sheetId);

  const list = allSheets();
  const row = s => {
    const sc = scoreOf(s);
    const state = !s.gradedAt
      ? '<span class="g-state g-todo">待批改</span>'
      : sc.done < sc.total
        ? `<span class="g-state g-part">已批 ${sc.done}/${sc.total} · 对 ${sc.right}</span>`
        : `<span class="g-state g-done">得分 ${sc.right}/${sc.total}</span>`;
    return `
    <a class="card grade-row" href="#/grade/${s.id}">
      <span class="g-code">${esc(s.code)}</span>
      <span class="g-info"><b>${esc(s.title)}</b><small>${dateStr(s.ts)} · ${s.items.length} 题</small></span>
      ${state}
    </a>`;
  };
  const ungraded = list.filter(s => !s.gradedAt);
  const graded = list.filter(s => s.gradedAt);

  el.innerHTML = `
  <div class="grade-view">
    <a class="crumb" href="#/">← 返回首页</a>
    <h1>📝 批改中心</h1>
    <p class="paper-note">打印的卷子都自动存档在这里。对着纸上的<b>卷号</b>找到卷子,逐题点对错,错题会自动收进错题本、进入间隔复习。</p>
    ${ungraded.length ? `<h3 class="grade-sec">待批改</h3>${ungraded.map(row).join('')}` : ''}
    ${graded.length ? `<h3 class="grade-sec">已批改</h3>${graded.map(row).join('')}` : ''}
    ${!list.length ? '<p class="empty">还没有存档的卷子——去 <a href="#/print">🖨 打印中心</a> 组一张卷,打印时会自动存档到这里。</p>' : ''}
  </div>`;
}

function renderSheet(el, sheetId) {
  const s = getSheet(sheetId);
  if (!s) {
    el.innerHTML = '<div class="card empty-card"><h2>找不到这张卷</h2><p>可能已被删除,或属于另一位学生(试试右上角切换学生)。</p><a class="btn" href="#/grade">← 回批改中心</a></div>';
    return;
  }
  const marks = new Map(); // num -> bool,本次新标记
  draw();

  function draw() {
    const locked = s.grades || {};
    const rows = s.items.map(it => {
      const done = typeof locked[it.num] === 'boolean';
      const mk = done ? locked[it.num] : marks.get(it.num);
      return `
      <div class="grade-item ${done ? 'g-locked' : ''}">
        <span class="g-num">${it.num}</span>
        <span class="g-stem">${it.variantOf ? '<span class="g-var">变式</span>' : ''}${esc(clip(stemOf(it.qid), 44))}<small>${esc((METHODS[it.tag]?.name || it.tag).replace(/^\d+\.\s*/, ''))}</small></span>
        <span class="g-btns">
          <button class="g-mark g-right ${mk === true ? 'on' : ''}" data-num="${it.num}" data-v="1" ${done ? 'disabled' : ''}>✓</button>
          <button class="g-mark g-wrong ${mk === false ? 'on' : ''}" data-num="${it.num}" data-v="0" ${done ? 'disabled' : ''}>✗</button>
        </span>
      </div>`;
    }).join('');

    const pendingItems = s.items.filter(it => typeof (s.grades || {})[it.num] !== 'boolean');
    const sc = scoreOf(s);
    el.innerHTML = `
    <div class="grade-view">
      <a class="crumb" href="#/grade">← 批改中心</a>
      <h1>📝 卷 ${esc(s.code)} <small class="g-title">${esc(s.title)} · ${dateStr(s.ts)}</small></h1>
      ${s.gradedAt ? `<p class="paper-note">这张卷已批过(${sc.done}/${sc.total} 题,对 ${sc.right});已录的结果锁定不可改${pendingItems.length ? ',剩下的题可以补录' : ''}。</p>`
        : '<p class="paper-note">对着纸上的题号逐题点 ✓ 或 ✗;点错了再点一下另一个改过来,<b>保存前</b>都能改。</p>'}
      ${pendingItems.length ? `<div class="model-actions no-print"><button class="btn btn-sm" id="all-right">🎉 没标过的都算对</button></div>` : ''}
      <div class="card grade-list">${rows}</div>
      <div class="grade-bar">
        <span id="g-count"></span>
        ${pendingItems.length ? '<button class="btn btn-big btn-primary" id="g-save">保存批改</button>' : ''}
        <button class="btn btn-ghost btn-sm" id="g-del">🗑 删除这张卷</button>
      </div>
      <div id="g-result"></div>
    </div>`;

    const $ = id => el.querySelector('#' + id);
    updateCount();

    el.querySelectorAll('.g-mark:not([disabled])').forEach(b => b.addEventListener('click', () => {
      const num = Number(b.dataset.num), v = b.dataset.v === '1';
      if (marks.get(num) === v) marks.delete(num);
      else marks.set(num, v);
      // 只刷新这一行的按钮状态,不整页重绘
      const rowBtns = el.querySelectorAll(`.g-mark[data-num="${num}"]`);
      rowBtns.forEach(x => x.classList.toggle('on', marks.get(num) === (x.dataset.v === '1')));
      updateCount();
    }));

    if ($('all-right')) $('all-right').addEventListener('click', () => {
      // 只填还没动过的题:家长已经点了 ✗ 的不能被"全对"冲掉
      for (const it of pendingItems) if (!marks.has(it.num)) marks.set(it.num, true);
      el.querySelectorAll('.g-mark:not([disabled])').forEach(x =>
        x.classList.toggle('on', marks.get(Number(x.dataset.num)) === (x.dataset.v === '1')));
      updateCount();
    });

    if ($('g-save')) $('g-save').addEventListener('click', () => {
      if (!marks.size) { $('g-result').innerHTML = '<div class="fb fb-warn">还没标任何题——先逐题点 ✓ 或 ✗。</div>'; return; }
      const obj = {};
      for (const [num, v] of marks) obj[num] = v;
      gradeSheet(s.id, obj);
      const sc2 = scoreOf(getSheet(s.id));
      el.innerHTML = `
      <div class="card summary-card">
        <h2>${sc2.right === sc2.total ? '🏆 全对!' : '📝 批改完成'}</h2>
        <div class="summary-score">${sc2.right} / ${sc2.done}</div>
        <p class="paper-note">${sc2.right < sc2.done ? `${sc2.done - sc2.right} 道错题已收进错题本,按 1/3/7/14 天安排复习。` : '已计入训练档案和掌握度。'}</p>
        <div class="model-actions">
          ${sc2.right < sc2.done ? '<a class="btn btn-alert" href="#/errors">📕 去看错题本</a>' : ''}
          <a class="btn btn-primary" href="#/grade">← 回批改中心</a>
          <a class="btn" href="#/">返回首页</a>
        </div>
      </div>`;
    });

    $('g-del').addEventListener('click', () => {
      if (confirm(`删除卷 ${s.code}?已录入的对错记录会保留,只删卷子本身。`)) {
        removeSheet(s.id);
        location.hash = '#/grade';
      }
    });

    function updateCount() {
      const c = $('g-count');
      if (!c) return;
      const right = [...marks.values()].filter(Boolean).length;
      c.textContent = pendingItems.length
        ? `已标 ${marks.size} / ${pendingItems.length} 题${marks.size ? ` · 对 ${right}` : ''}`
        : '全部题目已录入 ✓';
    }
  }
}
