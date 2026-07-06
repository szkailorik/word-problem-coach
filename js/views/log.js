// 训练档案:按天回看做了多少题、对多少、错了哪些
import { METHODS, QMAP } from '../data.js';
import { regenerate } from '../gen/generators.js';
import { esc } from '../ui.js';
import { profile } from '../store.js';

const MODE_NAME = { daily: '特训', drill: '刷题', review: '复习', bank: '题库' };

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekday(ts) { return '周' + '日一二三四五六'[new Date(ts).getDay()]; }
function hhmm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function stemOf(qid) {
  const q = QMAP.get(qid) || regenerate(qid);
  return q ? q.zh : qid;
}

export function renderLog(el) {
  const attempts = profile().attempts;
  // 按天分组(新→旧)
  const days = new Map();
  for (const a of attempts) {
    const k = dayKey(a.ts);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(a);
  }
  const dayList = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  // 概览
  const total = attempts.length;
  const correct = attempts.filter(a => a.correct).length;
  const todayK = dayKey(Date.now());
  const todayArr = days.get(todayK) || [];
  // 连续训练天数(从今天/昨天往前数)
  let streak = 0;
  const keys = new Set(days.keys());
  for (let i = 0; ; i++) {
    const k = dayKey(Date.now() - i * 86400000);
    if (keys.has(k)) streak++;
    else if (i === 0) continue; // 今天还没练不打断
    else break;
  }

  const dayCards = dayList.map(([k, arr]) => {
    const right = arr.filter(a => a.correct).length;
    const acc = Math.round(right / arr.length * 100);
    const byMode = {};
    for (const a of arr) byMode[a.mode] = (byMode[a.mode] || 0) + 1;
    const modeTxt = Object.entries(byMode).map(([m, n]) => `${MODE_NAME[m] || m} ${n}`).join(' · ');
    const items = arr.slice().sort((a, b) => b.ts - a.ts).map(a => `
      <div class="log-item">
        <span>${a.correct ? '✅' : '❌'}</span>
        <span class="when">${hhmm(a.ts)}</span>
        <span>${esc(stemOf(a.qid).slice(0, 42))}…</span>
        <span class="mode">${MODE_NAME[a.mode] || a.mode} · ${esc((METHODS[a.tag]?.name || a.tag).replace(/^\d+\.\s*/, ''))}</span>
      </div>`).join('');
    const isToday = k === todayK;
    return `
    <div class="card day-card">
      <div class="day-head" data-day="${k}">
        <span class="day-date">${isToday ? '今天' : k.slice(5).replace('-', '/')} <small style="color:var(--muted);font-weight:600">${weekday(arr[0].ts)}</small></span>
        <span class="day-nums"><span>做题 <b>${arr.length}</b></span><span>答对 <b>${right}</b></span><span>${esc(modeTxt)}</span></span>
        <span class="day-acc" style="color:${acc >= 80 ? 'var(--right)' : acc >= 50 ? 'var(--warn)' : 'var(--wrong)'}">${acc}%</span>
        <span class="toggle-ind">${isToday ? '▴' : '▾'}</span>
      </div>
      <div class="day-detail ${isToday ? '' : 'hidden'}">${items}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
  <div class="log">
    <a class="crumb" href="#/">← 返回首页</a>
    <h1>📅 训练档案</h1>
    <div class="log-summary">
      <div class="stat"><b>${todayArr.length}</b><span>今日做题</span></div>
      <div class="stat"><b>${streak}</b><span>连续天数</span></div>
      <div class="stat"><b>${total}</b><span>累计做题</span></div>
      <div class="stat"><b>${total ? Math.round(correct / total * 100) : 0}%</b><span>总正确率</span></div>
      <div class="stat"><b>${dayList.length}</b><span>训练天数</span></div>
    </div>
    ${dayCards || '<p class="empty">还没有训练记录——去做几道题,这里就会一天一天记下来。</p>'}
  </div>`;

  el.querySelectorAll('.day-head').forEach(h => h.addEventListener('click', () => {
    const d = h.parentElement.querySelector('.day-detail');
    d.classList.toggle('hidden');
    h.querySelector('.toggle-ind').textContent = d.classList.contains('hidden') ? '▾' : '▴';
  }));
}
