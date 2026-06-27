# 全自动 IP 智能体 Demo

这是「C端个人IP赋能智能体」的本地原型。当前重点实现第一步流程：

```text
爆款链接/口播/截图 URL -> 自动化提取 -> 文案生成 -> 行业改写 -> 音频/数字人/成片演示
```

## 当前版本

- 入口：http://127.0.0.1:8765/
- 后端：本地 Node HTTP 服务，无框架依赖
- 模型：直连阿里云百炼 / DashScope compatible-mode
- 已实现：
  - `POST /api/video/extract`：自动化提取结构、钩子、情绪曲线、转化点、风险
  - `POST /api/script/rewrite`：基于第一步提取结果改写行业文案
  - 前端流程演示、结果面板、分发文案、风控结果、内容包复制

## 启动

运行环境：

- Windows 10/11
- Node.js 20 或更高版本
- Chrome 或 Edge，用于打开抖音登录态浏览器并采集画面/音频
- ffmpeg 可选；如果要把多个 15 秒视频片段自动拼成 1 条长视频，建议安装

第一次给别人部署或换机器时，先运行：

```powershell
.\setup-env.cmd
```

按提示填入对方自己的阿里云百炼 / DashScope API Key。脚本会从 `.env.example` 生成 `.env`；`MODEL_API_KEY` 可以继续留空，后端会自动复用 `DASHSCOPE_API_KEY`。

```powershell
cd "解压后的 ip-agent 目录"
node server.js
```

也可以直接双击或运行：

```powershell
.\run-server.cmd
```

然后打开：

```text
http://127.0.0.1:8765/
```

## 环境变量

复制 `.env.example` 为 `.env`，默认直连百炼：

```text
PORT=8765
MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_CHAT_PATH=/chat/completions
MODEL_API_KEY=
MODEL_NAME=qwen3.7-plus
MODEL_MULTIMODAL_NAME=qwen3.7-plus
MODEL_VIDEO_NAME=qwen3.7-plus
MODEL_TEMPERATURE=0.7
MODEL_EXTRACT_TEMPERATURE=0.2
MODEL_EXTRACT_MAX_TOKENS=1600
MODEL_REWRITE_MAX_TOKENS=2200
DASHSCOPE_API_KEY=replace-with-dashscope-api-key
```

`MODEL_API_KEY` 可留空，后端会复用 `DASHSCOPE_API_KEY`。如果采集到画面帧，第一步会使用 `MODEL_MULTIMODAL_NAME`，并发送 OpenAI 多模态 `content` array。

## 自动测试

服务启动后可以跑完整链路测试：

```powershell
node tools/run-full-flow.mjs
```

测试脚本会自动执行：

```text
抖音录屏抽帧/ASR -> 百炼多模态提取 -> qwen3.7-plus 改写 -> qwen-tts 配音 -> wan2.7-i2v 视频生成 -> 下载本地 mp4 -> 输出 Markdown 报告
```

默认情况下，成片时长会跟随录屏采集到的原视频时长；受 `wan2.7-i2v` 单段限制，会取 2-15 秒整数。只有需要手动压测时才传 `--duration 10` 这类参数。

默认测试样本也会自动从抖音搜索页发现新视频，并记录到 `assets/outputs/douyin-discovery-history.json`，避免每次都测同一条老视频。需要复现某个问题时，再显式传 `--url "https://www.douyin.com/video/..."`。

## 1 分钟视频加速策略

抖音源视频如果接近 1 分钟，系统不会逐秒分析整条视频。当前默认做法是：

```text
登录态浏览器打开原视频 -> 按视频时长跳点采 5 帧关键画面 -> 录 12 秒原视频音频摘要并 ASR -> 交给多模态模型提取结构
```

关键参数：

```text
BROWSER_FRAME_COUNT=5
BROWSER_SEEK_FRAME_SAMPLING=true
BROWSER_AUDIO_CAPTURE_MS=12000
```

这能把采集阶段从“等待整条视频播放”压缩到几十秒内，同时让关键帧覆盖开头、中段和结尾。

生成阶段受 `wan2.7-i2v` 单段 15 秒限制。系统默认开启并行分段：

```text
WAN_PARALLEL_SEGMENTS=true
WAN_MAX_PARALLEL_SEGMENTS=4
```

例如 1 分钟源视频会拆成 4 个 15 秒 Wan 任务并行提交。服务器安装 `ffmpeg` 时，任务组全部完成后会自动拼接为单个 mp4；没有 `ffmpeg` 时会返回多段结果，并优先播放第一段。

## 第一阶段边界

当前还没有接抖音/视频号/小红书的真实抓取接口。第一步先支持三类输入：

1. 爆款视频链接：作为模型分析上下文。
2. 口播/字幕/人工观察：当前最稳定的提取依据。
3. 图片 URL：走多模态模型理解封面或截图。

后续可以继续接：

```text
POST /api/video/fetch-transcript
POST /api/audio/generate
POST /api/avatar/render
POST /api/publish/package
```
