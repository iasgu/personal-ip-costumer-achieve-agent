const api = require("../../utils/api");

const PRIORITY_LABELS = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

const STATUS_LABELS = {
  pending: "待回复",
  replied: "已回复",
  ignored: "已忽略",
  failed: "失败"
};

Page({
  data: {
    itemId: "item_demo",
    loading: false,
    summary: null,
    comments: [],
    visibleComments: [],
    filter: "all",
    strategy: null,
    mode: "assist",
    autoRunning: false,
    autoLogs: [],
    autoProgress: {
      total: 0,
      done: 0,
      failed: 0
    }
  },

  onShow() {
    if (!this.data.comments.length) this.bootstrap();
  },

  async bootstrap() {
    await this.loadStrategy();
    await this.loadComments();
  },

  async loadStrategy() {
    try {
      const data = await api.request("/api/customer-service/strategy/current");
      this.setData({ strategy: data.strategy || null });
    } catch {
      this.setData({ strategy: null });
    }
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  setMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (this.data.autoRunning) {
      this.toast("自动回复运行中，先停止后再切换模式");
      return;
    }
    this.setData({ mode });
  },

  setFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter }, () => this.applyFilter());
  },

  async loadComments() {
    this.setData({ loading: true });
    try {
      const itemId = this.data.itemId || "item_demo";
      const data = await api.request(`/api/comments?itemId=${encodeURIComponent(itemId)}`);
      const comments = (data.comments || []).map((item) => this.decorateComment(item));
      this.setData({ summary: data.summary || null, comments }, () => this.applyFilter(comments));
    } catch (error) {
      this.toast(error.message || "评论加载失败");
    } finally {
      this.setData({ loading: false });
    }
  },

  async suggestReply(event) {
    const commentId = event.currentTarget.dataset.commentId;
    const comment = this.findComment(commentId);
    if (!comment) return;
    this.patchComment(commentId, { generating: true });
    try {
      const data = await this.generateSuggestionForComment(comment);
      this.patchComment(commentId, {
        generating: false,
        suggestions: data.suggestions || [],
        replyText: (data.suggestions || [])[0] || "",
        analysis: data.analysis || comment.analysis,
        generation: data.generation || null,
        risk: data.risk || null
      });
    } catch (error) {
      this.patchComment(commentId, { generating: false });
      this.toast(error.message || "生成失败");
    }
  },

  useSuggestion(event) {
    this.patchComment(event.currentTarget.dataset.commentId, {
      replyText: event.currentTarget.dataset.text
    });
  },

  onReplyInput(event) {
    this.patchComment(event.currentTarget.dataset.commentId, {
      replyText: event.detail.value
    });
  },

  async sendReply(event) {
    const commentId = event.currentTarget.dataset.commentId;
    const comment = this.findComment(commentId);
    if (!comment?.replyText) {
      this.toast("先填写回复内容");
      return;
    }
    try {
      const data = await this.replyWithText(commentId, comment.replyText);
      this.patchComment(commentId, {
        replyStatus: "replied",
        replyStatusLabel: STATUS_LABELS.replied,
        replyId: data.reply?.replyId || data.replyId || "",
        replyRisk: data.risk || null
      });
      this.toast("已记录回复");
    } catch (error) {
      this.toast(error.message || "回复失败");
    }
  },

  async startAutoReply() {
    if (this.data.autoRunning) return;
    const targets = this.getAutoTargets();
    if (!targets.length) {
      this.toast("当前没有待自动回复的评论");
      return;
    }

    this._autoStopped = false;
    this.setData({
      mode: "auto",
      autoRunning: true,
      autoLogs: [],
      autoProgress: { total: targets.length, done: 0, failed: 0 }
    });
    this.pushAutoLog(`开始自动回复，共 ${targets.length} 条待处理`, "info");

    let done = 0;
    let failed = 0;

    for (let index = 0; index < targets.length; index += 1) {
      if (this._autoStopped) break;
      const commentId = targets[index].commentId;
      const latest = this.findComment(commentId);
      if (!latest || latest.replyStatus === "replied") continue;

      const name = latest.userName || latest.commentId;
      try {
        this.patchComment(commentId, { generating: true, autoState: "generating", autoError: "" });
        this.pushAutoLog(`${index + 1}/${targets.length} 正在生成回复：${name}`, "info");

        const suggestionData = await this.generateSuggestionForComment(latest);
        const replyText = (suggestionData.suggestions || [])[0] || "";
        if (!replyText) throw new Error("没有生成可用回复");

        this.patchComment(commentId, {
          generating: false,
          autoState: "replying",
          suggestions: suggestionData.suggestions || [],
          replyText,
          analysis: suggestionData.analysis || latest.analysis,
          generation: suggestionData.generation || null,
          risk: suggestionData.risk || null
        });
        this.pushAutoLog(`${index + 1}/${targets.length} 正在提交：${replyText}`, "info");

        const replyData = await this.replyWithText(commentId, replyText);
        done += 1;
        this.patchComment(commentId, {
          autoState: "done",
          autoHandled: true,
          replyStatus: "replied",
          replyStatusLabel: STATUS_LABELS.replied,
          replyId: replyData.reply?.replyId || replyData.replyId || "",
          replyRisk: replyData.risk || null
        });
        this.pushAutoLog(`${name} 已自动回复`, "success");
      } catch (error) {
        failed += 1;
        this.patchComment(commentId, {
          generating: false,
          autoState: "failed",
          autoError: error.message || "自动回复失败"
        });
        this.pushAutoLog(`${name} 处理失败：${error.message || "自动回复失败"}`, "error");
      } finally {
        this.setData({ autoProgress: { total: targets.length, done, failed } });
      }
    }

    this.setData({ autoRunning: false });
    this.pushAutoLog(this._autoStopped ? "已停止自动回复" : "自动回复执行完成", this._autoStopped ? "warning" : "success");
  },

  stopAutoReply() {
    this._autoStopped = true;
    this.setData({ autoRunning: false });
    this.pushAutoLog("正在停止，当前评论处理完后结束", "warning");
  },

  getAutoTargets() {
    return this.data.comments
      .filter((item) => item.replyStatus !== "replied" && item.replyStatus !== "ignored")
      .sort((a, b) => {
        const scoreA = Number(a.leadScore || 0);
        const scoreB = Number(b.leadScore || 0);
        return scoreB - scoreA;
      });
  },

  async generateSuggestionForComment(comment) {
    const profile = getApp().globalData.userProfile || {};
    return api.request(`/api/comments/${comment.commentId}/suggestions`, {
      method: "POST",
      data: {
        commentText: comment.text,
        persona: profile.persona || this.data.strategy?.persona,
        style: profile.replyStyle || this.data.strategy?.replyStyle
      }
    });
  },

  replyWithText(commentId, text) {
    return api.request(`/api/comments/${commentId}/reply`, {
      method: "POST",
      data: {
        itemId: this.data.itemId,
        text
      }
    });
  },

  patchComment(commentId, patch) {
    const comments = this.data.comments.map((item) => {
      if (item.commentId !== commentId) return item;
      return this.decorateComment({ ...item, ...patch });
    });
    this.setData({ comments }, () => this.applyFilter(comments));
  },

  applyFilter(sourceComments) {
    const comments = sourceComments || this.data.comments;
    const filter = this.data.filter;
    const visibleComments =
      filter === "all" ? comments : comments.filter((item) => item.priority === filter || item.replyStatus === filter);
    this.setData({ visibleComments });
  },

  findComment(commentId) {
    return this.data.comments.find((item) => item.commentId === commentId);
  },

  decorateComment(item) {
    const text = item.text || item.content || "";
    const priority = item.priority || "medium";
    const replyStatus = item.replyStatus || "pending";
    return {
      ...item,
      text,
      likeCount: item.likeCount || item.diggCount || 0,
      priority,
      priorityLabel: PRIORITY_LABELS[priority] || priority,
      replyStatus,
      replyStatusLabel: STATUS_LABELS[replyStatus] || replyStatus,
      suggestions: item.suggestions || [],
      replyText: item.replyText || "",
      autoStateLabel: this.getAutoStateLabel(item.autoState)
    };
  },

  getAutoStateLabel(state) {
    return {
      generating: "生成中",
      replying: "提交中",
      done: "自动完成",
      failed: "处理失败"
    }[state] || "";
  },

  pushAutoLog(text, level = "info") {
    const now = new Date();
    const time = `${this.pad(now.getHours())}:${this.pad(now.getMinutes())}:${this.pad(now.getSeconds())}`;
    const autoLogs = [...this.data.autoLogs, { id: `${Date.now()}_${Math.random()}`, time, text, level }].slice(-40);
    this.setData({ autoLogs });
  },

  pad(value) {
    return String(value).padStart(2, "0");
  },

  toast(title) {
    tt.showToast({ title, icon: "none" });
  }
});
