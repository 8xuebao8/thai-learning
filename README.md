# 泰语日常 Thai Everyday

面向已经能用泰语日常交流的中文使用者。React 网页提供词汇卡、五类测验、拼句、个人词库和间隔复习；访客临时体验刷新即清空，登录后自动保存到云端。网页已发布到 GitHub Pages。

在线使用：[泰语日常](https://8xuebao8.github.io/thai-learning/) · 源码仓库：[8xuebao8/thai-learning](https://github.com/8xuebao8/thai-learning)。登录使用自己创建的邮箱密码账号，云数据保存在新加坡 Supabase。

## 本地运行

需要 Node.js 22.12 或以上兼容版本。

```bash
npm ci
npm run dev
```

打开终端显示的地址，通常是 `http://127.0.0.1:5173`。没有环境配置时自动使用临时体验模式，刷新清空，不会伪造登录、同步或 AI 生成成功。

```bash
npm test
npm run build
npm run preview
```

浏览器测试首次需要下载 Chromium：

```bash
npx playwright install chromium
npm run test:e2e
```

开发服务器不注册 Service Worker。离线能力需要构建后在 `npm run preview` 或正式 HTTPS 网页验证。

## 当前功能

- 四个页面：学习首页、词汇学习、拼句练习、学习进度。
- 单词卡中文揭示、发音检测、自评、前后切换、随机顺序、会话恢复、总结与难词再练。
- 罗马音选中文、中文选罗马音、听音、泰文拼写选择、例句缺词选择。
- 稳定词块 ID，撤回、重置、提示、答案揭示、合理替代答案及三种显示模式。
- 个人词条编辑、删除、例句与可选人工分词的个人拼句练习。
- 单词与句型分别按 1、3、7、14、30、60 天安排复习；提示不提升等级。
- 临时访客体验、账号自动云端保存；两次确认后初始化账号学习数据。
- Supabase 邮箱＋密码登录、账号隔离、事件去重、版本冲突副本、删除墓碑、分页同步。
- 免费生成代理需单独配置，所有返回内容为待确认草稿。

内置 18 个词语和 9 个句型是**待核对样例**，不是已获专业人工审核的正式课程。读音规范见 [罗马音约定](docs/romanization.md)。浏览器没有泰语声音时显示说明，听力题可以跳过；不承诺各设备声音一致。

## 配置 Supabase 免费同步

1. 创建 Supabase Free 项目，地区选择 Southeast Asia (Singapore)。
2. 在 SQL Editor 按文件名顺序执行 `supabase/migrations/` 下的迁移，每个只执行一次。已有项目只执行尚未应用的迁移。
3. Authentication → Sign In / Providers 确认 Email 已开启。个人工具可关闭 Allow new users to sign up；保持 Confirm email 开启。
4. Authentication → Users → Add user → Create new user，由本人填写登录邮箱与登录密码。个人账号可保留 Auto confirm user。登录密码与数据库密码独立；密码不进入工程或仓库。
5. 复制 `.env.example` 为 `.env`，只填写项目 URL 和 publishable key，重启开发服务器。
6. 在 Authentication → Users 找到个人账号 UUID，在 SQL Editor 添加允许名单：

```sql
insert into public.allowed_users(user_id)
values ('替换为自己的用户UUID') on conflict do nothing;
```

7. 网页点击“登录同步”，填写邮箱和密码；之后自动加载和保存云端数据。只有允许名单中的账号能够同步或调用生成接口。
8. Authentication → URL Configuration 的 Site URL 设置为正式网页地址；后续若启用邮件确认或密码恢复，需配置对应的回跳地址。邮箱密码登录不需要 GitHub OAuth 应用。

当前连接目标为 `thai-learning-sg`，项目 ID 为 `hvpmjhsommuewiwrhozl`。2026-10-13 已执行数据库迁移，确认 7 张表均启用 RLS。个人账号与允许名单已配置；邮箱登录、刷新后会话保持与真实设置上传已验证；多设备同步仍需正式发布后验收。

```dotenv
VITE_SUPABASE_URL=https://项目ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=替换为公开的publishable_key
```

公开配置可以被访问者看到，权限由真实用户身份和数据库 RLS 强制执行。数据库 secret key、service role、AI key 和 OAuth client secret 不能放在任何 `VITE_` 配置里。

访客数据只放在当前页面内存，刷新清空，登录后不会合并。账号修改自动上传，顶部显示保存状态；网络失败时自动重试，请等待“已保存到云端”再关闭页面。

学习进度页的「一键初始化」先确认清除范围，再输入“确认初始化”并第二次确认。清空个人词库、学习记录、已认识标记、目标和学习设置，保留账号与系统课程。数据库版本保护阻止旧设备恢复已清空数据；旧客户端需要刷新才能继续保存。

## 发布 GitHub Pages

1. 创建公开仓库并上传工程代码，排除 `.env`、`node_modules`、私人备份和秘密。
2. Repository Settings → Pages → Source 选择 GitHub Actions。
3. Settings → Secrets and variables → Actions → Variables 添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。这是公开前端参数。
4. 项目仓库路径默认自动使用 `/仓库名/`。如果仓库是 `用户名.github.io` 或使用自定义域名，添加变量 `PAGES_BASE=/`。
5. 推送 `main` 后，工作流执行单元测试、浏览器测试和构建，检查通过才发布。
6. 在 Supabase 中更新正式回跳地址，实际测试登录与两台设备同步。

本地验证项目子路径：

```bash
PAGES_BASE=/thai-learning/ npm run build
PAGES_BASE=/thai-learning/ npm run preview
```

打开 `http://127.0.0.1:4173/thai-learning/`。路由使用 `#/vocabulary` 等，刷新不需要服务器路由重写。

生产构建生成 manifest 和带版本的 Service Worker。首次完整加载后缓存应用和内置课程；访客离线也可临时体验，刷新仍清空。账号数据加载需要联网，使用中断网的修改等待自动重试，未上传前不显示保存成功。新版本在未进行卡片或测验时提示更新。

## 可选免费生成

生成服务未配置时，核心学习和手动录入正常工作。先验证账号所在地区的可用模型和免费额度，再决定是否启用。免费政策可能变化，不默认启用付费模型或自动升级。

Supabase Edge Function 使用服务端秘密配置：

- `APP_ORIGIN`：网页源，例如 `https://用户名.github.io`，不含仓库子路径。
- `GEMINI_API_KEY`：个人模型 API 密钥。
- `GEMINI_MODEL`：当前账号具有免费额度且实际验证通过的模型 ID。
- Supabase 自动提供的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。

在 Dashboard 或安全的本地 secrets 文件中配置，**不要把秘密粘贴到聊天、仓库或前端环境变量**。

通过 Supabase CLI 部署：

```bash
supabase login
supabase link --project-ref 你的项目ID
supabase functions deploy generate-entry
```

函数配置关闭平台旧 JWT 检查，并在函数内用 `auth.getUser(token)` 验证真实用户，再由数据库检查允许名单。浏览器公开 key 不足以调用生成。每次最多 500 字符，每用户每天最多 20 次；并发请求限制、幂等记录和过期租约在服务端执行。

请求只上传你主动输入的文本，不上传整个词库。免费模型供应商可能使用输入输出改善产品；不要输入保密的工作或个人材料。生成结果必须由你检查，不能作为已经审核的发音教材。

## 验证边界

单元测试包括复习阶段、稳定词块、数据恢复、备份拒绝、冲突合并、账号切换、字节批次限制。SQL 在本地 PGlite PostgreSQL 中执行，测试 RLS、禁止直接写入、RPC 去重、旧版本冲突、生成额度和崩溃恢复。浏览器测试覆盖桌面和手机。

真实邮箱登录、Supabase 云端同步、Edge Function 运行和模型输出需要项目配置后验收，本地测试不能代替实际云端测试。免费 Supabase 存在活动不足暂停机制，不含免费自动数据库备份。

## 项目文件

`src/domain` 管理学习规则，`src/data` 管理本地数据库，`src/services` 管理外部接口与同步，`src/pages` 和 `src/components` 管理界面，`src/content` 管理课程，`supabase` 包含数据库及云函数，`.github/workflows` 包含发布流程。

设计与实施记录位于 `docs/superpowers`。
