# 抖音云后端部署信息

更新时间：2026-06-26

## 当前服务

- 小程序名称：个人IP营销自动化助手
- AppID：tt03cd75709da96e3701
- 后端服务：Node 容器服务
- 建议服务名：ipagent-backend
- 云环境：env-4vHpKxaMh0
- 默认域名：https://1m5sszuhihsfm-env-4vHpKxaMh0.service.douyincloud.run
- 外网访问路径：auto_deploy_add /api/*
- 抖音云 SDK：callContainer

## 当前限制

- 默认域名主要用于测试，截图提示默认域名限制 10 QPS。
- 单服务 QPS 限制为 500。
- 外网访问响应包体最大为 1MB。
- 正式上线建议绑定自定义域名。

## 后续要做

1. 将后端 `douyin-comment-reply-agent` 部署到该 Node 容器服务。
2. 小程序 `API_BASE_URL` 改为抖音云默认域名或后续绑定的自定义域名。
3. 在抖音云服务环境变量中配置 DeepSeek、抖音 OpenAPI、评论适配器等参数。
4. 在线调试 `/api/health`、`/api/comments`、`/api/comments/:id/suggestions`、`/api/comments/:id/reply`。
