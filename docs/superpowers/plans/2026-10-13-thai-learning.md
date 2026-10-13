# 泰语学习工具实施计划

用户已要求在当前工程直接开发，采用本会话执行。设计依据：../specs/2026-10-13-thai-learning-design.md。

目标：交付可运行的 React 学习应用、Supabase 部署文件和 GitHub Pages 自动发布配置。云端实际发布需要用户账号配置。

## 全局约束

手机与电脑布局；罗马音和泰文并列；本地优先；不发布秘密；免费云服务；不将内容草稿冒充人工审核。

## 文件和接口

- src/domain/model.ts：词条、句型、事件及设置类型和备份验证。
- src/domain/learning.ts：deriveProgress(events, id, now)、checkAnswer(exercise, tileIds)、生成测验。
- src/data/store.ts：IndexedDB 本地事务、备份导入导出、订阅。
- src/services/cloud.ts：OAuth、同步调用、生成草稿。
- src/components/ 与 src/pages/：页面和交互。
- supabase/migrations/：RLS、允许名单、同步 RPC。
- supabase/functions/generate-entry/：生成代理。
- .github/workflows/deploy.yml：测试和 Pages 发布。

## Review Focus

- 重复点击或重复事件不能重复计入进度。
- 损坏备份不能覆盖有效数据。
- 删除和离线编辑冲突不能静默丢数据。
- Pages 子路径、登录回调和离线缓存路径必须一致。
- 无语音、无云配置、免费 API 不可用时仍可手动学习。

## Task 1 领域和本地数据

- [x] 创建工具配置和关键规则测试，运行观察失败。
- [x] 实现事件去重、复习阶段、词块判题、备份验证。
- [x] 实现 IndexedDB 数据和事务；测试实际数据恢复。
- [x] npm test 验证绿色。

## Task 2 学习界面

- [x] 写用户流程测试：揭示卡片、拼句、添加词条、刷新恢复。
- [x] 实现四个主页面、会话恢复、五类测验、编辑和导入导出。
- [x] 响应式主题、键盘可访问性、语音不可用反馈。
- [x] 执行浏览器测试并检查手机与桌面布局。

## Task 3 云集成

- [x] 编写同步合并测试，验证事件去重、版本冲突、墓碑。
- [x] 实现带账号隔离的同步和 OAuth PKCE。
- [x] 实现 Supabase RLS、串行同步 RPC、生成请求限流；真实云端配置待部署。
- [x] 未配置云账号时明示本地模式；不伪造登录或同步成功。

## Task 4 发布与验证

- [x] 配置离线资源、更新提示、Pages 子路径和 Actions。
- [x] 编写 README、环境样例、部署和课程规范说明。
- [x] npm test、npm run build、浏览器流程验证。
- [x] 独立代码审阅；修复重要发现。

## 实施记录

当前目录无 Git 仓库，直接在用户指定工程开发，不创建额外 worktree 或进行远程发布。语言内容先标明参考来源和待核对状态；免费生成供应商通过环境配置指定，未配置时保留手动输入。

验证细节、独立审阅结果和未完成的真实云端验证见 ../../development-status.md。
