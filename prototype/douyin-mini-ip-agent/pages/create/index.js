const api = require("../../utils/api");
const config = require("../../utils/config");

Page({
  data: {
    activeModule: "create",
    avatarPath: "",
    avatarName: "",
    voicePath: "",
    voiceName: "",
    douyinUrl: "",
    persona: config.DEFAULT_PERSONA,
    offer: config.DEFAULT_OFFER,
    sourceSummary: "",
    analysisOpen: false,
    advancedOpen: false,
    submitting: false,
    job: null
  },

  recorder: null,

  onLoad() {
    const profile = getApp().globalData.userProfile || {};
    const latestJob = getApp().globalData.latestJob || tt.getStorageSync("latestJob");
    this.setData({
      persona: profile.persona || config.DEFAULT_PERSONA,
      offer: profile.offer || config.DEFAULT_OFFER,
      job: latestJob || null
    });

    if (tt.getRecorderManager) {
      this.recorder = tt.getRecorderManager();
      this.recorder.onStop((res) => {
        this.setData({
          voicePath: res.tempFilePath,
          voiceName: "已录制声音样本"
        });
      });
      this.recorder.onError(() => this.toast("录音失败，可以先用标准音色测试"));
    }
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  switchModule(event) {
    const module = event.currentTarget.dataset.module;
    if (module === "publish") {
      tt.switchTab({ url: "/pages/publish/index" });
      return;
    }
    if (module === "comments") {
      tt.switchTab({ url: "/pages/comments/index" });
      return;
    }
    if (module === "profile") {
      tt.switchTab({ url: "/pages/profile/index" });
      return;
    }
    this.setData({ activeModule: module });
  },

  togglePanel(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: !this.data[key] });
  },

  chooseAvatar() {
    tt.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const filePath = res.tempFilePaths[0];
        this.setData({
          avatarPath: filePath,
          avatarName: filePath.split("/").pop() || "已选择头像"
        });
      },
      fail: () => this.toast("未选择头像")
    });
  },

  chooseVoice() {
    tt.showActionSheet({
      itemList: ["录制 10 秒声音", "从本地选择音频", "先用标准音色"],
      success: (res) => {
        if (res.tapIndex === 0) this.recordVoice();
        if (res.tapIndex === 1) this.chooseAudioFile();
        if (res.tapIndex === 2) {
          this.setData({ voicePath: "", voiceName: "标准音色" });
        }
      }
    });
  },

  chooseAudioFile() {
    if (!tt.chooseMessageFile) {
      this.toast("当前环境不支持选择音频，先用录音或标准音色");
      return;
    }
    tt.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({
          voicePath: file.path,
          voiceName: file.name || "已选择音频"
        });
      }
    });
  },

  recordVoice() {
    if (!this.recorder) {
      this.toast("当前环境不支持录音，先用标准音色");
      return;
    }
    this.toast("开始录音，10 秒后自动结束");
    this.recorder.start({
      duration: 10000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: "mp3"
    });
    setTimeout(() => {
      try {
        this.recorder.stop();
      } catch {
        this.toast("录音已结束");
      }
    }, 10000);
  },

  async submitJob() {
    if (!this.data.douyinUrl.trim()) {
      this.toast("先粘贴一个抖音链接");
      return;
    }

    this.setData({ submitting: true });
    try {
      const assets = {};
      if (this.data.avatarPath) {
        assets.avatar = await api.uploadFile("/api/assets/upload", this.data.avatarPath, { kind: "avatar" });
      }
      if (this.data.voicePath) {
        assets.voice = await api.uploadFile("/api/assets/upload", this.data.voicePath, { kind: "voice" });
      }

      const createResult = await api.request("/api/jobs/create", {
        method: "POST",
        data: {
          douyinUrl: this.data.douyinUrl,
          persona: this.data.persona,
          offer: this.data.offer,
          sourceSummary: this.data.sourceSummary,
          assets
        }
      });

      const job = createResult.jobId
        ? await api.request(`/api/jobs/${createResult.jobId}`)
        : createResult;
      getApp().globalData.latestJob = job;
      tt.setStorageSync("latestJob", job);
      this.setData({ job, analysisOpen: true });
      this.toast("发布草稿已生成");
    } catch (error) {
      this.toast(error.message || "生成失败");
    } finally {
      this.setData({ submitting: false });
    }
  },

  goPublish() {
    if (!this.data.job) {
      this.toast("先生成一条发布草稿");
      return;
    }
    tt.switchTab({ url: "/pages/publish/index" });
  },

  toast(title) {
    tt.showToast({ title, icon: "none" });
  }
});
