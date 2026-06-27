# C端个人IP智能体全流程自动测试记录

测试时间：2026/6/23 15:11:08

## 输入

- 抖音链接：https://www.douyin.com/video/7653447733155747172
- 样本来源：auto-discovery
- 搜索关键词：热门
- 搜索标题：合集
01:08
7.3万
学了这个小技巧后✨ 我的视频播放量直接起飞！从原来的几百几千，涨到几十万甚至百万播放，流量蹭蹭上涨！ #我要上热门 #自媒体干货 #大数据推荐给有需要的人 #干货分享 #经验分享 @DOU+小助手
@小九
2天前
- 目标行业：未设置，参考源视频
- IP 人设：未设置，参考源视频
- 转化产品：未设置，轻量互动引导
- 头像/形象：标准素材
- 原片时长：67.8s
- 万相目标时长：15s
- 时长策略：默认跟随原片时长，受 wan2.7-i2v 单段 2-15 秒整数限制

## 输出

- 提取来源：fallback
- 采集帧数：5
- ASR 状态：failed
- ASR 文本：空
- 提取摘要：这个内容的核心有效点是：用强痛点开场，快速展示自动化过程，再用结果对比制造信任。
- 改写来源：fallback
- 标题：这个内容的核心有效点是：用强痛点开场，快速展示自动化过程，再
- 脚本长度：207
- 音频：
- 视频任务： / 
- 本地视频：
- MP4 校验：未下载

## 失败信息
- Qwen-TTS 合成失败 400: {"code":"Arrearage","message":"Access denied, please make sure your account is in good standing. For details, see: https://help.aliyun.com/zh/model-studio/error-code#overdue-payment","request_id":"a44a7c90-63be-9e54-b73f-7809cfc0d8a2"}
- Payload：{"error":"Qwen-TTS 合成失败 400: {\"code\":\"Arrearage\",\"message\":\"Access denied, please make sure your account is in good standing. For details, see: https://help.aliyun.com/zh/model-studio/error-code#overdue-payment\",\"request_id\":\"a44a7c90-63be-9e54-b73f-7809cfc0d8a2\"}"}
## 风险/观察

- 通过：未强行引导私域或卖课。
- 通过：未承诺确定收益。
- 模型改写超时或失败，已使用源视频兜底模板。原因：Model API error 400: {"error":{"message":"Access denied, please make sure your account is in good standing. For details, see: https://help.aliyun.com/zh/model-studio/error-code#ove

## 关联文件

- test-15s-majia-photo-20260623-capture-extract.json
- test-15s-majia-photo-20260623-rewrite.json
- test-15s-majia-photo-20260623-tts.json
- test-15s-majia-photo-20260623-wan-result.json
