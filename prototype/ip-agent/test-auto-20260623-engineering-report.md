# C端个人IP智能体阶段性工程测试记录

记录时间：2026-06-23 12:30（Asia/Shanghai）

## 本阶段修复

1. 模型调用改为直连百炼/DashScope compatible-mode，文本、多模态、视频分析模型均使用 qwen3.7-plus；ASR 使用 qwen3-asr-flash。
2. 修复万相默认只出 5 秒的问题：后端为 wan2.7-i2v 补充 duration、prompt_extend、watermark、seed 参数，默认 duration=10 秒。
3. 修复 driving_audio 超长导致 wan2.7-i2v 失败的问题：Qwen-TTS 生成的 PCM WAV 若超过万相限制，会在提交前自动裁剪为目标视频时长的新 WAV 资产。
4. 强化合规清洗：服务端会实际替换“爆单、疯狂响、80%、上万家、两步搞定、轻松获客、精准锁客”等过强表达，而不是只在风险提示里声明已清洗。
5. 增加全流程自动测试脚本 `tools/run-full-flow.mjs`：从抖音链接开始，自动跑采集、提取、改写、TTS、万相、下载和 Markdown 报告。
6. 增加失败落盘能力：自动测试任何一步失败，都会输出 `*-error.json` 和 `*-report.md`。
7. 增加万相视频本地保存：后端查询到任务成功后，会把临时 OSS 视频下载到 `assets/outputs/<taskId>.mp4`，并返回 `localVideoUrl`，前端优先播放本地文件。
8. 前端生成来源文案已从“中转站模型”改为“百炼模型直连”。

## 成功测试

### run3

- 输入链接：https://www.douyin.com/video/7627997605162684134
- 输出报告：test-auto-20260623-run3-report.md
- 提取来源：model
- ASR 状态：transcribed
- 万相任务：997c5b5e-8759-48e2-8d1a-972c67322d09 / SUCCEEDED
- 本地视频：assets/outputs/test-auto-20260623-run3-wan2.7-i2v.mp4
- 视频校验：MP4 ftyp/moov 存在，时长 10.031 秒

### run4

- 输入链接：https://www.douyin.com/video/7627997605162684134
- 输出报告：test-auto-20260623-run4-report.md
- 提取来源：model
- ASR 状态：transcribed
- 万相任务：cbd183ed-876f-4d83-9928-992a578349db / SUCCEEDED
- 本地视频：assets/outputs/test-auto-20260623-run4-wan2.7-i2v.mp4
- 后端任务查询本地保存：assets/outputs/cbd183ed-876f-4d83-9928-992a578349db.mp4
- 视频校验：MP4 ftyp/moov 存在，时长 10.031 秒
- 高风险词回归：未命中“爆单、疯狂响、80%、上万家、两步搞定、轻松获客”等词。

## 发现并修复的问题

1. **问题：wan2.7-i2v 默认只生成 5 秒。**
   - 原因：请求没有传 `duration`，官方默认 5 秒。
   - 修复：加入 `WAN_I2V_DURATION_SECONDS=10` 和请求参数 `duration`。

2. **问题：wan2.7-i2v 拒绝 57 秒 driving_audio。**
   - 原因：官方要求 driving_audio 为 2-30 秒，Qwen-TTS 生成音频可能超过 30 秒。
   - 修复：提交万相前自动裁剪 PCM WAV，生成 `voice-wan-*.wav` 新资产。

3. **问题：模型输出风险提示合规，但正文仍可能有夸张表达。**
   - 原因：原先只保存模型自评，没有强制二次清洗正文。
   - 修复：`sanitizeGeneratedCopy` 增加强表达替换，并加入改写回归测试。

4. **问题：测试脚本失败时只在终端报错，不方便复盘。**
   - 修复：失败时输出 `*-error.json` 和 `*-report.md`。

5. **问题：万相 OSS 视频链接 24 小时后可能过期。**
   - 修复：任务成功后后端自动下载到 `assets/outputs`，前端优先播放 `localVideoUrl`。

## 失败烟测

- 命令：`node tools/run-full-flow.mjs --url "not-a-douyin-link" --prefix test-auto-20260623-failure-smoke`
- 结果：失败符合预期。
- 报告：test-auto-20260623-failure-smoke-report.md
- 错误：`Cannot navigate to invalid URL`

## 前端验证

- 页面地址：http://127.0.0.1:8765/
- 截图：assets/outputs/frontend-check-20260623.png
- 结果：页面可打开，主表单、流程卡片、预览区正常显示；1365x900 下无明显遮挡或重叠。

## 当前仍未解决

1. 现在单段万相输出稳定为 10 秒。wan2.7-i2v 官方单次 duration 上限为 15 秒，因此 1 分钟完整成片需要“脚本分段 -> 多段 TTS -> 多段 wan 生成 -> ffmpeg 拼接”。
2. 本机 PATH 未发现 ffmpeg/ffprobe，暂未实现本地多段视频拼接。后续可安装 ffmpeg 或接入云端拼接。
3. 当前真人声音仍是 Qwen-TTS 标准音色 Cherry，不是用户音色克隆。
4. 当前真人形象使用标准照片；若要个性化，需要用户上传/录制真人照片或视频首帧。
5. 抖音采集依赖登录态浏览器播放状态，验证码/登录中断时仍需要用户配合。
