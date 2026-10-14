# 自定义主题 Implementation Plan

Goal: 用户已明确授权实现主题新建、重命名、删除、词语移动及 AI 复制/预览适配。
Architecture: 主题目录存入既有 settings 同步记录，固定 ID 与名称分离。删除保留重定向到用户选择的有效主题；所有视图解析重定向，旧词/离线词/恢复的词也不会丢失归属。personal 为不可删除的归档主题，其余初始主题同样可以管理。学习事件 ID 不变。
Tech Stack: React / TypeScript / Zod / Dexie / Supabase PostgreSQL。

Constraints: 免费；不更改电脑设置；访客内存体验；主题和词条一起原子提交；取消不写数据；云端继续允许名单与 epoch 隔离；不修改学习目标和学习历史。

- [x] 主题目录模型和解析函数：固定默认值、唯一名称、custom: ID、删除重定向与循环校验；先写测试。
- [x] AI operations 扩展 theme_add/theme_rename/theme_delete/move；目录快照并发校验；所有被迁移词与拼句列出预览；保留旧 v1 词条包兼容。
- [x] 服务将主题目录与词条放入同一确认事务；RPC v2 仅允许 settings.themes 改变，其他设置与事件禁止通过导入写入；重复回执正确还原各行。
- [x] 网页主题管理表单与批量移动；所有主题筛选、编辑器、首页、拼句使用统一有效目录。
- [x] 单元/服务/数据库/桌面手机回归；部署 SQL 与 Pages，核对上线状态。

Review focus: 删除链与同包目标被删除；重命名保留学习状态；主题新增后同包加词；预览之后目录变化；老客户端 settings 写入丢主题。每项在对应层回归覆盖。

验证：49项单元/数据库测试，48项桌面/手机回归通过。独立审查发现SQL空redirectTo问题，已用失败回归测试复现并修复。新加坡项目迁移执行成功。
