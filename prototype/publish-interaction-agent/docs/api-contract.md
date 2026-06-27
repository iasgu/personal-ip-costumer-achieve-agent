# 发布与互动评论模块 API 草案

## 设计原则

本模块先定义稳定接口，再分别实现 `mock/local` 和 `douyin-openapi` adapter。

前端、主项目或其他生成链路只调用本模块自己的接口，不直接依赖抖音或即梦的原始 API。

## Adapter 类型

```text
PUBLISH_ADAPTER=mock
PUBLISH_ADAPTER=douyin-openapi
JIMENG_ADAPTER=volcengine
```

## 发布草稿

### POST /api/publish/drafts

创建发布草稿。

请求：

```json
{
  "platform": "douyin",
  "videoUrl": "/assets/outputs/demo.mp4",
  "title": "标题文案",
  "description": "发布描述",
  "hashtags": ["个人IP", "AI获客", "短视频"],
  "coverUrl": "/assets/outputs/cover.jpg",
  "scheduledAt": null,
  "source": {
    "workflowId": "ip-agent-run-001",
    "douyinSourceUrl": "https://www.douyin.com/video/..."
  }
}
```

响应：

```json
{
  "ok": true,
  "draftId": "draft_001",
  "status": "draft"
}
```

### POST /api/publish/drafts/:draftId/submit

提交发布。

mock adapter 返回模拟发布结果；douyin-openapi adapter 后续调用抖音内容发布接口。

响应：

```json
{
  "ok": true,
  "publishId": "pub_001",
  "platform": "douyin",
  "status": "submitted",
  "reviewStatus": "pending"
}
```

### GET /api/publish/:publishId/status

查询发布状态。

响应：

```json
{
  "ok": true,
  "publishId": "pub_001",
  "status": "published",
  "reviewStatus": "pass",
  "shareUrl": "https://www.douyin.com/video/..."
}
```

## 评论互动

### GET /api/comments?publishId=pub_001

获取评论列表。

响应：

```json
{
  "ok": true,
  "comments": [
    {
      "commentId": "comment_001",
      "userName": "测试用户",
      "text": "这个工具怎么用？",
      "createdAt": "2026-06-24T10:00:00+08:00",
      "likeCount": 12,
      "replyStatus": "pending"
    }
  ]
}
```

### POST /api/comments/:commentId/suggestions

生成 AI 回复建议。

请求：

```json
{
  "persona": "AI短视频获客顾问，表达口语化，不夸大承诺",
  "knowledge": "产品可以根据抖音链接生成真人口播视频。",
  "commentText": "这个工具怎么用？"
}
```

响应：

```json
{
  "ok": true,
  "suggestions": [
    "可以先丢一个爆款链接，再上传头像和声音，系统会自动拆解并生成一版真人口播视频。",
    "你可以理解成从选题、文案到口播视频的半自动助手，适合个人IP批量测内容。"
  ],
  "risk": {
    "level": "low",
    "notes": []
  }
}
```

### POST /api/comments/:commentId/reply

人工确认后回复评论。

请求：

```json
{
  "text": "可以先丢一个爆款链接，再上传头像和声音，系统会自动生成一版真人口播视频。"
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

## 即梦能力评估接口

### POST /api/jimeng/evaluate

用于记录即梦不同模式的人工或半自动测试结果，不先做生产接入。

请求：

```json
{
  "mode": "digital-human-fast",
  "input": {
    "avatarImage": "local/path/avatar.jpg",
    "audio": "local/path/voice.wav",
    "script": "口播文案"
  },
  "result": {
    "durationSeconds": 15,
    "costEstimate": 1.2,
    "latencySeconds": 180,
    "qualityScore": 4,
    "notes": "人物一致性较好，嘴型同步待观察"
  }
}
```

响应：

```json
{
  "ok": true,
  "recordId": "jimeng_eval_001"
}
```

