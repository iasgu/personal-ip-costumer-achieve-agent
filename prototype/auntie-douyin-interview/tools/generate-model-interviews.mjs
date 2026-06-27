import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(rootDir, "..", "..");
loadDotEnv(path.join(projectRoot, "prototype", "ip-agent", ".env"));
loadDotEnv(path.join(rootDir, ".env"));

const baseUrl = process.env.INTERVIEW_BASE_URL || "http://127.0.0.1:8894";
const dashScopeKey = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || "";
const workspaceId = process.env.DASHSCOPE_WORKSPACE_ID || process.env.ALIYUN_WORKSPACE_ID || "llm-577ewqw8ktzlak0j";
const compatibleBaseUrl = (process.env.DASHSCOPE_COMPATIBLE_BASE_URL || `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`).replace(/\/+$/, "");
const model = getArg("--model") || process.env.INTERVIEW_MODEL || "qwen3.7-plus";
const limit = Number(getArg("--limit") || process.env.INTERVIEW_ROLE_LIMIT || 4);
const offset = Number(getArg("--offset") || process.env.INTERVIEW_ROLE_OFFSET || 0);
const concurrency = Number(getArg("--concurrency") || process.env.INTERVIEW_ROLE_CONCURRENCY || 2);
const modelTimeoutMs = Number(getArg("--timeout-ms") || process.env.INTERVIEW_MODEL_TIMEOUT_MS || 45000);
const dryRun = hasArg("--dry-run");

const roles = [
  {
    name: "餐饮店老板",
    traits: "40岁左右，本地小店老板，不懂AI，最关心能不能带来客流、是否像真人、会不会违规。",
  },
  {
    name: "美业店长",
    traits: "女性，短视频轻度运营，关注个人形象、信任感、私域转化和评论区话术边界。",
  },
  {
    name: "抖音重度中年用户",
    traits: "经常刷抖音和评论，讨厌广告腔，喜欢真实、接地气、有生活感的回复。",
  },
  {
    name: "挑刺型潜在用户",
    traits: "对AI视频天然质疑，会问是不是割韭菜、是不是骗人、效果是不是很假。",
  },
  {
    name: "本地生活代运营",
    traits: "关注批量交付、线索质量、评论优先级、风险话术和客户是否愿意留资。",
  },
  {
    name: "企业培训负责人",
    traits: "关注标准化SOP、多人账号矩阵、能否沉淀知识库和后续企业端服务。",
  },
  {
    name: "刚起号的新手宝妈",
    traits: "想做副业但怕露脸，不会写文案，关心是不是简单、要不要每天拍、能不能保护隐私。",
  },
  {
    name: "同城房产中介",
    traits: "关心获客线索、账号信任感、评论区咨询转私信、内容是否会被判营销。",
  },
  {
    name: "教培机构校长",
    traits: "关心家长信任、课程案例、合规表达和评论里如何筛选有报名意向的人。",
  },
  {
    name: "健身私教",
    traits: "想打造个人IP，关注身材展示、专业感、评论里如何回应价格和效果质疑。",
  },
  {
    name: "知识付费博主",
    traits: "熟悉内容运营，关心爆款拆解质量、批量产出效率、评论区如何引导体验课。",
  },
  {
    name: "小红书转抖音用户",
    traits: "会做图文但不熟抖音，关心口播节奏、评论互动和跨平台内容改写。",
  },
  {
    name: "本地探店达人",
    traits: "关注真实感、商单转化、评论里如何处理质疑和商家合作咨询。",
  },
  {
    name: "企业老板助理",
    traits: "负责帮老板做账号，关心素材收集、老板音色形象、批量审核和风险兜底。",
  },
  {
    name: "直播间运营",
    traits: "关心评论热词、私域引流边界、短视频到直播间的转化和互动节奏。",
  },
  {
    name: "传统制造业销售",
    traits: "不懂短视频，关心B端询盘、产品讲解、客户信任和评论里如何留线索。",
  },
  {
    name: "医美咨询师",
    traits: "强合规场景，关心效果承诺风险、案例表达边界、评论里如何温和引导咨询。",
  },
  {
    name: "律师个人IP",
    traits: "专业服务场景，关心不能承诺结果、评论区如何筛选咨询和避免敏感表达。",
  },
  {
    name: "宝妈生活号观众",
    traits: "普通观看者视角，敏感广告和割韭菜，喜欢真实经验和低门槛尝试。",
  },
  {
    name: "价格敏感型用户",
    traits: "第一反应问多少钱，怕被套路，只有看到小样和明确边界才愿意继续聊。",
  },
  {
    name: "高意向试用用户",
    traits: "已经想试一条，关心第一步给什么素材、多久出结果、怎么判断能不能发。",
  },
  {
    name: "负面评论围观者",
    traits: "不一定买，但会看评论区争吵，判断账号是否真诚、克制、有底气。",
  },
  {
    name: "代理合作考察者",
    traits: "想判断能不能卖给本地商家，关心成本、交付稳定性、售后边界和话术标准。",
  },
  {
    name: "短视频剪辑师",
    traits: "懂剪辑但不懂AI生成，关心工具是否抢活、如何提升效率、成片是否可控。",
  },
  {
    name: "私域运营",
    traits: "关心评论区到私域的安全路径、用户分层、群运营和自动回复边界。",
  },
  {
    name: "餐饮连锁市场负责人",
    traits: "有多门店账号矩阵需求，关心标准化模板、城市差异、评论线索分配。",
  },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const questions = await getQuestions();
  const submitted = [];
  const selectedRoles = roles.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, Math.min(limit, roles.length)));
  if (!selectedRoles.length) throw new Error(`no roles selected: offset=${offset}, limit=${limit}, roleCount=${roles.length}`);
  await mapLimit(selectedRoles, Math.max(1, concurrency), async (role) => {
    const generated = dryRun ? fallbackAnswers(role) : await generateAnswersWithTimeout(role, questions).catch((error) => {
      return {
        ...fallbackAnswers(role),
        generationError: error.message,
      };
    });
    const answers = generated.answers || generated;
    const response = await fetch(`${baseUrl}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interviewee: role.name,
        traits: role.traits,
        answers,
        synthetic: true,
        modelGenerated: !generated.generationError && !dryRun,
        model: generated.generationError || dryRun ? "local-fallback" : model,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `submit failed for ${role.name}`);
    submitted.push({
      role: role.name,
      submissionId: data.submissionId,
      model: generated.generationError || dryRun ? "local-fallback" : model,
      generationError: generated.generationError || "",
    });
  });

  console.log(JSON.stringify({ ok: true, baseUrl, count: submitted.length, submitted }, null, 2));
}

async function getQuestions() {
  const response = await fetch(`${baseUrl}/api/questions`);
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "failed to load questions");
  return data.questions;
}

async function generateAnswersWithTimeout(role, questions) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${role.name} model timeout`)), modelTimeoutMs);
  try {
    return await generateAnswers(role, questions, controller.signal);
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`${role.name} model timeout`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function generateAnswers(role, questions, signal) {
  if (!dashScopeKey) throw new Error("missing DASHSCOPE_API_KEY or OPENAI_API_KEY");
  const prompt = [
    "你要模拟一个真实抖音用户来填写一份访谈问卷，目标是提炼“个人IP口播视频”评论区互动策略。",
    "要求：只输出 JSON，不要 Markdown；答案要像真人，不要客服腔；重点覆盖评论回复、负面质疑、引导留资边界。",
    `角色：${role.name}`,
    `角色特征：${role.traits}`,
    "输出 JSON schema：",
    JSON.stringify(exampleSchema(), null, 2),
    "问卷结构：",
    JSON.stringify(questions, null, 2),
  ].join("\n");

  const response = await fetch(`${compatibleBaseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${dashScopeKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是一个擅长模拟真实用户访谈的中文研究员，只输出严格 JSON。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2200,
      response_format: { type: "json_object" },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`model HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`empty model response: ${JSON.stringify(payload).slice(0, 500)}`);
  const parsed = JSON.parse(stripJsonFence(content));
  if (!parsed.answers?.profile || !parsed.answers?.comment_cases) throw new Error("model response missing answers");
  return parsed;
}

async function mapLimit(items, limitCount, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limitCount, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function exampleSchema() {
  return {
    answers: {
      profile: {
        ageRange: "40-50",
        commentHabit: "什么时候会评论",
        replyPreference: "喜欢别人怎么回复",
      },
      comment_judgement: {
        p0: "什么评论认真回",
        p1: "什么评论简单回",
        p2: "什么评论不回",
        p3: "什么评论有线索价值",
        p4: "什么评论容易吵起来",
      },
      comment_cases: Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`reply${index}`, "针对该评论的一句口语回复"])),
      negative_cases: {
        p0: "别人说骗人的怎么回",
        p1: "别人说AI太假怎么回",
        p2: "骂人或阴阳怪气怎么处理",
        p3: "哪些话不能回",
      },
      lead_boundary: {
        p0: "问价格怎么处理",
        p1: "什么时候引导私信",
        p2: "评论区怎么避免违规",
        p3: "让别人留下链接/账号怎么说",
      },
    },
  };
}

function fallbackAnswers(role) {
  return {
    answers: {
      profile: {
        ageRange: role.name.includes("中年") || role.name.includes("老板") ? "40-55" : "25-40",
        commentHabit: "看到问题很具体、像是真想解决账号或内容问题时会评论；太像广告或夸大承诺就会划走。",
        replyPreference: "希望回复短一点、实在一点，像真人说话，最好直接告诉我下一步怎么试。",
      },
      comment_judgement: {
        p0: "问价格、问案例、问能不能用自己头像声音、问账号诊断、问怎么开始的评论要认真回。",
        p1: "单纯夸一句、问得很泛的可以简单回一句。",
        p2: "骂人、套承诺、要求保证涨粉赚钱的不要深入回。",
        p3: "愿意留视频链接、问能不能试一条、问自己行业能不能做，都是高价值线索。",
        p4: "说骗人、割韭菜、保证效果、AI很假这些容易吵起来。",
      },
      comment_cases: {
        reply0: "别急着买，先拿你自己的视频试一条，效果过了再聊方案。",
        reply1: "担心正常，所以先看生成结果，不靠嘴说。",
        reply2: "可以，用自己的头像和声音会更像个人IP，先测15秒就够。",
        reply3: "能用，系统先拆爆款结构，再改成你能说出口的版本。",
        reply4: "会不会像AI主要看头像、音频和脚本，建议先小样测试。",
        reply5: "你可以先看成片，觉得假就不用继续。",
        reply6: "先从你行业里一条爆款开始拆，不要一上来想太多。",
        reply7: "餐饮能做，但要围绕老板本人、招牌菜和真实到店理由。",
        reply8: "可以，先留一个账号或代表视频，我看下问题在哪。",
        reply9: "有案例，不过建议先看生成前后对比。",
        reply10: "可以先留链接，我看适不适合做一版。",
        reply11: "合规要注意，不夸大承诺，也别在评论区直接放联系方式。",
        reply12: "没时间拍就先用轻量口播模板，解决持续输出。",
        reply13: "你觉得夸张没关系，先看一条真实生成结果。",
        reply14: "第一步给一个你想模仿的爆款链接，再给你的头像和声音。",
      },
      negative_cases: {
        p0: "先承认对方担心合理，再说可以用一条小样验证，不要争辩。",
        p1: "承认AI确实有边界，所以只建议先做15秒测试，看能不能接受。",
        p2: "纯骂人的隐藏或不回，阴阳怪气的低情绪回复一句就停。",
        p3: "不能说保证涨粉、稳赚、百分百有效，也不要直接留微信手机号。",
      },
      lead_boundary: {
        p0: "先问行业、账号阶段和要做几条，不要上来硬报价。",
        p1: "对方问案例、试用、账号诊断、链接时，可以引导私信或留视频链接。",
        p2: "评论区只做轻引导，不放敏感联系方式，不承诺结果。",
        p3: "可以说把账号或爆款链接留一下，我先帮你判断适不适合做。",
      },
    },
  };
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function hasArg(name) {
  return process.argv.includes(name);
}

function stripJsonFence(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
