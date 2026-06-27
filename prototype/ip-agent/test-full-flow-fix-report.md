# C端个人IP智能体全流程修复测试记录

测试时间：2026-06-23 01:33（Asia/Shanghai）

## 本轮修复

1. 改写接口服务端自动瘦身 extraction，移除 frameDataUrls / screenshot / video 等大字段，避免真实采集结果导致 JSON body 过大或模型上下文污染。
2. 增加改写质量校验：行业锚点、服务锚点、偏题词和高风险承诺词；失败时先模型修复，再兜底。
3. 标准素材安装支持复用 manifest 里的已下载文件，重复点击不再因外部下载失败而 500。
4. 接入 qwen-tts-latest，生成真实 driving audio，不再只能依赖标准音频。
5. 前端上传真人视频时自动抽第一帧 JPG，用作 wan2.7-i2v 的 first_frame。
6. 前端完整执行流程等待 wan 异步任务完成并直接展示视频结果，不再错误调用 finalize。

## 实测链路

### 1. 抖音采集结果进入改写

输入文件：test-capture-extract.json（上一轮真实抖音登录态采集，约 857KB，包含画面帧/音频/ASR 结果）
输出文件：test-fix-rewrite-real-capture-3.json

- 改写结果来源：model
- 标题：餐饮老板必看！用AI诊断一下，你的餐厅为什么没客？
- 脚本长度：129
- 行业锚点：餐饮 / 餐饮老板 / AI获客诊断

### 2. TTS 配音

输出文件：test-fix-full-tts.json

- Provider：qwen-tts
- Model：qwen-tts-latest
- Voice：Cherry
- 本地音频：C:\Users\majia\Documents\ningjingzhiyuan-2C Agent\prototype\ip-agent\assets\uploads\voice-tts-4660db51.wav
- 音频大小：1.2MB

### 3. wan2.7-i2v 视频生成

提交文件：test-fix-full-wan-submit.json
结果文件：test-fix-full-wan-result.json

- Provider：wan2.7-i2v
- Model：wan2.7-i2v-2026-04-25
- TaskId：96ba3196-a21b-44b0-a731-0f198d96da6f
- 状态：SUCCEEDED
- 输出时长：5s
- 分辨率：720P
- 本地视频：C:\Users\majia\Documents\ningjingzhiyuan-2C Agent\prototype\ip-agent\assets\outputs\full-flow-fixed-wan2.7-i2v.mp4
- 本地文件大小：4441638 bytes

## 仍需注意

- 本次视频使用的是标准测试形象图，不是真人定制形象。正式流程应上传或录制用户真人形象，前端已支持视频自动抽首帧。
- 本次声音是 qwen-tts 标准音色 Cherry，不是用户克隆音色。正式个性化音色仍需要接入音色克隆/复刻能力。
- wan2.7-i2v 本次返回 5 秒视频；长视频需要后续做分段脚本、分段音频和分段视频拼接。
