# 你需要提供什么

当前小程序 MVP 已经可以先用 mock 数据跑页面。要接真实能力时，需要你提供或在平台后台完成以下事项。

## 现在暂时不需要

- 不需要把抖音账号密码写给我。
- 不需要把 DashScope / 火山引擎 API Key 写到小程序。
- 不需要把 `client_secret` 写进前端代码。

## 真机预览前需要

1. 抖音小程序 AppID。
2. 使用抖音开发者工具打开本目录：

```text
prototype/douyin-mini-ip-agent
```

3. 如果开发者工具要求调整文件后缀或配置，以工具提示为准。

## 接真实后端前需要

1. HTTPS 后端域名。
2. 小程序后台配置合法域名：
   - request 合法域名
   - uploadFile 合法域名
   - downloadFile 合法域名
3. 服务器可公开访问生成的视频 mp4。
4. 视频文件尽量小于 200MB，因为 `tt.downloadFile` 有单次下载限制。

## 接抖音发布/评论前需要申请

1. 发布抖音视频 JSAPI / 拍摄视频并发布至抖音。
2. 短视频自主挂载，如果要发布时挂载小程序锚点。
3. 视频数据查询。
4. 视频评论数据 / 评论管理。

## 后端需要保存

这些只放服务器：

- 抖音 AppSecret
- access_token
- refresh_token
- DashScope API Key
- 火山引擎 API Key

