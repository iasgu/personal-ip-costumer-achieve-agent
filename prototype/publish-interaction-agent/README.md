# 发布与互动评论模块

这是 2026-06-24 单独拆出的模块项目，用于验证「一键发布 + 评论互动 + 即梦能力评估」。

本目录不直接集成昨天的 `ip-agent` 主链路，只作为软件的一部分独立开发。后续如果验证通过，再通过 API 或 SDK 方式拼接到主项目。

## 今日目标

1. 做出独立的发布与互动评论模块。
2. 支持生成视频后的发布草稿管理。
3. 支持评论列表、AI 回复建议、人工确认回复的交互闭环。
4. 抖音官方 OpenAPI 暂未授权前，先用 mock/local adapter 跑通完整流程。
5. 研究即梦 API 模块，判断哪些能力适合替换或增强现有 Wan/Qwen 工作流。

## 非目标

- 今天不重构 `prototype/ip-agent`。
- 今天不把发布模块强行接进主生成链路。
- 今天不绕过抖音开放平台权限做违规自动发布。
- 今天不把剪映作为核心后端 API 方案。

## 目录规划

```text
prototype/publish-interaction-agent/
  README.md
  docs/
    plans/
      2026-06-24-publish-interaction-agent.md
    api-contract.md
```

## 官方资料入口

- 抖音内容发布接入方案：https://open.douyin.com/platform/resource/docs/ability/content-management/douyin-publish-solution
- 抖音评论管理能力：https://developer.open-douyin.com/capacity-center-page/capacity-detail/7180530418775490619
- 抖音回复视频评论：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/interaction-management/comment-management-user/video-comment-reply
- 即梦 AI 产品页：https://www.volcengine.com/product/jimeng
- 即梦 AI 文档目录：https://www.volcengine.com/docs/85621
- 即梦视频生成 3.0：https://www.volcengine.com/docs/85621/1785201
- 即梦数字人快速模式：https://www.volcengine.com/docs/85621/1810468

