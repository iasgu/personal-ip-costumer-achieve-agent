# 2026-06-24 评论互动运营开发测试总结

## 本轮目标

围绕“评论互动运营”单独推进，不依赖视频生成和一键发布权限。

目标闭环：

```text
拉评论 -> 自动分类 -> 线索评分 -> 生成回复建议 -> 风险检查 -> 人工确认回复 -> 记录状态
```

## 已完成

### 1. 问卷策略接入升级

评论模块现在优先读取：

```text
prototype/auntie-douyin-interview/data/fused-strategy.json
```

如果融合策略不存在，再回退读取：

```text
prototype/auntie-douyin-interview/data/submissions.json
```

健康检查会显示当前策略来源，例如：

```json
{
  "auntieRulesLoaded": true,
  "auntieRulesSource": "fused-strategy:2026-06-24T08:26:00.441Z"
}
```

### 2. 多角色问卷与策略融合

新增：

```text
prototype/auntie-douyin-interview/tools/generate-model-interviews.mjs
prototype/auntie-douyin-interview/tools/fuse-strategies.mjs
prototype/auntie-douyin-interview/data/fused-strategy.json
```

融合策略会统计：
- 总样本数
- 真实填写数
- 合成角色数
- 模型生成数
- 高频规则、线索信号、负面处理、回复风格、避坑表达

当前策略池已更新到 34 份：
- 人类填写：3
- 显式合成角色样本：18
- 历史合成/测试样本：13
- 模型成功生成样本：0

新增覆盖了宝妈、房产、教培、健身、知识付费、探店、直播间运营、传统制造业、医美、律师、价格敏感用户等场景。

2026-06-24 20:32 更新：已有爸爸 1 份、妈妈 2 份人类问卷。融合算法已提高人类权重：
- 人类填写：基础权重 5
- 最近 24 小时人类填写：权重 7
- 模型生成：权重 1.5
- 本地合成/历史合成：权重 1

同时修正历史数据识别：早期因旧服务未保存 `synthetic:true` 的合成/测试样本不再算作真人。

### 3. 评论运营分析层

每条评论会补充：

```text
category
categoryLabel
leadScore
priority
recommendedAction
reasons
auntieRuleHints
```

当前支持：
- 价格咨询
- 素材咨询
- 效果质疑
- 内容咨询
- 账号诊断
- 合作线索
- 试用意向
- 负面质疑
- 承诺陷阱
- 行业适配
- 普通互动

### 4. 回复建议与风险检查

已覆盖：
- 负面质疑：先承认担心合理，再引导看样片
- 承诺陷阱：明确不保证涨粉、收益、百分百效果
- 账号诊断：引导提供账号或代表视频
- 合作线索：引导小范围样板测试
- 价格咨询：先问需求或引导试一条
- 素材咨询：解释头像/声音流程

风险检查已修复“不能保证”被误判为承诺的问题。

### 5. 自动化测试

测试脚本：

```powershell
cd prototype/douyin-comment-reply-agent
node tools/test-comment-ops.mjs
```

最新结果：

```text
PASS health
PASS reset mock
PASS list comments with analysis
PASS suggestions include analysis
PASS risk blocks forbidden promise
PASS manual reply success
PASS reply persisted
PASS ignore status
PASS batch high priority suggestions
PASS ops report markdown

passed: 10
failed: 0
```

测试后已执行：

```text
POST /api/reset-mock
```

当前 mock 数据恢复干净状态。

## 发现的问题

### 1. qwen3.7-plus 生成问卷超时

现象：
- `generate-model-interviews.mjs --limit 1 --timeout-ms 20000` 超时
- `--limit 3 --timeout-ms 45000` 也出现超时

已修复：
- 加并发控制
- 加单角色超时
- 用 `AbortController` 中止请求
- fallback 样本明确标记为 `local-fallback`

后续建议：
- 批量角色问卷用更快模型
- 高价值策略复核再用强模型

### 2. 旧服务进程导致新字段未保存

现象：
- 改完 `server.js` 后，8894 仍是旧进程
- 新提交样本缺少 `synthetic/modelGenerated/model`

处理：
- 停止 8893/8894 旧进程
- 用当前代码重启服务
- 重新提交 dry-run 样本
- 重新融合策略

### 3. 真实 OpenAPI 未联调

当前仍是 mock adapter。

等网页应用和权限通过后，需要配置：

```text
COMMENT_ADAPTER=douyin-openapi
DOUYIN_APP_TYPE=web
DOUYIN_ACCESS_TOKEN=...
DOUYIN_ITEM_ID=...
```

再验证：
- 拉真实评论
- 发真实回复
- 审核状态与失败原因

## 当前运行地址

评论运营模块：

```text
http://127.0.0.1:8893/
```

问卷后台：

```text
http://127.0.0.1:8894/admin.html
```
