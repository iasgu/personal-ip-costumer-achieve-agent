const config = require("./config");
const { mockRequest } = require("./mock");

function getBaseUrl() {
  try {
    return tt.getStorageSync("API_BASE_URL") || config.API_BASE_URL;
  } catch {
    return config.API_BASE_URL;
  }
}

function request(path, options = {}) {
  const baseUrl = getBaseUrl();
  if (baseUrl === "mock") {
    return mockRequest(path, options.data || {});
  }

  return new Promise((resolve, reject) => {
    tt.request({
      url: `${baseUrl}${path}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json",
        ...(options.header || {})
      },
      success(response) {
        const data = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300 && data.ok !== false) {
          resolve(data);
        } else {
          reject(new Error(data.error || `请求失败：${response.statusCode}`));
        }
      },
      fail(error) {
        if (config.FALLBACK_TO_MOCK) {
          mockRequest(path, options.data || {}).then(resolve).catch(reject);
          return;
        }
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}

function uploadFile(path, filePath, formData = {}) {
  const baseUrl = getBaseUrl();
  if (baseUrl === "mock" || baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")) {
    return Promise.resolve(buildLocalAsset(filePath, formData.kind));
  }

  return new Promise((resolve, reject) => {
    tt.uploadFile({
      url: `${baseUrl}${path}`,
      filePath,
      name: "file",
      formData,
      success(response) {
        try {
          const data = JSON.parse(response.data || "{}");
          if (data.ok === false) reject(new Error(data.error || "上传失败"));
          else resolve(data);
        } catch {
          reject(new Error("上传响应解析失败"));
        }
      },
      fail(error) {
        reject(new Error(error.errMsg || "上传失败"));
      }
    });
  });
}

function buildLocalAsset(filePath, kind = "asset") {
  return {
    ok: true,
    assetId: `${kind}_${Date.now()}`,
    url: filePath,
    localOnly: true,
    kind,
    name: String(filePath || "").split("/").pop() || `${kind}-file`
  };
}

function downloadVideo(url) {
  return new Promise((resolve, reject) => {
    if (!url || url.startsWith("https://example.com")) {
      resolve({ tempFilePath: "ttfile://mock/generated-personal-ip-demo.mp4" });
      return;
    }

    tt.downloadFile({
      url,
      success(response) {
        if (response.statusCode === 200) {
          resolve({ tempFilePath: response.tempFilePath });
        } else {
          reject(new Error(`视频下载失败：${response.statusCode}`));
        }
      },
      fail(error) {
        reject(new Error(error.errMsg || "视频下载失败"));
      }
    });
  });
}

module.exports = {
  request,
  uploadFile,
  downloadVideo
};
