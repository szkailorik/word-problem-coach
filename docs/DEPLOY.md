# 部署指南:wp.kailorik.com(Cloudflare Worker + Access 登录门)

> 目标:和 mini2.kailorik.com 一样挂 Cloudflare Access 登录门;DeepSeek 密钥只在服务端;多设备登录后自动同步。
> GitHub Pages 镜像(szkailorik.github.io/word-problem-coach)照常可用,但没有 AI、用 Gist 同步。

## 架构

```
浏览器 → Cloudflare Access(邮箱验证码,策略同 mini2)→ Worker word-problem-coach
                                                     ├─ 静态资源(仓库根目录,.assetsignore 排除 worker/tests/docs 等)
                                                     ├─ /api/me    登录信息 + AI 可用 + 今日额度
                                                     ├─ /api/ai    DeepSeek 代理(密钥在 secret;每日上限、长度上限)
                                                     └─ /api/sync  Durable Object 服务端合并同步
```

## 一次性部署(约 10 分钟)

1. **登录 wrangler**(需要 Workers + Durable Objects 权限,用管理 kailorik.com 的那个 Cloudflare 账号):
   ```bash
   npx wrangler login
   ```
2. **发布 Worker**(在仓库根目录):
   ```bash
   npx wrangler deploy
   ```
3. **写入 DeepSeek 密钥**(只存在 Cloudflare,不进 Git、不进浏览器):
   ```bash
   npx wrangler secret put DEEPSEEK_API_KEY
   ```
4. **把域名切过来**:Cloudflare 控制台 → Workers & Pages → word-problem-coach → Settings → Domains & Routes → Add **Custom domain** `wp.kailorik.com`。
   (旧引擎当前占用这个域名:先在旧的 Pages 项目里移除 wp.kailorik.com 自定义域;旧站可以改挂 `wp-old.kailorik.com` 之类保留。)
5. **挂 Access 登录门**(与 mini2 相同):Zero Trust → Access → Applications → Add → Self-hosted
   - Application domain:`wp.kailorik.com`(建议再加一条 `word-problem-coach.<子域>.workers.dev`,或在 Worker 设置里关掉 workers.dev 路由)
   - Policy:直接复用 mini2 的那条 Allow 策略(同样的家庭邮箱)
   - 保存后在应用 Overview 里复制 **Application Audience (AUD) Tag**
6. **填 AUD**:把上一步的 AUD 填进 `wrangler.jsonc` 的 `vars.ACCESS_AUD`,再 `npx wrangler deploy` 一次。
   - 不填 AUD 时所有 /api 一律返回 401(fail closed)——这是故意的,防止 workers.dev 地址被外人直接调用。
7. **验证**:手机/电脑打开 wp.kailorik.com → 走邮箱验证码登录 → 顶栏出现「☁️ 已同步 · 🤖」;点开它能看到"AI 老师已就绪 · 今日已用 0/300"。

## 可调参数(wrangler.jsonc → vars)

| 变量 | 默认 | 说明 |
|---|---|---|
| `ACCESS_AUD` | 空 | Access 应用 AUD;可逗号分隔填多个 |
| `TEAM_DOMAIN` | divine-wave-23a0.cloudflareaccess.com | Access 团队域名(与 mini2 同一团队) |
| `ALLOWED_EMAILS` | 空 | 额外的邮箱白名单(逗号分隔);空 = 交给 Access 策略 |
| `AI_DAILY_LIMIT` | 300 | 每天最多调用 DeepSeek 次数(按北京时间换日);一次"出变式"约 2~6 次 |
| `DEEPSEEK_MODEL` | deepseek-chat | 模型名 |
| `DEEPSEEK_BASE` | https://api.deepseek.com | 上游地址(本地测试指向模拟服务) |

建议同时在 DeepSeek 控制台给这个 Key 设置用量提醒/上限,双保险。

## 本地开发

```bash
# 终端 1:模拟 DeepSeek(不花 Token;第一次出变式故意给错答案,用来测"验算不过→重出")
node tests/mock-deepseek.mjs 5399
# 终端 2:本地 Worker(.dev.vars 里 DEV_AUTH_BYPASS=1 只对 localhost 生效)
npx wrangler dev --port 8787
```

`.dev.vars`(不进 Git):

```
DEV_AUTH_BYPASS=1
DEEPSEEK_API_KEY=mock-key
DEEPSEEK_BASE=http://127.0.0.1:5399
```

想用真 DeepSeek 调试:把 `DEEPSEEK_API_KEY` 换成真 Key、删掉 `DEEPSEEK_BASE`。

## 测试

```bash
for t in tests/*.test.mjs; do node $t || echo "FAILED $t"; done
```
