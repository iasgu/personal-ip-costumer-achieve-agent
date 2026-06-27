# 小程序 MVP 后端接口契约

## 基础原则

小程序只调用业务后端，不直接调用模型平台，不保存任何密钥。

真实接口上线时，将 `utils/config.js` 中：

```js
API_BASE_URL: "mock"
```

改成 HTTPS 后端域名，例如：

```js
API_BASE_URL: "https://api.example.com"
```

## 1. 素材上传

### POST /api/assets/upload

使用 `tt.uploadFile`。

formData:

```json
{
  "kind": "avatar | voice"
}
```

响应：

```json
{
  "ok": true,
  "assetId": "asset_001",
  "url": "https://cdn.example.com/assets/avatar.jpg",
  "name": "avatar.jpg"
}
```

## 2. 创建生成任务

### POST /api/jobs/create

请求：

```json
{
  "douyinUrl": "https://www.douyin.com/video/...",
  "persona": "AI短视频获客顾问",
  "offer": "给一个爆款链接，生成个人IP真人口播视频",
  "assets": {
    "avatar": {
      "assetId": "asset_avatar",
      "url": "https://..."
    },
    "voice": {
      "assetId": "asset_voice",
      "url": "https://..."
    }
  }
}
```

响应：

```json
{
  "ok": true,
  "jobId": "job_001",
  "status": "processing"
}
```

## 3. 查询生成任务

### GET /api/jobs/:jobId

响应：

```json
{
  "ok": true,
  "jobId": "job_001",
  "status": "succeeded",
  "progress": 100,
  "title": "同行天天真人出镜，其实根本没拍摄？",
  "script": "口播文案",
  "videoUrl": "https://cdn.example.com/output.mp4",
  "coverUrl": "https://cdn.example.com/cover.jpg",
  "hashtags": ["个人IP", "AI获客", "真人口播"]
}
```

## 4. 发布草稿

### POST /api/publish/drafts

请求：

```json
{
  "title": "标题",
  "description": "发布文案",
  "hashtags": ["个人IP"],
  "videoUrl": "https://cdn.example.com/output.mp4"
}
```

响应：

```json
{
  "ok": true,
  "draftId": "draft_001",
  "status": "ready"
}
```

## 5. 评论列表

### GET /api/comments?publishId=latest

响应：

```json
{
  "ok": true,
  "comments": [
    {
      "commentId": "comment_001",
      "userName": "用户",
      "text": "这个工具怎么收费？",
      "replyStatus": "pending",
      "likeCount": 18
    }
  ]
}
```

## 6. 回复建议

### POST /api/comments/:commentId/suggestions

请求：

```json
{
  "commentText": "这个工具怎么收费？"
}
```

响应：

```json
{
  "ok": true,
  "suggestions": [
    "可以先拿你自己的视频测一版，效果能过再聊套餐。"
  ],
  "risk": {
    "level": "low",
    "notes": []
  }
}
```

## 7. 确认回复

### POST /api/comments/:commentId/reply

请求：

```json
{
  "text": "可以先拿你自己的视频测一版，效果能过再聊套餐。"
}
```

响应：

```json
{
  "ok": true,
  "replyId": "reply_001",
  "status": "sent"
}
```

## 8. 客服智能体策略

### GET /api/customer-service/strategy/current

响应：

```json
{
  "ok": true,
  "strategy": {
    "sceneName": "抖音粉丝群客服",
    "businessSummary": "面向抖音粉丝群的售前、售中、售后自动回复助手",
    "businessItems": ["产品/服务介绍", "价格/套餐/优惠"],
    "replyRules": ["先识别意图，再回复"],
    "handoffRules": ["退款争议", "投诉升级"],
    "fallbackReply": "我先帮你记下，人工客服会尽快跟进。",
    "prompt": "你是抖音粉丝群客服助手...",
    "tone": "professional",
    "humanApproval": true,
    "workingHours": {
      "timezone": "Asia/Shanghai",
      "start": "09:00",
      "end": "21:00"
    }
  }
}
```

### POST /api/customer-service/strategy/save

请求：

```json
{
  "strategy": {
    "sceneName": "抖音粉丝群客服",
    "businessSummary": "面向抖音粉丝群的售前、售中、售后自动回复助手",
    "businessItems": ["产品/服务介绍", "价格/套餐/优惠"],
    "replyRules": ["先识别意图，再回复"],
    "handoffRules": ["退款争议", "投诉升级"],
    "fallbackReply": "我先帮你记下，人工客服会尽快跟进。",
    "prompt": "你是抖音粉丝群客服助手...",
    "tone": "professional",
    "humanApproval": true,
    "workingHours": {
      "timezone": "Asia/Shanghai",
      "start": "09:00",
      "end": "21:00"
    }
  }
}
```

响应：

```json
{
  "ok": true,
  "strategy": {
    "sceneName": "抖音粉丝群客服",
    "businessSummary": "面向抖音粉丝群的售前、售中、售后自动回复助手",
    "businessItems": ["产品/服务介绍", "价格/套餐/优惠"],
    "replyRules": ["先识别意图，再回复"]
  }
}
```
