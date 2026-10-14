// 应用入口:加载数据 → hash 路由 → 顶栏(学生切换/语言/备份)
import { loadData } from './data.js';
import { state, setStudent, setLang, exportJSON, importJSON, totals } from './store.js';
import { sync, isConnected, gistConnected, connect, disconnect, syncNow, initSync } from './sync.js';
import { ai, aiAvailable } from './ai/client.js';
import { renderHome } from './views/home.js';
import { renderLearn } from './views/learn.js';
import { renderDrill } from './views/drill.js';
import { renderBank } from './views/bank.js';
import { renderErrors } from './views/errors.js';
import { renderLog } from './views/log.js';
import { renderPrint } from './views/print.js';
import { renderGrade } from './views/grade.js';
import { renderQuiz } from './views/quiz.js';
import { bumpNav } from './nav.js';
import { esc } from './ui.js';

const view = document.getElementById('view');

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || '';
  const [pathFull, query] = hash.split('?');
  const [path, anchor] = pathFull.split('#'); // #/learn/<tag>#trick 这种页内锚点
  const parts = path.split('/').filter(Boolean);
  bumpNav(); // 让上一页还在路上的异步结果作废
  window.scrollTo(0, 0);
  renderTopbar();

  if (!parts.length) return renderHome(view);
  if (parts[0] === 'learn' && parts[1]) return renderLearn(view, parts[1], anchor || '');
  if (parts[0] === 'drill' && parts[1] === 'review') return renderDrill(view, 'review', parts[2] || '');
  if (parts[0] === 'drill' && parts[1] === 'variant') return renderDrill(view, 'variant', decodeURIComponent(parts[2] || ''));
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
  const aiMark = ai.available ? ' · 🤖' : '';
  if (!isConnected()) return '💾 本地' + aiMark;
  return ({ syncing: '☁️ 同步中…', ok: '☁️ 已同步', error: '⚠️ 同步异常', local: '☁️' }[sync.status] || '☁️') + aiMark;
}

function refreshSyncBadge() {
  const b = document.getElementById('syncbtn');
  if (b) b.innerHTML = syncBadge();
}

function openSyncModal() {
  document.getElementById('syncmodal')?.remove();
  const cloud = sync.backend === 'cloud';
  const gist = !cloud && gistConnected();
  const stTxt = { ok: '✅ 正常', syncing: '同步中…', error: '⚠️ ' + esc(sync.error), local: '待同步' }[sync.status];
  const div = document.createElement('div');
  div.id = 'syncmodal';
  div.className = 'modal-mask no-print';
  div.innerHTML = `
  <div class="modal card">
    <div class="modal-head"><h2>☁️ 同步 · 🤖 AI 老师</h2><button class="btn btn-sm btn-ghost" id="m-close">✕</button></div>
    <h3>🤖 AI 老师(DeepSeek)</h3>
    <p class="modal-p" id="m-ai">检测中…</p>
    <hr class="modal-hr">
    <h3>☁️ 多设备同步</h3>
    ${cloud ? `
      <p class="modal-p">已用家庭账号登录:<b>${esc(sync.user || '已登录')}</b>。做题记录、错题本、卷子、AI 变式题在所有登录过的设备间<b>自动合并同步</b>(服务端逐条合并,两台设备同时做题也不会互相覆盖),无需任何设置。</p>
      <p class="modal-p">状态:<b>${stTxt}</b>${sync.lastSyncAt ? ` · 上次同步 ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : ''}</p>
      <div class="model-actions"><button class="btn btn-primary" id="m-sync">立即同步</button></div>` : gist ? `
      <p class="modal-p">已连接 GitHub Gist(后备同步方式)。数据在打开页面、切回页面时自动拉取合并,做题后自动推送。</p>
      <p class="modal-p">状态:<b>${stTxt}</b>${sync.lastSyncAt ? ` · 上次同步 ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : ''}</p>
      <div class="model-actions">
        <button class="btn btn-primary" id="m-sync">立即双向同步</button>
        <button class="btn btn-ghost" id="m-disc">断开连接</button>
      </div>` : `
      <p class="modal-p">在家庭网址 <b>wp.kailorik.com</b> 登录后会<b>自动同步</b>,什么都不用设置。这里是没有登录服务的镜像站,可以改用 GitHub Gist 同步:</p>
      <ol class="modal-ol">
        <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=word-problem-coach-sync" target="_blank" rel="noopener">点这里创建 GitHub Token</a>(已自动勾选 gist 权限,直接点最下面的 Generate token)</li>
        <li>复制生成的 token,粘贴到下面 → 连接;换一台设备粘贴同一个 token 即可同步</li>
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
  aiAvailable(true).then(ok => {
    if (!$('m-ai')) return;
    $('m-ai').innerHTML = ok
      ? `✅ 已就绪${ai.quota ? ` · 今日已用 <b>${ai.quota.used}/${ai.quota.limit}</b> 次` : ''}。做错题时自动诊断错因、画线段图、出变式题;错题本可生成学情分析,模型学堂可生成"我的套路卡"。`
      : `AI 老师只在家庭网址 <b>wp.kailorik.com</b> 登录后可用(DeepSeek 密钥只存在服务器上,外人打不开,不会白白消耗额度)。没有 AI 时,错因诊断用本地规则、变式题用出题机,照样能练。`;
    refreshSyncBadge();
  });
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
  if (cloud || gist) {
    $('m-sync').addEventListener('click', async () => {
      $('m-sync').disabled = true;
      await syncNow();
      div.remove(); openSyncModal();
    });
  }
  if (gist) {
    $('m-disc').addEventListener('click', () => {
      if (confirm('断开后数据仍保留在本设备和 Gist 里,只是不再自动同步。确定?')) { disconnect(); div.remove(); refreshSyncBadge(); }
    });
  }
  if (!cloud && !gist) {
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
// 同步拉回了别的设备的新数据:首页/错题本/档案这类概览页原地重绘(保留滚动位置);做题页不打断
window.addEventListener('wpc:saved', e => {
  if (!(e.detail && e.detail.fromSync) || !/^(#\/?)?(errors|log)?$/.test(location.hash)) return;
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
});

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
  route();
  initSync();
  aiAvailable().then(refreshSyncBadge);
}).catch(err => {
  view.innerHTML = `<div class="card"><h2>加载失败</h2><p>${err.message}</p><p>请刷新重试。</p></div>`;
});
