# 多角色问卷与融合策略

## 目的

在真实访谈样本不足时，先用“合成抖音用户角色”填写评论问卷，生成一套可测试的评论互动策略底座。

这不是替代真人经验，而是让评论回复系统先具备可运行、可验证、可迭代的策略输入。

## 当前链路

```text
角色设定
-> 问卷 answers JSON
-> POST /api/submit
-> data/submissions.json
-> 融合策略 data/fused-strategy.json
-> 评论运营模块读取 fused-strategy
```

## 工具脚本

### 本地合成角色

```powershell
cd prototype/auntie-douyin-interview
node tools/generate-synthetic-interviews.mjs
```

### 模型角色问卷

```powershell
cd prototype/auntie-douyin-interview
node tools/generate-model-interviews.mjs --limit 3 --concurrency 3 --timeout-ms 45000
```

说明：
- 默认模型：`qwen3.7-plus`
- 默认读取百炼兼容 OpenAI 接口配置
- 支持 `--offset` 从角色池中间开始生成，避免重复前几个角色
- 如果模型超时或返回非法 JSON，会提交 `local-fallback` 样本，并记录 `generationError`
- 不会把 fallback 冒充成真实模型生成，`modelGenerated` 会保持 `false`

补足 30 份以上样本的命令：

```powershell
node tools/generate-model-interviews.mjs --offset 6 --limit 14 --concurrency 4 --dry-run
node tools/fuse-strategies.mjs
```

### 融合策略

```powershell
cd prototype/auntie-douyin-interview
node tools/fuse-strategies.mjs
```

输出：

```text
prototype/auntie-douyin-interview/data/fused-strategy.json
```

## 后台查看

```text
http://127.0.0.1:8894/admin.html
```

后台可以看到：
- 总样本数
- 真实填写数
- 合成角色数
- 模型生成数
- 融合后的核心策略提示

## 当前融合结果

截至 2026-06-24 20:32 左右：
- 总样本：34
- 人类填写：3
- 显式合成角色：18
- 历史合成/测试样本：13
- 模型成功生成：0

最新人类填写：
- 爸爸：1 份
- 妈妈：2 份

融合权重已调整：
- 人类填写：基础权重 5
- 最近 24 小时的人类填写：权重 7
- 模型生成：权重 1.5
- 本地合成/历史合成：权重 1

这样真实问卷会显著高于合成样本，不会被批量生成的角色淹没。

本轮新增的合成角色包括：
- 刚起号的新手宝妈
- 同城房产中介
- 教培机构校长
- 健身私教
- 知识付费博主
- 小红书转抖音用户
- 本地探店达人
- 企业老板助理
- 直播间运营
- 传统制造业销售
- 医美咨询师
- 律师个人IP
- 宝妈生活号观众
- 价格敏感型用户

核心策略：
- 优先回复有明确需求、想试、问案例、问账号诊断、问联系方式的评论
- 问联系、问案例、愿意留链接/账号的评论，是高价值线索
- 攻击性评论忽略、隐藏或低情绪回应
- 质疑类先承认担心合理，再给测试方式，不要对怼
- 价格类先问需求或引导试一条，不要上来硬报价
- 评论区避免直接发联系方式

## 发现的问题

`qwen3.7-plus` 作为问卷生成模型响应偏慢，本轮 20 秒和 45 秒测试都超时。已做修复：
- 加并发参数
- 加单角色超时
- 用 `AbortController` 真正中止请求
- fallback 样本明确标记来源

后续建议改用更快的文本模型做批量角色问卷，`qwen3.7-plus` 留给高质量策略复核。
