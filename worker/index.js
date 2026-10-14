// Worker 入口:/api/* 走接口(Access 校验后),其余交给静态资源
// 部署见 docs/DEPLOY.md。DeepSeek 密钥:wrangler secret put DEEPSEEK_API_KEY
import { DurableObject } from 'cloudflare:workers';
import { handleApi } from './api.js';
import { FamilyCore } from './core.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};

// 家庭数据:单实例 Durable Object(SQLite 持久化)。单线程执行 → 同步合并天然串行,没有竞态。
export class FamilyStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    this.core = new FamilyCore({
      get: k => {
        const rows = sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray();
        return rows.length ? rows[0].v : null;
      },
      put: (k, v) => { sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v); },
    });
  }
  getState() { return this.core.getState(); }
  syncState(text) { return this.core.syncState(text); }
  quota(limit) { return this.core.quota(limit); }
  useQuota(limit) { return this.core.useQuota(limit); }
}
