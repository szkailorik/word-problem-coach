// 应用入口:加载数据 → hash 路由 → 顶栏(学生切换/语言/备份)
import { loadData } from './data.js';
import { state, setStudent, setLang, exportJSON, importJSON, totals } from './store.js';
import { sync, isConnected, connect, disconnect, syncNow, initSync } from './sync.js';
import { renderHome } from './views/home.js';
import { renderLearn } from './views/learn.js';
import { renderDrill } from './views/drill.js';
import { renderBank } from './views/bank.js';
import { renderErrors } from './views/errors.js';
import { renderLog } from './views/log.js';
import { renderPrint } from './views/print.js';
import { renderGrade } from './views/grade.js';
import { renderQuiz } from './views/quiz.js';

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
  if (parts[0] === 'grade') return renderGrade(view, parts[1] || '');
  if (parts[0] === 'quiz') return renderQuiz(view);
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
      <button class="chip" id="syncbtn" title="云同步与备份">${syncBadge()}</button>
    </div>`;

  bar.querySelectorAll('[data-student]').forEach(b => b.addEventListener('click', () => {
    setStudent(b.dataset.student);
    route();
  }));
  bar.querySelector('#langsel').addEventListener('change', e => { setLang(e.target.value); route(); });
  bar.querySelector('#syncbtn').addEventListener('click', openSyncModal);
}

function syncBadge() {
  if (!isConnected()) return '💾 本地';
  return { syncing: '☁️ 同步中…', ok: '☁️ 已同步', error: '⚠️ 同步异常', local: '☁️' }[sync.status] || '☁️';
}

function refreshSyncBadge() {
  const b = document.getElementById('syncbtn');
  if (b) b.innerHTML = syncBadge();
}

function openSyncModal() {
  document.getElementById('syncmodal')?.remove();
  const connected = isConnected();
  const div = document.createElement('div');
  div.id = 'syncmodal';
  div.className = 'modal-mask no-print';
  div.innerHTML = `
  <div class="modal card">
    <div class="modal-head"><h2>☁️ 云同步与备份</h2><button class="btn btn-sm btn-ghost" id="m-close">✕</button></div>
    ${connected ? `
      <p class="modal-p">已连接 GitHub Gist。数据在打开页面、切回页面时自动拉取,每次做题后自动推送。</p>
      <p class="modal-p">状态:<b>${{ ok: '✅ 正常', syncing: '同步中…', error: '⚠️ ' + sync.error, local: '待同步' }[sync.status]}</b>
      ${sync.lastSyncAt ? ` · 上次同步 ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : ''}</p>
      <div class="model-actions">
        <button class="btn btn-primary" id="m-sync">立即双向同步</button>
        <button class="btn btn-ghost" id="m-disc">断开连接</button>
      </div>` : `
      <p class="modal-p">连接后,两台设备(比如家里电脑和 iPad)的做题记录、错题本会自动合并同步。数据存在<b>你自己 GitHub 账号的私有 Gist</b> 里,不经过任何第三方。</p>
      <ol class="modal-ol">
        <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=word-problem-coach-sync" target="_blank" rel="noopener">点这里创建 GitHub Token</a>(已自动勾选 gist 权限,直接点最下面的 Generate token)</li>
        <li>复制生成的 token,粘贴到下面 → 连接</li>
        <li>换一台设备打开本站,粘贴同一个 token 即可同步</li>
      </ol>
      <div class="pc-row">
        <input type="password" id="m-token" placeholder="ghp_ 开头的 token" style="flex:1;min-width:200px" class="num-input">
        <button class="btn btn-primary" id="m-conn">连接</button>
      </div>
      <p class="modal-p" id="m-err" style="color:var(--wrong)"></p>`}
    <hr class="modal-hr">
    <h3>💾 手动备份</h3>
    <div class="model-actions">
      <button class="btn btn-sm" id="m-export">导出 JSON 备份</button>
      <button class="btn btn-sm" id="m-import">从备份恢复</button>
    </div>
  </div>`;
  document.body.appendChild(div);
  const $ = id => div.querySelector('#' + id);
  div.addEventListener('click', e => { if (e.target === div) div.remove(); });
  $('m-close').addEventListener('click', () => div.remove());
  $('m-export').addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wpc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $('m-import').addEventListener('click', () => {
    const text = prompt('把之前导出的备份 JSON 粘贴到这里:');
    if (text) {
      try { importJSON(text); alert('恢复成功!'); div.remove(); route(); }
      catch (e) { alert('恢复失败:' + e.message); }
    }
  });
  if (connected) {
    $('m-sync').addEventListener('click', async () => {
      $('m-sync').disabled = true;
      await syncNow();
      div.remove(); openSyncModal();
    });
    $('m-disc').addEventListener('click', () => {
      if (confirm('断开后数据仍保留在本设备和 Gist 里,只是不再自动同步。确定?')) { disconnect(); div.remove(); refreshSyncBadge(); }
    });
  } else {
    $('m-conn').addEventListener('click', async () => {
      const t = $('m-token').value.trim();
      if (!t) return;
      $('m-conn').disabled = true; $('m-conn').textContent = '连接中…';
      try {
        await connect(t);
        div.remove(); route();
      } catch (e) {
        $('m-err').textContent = '连接失败:' + e.message;
        $('m-conn').disabled = false; $('m-conn').textContent = '连接';
      }
    });
  }
}

window.addEventListener('hashchange', route);
sync.onChange = refreshSyncBadge;

// 做题后实时刷新顶栏错题角标(轻量重绘)
let badgeTimer = null;
window.addEventListener('wpc:saved', () => {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(renderTopbar, 400);
});

// PWA:注册 Service Worker(离线可用;本地 http.server 也支持 localhost)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

loadData().then(() => {
  initSync();
  route();
}).catch(err => {
  view.innerHTML = `<div class="card"><h2>加载失败</h2><p>${err.message}</p><p>请刷新重试。</p></div>`;
});
