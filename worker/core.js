// 家庭数据存储核心(纯逻辑,存储接口注入,node 可测):
//   syncState  服务端合并同步——云端文档与客户端状态用同一份 merge.js 合并后写回
//   quota      AI 每日调用计数(按北京时间换日)
// 存储布局:每个学生一份 JSON,按 CHUNK 字符切片(SQLite 单值上限 2MB;中文 UTF-8 占 3 字节,
// 300k 字符 ≤ 0.9MB),键 s:<学生>:n = 片数,s:<学生>:<i> = 第 i 片;students = 学生名列表。
import { mergeProfile } from '../js/merge.js';

export const CHUNK = 300000;

export function dayKey(ts) {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export class FamilyCore {
  // kv: { get(k) -> string|null, put(k, v) }
  constructor(kv, now = () => Date.now()) { this.kv = kv; this.now = now; }

  names() { return JSON.parse(this.kv.get('students') || '[]'); }

  readStudent(name) {
    const n = Number(this.kv.get(`s:${name}:n`) || 0);
    if (!n) return null;
    let text = '';
    for (let i = 0; i < n; i++) text += this.kv.get(`s:${name}:${i}`) || '';
    return JSON.parse(text);
  }

  writeStudent(name, profile) {
    const text = JSON.stringify(profile);
    const n = Math.max(1, Math.ceil(text.length / CHUNK));
    for (let i = 0; i < n; i++) this.kv.put(`s:${name}:${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK));
    this.kv.put(`s:${name}:n`, String(n)); // 最后写片数:读到的永远是完整的一版
  }

  getState() {
    const students = {};
    for (const name of this.names()) {
      const p = this.readStudent(name);
      if (p) students[name] = p;
    }
    return JSON.stringify({ version: 1, students, savedAt: Number(this.kv.get('savedAt') || 0) });
  }

  // clientText:客户端发来的 { students } JSON 文本(调用方已校验格式);返回合并后的完整状态文本
  syncState(clientText) {
    const client = JSON.parse(clientText);
    const names = new Set(this.names());
    for (const [name, prof] of Object.entries(client.students || {})) {
      if (!prof || typeof prof !== 'object') continue;
      const merged = mergeProfile(this.readStudent(name), prof);
      this.writeStudent(name, merged);
      names.add(name);
    }
    this.kv.put('students', JSON.stringify([...names]));
    this.kv.put('savedAt', String(this.now()));
    return this.getState();
  }

  quota(limit) {
    const day = dayKey(this.now());
    const used = Number(this.kv.get('ai:' + day) || 0);
    return { day, used, limit };
  }

  // 先占额度再调用;超限返回 ok:false
  useQuota(limit) {
    const q = this.quota(limit);
    if (q.used >= limit) return { ok: false, ...q };
    this.kv.put('ai:' + q.day, String(q.used + 1));
    return { ok: true, ...q, used: q.used + 1 };
  }
}
