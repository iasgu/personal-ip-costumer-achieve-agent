const api = require("../../utils/api");

Page({
  data: {
    job: null,
    title: "",
    caption: "",
    script: "",
    hashtagsText: "",
    localVideoPath: "",
    checks: [],
    checking: false,
    downloading: false,
    saving: false
  },

  onShow() {
    const job = getApp().globalData.latestJob || tt.getStorageSync("latestJob");
    if (job) {
      this.setData({
        job,
        title: job.title || "",
        caption: job.caption || "",
        script: job.script || "",
        hashtagsText: (job.hashtags || []).map((item) => `#${item}`).join(" "),
        checks: job.checks || []
      });
    }
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  goCreate() {
    tt.switchTab({ url: "/pages/create/index" });
  },

  getDraftPayload() {
    return {
      title: this.data.title,
      caption: this.data.caption,
      script: this.data.script,
      videoUrl: this.data.job?.videoUrl || "",
      coverUrl: this.data.job?.coverUrl || "",
      hashtags: this.parseHashtags()
    };
  },

  parseHashtags() {
    return String(this.data.hashtagsText || "")
      .split(/\s+/)
      .map((item) => item.replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
  },

  async checkDraft() {
    this.setData({ checking: true });
    try {
      const data = await api.request("/api/publish/check", {
        method: "POST",
        data: this.getDraftPayload()
      });
      this.setData({ checks: data.checks || [] });
      this.toast("发布检查完成");
    } catch (error) {
      this.toast(error.message || "检查失败");
    } finally {
      this.setData({ checking: false });
    }
  },

  async saveDraft() {
    this.setData({ saving: true });
    try {
      const data = await api.request("/api/publish/drafts", {
        method: "POST",
        data: this.getDraftPayload()
      });
      getApp().globalData.latestDraft = data.draft;
      tt.setStorageSync("latestDraft", data.draft);
      this.setData({ checks: data.draft?.checks || this.data.checks });
      this.toast("草稿已保存");
    } catch (error) {
      this.toast(error.message || "保存失败");
    } finally {
      this.setData({ saving: false });
    }
  },

  async downloadVideo() {
    if (!this.data.job?.videoUrl) {
      this.toast("没有可下载的视频");
      return;
    }
    this.setData({ downloading: true });
    try {
      const result = await api.downloadVideo(this.data.job.videoUrl);
      this.setData({ localVideoPath: result.tempFilePath });
      this.toast("视频已准备好");
    } catch (error) {
      this.toast(error.message || "下载失败");
    } finally {
      this.setData({ downloading: false });
    }
  },

  copyText() {
    const text = `${this.data.title}\n\n${this.data.caption}\n\n${this.data.hashtagsText}`;
    tt.setClipboardData({
      data: text,
      success: () => this.toast("发布文案已复制")
    });
  },

  guardPublish() {
    if (!this.data.localVideoPath) {
      this.toast("请先下载视频，获得 ttfile 本地路径");
    }
  },

  onUploadDouyinVideo(event) {
    const detail = event.detail || {};
    tt.showModal({
      title: "发布结果",
      content: detail.errMsg || "已调起抖音发布流程，请按页面提示确认。",
      showCancel: false
    });
  },

  toast(title) {
    tt.showToast({ title, icon: "none" });
  }
});
