// 应用入口:加载数据 → hash 路由 → 顶栏(学生切换/语言/备份)
import { loadData } from './data.js';
import { state, setStudent, setLang, exportJSON, importJSON, totals } from './store.js';
import { renderHome } from './views/home.js';
import { renderLearn } from './views/learn.js';
import { renderDrill } from './views/drill.js';
import { renderBank } from './views/bank.js';
import { renderErrors } from './views/errors.js';
import { renderLog } from './views/log.js';
import { renderPrint } from './views/print.js';

const view = document.getElementById('view');

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || '';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  renderTopbar();

  if (!parts.length) return renderHome(view);
  if (parts[0] === 'learn' && parts[1]) return renderLearn(view, parts[1]);
  if (parts[0] === 'drill' && parts[1] === 'review') return renderDrill(view, 'review', parts[2] || '');
  if (parts[0] === 'drill' && parts[1]) return renderDrill(view, parts[1]);
  if (parts[0] === 'bank') return renderBank(view, query);
  if (parts[0] === 'errors') return renderErrors(view);
  if (parts[0] === 'log') return renderLog(view);
  if (parts[0] === 'print') return renderPrint(view);
  renderHome(view);
}

function renderTopbar() {
  const bar = document.getElementById('topbar');
  const t = totals();
  bar.innerHTML = `
    <a class="logo" href="#/">🧮 应用题教练</a>
    <nav class="top-nav">
      <a href="#/errors" class="top-link">📕 错题本${t.due ? `<span class="badge">${t.due}</span>` : ''}</a>
    </nav>
    <div class="top-right">
      <div class="student-switch">
        ${['KAI', 'Lorik'].map(s => `<button class="chip ${state.student === s ? 'chip-on' : ''}" data-student="${s}">${s}</button>`).join('')}
      </div>
      <select id="langsel" title="语言">
        <option value="both" ${state.lang === 'both' ? 'selected' : ''}>中+EN</option>
        <option value="zh" ${state.lang === 'zh' ? 'selected' : ''}>中文</option>
        <option value="en" ${state.lang === 'en' ? 'selected' : ''}>EN</option>
      </select>
      <button class="chip" id="backup" title="备份/恢复">💾</button>
    </div>`;

  bar.querySelectorAll('[data-student]').forEach(b => b.addEventListener('click', () => {
    setStudent(b.dataset.student);
    route();
  }));
  bar.querySelector('#langsel').addEventListener('change', e => { setLang(e.target.value); route(); });
  bar.querySelector('#backup').addEventListener('click', backupDialog);
}

function backupDialog() {
  const choice = prompt('输入 1 导出备份(复制弹出的文本);输入 2 粘贴备份内容进行恢复:', '1');
  if (choice === '1') {
    const data = exportJSON();
    navigator.clipboard?.writeText(data).catch(() => {});
    prompt('已尝试复制到剪贴板。也可手动复制下面内容保存:', data);
  } else if (choice === '2') {
    const text = prompt('把之前导出的备份粘贴到这里:');
    if (text) {
      try { importJSON(text); alert('恢复成功!'); route(); }
      catch (e) { alert('恢复失败:' + e.message); }
    }
  }
}

window.addEventListener('hashchange', route);

loadData().then(route).catch(err => {
  view.innerHTML = `<div class="card"><h2>加载失败</h2><p>${err.message}</p><p>请刷新重试。</p></div>`;
});
