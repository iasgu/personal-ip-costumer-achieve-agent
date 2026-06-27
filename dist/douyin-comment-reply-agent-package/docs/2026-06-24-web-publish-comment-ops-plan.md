# 网页应用一键发布与评论互动运营开发计划

更新时间：2026-06-24

## 目标

围绕企业网页应用路线，建设两个能力：

```text
1. 一键发布/发布辅助
2. 评论互动运营
```

短期先把评论互动运营做成可用模块；一键发布等网页应用和 API 权限下来后接入。

## 官方文档结论

### 1. 评论互动运营可以作为主线先做

官方“视频评论管理”支持：

```text
小程序、移动应用、网站应用
```

能力说明：

- 可批量获取抖音视频评论内容。
- 可通过回复评论接口解答用户疑问。
- 移动/网站应用需要在页面申请能力。
- 审核时间通常 2-3 个工作日。
- 需要用户授权。
- 回复视频评论只能回复授权用户自己发布的视频。

移动/网站应用相关 scope：

```text
item.comment
```

主要接口：

```text
GET  /item/comment/list/
GET  /item/comment/reply/list/
POST /item/comment/reply/
Webhooks 接收评论回复事件
```

### 2. 视频数据建议一起申请

官方“视频数据”支持：

```text
小程序、移动应用、网站应用
```

用途：

- 查询授权用户视频列表。
- 查询视频基本信息。
- 获取 item_id。
- 配合发布能力通过 share_id / Webhooks 找到发布后的视频 item_id。

移动/网站应用需要申请：

```text
内容运营-视频信息数据
内容运营-视频互动数据
```

### 3. 发布能力要拆成两种

#### A. 发布内容至抖音：H5 场景

官方“发布内容至抖音”支持：

```text
移动应用、网站应用
```

特点：

- 更像“用户自主触发发布/分享”。
- 应用内按钮文案和能力必须一致。
- 发布能力适合用户自己有内容创作的场景。
- 需要申请“发布内容至抖音：H5场景”。
- 使用规范强调用户自主触发。

准入限制：

- 仅对创作工具、社区、硬件配套、游戏类应用开放。
- 如涉及企业宣传、商品介绍、诱导分享等营销类内容分享，将不开放该能力准入。

#### B. 代替用户发布内容到抖音：Beta OpenAPI

官方“代替用户发布内容到抖音”支持：

```text
网站应用
```

但准入非常窄：

- 当前仅支持网站应用。
- 仅可在网站应用电脑端网站中授权、使用。
- 仅支持政务或媒体机构做内部多媒体管理平台。
- 开发者主体需为党政机关或事业单位。
- 不可对外面向 C 端用户使用。
- 审核约 7 个工作日。

因此我们当前商业工具路线不应把它作为默认方案。

## 产品路线判断

### 推荐短期路线

```text
生成视频
-> 生成标题/文案/话题
-> 网页发布草稿
-> 用户自主触发发布/保存/复制
-> 获取视频数据
-> 拉评论
-> AI 生成回复建议
-> 人工确认回复
```

### 不建议短期承诺

```text
后端全自动代替用户发布到抖音
```

原因：

- 官方 Beta 能力准入极窄。
- 不适合对外 C 端 SaaS。
- 监管要求高。

## 模块架构

```text
web-publish-console
  网页工作台
  发布草稿
  授权入口
  评论运营界面

douyin-platform-service
  OAuth
  token 管理
  视频数据
  评论列表
  评论回复
  Webhooks

publish-adapter
  mock
  h5-assisted-publish
  douyin-create-bind-beta（仅保留接口，不作为默认）

comment-adapter
  mock
  douyin-openapi

reply-engine
  舅妈规则
  个人IP人设
  风险词检查
  AI 回复建议
```

## 数据模型

### AccountAuthorization

```json
{
  "id": "auth_001",
  "openId": "douyin_open_id",
  "nickname": "授权账号昵称",
  "scope": "item.comment,video.list",
  "accessTokenEncrypted": "...",
  "refreshTokenEncrypted": "...",
  "accessTokenExpiresAt": "2026-07-09T00:00:00+08:00",
  "refreshTokenExpiresAt": "2026-07-24T00:00:00+08:00",
  "status": "active"
}
```

### PublishDraft

```json
{
  "id": "draft_001",
  "videoUrl": "https://cdn.example.com/output.mp4",
  "title": "标题",
  "description": "文案",
  "hashtags": ["个人IP", "AI获客"],
  "status": "draft",
  "shareId": "",
  "itemId": "",
  "createdAt": ""
}
```

### CommentTask

```json
{
  "id": "comment_task_001",
  "itemId": "video_item_id",
  "commentId": "comment_id",
  "content": "评论内容",
  "category": "lead | question | negative | normal | spam",
  "leadScore": 80,
  "suggestions": [],
  "selectedReply": "",
  "replyStatus": "pending | submitted | approved | failed | ignored",
  "risk": {
    "level": "low",
    "notes": []
  }
}
```

## 开发阶段

## Phase 1：评论互动运营 MVP（今天优先）

目标：

把 `douyin-comment-reply-agent` 从 mock 工作台升级为可接真实 OpenAPI 的评论运营模块。

任务：

1. 完善评论工作台：
   - 视频 item_id 输入。
   - 评论列表。
   - 评论分类。
   - 线索评分。
   - 回复建议。
   - 风险检查。
   - 人工确认回复。
   - 忽略/标记已处理。

2. 完善规则引擎：
   - 接入“舅妈评论回复规则”。
   - 分类：价格咨询、素材咨询、效果质疑、账号诊断、合作意向、负面攻击、普通互动。
   - 风险词：保证涨粉、稳赚、百分百、微信、手机号、转账等。

3. OpenAPI adapter 骨架：
   - `GET /item/comment/list/`
   - `GET /item/comment/reply/list/`
   - `POST /item/comment/reply/`
   - token 未配置时返回明确错误。

4. 测试：
   - mock 评论 10 条。
   - 每类评论至少 1 条。
   - 生成建议。
   - 人工确认回复。
   - 风险拦截。

验收：

```text
打开评论工作台 -> 拉 mock 评论 -> 自动分类/评分 -> 生成回复 -> 风险检查 -> 人工确认回复
```

## Phase 2：网页应用 OAuth 与 Token 管理

等待企业网页应用创建后开始。

需要合作伙伴提供：

```text
client_key
client_secret
redirect_uri
已申请 scope 列表
```

后端接口：

```text
GET  /api/douyin/oauth/start
GET  /api/douyin/oauth/callback
POST /api/douyin/oauth/refresh
GET  /api/douyin/accounts
POST /api/douyin/accounts/:id/revoke
```

注意：

- 授权 URL：`https://open.douyin.com/platform/oauth/connect/`
- `redirect_uri` 必须 HTTPS。
- `redirect_uri` 不支持携带自定义 query 参数。
- code 10 分钟有效且只能使用一次。
- access_token 建议服务端保存。
- access_token 有效期 15 天。
- refresh_token 有效期 30 天。
- refresh_token 过期后需要重新授权。

## Phase 3：真实评论 OpenAPI 联调

前置条件：

- `item.comment` 权限通过。
- 用户完成授权。
- 有授权用户自己发布的视频 item_id。

任务：

1. 用 access_token 拉评论列表。
2. 用 comment_id 生成回复建议。
3. 提交回复。
4. 记录平台返回。
5. 标记审核中。
6. 接 Webhooks 或轮询回复列表更新状态。

限制：

- 只能回复授权用户自己发布的视频。
- 图集目前不支持评论。
- 私密账号等场景端上可能不展示。
- 回复内容需要审核。

## Phase 4：发布草稿与 H5 发布辅助

前置条件：

- 网站应用创建。
- 申请“发布内容至抖音：H5场景”。
- 确认可用接入方式和页面规范。

任务：

1. 发布草稿管理：
   - 视频 URL。
   - 标题。
   - 文案。
   - 话题。
   - 小程序挂载/锚点预留。

2. 用户自主触发：
   - 明确按钮文案。
   - 明确“发布到抖音”行为。
   - 不做诱导分享/奖励导向。

3. 发布后回流：
   - 通过 share_id / Webhooks / 视频数据能力匹配 item_id。
   - 进入评论运营模块。

验收：

```text
生成视频 -> 创建发布草稿 -> 用户触发发布 -> 获取 item_id -> 拉评论
```

## Phase 5：代替用户发布 OpenAPI 预研，不作为默认

仅在企业主体和使用场景满足官方要求时推进。

前置条件：

- 网站应用正式应用。
- 能力实验室“代替用户发布内容到抖音”通过。
- 主体为党政机关或事业单位。
- 使用场景为内部多媒体管理平台。

如果不满足，不投入开发主线。

## 当前需要准备的材料

### 企业网页应用

- 企业主体认证。
- 网站应用。
- 线上可访问 HTTPS 地址。
- 隐私政策和用户协议。
- redirect_uri。
- 测试账号。

### 权限申请

优先级：

1. 视频评论管理。
2. 视频数据。
3. 发布内容至抖音：H5场景。
4. Webhooks。
5. 代替用户发布内容到抖音 Beta：仅在满足主体和场景时申请。

### 申请场景描述建议

评论管理：

```text
为授权用户提供抖音作品评论集中查看、分类、回复建议和人工确认回复能力，帮助创作者及时处理评论问题，不做自动无审核批量回复。
```

视频数据：

```text
用于展示授权用户已发布作品的基础信息、互动数据，并将评论运营任务与具体视频绑定。
```

发布内容至抖音 H5：

```text
用户在本工具中生成自己的短视频内容后，自主触发发布到抖音，工具提供标题、话题和发布草稿辅助。
```

## 风险与边界

1. 一键发布不是无条件可做。
   - H5 发布偏用户自主触发。
   - 代替用户发布 Beta 准入极窄。

2. 评论不能全自动放开。
   - 必须人工确认。
   - 高风险话术必须拦截。

3. 不能做诱导分享和收集线索违规表达。
   - 页面不能出现拍抖音赚佣金、填手机号、客服电话、下载引导、抽奖等违规引导。

4. token 必须服务端保存。
   - 前端不保存 access_token、refresh_token、client_secret。

## 近期执行顺序

### 今天

1. 打磨 `douyin-comment-reply-agent`。
2. 接入舅妈评论规则输出。
3. 做评论分类和线索评分。
4. 写 OpenAPI adapter 参数契约。
5. 用 mock 评论实例测试。

### API 权限下来后

1. 配置企业网页应用 OAuth。
2. 授权测试抖音账号。
3. 拉取真实 item_id 评论。
4. 提交一条真实评论回复。
5. 记录审核/展示状态。

### 发布权限下来后

1. 先做 H5 发布辅助。
2. 跑生成视频 -> 草稿 -> 用户发布 -> 数据回流。
3. 视官方审核情况决定是否探索代替用户发布 Beta。

## 官方资料

- 开发者平台概述：https://developer.open-douyin.com/docs/resource/zh-CN/developer/introduction/overview
- 发布内容至抖音：https://developer.open-douyin.com/capacity-center-page/capacity-detail/7180322911280955447
- 代替用户发布内容到抖音：https://developer.open-douyin.com/capacity-center-page/capacity-detail/7224121299067469881
- 视频评论管理：https://developer.open-douyin.com/capacity-center-page/capacity-detail/7180530418775490619
- 评论列表：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/interaction-management/comment-management-user/comment-list
- 回复视频评论：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/interaction-management/comment-management-user/video-comment-reply
- 评论回复事件：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/interaction-management/comment-management-user/accept-comment-reply-event
- 视频数据：https://developer.open-douyin.com/capacity-center-page/capacity-detail/7180522194714230845
- 获取授权码：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/douyin-get-permission-code
- 获取 access_token：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/get-access-token
- 刷新 access_token：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/refresh-access-token

