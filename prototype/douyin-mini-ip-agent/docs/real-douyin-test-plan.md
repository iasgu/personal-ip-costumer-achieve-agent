# 真实抖音能力测试计划

更新时间：2026-06-27

## 已接入入口

小程序 Profile 页新增：

- 后端 API 地址配置
- 抖音授权状态检测
- `tt.showDouyinOpenAuth` 授权入口
- `video_id -> item_id` 测试入口
- 视频数据查询测试入口

后端新增：

- `/api/douyin/auth/status`
- `/api/douyin/auth/exchange`
- `/api/douyin/auth/manual-token`
- `/api/douyin/video/convert`
- `/api/douyin/video/query`

## 测试顺序

1. 云端 Node 服务配置 `DOUYIN_APP_ID`、`DOUYIN_APP_SECRET`、`DOUYIN_OPENAPI_BASE`。
2. 小程序 Profile 页保存云端 API 地址。
3. 点击“拉起授权”。
4. 授权成功后刷新状态，确认后端显示已授权。
5. 填真实视频 `video_id`，测试转换 `item_id`。
6. 填真实 `item_id`，测试视频数据查询。
7. 将后端 `COMMENT_ADAPTER` 改为 `douyin-openapi`。
8. 在评论页填同一个 `item_id`，刷新评论。
9. 生成建议并人工确认回复。

## 待验证能力

- 当前小程序基础库是否支持 `tt.showDouyinOpenAuth`。
- 返回字段到底是 `ticket`、`code` 还是其他字段。
- 小程序已申请的 scope 是否覆盖视频数据、评论数据和评论回复。
- 真实评论接口 endpoint 和参数是否与当前适配一致。
- 发布视频 JSAPI 需要单独在发布页验证，不能静默发布。
