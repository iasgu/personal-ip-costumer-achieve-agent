# C端个人IP智能体时长跟随修复测试

- 测试时间：2026-06-23 12:45
- 抖音链接：https://www.douyin.com/video/7627997605162684134
- 原片采集时长：14.633333s
- 旧请求参数：durationSeconds=10
- 后端最终提交给 wan2.7-i2v：15s
- 驱动音频裁切结果：15s
- 万相任务：d78e29aa-7e55-4acb-91ea-3a334b9e36ff / SUCCEEDED
- 本地成片：C:\Users\majia\Documents\ningjingzhiyuan-2C Agent\prototype\ip-agent\assets\outputs\d78e29aa-7e55-4acb-91ea-3a334b9e36ff.mp4
- MP4 校验时长：15.023s

结论：成片时长已经默认跟随原视频时长。受 wan2.7-i2v 单段 2-15 秒整数限制，14.633333s 原片会生成 15s 视频。
