import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const submissionsPath = path.join(rootDir, "data", "submissions.json");
const strategyPath = path.join(rootDir, "data", "fused-strategy.json");

main();

function main() {
  const submissions = readJson(submissionsPath, []);
  const strategy = buildFusedStrategy(submissions);
  fs.mkdirSync(path.dirname(strategyPath), { recursive: true });
  fs.writeFileSync(strategyPath, JSON.stringify(strategy, null, 2), "utf8");
  console.log(JSON.stringify({
    ok: true,
    output: strategyPath,
    submissionCount: strategy.submissionCount,
    realCount: strategy.realCount,
    syntheticCount: strategy.syntheticCount,
    modelGeneratedCount: strategy.modelGeneratedCount,
    hintCount: strategy.hints.length,
  }, null, 2));
}

function buildFusedStrategy(submissions) {
  const valid = Array.isArray(submissions) ? submissions.filter((item) => item?.insight) : [];
  const sections = {
    rules: collectWeightedItems(valid, "rules"),
    leadSignals: collectWeightedItems(valid, "leadSignals"),
    negativeHandling: collectWeightedItems(valid, "negativeHandling"),
    replyStyle: collectWeightedItems(valid, "replyStyle"),
    avoid: collectWeightedItems(valid, "avoid"),
  };
  const hints = [
    ...sections.rules.slice(0, 2),
    ...sections.leadSignals.slice(0, 2),
    ...sections.negativeHandling.slice(0, 2),
    ...sections.replyStyle.slice(0, 1),
    ...sections.avoid.slice(0, 1),
  ].map((item) => item.text);

  return {
    generatedAt: new Date().toISOString(),
    submissionCount: valid.length,
    realCount: valid.filter(isHumanSubmission).length,
    syntheticCount: valid.filter((item) => item.synthetic).length,
    legacySyntheticCount: valid.filter((item) => !item.synthetic && !isHumanSubmission(item)).length,
    modelGeneratedCount: valid.filter((item) => item.modelGenerated).length,
    sources: valid.slice(0, 30).map((item) => ({
      id: item.id,
      interviewee: item.interviewee,
      synthetic: Boolean(item.synthetic),
      human: isHumanSubmission(item),
      modelGenerated: Boolean(item.modelGenerated),
      model: item.model || "",
      createdAt: item.createdAt,
    })),
    sections,
    hints,
    summary: {
      priority: "优先回复有明确需求、试用、案例、账号诊断、合作意向的评论。",
      risk: "对质疑类先共情再给测试路径；绝不承诺涨粉、收益、百分百效果，也不在评论区暴露联系方式。",
      style: "偏个人IP口语，短句、像真人，不要客服腔，尽量引导先测一条。",
    },
  };
}

function collectWeightedItems(submissions, sectionKey) {
  const map = new Map();
  const now = Date.now();
  for (const item of submissions) {
    const values = Array.isArray(item.insight?.[sectionKey]) ? item.insight[sectionKey] : [];
    for (const raw of values) {
      const text = normalizeText(raw);
      if (!text) continue;
      const current = map.get(text) || {
        text,
        count: 0,
        realCount: 0,
        syntheticCount: 0,
        modelGeneratedCount: 0,
        humanRecentCount: 0,
        score: 0,
        sources: [],
      };
      const isHuman = isHumanSubmission(item);
      const createdAtMs = Date.parse(item.createdAt || "");
      const isRecentHuman = isHuman && Number.isFinite(createdAtMs) && now - createdAtMs <= 24 * 60 * 60 * 1000;
      const weight = isHuman ? (isRecentHuman ? 7 : 5) : item.modelGenerated ? 1.5 : 1;
      current.count += 1;
      current.score += weight;
      if (isHuman) current.realCount += 1;
      else current.syntheticCount += 1;
      if (isRecentHuman) current.humanRecentCount += 1;
      if (item.modelGenerated) current.modelGeneratedCount += 1;
      if (current.sources.length < 8) current.sources.push(item.id);
      map.set(text, current);
    }
  }
  return [...map.values()].sort((a, b) => {
    const scoreA = a.score;
    const scoreB = b.score;
    return scoreB - scoreA || b.count - a.count || a.text.length - b.text.length;
  });
}

function isHumanSubmission(item) {
  if (!item || item.synthetic || item.modelGenerated || item.model) return false;
  const name = String(item.interviewee || "");
  const syntheticNamePattern = /示例|用户|运营|老板|店长|负责人|合作方|博主|达人|助理|销售|咨询师|律师|私域|房产|教培|健身|医美|宝妈|敏感|探店|直播|制造业|小红书|价格/;
  if (syntheticNamePattern.test(name)) return false;
  return true;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[。；;,.，]+$/g, "")
    .trim();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
