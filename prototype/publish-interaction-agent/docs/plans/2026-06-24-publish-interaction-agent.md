# 发布与互动评论模块 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 独立做出一个「发布草稿 + 一键发布适配器 + 评论互动 + 即梦能力评估」模块，作为软件的一部分，暂不集成昨天的主生成项目。

**Architecture:** 新建 `prototype/publish-interaction-agent`，用独立前端和 Node 后端验证闭环。后端使用 adapter 层隔离平台能力，先实现 `mock/local`，后续再接 `douyin-openapi` 和 `volcengine-jimeng`。

**Tech Stack:** Windows、本地 Node.js HTTP 服务、原生 HTML/CSS/JS、JSON 文件本地存储、抖音开放平台 OpenAPI 预留、火山引擎即梦 API 预研。

---

## 背景判断

昨天反馈说明「主生成链路」方向成立。今天老板明确要求的是：

1. 自己用即梦、剪映、开拍跑整体流程并做对比。
2. 一键发布和互动评论模块今天做好，后续一起拼接。
3. 6 月 25 日上午检查没问题后，给西安开始测试。
4. 研究即梦各模式、API、智能模块，判断如何和我们的工作流、个人定位、知识库对齐。

今天的开发主线必须聚焦在「发布与互动」模块，不能被即梦/剪映/开拍调研拖散。

## 今日交付边界

必须完成：

- 独立模块目录。
- 发布草稿页面。
- mock 一键发布流程。
- mock 评论列表。
- AI 回复建议接口结构。
- 人工确认后回复评论的操作流。
- 即梦模式评估表和记录入口。
- 6 月 25 日西安测试准备清单。

尽量完成：

- 抖音 OpenAPI adapter 的环境变量和接口骨架。
- 即梦 API 能力矩阵。
- 剪映/开拍人工流程对比记录。

不做：

- 不接入昨天 `prototype/ip-agent` 的真实生成链路。
- 不做违规浏览器自动发布。
- 不把真实 DashScope、抖音、火山引擎密钥写入代码。
- 不承诺今天完成抖音官方真实发布，因为需要开放平台应用、OAuth、权限审核。

---

### Task 1: 初始化独立模块骨架

**Files:**
- Create: `prototype/publish-interaction-agent/server.js`
- Create: `prototype/publish-interaction-agent/index.html`
- Create: `prototype/publish-interaction-agent/styles.css`
- Create: `prototype/publish-interaction-agent/app.js`
- Create: `prototype/publish-interaction-agent/.env.example`
- Create: `prototype/publish-interaction-agent/run-server.cmd`
- Create: `prototype/publish-interaction-agent/data/.gitkeep`

**Step 1: 创建最小 Node 服务**

实现：

```js
GET /api/health
GET /
```

返回模块名、版本、adapter 状态。

**Step 2: 创建前端页面**

页面分三块：

- 发布草稿
- 评论互动
- 即梦评估

**Step 3: 验证启动**

Run:

```powershell
cd prototype/publish-interaction-agent
node server.js
```

Expected:

```text
http://127.0.0.1:8891/
```

可以打开，`/api/health` 返回 200。

---

### Task 2: 发布草稿 mock 闭环

**Files:**
- Modify: `prototype/publish-interaction-agent/server.js`
- Modify: `prototype/publish-interaction-agent/app.js`
- Modify: `prototype/publish-interaction-agent/index.html`

**Step 1: 实现草稿创建接口**

接口：

```text
POST /api/publish/drafts
```

存储到：

```text
prototype/publish-interaction-agent/data/drafts.json
```

**Step 2: 实现发布提交接口**

接口：

```text
POST /api/publish/drafts/:draftId/submit
```

mock 返回：

```json
{
  "status": "submitted",
  "reviewStatus": "pending"
}
```

**Step 3: 实现状态查询接口**

接口：

```text
GET /api/publish/:publishId/status
```

mock 逻辑：

- 提交后 10 秒内：`pending`
- 10 秒后：`published`

**Step 4: 前端接入**

用户输入：

- 视频地址或本地路径
- 标题
- 描述
- 话题
- 发布时间

按钮：

- 保存草稿
- 提交发布
- 查询状态

---

### Task 3: 评论互动 mock 闭环

**Files:**
- Modify: `prototype/publish-interaction-agent/server.js`
- Modify: `prototype/publish-interaction-agent/app.js`
- Modify: `prototype/publish-interaction-agent/index.html`
- Create: `prototype/publish-interaction-agent/data/comments.seed.json`

**Step 1: 准备 mock 评论数据**

示例评论：

```json
[
  {
    "commentId": "comment_001",
    "userName": "测试用户A",
    "text": "这个工具怎么收费？",
    "replyStatus": "pending"
  },
  {
    "commentId": "comment_002",
    "userName": "测试用户B",
    "text": "能不能生成我自己的声音？",
    "replyStatus": "pending"
  }
]
```

**Step 2: 实现评论列表接口**

接口：

```text
GET /api/comments?publishId=pub_001
```

**Step 3: 实现回复建议接口**

接口：

```text
POST /api/comments/:commentId/suggestions
```

今天先用规则 + 模板生成，不依赖模型，避免被 key 和模型速度卡住。

规则：

- 收费问题：引导私聊/试用。
- 声音问题：说明支持上传或录制音频。
- 效果问题：说明先用爆款链接测试。
- 其他问题：给通用口语化回复。

**Step 4: 实现人工确认回复接口**

接口：

```text
POST /api/comments/:commentId/reply
```

mock 更新评论状态为 `replied`。

**Step 5: 前端接入**

评论列表每条显示：

- 用户名
- 评论内容
- AI 回复建议
- 编辑框
- 确认回复按钮

---

### Task 4: 抖音 OpenAPI adapter 骨架

**Files:**
- Create: `prototype/publish-interaction-agent/adapters/douyin-openapi.js`
- Modify: `prototype/publish-interaction-agent/.env.example`
- Modify: `prototype/publish-interaction-agent/docs/api-contract.md`

**Step 1: 定义环境变量**

```text
PUBLISH_ADAPTER=mock
DOUYIN_CLIENT_KEY=
DOUYIN_CLIENT_SECRET=
DOUYIN_REDIRECT_URI=
DOUYIN_ACCESS_TOKEN=
```

**Step 2: 定义 adapter 方法**

```js
async function createDraft(input) {}
async function submitDraft(draft) {}
async function getPublishStatus(publishId) {}
async function listComments(publishId) {}
async function replyComment(commentId, text) {}
```

**Step 3: 未配置权限时返回明确错误**

错误信息：

```text
抖音 OpenAPI 未配置。请先准备开放平台应用、OAuth 授权、视频发布权限、评论管理权限。
```

---

### Task 5: 即梦能力矩阵和评估入口

**Files:**
- Create: `prototype/publish-interaction-agent/docs/jimeng-capability-matrix.md`
- Modify: `prototype/publish-interaction-agent/index.html`
- Modify: `prototype/publish-interaction-agent/app.js`
- Modify: `prototype/publish-interaction-agent/server.js`

**Step 1: 建能力矩阵**

至少记录：

- 文生图
- 图生图智能参考
- 视频生成 3.0
- 动作模仿
- 动作模仿 2.0
- OmniHuman1.5
- 数字人快速模式
- 小云雀智能生视频 Agent
- 小云雀营销成片 Agent

字段：

```text
能力名称 / 输入 / 输出 / 适合环节 / 风险 / 是否优先测试
```

**Step 2: 做评估记录接口**

接口：

```text
POST /api/jimeng/evaluate
GET /api/jimeng/evaluations
```

存储到：

```text
prototype/publish-interaction-agent/data/jimeng-evaluations.json
```

**Step 3: 前端评估表单**

字段：

- 模式
- 输入素材
- 耗时
- 预估成本
- 质量评分
- 是否适合个人 IP
- 备注

---

### Task 6: 6 月 25 日西安测试准备清单

**Files:**
- Create: `prototype/publish-interaction-agent/docs/2026-06-25-xian-test-checklist.md`

**Step 1: 写测试前置条件**

包括：

- 本地 Demo 是否能启动
- mock 发布是否可跑通
- mock 评论是否可跑通
- 是否有演示视频
- 是否有演示账号
- 是否需要抖音开放平台权限

**Step 2: 写风险说明**

必须明确：

- 抖音真实发布需要开放平台应用和权限审核。
- 评论回复只能回复授权账号自己发布的视频评论。
- 即梦是否替换 Wan，需要实测成本、耗时、质量。
- 剪映目前不作为稳定后端 API。

---

## 今日时间安排

### 09:30-10:30

完成独立模块骨架、README、API 草案。

### 10:30-12:00

完成发布草稿 mock 闭环。

### 13:30-15:00

完成评论互动 mock 闭环。

### 15:00-16:00

补抖音 OpenAPI adapter 骨架和配置说明。

### 16:00-17:30

整理即梦能力矩阵，标出优先测试模式。

### 17:30-18:30

写 6 月 25 日西安测试准备清单，检查前端体验。

---

## 验收标准

今天结束时，打开独立模块页面应该能做到：

1. 填一个视频地址、标题、话题，保存发布草稿。
2. 点击提交发布，看到 mock 发布状态。
3. 查询发布状态，看到 pending 到 published 的变化。
4. 查看 mock 评论列表。
5. 对每条评论生成回复建议。
6. 编辑后点击确认回复，状态变成已回复。
7. 在即梦评估区录入一次模式测试结果。
8. 明确看到抖音真实发布/评论需要哪些权限。

---

## 官方资料

- 抖音内容发布接入方案：https://open.douyin.com/platform/resource/docs/ability/content-management/douyin-publish-solution
- 抖音评论管理能力：https://developer.open-douyin.com/capacity-center-page/capacity-detail/7180530418775490619
- 抖音回复视频评论：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/interaction-management/comment-management-user/video-comment-reply
- 即梦 AI 产品页：https://www.volcengine.com/product/jimeng
- 即梦 AI 文档目录：https://www.volcengine.com/docs/85621
- 即梦视频生成 3.0：https://www.volcengine.com/docs/85621/1785201
- 即梦数字人快速模式：https://www.volcengine.com/docs/85621/1810468

