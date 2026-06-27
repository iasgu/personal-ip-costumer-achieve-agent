# IP Agent 全流程测试记录

测试时间：2026-06-23 00:55（Asia/Shanghai）

## 输入

- 抖音链接：https://www.douyin.com/video/7380678787580562707
- 行业：餐饮
- IP 人设：商业增长顾问
- 引流产品：AI获客诊断

## 环节结果

1. 抖音登录态采集：成功
   - 页面标题：如何把抖音的视频保存在手机相册里面？很简单，看完你就学会了！ #抖音视频 #保存抖音视频 #手机技巧 #内存不足 #手机技巧分享 #视频去水印 #视频教学 #抖音 - 抖音
   - 视频源：已获取
   - 抽帧数：4
   - 音频录制：transcribed，128774 bytes

2. ASR：成功
   - 模型：qwen3-asr-flash
   - 转写：嗯，我们往这边拖动一下，拖动一下，看到没有？这里呢就有一个保存本地了，那么我们。

3. 视频结构理解：成功
   - 模型：qwen3.7-plus
   - 摘要：通过手把手的屏幕录制演示，利用中老年群体对智能手机操作不熟悉的痛点，以极简的‘点击-发现新功能’模式吸引停留并建立信任。
   - 可复用结构：痛点场景+动作指令+结果展示+价值点明
   - 证据：ASR字幕显示‘点一下小箭头’‘出来了很多功能’‘保存本地’；画面为手持手机录屏，展示抖音界面操作；视频风格为典型的中老年手机教学类内容

4. 文案改写：成功但质量有问题
   - 标题：别人用AI月入3万，我却还在刷手机？这个懒人副业真香
   - 标签：#AI副业 #懒人赚钱 #副业新思路 #数字人 #AI工具
   - 问题：目标行业是餐饮，但输出偏向 AI 副业，行业约束未被稳定执行。

5. 标准素材：部分成功
   - 复用本地标准人像：video-standard-a6ccca86.jpg
   - 复用本地标准短音频：voice-standard-ffb88174.mp3
   - 问题：重复调用 /api/assets/standard/install 时出现 500，疑似外部素材重复下载/网络偶发问题；本轮已复用本地文件继续。

6. wan2.7-i2v 生成：成功
   - 模型：wan2.7-i2v-2026-04-25
   - 任务 ID：6d358053-4532-44bf-b06c-bcb0572de788
   - 状态：SUCCEEDED
   - 输出时长：5 秒
   - 分辨率：720P
   - 本地成片：assets/outputs/full-flow-wan2.7-i2v.mp4

## 测试过程中出现的问题

1. 文案改写第一次请求失败：Invalid JSON body
   - 原因：测试脚本把 capture-extract 的完整结果传给 rewrite，其中包含 base64 抽帧大字段，导致请求体不适合直接进入文案模块。
   - 处理：瘦身 extraction，只传 summary/hook/structure/evidence/transcript 等结构化文本。

2. 文案改写偏题
   - 现象：行业设置为餐饮，但模型生成了 AI 副业主题文案。
   - 建议：强化 rewrite prompt 的行业锁定；失败时增加 schema 校验和二次重写；可增加 forbidden topic/required industry terms。

3. 标准素材安装接口偶发 500
   - 现象：首次标准素材已成功安装，重复安装时出现 500。
   - 建议：installStandardAssets 先查 manifest/本地文件复用，避免每次重新下载外部 URL；下载失败时降级复用已有文件。

4. 本轮最终视频不是定制真人音色
   - 说明：wan2.7-i2v 使用的是标准公开短音频作为 driving_audio，只验证“真人首帧 + 音频驱动视频”通路。
   - 后续：需要接入脚本文案 -> TTS/音色复刻 -> driving_audio，才能输出与生成脚本一致的真人音色视频。

5. 用户上传真人视频尚未自动抽首帧
   - 说明：wan2.7-i2v 需要 first_frame 图片；当前图片可直接用，视频素材需要后续加自动抽帧。

## 输出文件

- 成片：C:\Users\majia\Documents\ningjingzhiyuan-2C Agent\prototype\ip-agent\assets\outputs\full-flow-wan2.7-i2v.mp4
- 采集分析结果：test-capture-extract.json
- 文案改写结果：test-rewrite.json
- 视频任务提交：test-wan-submit.json
- 视频任务结果：test-wan-result.json
