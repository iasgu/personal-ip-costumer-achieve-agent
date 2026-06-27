App({
  globalData: {
    latestJob: null,
    latestDraft: null,
    customerServiceStrategy: null,
    userProfile: {
      persona: "AI短视频获客顾问",
      replyStyle: "个人IP口语化，真实克制，不夸大承诺"
    }
  },

  onLaunch() {
    const profile = tt.getStorageSync("userProfile");
    const customerServiceStrategy = tt.getStorageSync("customerServiceStrategy");
    if (profile) {
      this.globalData.userProfile = {
        ...this.globalData.userProfile,
        ...profile
      };
    }
    if (customerServiceStrategy) {
      this.globalData.customerServiceStrategy = customerServiceStrategy;
    }
  }
});
