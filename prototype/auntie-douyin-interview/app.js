const state = {
  questions: [],
  index: 0,
  interviewee: "舅妈",
  answers: {},
};

const screens = {
  intro: document.querySelector("#intro"),
  question: document.querySelector("#questionScreen"),
  done: document.querySelector("#doneScreen"),
};

document.querySelector("#startBtn").addEventListener("click", start);
document.querySelector("#prevBtn").addEventListener("click", prev);
document.querySelector("#nextBtn").addEventListener("click", next);

async function start() {
  state.interviewee = document.querySelector("#interviewee").value || "舅妈";
  const data = await api("/api/questions");
  state.questions = data.questions;
  show("question");
  render();
}

function render() {
  const question = state.questions[state.index];
  document.querySelector("#progressBar").style.width = `${((state.index + 1) / state.questions.length) * 100}%`;
  document.querySelector("#sectionLabel").textContent = `${state.index + 1}/${state.questions.length}`;
  document.querySelector("#questionTitle").textContent = question.title;
  document.querySelector("#questionBody").innerHTML = buildQuestion(question);
  bindInputs(question);
}

function buildQuestion(question) {
  if (question.type === "form") {
    return question.items.map((item) => field(question.id, item.key, item.label, item.placeholder)).join("");
  }
  if (question.type === "open") {
    return question.prompts.map((prompt, index) => area(question.id, `p${index}`, prompt)).join("");
  }
  if (question.type === "comment_cases") {
    return question.cases.map((text, index) => `
      <div class="case">
        <div class="case-title">别人评论：${escapeHtml(text)}</div>
        ${area(question.id, `reply${index}`, "你会怎么回？")}
      </div>
    `).join("");
  }
  return "";
}

function field(section, key, label, placeholder) {
  const value = getAnswer(section, key);
  return `
    <label class="field">
      ${escapeHtml(label)}
      <input data-section="${section}" data-key="${key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder || "")}" />
    </label>
  `;
}

function area(section, key, label) {
  const value = getAnswer(section, key);
  return `
    <label class="field">
      ${escapeHtml(label)}
      <textarea data-section="${section}" data-key="${key}" placeholder="按你的直觉写，越口语越好">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function rating(section, key, label) {
  const value = Number(getAnswer(section, key) || 0);
  return `
    <div class="field">
      ${escapeHtml(label)}
      <div class="rating">
        ${[1, 2, 3, 4, 5].map((score) => `<button type="button" class="${value === score ? "active" : ""}" data-rating-section="${section}" data-rating-key="${key}" data-score="${score}">${score}</button>`).join("")}
      </div>
    </div>
  `;
}

function bindInputs() {
  document.querySelectorAll("[data-section][data-key]").forEach((input) => {
    input.addEventListener("input", () => setAnswer(input.dataset.section, input.dataset.key, input.value));
  });
  document.querySelectorAll("[data-rating-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setAnswer(btn.dataset.ratingSection, btn.dataset.ratingKey, Number(btn.dataset.score));
      render();
    });
  });
}

function next() {
  if (state.index < state.questions.length - 1) {
    state.index += 1;
    render();
  } else {
    submit();
  }
}

function prev() {
  if (state.index > 0) {
    state.index -= 1;
    render();
  }
}

async function submit() {
  const data = await api("/api/submit", {
    method: "POST",
    body: JSON.stringify({
      interviewee: state.interviewee,
      answers: state.answers,
    }),
  });
  document.querySelector("#insightBox").textContent = JSON.stringify(data.insight, null, 2);
  show("done");
}

function show(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function getAnswer(section, key) {
  return state.answers[section]?.[key] || "";
}

function setAnswer(section, key, value) {
  state.answers[section] = state.answers[section] || {};
  state.answers[section][key] = value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
