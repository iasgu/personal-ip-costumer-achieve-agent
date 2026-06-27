# 抖音视频评论回复模块

这是单独拆出的「抖音视频评论回复」MVP，不依赖视频生成和发布模块。

## 目标

```text
选择已发布视频
-> 拉取评论
-> 按个人 IP 口语风格生成回复建议
-> 风险检查
-> 人工确认
-> 调用抖音评论回复接口
```

## 当前状态

当前默认使用 `mock` adapter，可以完整演示评论列表、回复建议、人工确认回复。

真实接入时切换：

```text
COMMENT_ADAPTER=douyin-openapi
```

## 官方能力要求

### 移动/网站应用

- Scope: `item.comment`
- 需要申请权限
- 需要用户授权
- 接口：
  - `GET /item/comment/list/`
  - `GET /item/comment/reply/list/`
  - `POST /item/comment/reply/`

### 小程序

- Scope/能力：`ma.item.comment`，视频评论数据
- 需要在小程序控制台申请“视频评论数据”能力
- 需要用户授权

## 注意

- 只能回复授权用户自己发布的视频评论。
- 回复内容需要平台审核，审核通过后才会展示。
- 不要自动无审核批量回复，MVP 必须保留人工确认。
- 不在前端保存 `client_secret`、access_token、refresh_token。

## 启动

```powershell
cd prototype/douyin-comment-reply-agent
node server.js
```

打开：

```text
http://127.0.0.1:8893/
```

