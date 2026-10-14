# 专用词库 MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Codex 按统一收词规范查询、批量添加和修改个人泰语词库，并在现有网页同步显示。

**Architecture:** Supabase Edge Function 提供无会话状态的 Streamable HTTP MCP，专用数据库函数验证可撤销凭证并执行账号隔离事务。词库读写复用现有游标、版本与 epoch；网页提供最小凭证管理入口。工作流由 MCP 说明、资源及提示词提供，硬性约束在服务端执行。

**Tech Stack:** TypeScript、标准 MCP SDK 的 Web Request/Response HTTP transport、Zod、Supabase Edge Functions/PostgreSQL、React、Vitest/PGlite、Playwright。实施时核对 SDK 官方当前接口，固定实际验证过的版本及锁文件，不猜测版本号。

**Spec:** [DESIGN.md](./DESIGN.md) 与 [WORKFLOW.md](./WORKFLOW.md)。原设计已获用户同意；工作流是本轮新增要求的具体化。

## Global Constraints

- 只连接 thai-learning-sg：hvpmjhsommuewiwrhozl；不修改电脑、浏览器或全局 Codex 设置。
- 仅三个写读工具：query_vocabulary、add_vocabulary_batch、update_vocabulary；不提供 SQL、删除、初始化或学习事件写入。
- 源码、测试、配置示例在 vocabulary-mcp/；部署入口、迁移留在根工程 Supabase 标准目录。
- 查询默认 20、最大 50；每次添加 1–50 条，请求最大 256 KiB；沿用 wordSchema 长度限制。
- 凭证只显示一次、只存摘要、30 天到期、可撤销；无数据库密码或 service-role 传给 Codex。
- userId、source、review、enrichment、版本和同步字段由服务端决定；所有内容写入产生 learning_changes。
- 不确定读音或释义留空并保存 pending；默认简体中文及现有网页 ¹–⁵ 声调约定。
- 不启动付费服务；真实连接和凭证录入完成前不宣称 Codex 已接入。

## Review Focus

1. 中文查询含 %、_ 或泰语组合字符：字面查询，不能变成任意通配符或漏掉标准化重复词（任务 1、2）。
2. 课程词被用户覆盖、删除或恢复：列表与网页一致，不能再次露出被隐藏的种子版本（任务 2）。
3. 凭证撤销与正在写入的请求竞态：用数据库锁明确顺序，撤销完成后的请求不能再写（任务 2）。
4. 例句只填部分、更新原词却保留旧例句：返回可理解的校验说明，不默默存错配数据（任务 1、4）。
5. 写入成功但响应丢失、随后用户初始化：重试先检查 epoch，不能旧成功回执掩盖已清空状态（任务 2、5）。

## 文件结构

- vocabulary-mcp/src/contracts.ts：工具输入、输出类型、内容规范化与默认值。
- vocabulary-mcp/src/server.ts、handler.ts、repository.ts：MCP 注册、HTTP 边界、Supabase RPC 适配，各司一职。
- vocabulary-mcp/src/workflow.ts：从 WORKFLOW.md 生成的版本化文本及资源、提示词定义；生成检查防漂移。
- vocabulary-mcp/scripts/generate-catalog.ts、generate-workflow.ts：课程目录迁移与工作流文本生成，支持 --check。
- vocabulary-mcp/tests/{contracts,database,protocol}.test.ts：边界、事务、真实 SDK 客户端验证。
- vocabulary-mcp/examples/codex.toml、README.md：无密钥配置示例和部署/使用说明。
- supabase/functions/vocabulary-mcp/index.ts、deno.json：薄部署入口与固定依赖。
- supabase/migrations/202610140002_vocabulary_mcp.sql、202610140003_vocabulary_catalog.sql：权限与 RPC、受版本控制的课程目录。
- src/services/vocabulary-connection.ts、src/components/VocabularyConnection.tsx：凭证管理服务与 UI。
- e2e/vocabulary-connection.spec.ts、e2e/vocabulary-mcp-sync.spec.ts：管理和同步体验。
- 修改 vitest.config.ts、package.json/锁文件、supabase/config.toml、src/App.tsx；课程数据继续以 src/content/course.ts 为源，不复制手工维护。

### Task 1: 工具契约与收词规范

**Interfaces:** `normalizeEntry(input: unknown): EntryValidation` 返回 `{ok:true,value:EntryContent}` 或 `{ok:false,issues:string[]}`；EntryContent 为 thai/chinese/roman/theme/pos/note/example。`QueryInput` 含 keyword/id/status/limit/cursor；`AddInput` 含 requestId/expectedEpoch/entries；`UpdateInput` 含 requestId/expectedEpoch/id/expectedVersion/patch。所有结果带 epoch，错误含稳定 code/message；批量结果保留输入 index。

- [ ] 写 contracts.test.ts：`expect(normalizeEntry({thai:' งาน '}).value).toMatchObject({thai:'งาน',chinese:'',roman:'',theme:'personal'})`；非法 theme、超长字段、空补丁、未知管理字段被拒绝；50 条通过、51 条拒绝；更新允许缺省字段但不能提交部分例句对象；NFC 等价输入同一规范化值。
- [ ] 配置 Vitest 包含新目录，运行 `npx vitest run vocabulary-mcp/tests/contracts.test.ts`，确认失败源于缺失实现。
- [ ] 实现 contracts.ts，严格区分 pending 和 ready；只提供内容字段，服务端生成 source/review/enrichment。生成 workflow.ts，将源文案通过 --check 验证一致。
- [ ] 运行上述测试及工作流生成检查，全部通过后提交本任务文件。

### Task 2: 数据库权限、课程目录与事务

**Interfaces:** SQL RPC `vocabulary_query(p_token text,p_input jsonb)`、`vocabulary_add(p_token text,p_input jsonb)`、`vocabulary_update(p_token text,p_input jsonb)` 均返回契约 JSON；`vocabulary_authenticate(p_token text)` 只返回有效凭证的权限与到期元数据，供协议入口验证，不返回账号私密数据。管理 RPC `create_vocabulary_token(p_label text)` 返回一次性 token/id/expiresAt，`list_vocabulary_tokens()` 只返元数据，`revoke_vocabulary_token(p_id uuid)` 只撤销当前用户记录。用 32 随机字节 token、SHA-256 摘要；管理需 auth.uid 和允许名单，业务 RPC 验专用 token。

- [ ] 写 database.test.ts，复用现有 PGlite 的 auth/角色设置：无效、过期、撤销、非允许名单和跨账号调用拒绝；直接访问凭证表、幂等表拒绝。管理函数不泄漏其他账号，不返回历史明文。
- [ ] 添加事务断言：有效添加产生相同 seq 的变更记录；同请求内容重试只写一次、异内容复用报错；旧版本 conflict；旧 epoch account_reset，即便存在旧回执；有效项和 invalid/duplicate 按 index 返回；基础设施失败全部回滚；学习事件不改变。
- [ ] 添加种子覆盖/隐藏/恢复、字面 %/_ 搜索、NFC 去重、翻页不重复测试。游标编码筛选摘要、epoch、最后 ID，换筛选或 epoch 拒绝旧游标；默认20最大50。加入受锁串行化的撤销/写入测试，必要时用本地真实 Postgres 补足 PGlite 并发能力。
- [ ] 运行 `npx vitest run vocabulary-mcp/tests/database.test.ts`，确认新 RPC 缺失导致失败。
- [ ] 实现两份迁移和课程生成脚本：只读课程表通过部署迁移填充，--check 验证与 courseWords 一致。业务函数重复验证硬限制，安全固定 search_path、撤销默认 PUBLIC 执行权，只授予必要 RPC；账号游标同现有同步/初始化锁顺序。凭证行锁按共享读取、撤销排他顺序设计，避免死锁。
- [ ] 幂等表主键 account+epoch+requestId，保存操作类型和规范化负载摘要，成功响应保存原结果；账号 reset 检查优先。每凭证每分钟最多60业务调用，数据库计数，返回 rate_limited/retryAfter；异常不回滚掉需保留的限流计数。
- [ ] 运行新数据库测试及 `npx vitest run src/services/database.test.ts src/services/reset-database.test.ts`；通过后提交。

### Task 3: 可部署 MCP HTTP 服务

**Interfaces:** `createVocabularyServer(repository: VocabularyRepository): McpServer`；repository 定义 `authenticate(token)` 及 `query(token,input)`、`add(token,input)`、`update(token,input)`，返回任务1的结果。`createHandler(config): (request: Request) => Promise<Response>` 对接标准 SDK 无状态 Web transport；token 仅请求作用域传递，不存在跨用户全局单例。

- [ ] 写 protocol.test.ts，使用真实 SDK Client：initialize、tools/list 恰好三工具、tools/call、通知、resources/read 和 prompts/get；缺失/错误 bearer 被拒绝；输出词条不能作为服务器指令执行；响应不泄漏 token/SQL 异常。
- [ ] 添加边界测试：分块或伪造 Content-Length 仍限制真实请求至256 KiB；不支持方法返回405；身份在资源及提示词读取时也验证；读规范不需要开启写工具；transport 不要求跨 Edge 实例保存会话。
- [ ] 运行协议测试确认失败；核对 SDK 官方当前 Web transport 及 Supabase Edge 兼容性，固定依赖和锁文件。
- [ ] 实现 server/handler/repository、薄 Edge 入口、config.toml verify_jwt=false（应用自验专用凭证，绝非匿名放行）。工具描述附核心工作流，资源 URI `vocabulary://workflow/v1`，提示词 `collect_vocabulary(text,mode)`；不添加第四个业务工具。
- [ ] 运行协议测试、类型检查及 Edge 本地 smoke test，通过后提交。

### Task 4: 网页凭证管理与 Codex 使用文档

**Interfaces:** `createVocabularyToken(label): Promise<{id,token,expiresAt}>`、`listVocabularyTokens(): Promise<TokenMetadata[]>`、`revokeVocabularyToken(id): Promise<void>` 使用现有登录会话调用管理 RPC。VocabularyConnection 仅登录账号显示，退出账号卸载并清空一次性凭证状态。

- [ ] 写 e2e/vocabulary-connection.spec.ts：访客不可用；生成仅显示一次；关闭再打开不重现；账号切换清空；撤销后状态更新；失败有重试信息；令牌不得进入 localStorage、网址或日志。
- [ ] 运行对应 Playwright 测试，确认缺少入口导致失败。
- [ ] 实现组件和服务，接入 App 现有设置/登录区域；界面写清权限与30天有效期。README 给出查询、收词、改词示例及不确定内容处理；引用 WORKFLOW.md，不另维护一份矛盾的规范。
- [ ] 写 examples/codex.toml：URL 指向本项目函数，只用 bearer_token_env_var=`THAI_VOCABULARY_MCP_TOKEN`，不含真实凭证；给用户手动配置步骤，不自动改全局配置。
- [ ] 运行 UI 测试和构建，通过后提交。

### Task 5: 同步验收、回归及真实连接

**Interfaces:** 沿用现有 sync_learning_v2、网页每30秒及回前台同步、reset_learning；不新增另一套学习状态。

- [ ] 写 e2e/vocabulary-mcp-sync.spec.ts：模拟实际 RPC 变更包，新增可见、pending 不入练习、修改保留 known 状态、网页未保存修改遇到 MCP 新版走现有冲突流程；单独数据库测试真实 MCP 写入到 sync_learning_v2 读取的完整链路。
- [ ] 先运行新增测试确认能捕获缺失同步或错误状态，完成必要适配后重跑。
- [ ] 执行 `npm test`、`npm run build`、`npm run test:e2e`、`npm run test:production`；课程/工作流 --check；记录实际结果，不重复已通过检查除非又有变更。
- [ ] 做一次整分支独立审查，修复实质问题并定向回归；按照已有部署授权应用新加坡迁移、部署函数、发布网页，核对结果，不触碰悉尼项目。
- [ ] 用户在网页生成并自行配置凭证后，检查 Codex 工具发现，使用明确标注测试词完成查询→批量添加→修改→网页同步；用户撤销测试凭证后确认拒绝。如客户端需重载，向用户说明具体操作；不冒称工具已可调用。
- [ ] 记录最终部署位置、实际验证、未完成限制；提交必要修复和文档。测试词首版无删除工具，由用户从网页处理。

## 执行建议与当前状态

### 必须合入上述任务的新增验收项

- 任务1：EntryContent 与补丁增加可选 Word.sentence；2–20词块、每块泰文/读音长度100/200、最多20组完整索引排列、解释最多2000字符。整句词块拼接按 NFC/去空白后匹配原句；重复词按索引区分；省略保留、null 拒绝、结构完整替换。测试数量越界、缺读音、重复/遗漏/越界索引、原句变更后旧词块不匹配。
- 任务2：SQL 同样验证 sentence，查询返回完整结构，写入变更日志。测试相同句子返回 duplicate 而不暗中添加练习、明确修改保留 ID 和学习事件、无效练习被拒绝。
- 任务3：collect_vocabulary 增加 extract 模式；资源和说明包含“提取不写入、答复末尾完整候选、明确确认后入库、逐条真实回执”。协议测试验证工具 schema 暴露 sentence，资源/提示词载入完整流程；不能声称协议测试能证明模型每次遵循自然语言授权。
- 任务4：使用文档加入长段落→清单→修改候选→用户确认→逐条结果的示例，清单有稳定编号和修订号；遗漏上下文须重新展示，不推测旧清单。
- 任务5：扩展 e2e/vocabulary-mcp-sync.spec.ts，新增拼句同步进入“我的句子”，验证默认答案、合理变体、错误答案、重复词块。必要时修改 src/content/course.ts 和 src/pages/Sentences.tsx：pending 不进拼句；同 ID 的题目内容云端更新时刷新词块、选择和答题状态，不能只依赖 exercise.id 保留旧词块。真实验收用明确测试段落，先展示候选，用户确认后写入，逐条汇报词语和练习 ID，再在网页完成拼句。

推荐在本会话由主代理逐项实现，最后一次独立审查：五项共享字段、SQL事务及同步契约，连续实施有利于保持一致。另一选项是每项独立子代理实施和审查，成本更高。

当前仅设计与计划文档完成；等待用户审阅计划并选择执行方式，尚未实现、部署或更改 Codex 配置。
