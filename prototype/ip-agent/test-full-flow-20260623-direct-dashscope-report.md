# C端个人IP智能体全流程测试记录

测试时间：2026-06-23 11:31（Asia/Shanghai）

## 本轮配置

- 模型接口：直连 DashScope compatible-mode，不再经过本地 model-gateway/LiteLLM。
- 文本模型：qwen3.7-plus
- 多模态/视频理解模型：qwen3.7-plus
- ASR：qwen3-asr-flash
- TTS：qwen-tts-latest / Cherry
- 视频生成：wan2.7-i2v-2026-04-25

## 输入

- 抖音视频链接：https://www.douyin.com/video/7627997605162684134
- 采集参数：8 帧，间隔 5.5 秒，录音 60 秒
- 目标行业：餐饮
- IP 人设：商业增长顾问
- 转化产品：AI获客诊断课
- 基准形象：标准真人照片 video-standard-a6af16c0
- 基准音频：本轮由 qwen-tts 根据改写脚本生成，不使用原视频音频

## 结果

### 1. 抖音录屏抽帧 + ASR + 视觉理解

输出文件：test-full-20260623-capture-extract.json

- 结果来源：model
- 画面帧数：8
- ASR 状态：transcribed
- 原视频录音字节数：169346
- ASR 文本：风吹来，浪打来。
- 置信度：0.85
- 视觉理解摘要：通过视觉奇观（空中滑步）吸引注意力，随后用极简口诀降低学习门槛，利用反差感制造爆款。

### 2. 改写

输出文件：test-full-20260623-rewrite.json

- 结果来源：model
- 标题：餐饮店老板天天喝茶却排队到腿软？揭秘AI截流玩法！
- 脚本长度：136
- 风险检查：未出现确定收益承诺；存在“排队到腿软”强表达，后续建议前端加人工复核提示。

### 3. 配音

输出文件：test-full-20260623-tts.json

- Provider：qwen-tts
- Model：qwen-tts-latest
- Voice：Cherry
- 本地音频：assets/uploads/voice-tts-38e79c27.wav
- 音频大小：1.2MB

### 4. 真人形象视频生成

输出文件：test-full-20260623-wan-result.json

- Provider：wan2.7-i2v
- Model：wan2.7-i2v-2026-04-25
- TaskId：5312018a-bd2f-4a88-99fb-92d4182b937a
- 状态：SUCCEEDED
- 本地视频：assets/outputs/full-flow-20260623-wan2.7-i2v.mp4
- 文件大小：4469472 bytes
- MP4 校验：ftyp/moov 存在
- 视频时长：5.039 秒

## 测试中发现的问题

1. 原视频 ASR 可用但文本很短，主要信息来自画面帧和画面字幕，不应只依赖音频转写。
2. 当前 wan2.7-i2v 通路成功返回真实视频，但输出是短视频片段，不是 1 分钟完整成片。
3. 当前“真人音色”仍是标准 TTS 音色 Cherry，不是用户音色克隆；需要后续接入音色复刻能力。
4. 当前“真人形象”使用标准基准照片，不是用户本人上传/录制形象；前端已支持上传素材，但本轮测试按标准素材执行。
5. `ffprobe` 未安装，视频时长用 Node 解析 MP4 mvhd 元数据完成校验。

## 下一步建议

- 做 1 分钟成片：将脚本扩写并分段，分段生成 TTS 和 wan 视频，再用 ffmpeg 拼接。
- 做个性化：让用户上传或录制真人照片/视频、音频样本，并接入音色克隆。
- 前端展示：把 source=fallback/source=model、ASR 文本长度、采集帧数、视频生成时长显式展示，避免误以为每一步都“完美理解”。
