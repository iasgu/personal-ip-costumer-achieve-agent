# 抖音小程序 MVP：个人IP智能体

这是「C端个人IP赋能智能体」的小程序前端 MVP。它只做用户入口和小程序侧交互，不保存任何模型密钥、平台密钥或账号密码。

## MVP 目标

```text
上传头像/真人形象
-> 录制或上传声音
-> 粘贴爆款抖音链接
-> 提交服务器生成视频
-> 下载生成视频到本地 ttfile
-> 用户手动确认发布到抖音
-> 查看评论并人工确认回复
```

## 当前状态

当前先使用 mock API，便于在开发者工具里跑通页面和交互。真实接入时，只需要修改 `utils/config.js` 里的 `API_BASE_URL`。

## 目录

```text
prototype/douyin-mini-ip-agent/
  app.json
  app.js
  app.ttss
  project.config.json
  utils/
    config.js
    api.js
    mock.js
  pages/
    create/
    publish/
    comments/
    profile/
```

## 需要后续提供

1. 抖音小程序 AppID。
2. HTTPS 后端域名。
3. 小程序后台配置合法域名：
   - request
   - uploadFile
   - downloadFile
4. 申请能力：
   - 发布抖音视频 JSAPI / 拍摄视频并发布至抖音
   - 短视频自主挂载，若需要挂载小程序
   - 视频数据查询
   - 视频评论数据 / `ma.item.comment`
5. 服务器接口：
   - 素材上传
   - 生成任务提交
   - 任务状态查询
   - 视频下载地址
   - 评论列表
   - 回复建议
   - 确认回复

## 安全原则

- 小程序端不保存 DashScope、火山引擎、抖音 `client_secret`。
- access_token / refresh_token 只放服务器。
- 发布视频必须用户主动点击确认。
- 评论回复必须人工确认。

