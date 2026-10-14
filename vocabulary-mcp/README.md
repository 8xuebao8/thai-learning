> 已暂停：用户改选网页复制提示词与 JSON 导入，当前实现见 ../library-transfer/README.md。此目录保留原 MCP 设计，不表示已实现。

# Vocabulary MCP

本目录用于 Codex 专用词库 MCP 模块：查询、批量添加及修改个人泰语词库。

首版同时适配拼句练习，并采用“提取完整清单→用户明确确认→执行入库→逐条列出真实结果”的工作流。

当前状态：原设计已确认；新增收词规范和实施计划待审阅，尚无可运行服务，尚未部署或连接 Codex。

设计见 [DESIGN.md](./DESIGN.md)，默认字段与收词步骤见 [WORKFLOW.md](./WORKFLOW.md)，实施计划见 [PLAN.md](./PLAN.md)。实施时，源码、测试和不含凭证的 Codex 配置示例将放在本目录。Supabase 迁移与部署入口沿用根工程的标准目录。

请勿将数据库密码、service-role key 或词库访问凭证加入本目录、Git 仓库或聊天。
