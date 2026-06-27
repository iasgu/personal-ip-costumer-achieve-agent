const api = require("../../utils/api");
const config = require("../../utils/config");

Page({
  data: {
    persona: config.DEFAULT_PERSONA,
    replyStyle: config.DEFAULT_REPLY_STYLE,
    offer: config.DEFAULT_OFFER,
    apiBaseUrl: config.API_BASE_URL,
    backendStatus: { status: "unknown", message: "未检查后端" },
    customerServiceScene: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.sceneName,
    customerServiceSummary: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.businessSummary,
    customerServiceItemsText: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.businessItems.join("\n"),
    customerServiceRulesText: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.replyRules.join("\n"),
    customerServiceHandoffText: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.handoffRules.join("\n"),
    customerServiceFallback: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.fallbackReply,
    customerServicePrompt: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.prompt,
    customerServiceTone: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.tone,
    customerServiceHumanApproval: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.humanApproval,
    customerServiceWorkStart: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.workingHours.start,
    customerServiceWorkEnd: config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.workingHours.end,
    customerServiceStatus: { status: "unknown", message: "未加载客服策略" },
    customerServiceSaving: false,
    authState: { status: "unknown", message: "未检查授权" },
    testVideoId: "",
    testItemId: "",
    testing: false,
  },

  onLoad() {
    const profile = getApp().globalData.userProfile || {};
    const savedApiBaseUrl = tt.getStorageSync("API_BASE_URL") || config.API_BASE_URL;
    this.setData({
      persona: profile.persona || config.DEFAULT_PERSONA,
      replyStyle: profile.replyStyle || config.DEFAULT_REPLY_STYLE,
      offer: profile.offer || config.DEFAULT_OFFER,
      apiBaseUrl: savedApiBaseUrl,
    });
    this.loadBackendStatus();
    this.loadAuthState();
    this.loadCustomerServiceStrategy();
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  saveApiBaseUrl() {
    const value = String(this.data.apiBaseUrl || "").trim();
    if (!value) {
      this.toast("API 地址不能为空");
      return;
    }
    tt.setStorageSync("API_BASE_URL", value);
    this.toast("已保存 API 地址");
    this.loadBackendStatus();
    this.loadAuthState();
  },

  async loadBackendStatus() {
    try {
      const data = await api.request("/api/health");
      const env = data.env || {};
      const douyin = env.douyin || {};
      const llm = env.llm || {};
      this.setData({
        backendStatus: {
          status: data.ok ? "connected" : "error",
          message: [
            `后端${data.ok ? "正常" : "异常"}`,
            `抖音密钥${douyin.appIdSet && douyin.appSecretSet ? "已配" : "缺失"}`,
            `授权${douyin.accessTokenSet ? "已登录" : "未登录"}`,
            `模型${llm.configured ? `${llm.provider}/${llm.model}` : "未配置"}`,
          ].join(" / "),
        },
      });
    } catch (error) {
      this.setData({
        backendStatus: {
          status: "error",
          message: error.message || "后端健康检查失败",
        },
      });
    }
  },

  async loadAuthState() {
    try {
      const data = await api.request("/api/douyin/auth/status");
      const auth = data.auth || {};
      this.setData({
        authState: {
          status: auth.configured ? "connected" : "mock",
          message: auth.configured
            ? `已授权：${auth.openId || "token 已保存"}`
            : "未授权，当前仅能使用 mock 或只读状态",
        },
      });
    } catch (error) {
      this.setData({
        authState: {
          status: "error",
          message: error.message || "授权状态获取失败",
        },
      });
    }
  },

  async loadCustomerServiceStrategy() {
    try {
      const data = await api.request("/api/customer-service/strategy/current");
      const strategy = data.strategy || config.DEFAULT_CUSTOMER_SERVICE_STRATEGY;
      this.applyCustomerServiceStrategy(strategy, "connected", "已从后端加载客服策略");
    } catch (error) {
      const localStrategy = tt.getStorageSync("customerServiceStrategy");
      if (localStrategy) {
        this.applyCustomerServiceStrategy(localStrategy, "cached", "使用本地缓存客服策略");
        return;
      }
      this.applyCustomerServiceStrategy(config.DEFAULT_CUSTOMER_SERVICE_STRATEGY, "default", error.message || "使用默认客服策略");
    }
  },

  connectDouyinAuth() {
    if (!tt.showDouyinOpenAuth) {
      tt.showModal({
        title: "当前环境不支持",
        content: "当前开发工具或基础库没有 showDouyinOpenAuth。请在真机预览或升级开发者工具后再试。",
        showCancel: false,
      });
      return;
    }

    tt.showDouyinOpenAuth({
      scope: config.DOUYIN_AUTH_SCOPE,
      success: async (res) => {
        const ticket = res.ticket || res.code || res.authCode || "";
        if (!ticket) {
          this.setData({
            authState: {
              status: "error",
              message: "授权成功但没有拿到 ticket/code，请查看返回值",
            },
          });
          return;
        }
        await this.exchangeAuthTicket(ticket);
      },
      fail: (error) => {
        this.setData({
          authState: {
            status: "error",
            message: error.errMsg || "授权失败",
          },
        });
        this.toast(error.errMsg || "授权失败");
      },
    });
  },

  async exchangeAuthTicket(ticket) {
    this.setData({
      authState: { status: "authing", message: "正在兑换 access_token" },
    });
    try {
      const data = await api.request("/api/douyin/auth/exchange", {
        method: "POST",
        data: { ticket },
      });
      const auth = data.auth || {};
      this.setData({
        authState: {
          status: auth.configured ? "connected" : "error",
          message: auth.configured ? `授权成功：${auth.openId || "token 已保存"}` : "授权返回异常",
        },
      });
      this.toast("授权成功");
    } catch (error) {
      this.setData({
        authState: {
          status: "error",
          message: error.message || "兑换 token 失败",
        },
      });
      this.toast(error.message || "兑换 token 失败");
    }
  },

  async testVideoConvert() {
    const videoId = String(this.data.testVideoId || "").trim();
    if (!videoId) {
      this.toast("先填 video_id");
      return;
    }
    this.setData({ testing: true });
    try {
      const data = await api.request("/api/douyin/video/convert", {
        method: "POST",
        data: { videoId },
      });
      tt.showModal({
        title: "转换结果",
        content: JSON.stringify(data.result || data).slice(0, 800),
        showCancel: false,
      });
    } catch (error) {
      this.toast(error.message || "转换失败");
    } finally {
      this.setData({ testing: false });
    }
  },

  async testVideoQuery() {
    const itemId = String(this.data.testItemId || "").trim();
    if (!itemId) {
      this.toast("先填 item_id");
      return;
    }
    this.setData({ testing: true });
    try {
      const data = await api.request("/api/douyin/video/query", {
        method: "POST",
        data: { itemId },
      });
      tt.showModal({
        title: "视频数据",
        content: JSON.stringify(data.result || data).slice(0, 800),
        showCancel: false,
      });
    } catch (error) {
      this.toast(error.message || "查询失败");
    } finally {
      this.setData({ testing: false });
    }
  },

  onSwitchChange(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: Boolean(event.detail.value) });
  },

  applyCustomerServiceStrategy(strategy, status = "connected", message = "") {
    const safeStrategy = {
      ...config.DEFAULT_CUSTOMER_SERVICE_STRATEGY,
      ...strategy,
      workingHours: {
        ...config.DEFAULT_CUSTOMER_SERVICE_STRATEGY.workingHours,
        ...(strategy.workingHours || {}),
      },
    };
    this.setData({
      customerServiceScene: safeStrategy.sceneName || "",
      customerServiceSummary: safeStrategy.businessSummary || "",
      customerServiceItemsText: this.joinLines(safeStrategy.businessItems),
      customerServiceRulesText: this.joinLines(safeStrategy.replyRules),
      customerServiceHandoffText: this.joinLines(safeStrategy.handoffRules),
      customerServiceFallback: safeStrategy.fallbackReply || "",
      customerServicePrompt: safeStrategy.prompt || "",
      customerServiceTone: safeStrategy.tone || "professional",
      customerServiceHumanApproval: safeStrategy.humanApproval !== false,
      customerServiceWorkStart: safeStrategy.workingHours?.start || "09:00",
      customerServiceWorkEnd: safeStrategy.workingHours?.end || "21:00",
      customerServiceStatus: { status, message },
    });
    getApp().globalData.customerServiceStrategy = safeStrategy;
    tt.setStorageSync("customerServiceStrategy", safeStrategy);
  },

  buildCustomerServiceStrategy() {
    return {
      sceneName: String(this.data.customerServiceScene || "").trim(),
      businessSummary: String(this.data.customerServiceSummary || "").trim(),
      businessItems: this.splitLines(this.data.customerServiceItemsText),
      replyRules: this.splitLines(this.data.customerServiceRulesText),
      handoffRules: this.splitLines(this.data.customerServiceHandoffText),
      fallbackReply: String(this.data.customerServiceFallback || "").trim(),
      prompt: String(this.data.customerServicePrompt || "").trim(),
      tone: String(this.data.customerServiceTone || "professional").trim(),
      humanApproval: Boolean(this.data.customerServiceHumanApproval),
      workingHours: {
        timezone: "Asia/Shanghai",
        start: String(this.data.customerServiceWorkStart || "09:00").trim(),
        end: String(this.data.customerServiceWorkEnd || "21:00").trim(),
      },
    };
  },

  async saveCustomerServiceStrategy() {
    const strategy = this.buildCustomerServiceStrategy();
    if (!strategy.sceneName) {
      this.toast("先填客服场景名称");
      return;
    }
    if (!strategy.prompt) {
      this.toast("提示词不能为空");
      return;
    }
    this.setData({
      customerServiceSaving: true,
      customerServiceStatus: { status: "saving", message: "正在保存客服策略" },
    });
    try {
      const data = await api.request("/api/customer-service/strategy/save", {
        method: "POST",
        data: { strategy },
      });
      this.applyCustomerServiceStrategy(data.strategy || strategy, "connected", "客服策略已保存");
      this.toast("客服策略已保存");
    } catch (error) {
      this.toast(error.message || "保存客服策略失败");
      this.setData({
        customerServiceStatus: {
          status: "error",
          message: error.message || "保存客服策略失败",
        },
      });
    } finally {
      this.setData({ customerServiceSaving: false });
    }
  },

  resetCustomerServiceStrategy() {
    this.applyCustomerServiceStrategy(
      config.DEFAULT_CUSTOMER_SERVICE_STRATEGY,
      "default",
      "已恢复默认客服策略",
    );
    this.toast("已恢复默认策略");
  },

  splitLines(text) {
    return String(text || "")
      .split(/\n+/)
      .map((item) => item.replace(/^[\-\*\d.\s]+/, "").trim())
      .filter(Boolean);
  },

  joinLines(list) {
    if (!Array.isArray(list)) return String(list || "");
    return list.join("\n");
  },

  saveProfile() {
    const profile = {
      persona: this.data.persona,
      replyStyle: this.data.replyStyle,
      offer: this.data.offer,
    };
    getApp().globalData.userProfile = profile;
    tt.setStorageSync("userProfile", profile);
    this.toast("已保存个人配置");
  },

  toast(title) {
    tt.showToast({ title, icon: "none" });
  },
});
