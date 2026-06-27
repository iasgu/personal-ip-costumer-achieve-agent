const gatewayUrl = process.env.GATEWAY_URL || "http://127.0.0.1:8787";
const apiKey = process.env.GATEWAY_API_KEY || "sk-demo-local";

const tests = [
  {
    name: "fast text / deepseek-v4-flash",
    model: "deepseek-v4-flash",
    messages: [
      {
        role: "user",
        content: "Return exactly this JSON: {\"ok\":true,\"type\":\"fast-text\"}",
      },
    ],
  },
  {
    name: "fallback text / doubao lite",
    model: "doubao-seed-2-0-lite-260428",
    messages: [
      {
        role: "user",
        content: "Return exactly this JSON: {\"ok\":true,\"type\":\"fallback-text\"}",
      },
    ],
  },
  {
    name: "reasoning / deepseek-v4-pro",
    model: "deepseek-v4-pro",
    messages: [
      {
        role: "user",
        content: "用一句中文回答：如果A大于B，B大于C，那么A和C是什么关系？",
      },
    ],
  },
  {
    name: "route policy / fast-text",
    model: "fast-text",
    messages: [
      {
        role: "user",
        content: "把这句话改成短视频开头：老板不会做内容，所以获客越来越难。",
      },
    ],
  },
  {
    name: "route policy / reasoning",
    model: "reasoning",
    messages: [
      {
        role: "user",
        content: "分析这个产品链路的风险：爆款链接提取、行业改写、数字人成片、自动分发。",
      },
    ],
  },
  {
    name: "route policy / gateway-auto",
    model: "gateway-auto",
    messages: [
      {
        role: "user",
        content: "给餐饮老板写一个15秒短视频钩子。",
      },
    ],
  },
  {
    name: "multimodal / doubao vision",
    model: "doubao-seed-1-6-vision-250815",
    messages: [
      {
        role: "user",
        content:
          "这是一张测试图片：data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=。请用一句话描述。",
      },
    ],
  },
  {
    name: "route policy / multimodal",
    model: "multimodal",
    messages: [
      {
        role: "user",
        content:
          "请理解这张测试图片：data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=。",
      },
    ],
  },
];

const results = [];

for (const test of tests) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: test.model,
        messages: test.messages,
        temperature: 0,
        max_tokens: 180,
      }),
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      results.push({
        name: test.name,
        model: test.model,
        status: "FAIL",
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        error: payload.error?.code || payload.code || payload.error?.message || text.slice(0, 180),
      });
      continue;
    }

    results.push({
      name: test.name,
      model: test.model,
      status: "OK",
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      routedModel: payload.gateway?.routedModel,
      routePolicyId: payload.gateway?.routing?.routePolicyId,
      usageLogId: payload.gateway?.usageLogId,
      answerPreview: payload.choices?.[0]?.message?.content?.slice(0, 120),
    });
  } catch (error) {
    results.push({
      name: test.name,
      model: test.model,
      status: "ERROR",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log(JSON.stringify(results, null, 2));
