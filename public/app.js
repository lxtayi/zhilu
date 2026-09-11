const elements = {
  form: document.querySelector("#questionForm"),
  input: document.querySelector("#questionInput"),
  charCount: document.querySelector("#charCount"),
  hero: document.querySelector("#heroSection"),
  progress: document.querySelector("#progressSection"),
  progressTitle: document.querySelector("#progressTitle"),
  progressDetail: document.querySelector("#progressDetail"),
  progressSteps: [...document.querySelectorAll("#progressSteps li")],
  results: document.querySelector("#resultSection"),
  resultQuestion: document.querySelector("#resultQuestion"),
  resultMode: document.querySelector("#resultMode"),
  modeBadge: document.querySelector("#modeBadge"),
  coreTension: document.querySelector("#coreTension"),
  queryPills: document.querySelector("#queryPills"),
  warningBox: document.querySelector("#warningBox"),
  mapTitle: document.querySelector("#mapTitle"),
  islandMap: document.querySelector("#islandMap"),
  restart: document.querySelector("#restartButton"),
  bottomRestart: document.querySelector("#bottomRestart"),
  dialog: document.querySelector("#personDialog"),
  closeDialog: document.querySelector("#closeDialog"),
  personContent: document.querySelector("#personContent"),
  toast: document.querySelector("#toast")
};

const progressCopy = [
  ["正在理解你的问题", "保留原问题，拆解不同的搜索方向。"],
  ["正在沿知乎内容寻找线索", "同时搜索经验、能力、风险和行动路径。"],
  ["正在整理不同观点", "把相似内容归到同一座观点岛，并保留证据。"],
  ["正在寻找值得认识的人", "从内容出发，解释为什么值得继续交流。"]
];

const state = {
  result: null,
  selectedClusterIndex: -1,
  transitioning: false,
  progressTimer: null,
  trail: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? value : "#2468f2";
}

function safeZhihuUrl(value) {
  try {
    const url = new URL(value);
    const validHost = url.hostname === "zhihu.com" || url.hostname.endsWith(".zhihu.com");
    return url.protocol === "https:" && validHost ? url.href : "https://www.zhihu.com/";
  } catch {
    return "https://www.zhihu.com/";
  }
}

function safeAvatarUrl(value) {
  try {
    const url = new URL(value);
    const validHost = url.hostname === "zhimg.com" || url.hostname.endsWith(".zhimg.com");
    return url.protocol === "https:" && validHost ? url.href : "";
  } catch {
    return "";
  }
}

function initials(name) {
  const clean = String(name || "知").replace(/知友[·・]?/g, "").trim();
  return escapeHtml(clean.slice(0, 1) || "知");
}

function avatarMarkup(person) {
  const avatarUrl = safeAvatarUrl(person?.avatar);
  return avatarUrl
    ? `<span class="avatar"><img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer"></span>`
    : `<span class="avatar">${initials(person?.name)}</span>`;
}

function setModeBadge(mode) {
  const isLive = mode === "live";
  elements.modeBadge.className = `mode-badge ${isLive ? "live" : "demo"}`;
  elements.modeBadge.textContent = isLive ? "真实知乎数据" : "安全演示模式";
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    setModeBadge(data.dataMode);
  } catch {
    elements.modeBadge.textContent = "服务连接异常";
  }
}

function updateCharCount() {
  elements.charCount.textContent = `${elements.input.value.length} / 100`;
}

function startProgress() {
  let index = 0;
  updateProgress(index);
  state.progressTimer = window.setInterval(() => {
    index = Math.min(index + 1, progressCopy.length - 1);
    updateProgress(index);
  }, 700);
}

function updateProgress(index) {
  const [title, detail] = progressCopy[index];
  elements.progressTitle.textContent = title;
  elements.progressDetail.textContent = detail;
  elements.progressSteps.forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
    step.classList.toggle("done", stepIndex < index);
  });
}

function stopProgress() {
  window.clearInterval(state.progressTimer);
  state.progressTimer = null;
  updateProgress(progressCopy.length - 1);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function submitQuestion(question) {
  const submitButton = elements.form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  elements.hero.hidden = true;
  elements.results.hidden = true;
  elements.progress.hidden = false;
  elements.restart.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
  startProgress();

  try {
    const [response] = await Promise.all([
      fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      }),
      delay(1500)
    ]);

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "探索失败，请稍后重试。");

    stopProgress();
    state.result = payload;
    state.trail = { question: payload.question, branches: new Map() };
    state.selectedClusterIndex = -1;
    renderResult();
    saveRecentQuestion(question);
    await delay(250);
    elements.progress.hidden = true;
    elements.results.hidden = false;
    elements.restart.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    stopProgress();
    elements.progress.hidden = true;
    elements.hero.hidden = false;
    showToast(error.message || "探索失败，请稍后重试。");
  } finally {
    submitButton.disabled = false;
  }
}

function saveRecentQuestion(question) {
  try {
    const existing = JSON.parse(localStorage.getItem("zhilu-recent") || "[]");
    const next = [question, ...existing.filter((item) => item !== question)].slice(0, 5);
    localStorage.setItem("zhilu-recent", JSON.stringify(next));
  } catch {
    // 浏览器禁用本地存储时不影响主流程。
  }
}

function renderResult() {
  const result = state.result;
  elements.resultQuestion.textContent = result.question;
  elements.coreTension.textContent = result.analysis?.coreTension || "正在比较不同的思考路径";
  elements.queryPills.innerHTML = (result.analysis?.searchQueries || [])
    .map((query) => `<span>${escapeHtml(query)}</span>`)
    .join("");

  const isLive = result.mode === "live";
  elements.resultMode.className = `result-mode ${isLive ? "live" : "demo"}`;
  elements.resultMode.textContent = isLive
    ? "基于真实知乎搜索"
    : result.mode === "fallback"
      ? "真实接口不足 · 已安全降级"
      : "演示数据 · 完整流程";

  const warnings = (result.warnings || []).filter((warning) => warning?.message);
  elements.warningBox.hidden = warnings.length === 0;
  elements.warningBox.textContent = warnings.map((warning) => warning.message).join(" ");

  renderIslands();
  const closing = document.querySelector(".closing-section");
  if (closing && !closing.querySelector(".trail-trigger")) { const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button trail-trigger"; button.textContent = "结束探索，查看链路树"; button.addEventListener("click", () => showTrail(() => {})); closing.insertBefore(button, closing.querySelector("#bottomRestart")); }
}

function renderIslands() {
  elements.mapTitle.textContent = "四座岛，四种看待问题的方式";
  elements.islandMap.className = "island-map";
  elements.islandMap.innerHTML = `
    <div class="map-center-note" aria-hidden="true">
      <span>沿问题启航</span>
      <strong>四种方向<br>四群具体的人</strong>
    </div>
  `;
  state.result.clusters.forEach((cluster, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `island-button island-position-${index}`;
    button.style.setProperty("--island-color", safeColor(cluster.color));
    button.setAttribute("aria-label", `探索${cluster.name}，${cluster.people?.length || 0} 位代表知友`);
    button.innerHTML = `
      <span class="island-label">
        <span class="island-number">ISLAND ${String(index + 1).padStart(2, "0")}</span>
        <strong>${escapeHtml(cluster.name)}</strong>
        <span class="island-rule"></span>
        <small>${escapeHtml(cluster.summary)}</small>
        <span class="island-count">${Number(cluster.contentCount || cluster.evidenceIds?.length || 0)} 条线索 · ${cluster.people?.length || 0} 位知友</span>
      </span>
      <span class="island-marker" aria-hidden="true"></span>
    `;
    button.addEventListener("click", () => enterIsland(index));
    elements.islandMap.append(button);
  });
}

async function enterIsland(index) {
  if (state.transitioning) return;
  const cluster = state.result.clusters[index];
  if (!cluster) return;

  track("island", { index, name: cluster.name, summary: cluster.summary, color: safeColor(cluster.color) });
  state.transitioning = true;
  state.selectedClusterIndex = index;
  elements.islandMap.classList.add("is-transitioning");
  elements.islandMap.insertAdjacentHTML("beforeend", `
    <div class="scene-transition" role="status">
      <span class="transition-compass" aria-hidden="true">✦</span>
      <small>沿观点航线前行</small>
      <strong>正在前往${escapeHtml(cluster.name)}</strong>
    </div>
  `);

  await delay(520);
  renderIslandScene(index);
  state.transitioning = false;
}

function renderIslandScene(index) {
  const cluster = state.result.clusters[index];
  const color = safeColor(cluster.color);
  const people = cluster.people || [];
  elements.mapTitle.textContent = `${cluster.name} · 点击头像认识岛上的人`;
  elements.islandMap.className = `island-map island-scene focus-${index}`;
  elements.islandMap.style.setProperty("--scene-color", color);
  elements.islandMap.innerHTML = `
    <button class="map-back-button" type="button" aria-label="返回四岛地图">
      <span aria-hidden="true">←</span> 返回群岛
    </button>
    <div class="island-scene-heading">
      <span>ISLAND ${String(index + 1).padStart(2, "0")}</span>
      <h3>${escapeHtml(cluster.name)}</h3>
      <i></i>
      <p>${escapeHtml(cluster.summary)}</p>
      <small>${people.length} 位知友 · 点击头像查看观点依据</small>
    </div>
    <div class="map-people-layer" aria-label="${escapeHtml(cluster.name)}上的代表知友"></div>
  `;

  elements.islandMap.querySelector(".map-back-button").addEventListener("click", leaveIsland);
  const layer = elements.islandMap.querySelector(".map-people-layer");

  if (!people.length) {
    layer.innerHTML = '<div class="map-empty-person">这座岛暂时没有足够可靠的人物线索。</div>';
    return;
  }

  people.slice(0, 3).forEach((person, personIndex) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = `map-person-node person-node-${personIndex}`;
    node.style.setProperty("--person-color", color);
    node.setAttribute("aria-label", `查看${person.name}的观点`);
    node.innerHTML = `
      <span class="map-person-anchor">
        ${avatarMarkup(person)}
        <span class="map-person-name">
          <strong class="person-name">${escapeHtml(person.name)}</strong>
          <small>${escapeHtml(person.recommendationType || "值得了解")}</small>
          <span>${escapeHtml(person.viewpoint)}</span>
        </span>
      </span>
      <span class="map-person-thought">
        <em>${escapeHtml(person.headline || "相关内容作者")}</em>
        <strong>${escapeHtml(person.viewpoint)}</strong>
        <q>${escapeHtml(person.quote?.text || "从公开内容继续了解 TA 的判断")}</q>
        <small>点击查看原文证据与破冰话术 →</small>
      </span>
    `;
    node.addEventListener("click", () => openPerson(person, cluster, color));
    layer.append(node);
  });

  requestAnimationFrame(() => elements.islandMap.classList.add("scene-ready"));
}

function leaveIsland() {
  if (state.transitioning) return;
  state.selectedClusterIndex = -1;
  elements.islandMap.classList.add("scene-leaving");
  window.setTimeout(renderIslands, 260);
}

function findEvidence(id) {
  return state.result.evidence?.find((item) => item.id === id);
}

async function openPerson(person, cluster, color) {
  const evidence = findEvidence(person.quote?.evidenceId || person.evidenceIds?.[0]);
  const sourceUrl = safeZhihuUrl(evidence?.url);
  const sourceLabel = evidence?.isSynthetic ? "打开知乎搜索" : "查看知乎原文";
  track("person", { person, cluster, color, evidence });

  elements.personContent.innerHTML = `
    <div class="dialog-body" style="--person-color:${color}">
      <div class="dialog-person">
        ${avatarMarkup(person)}
        <div>
          <h2>${escapeHtml(person.name)}</h2>
          <p>${escapeHtml(person.headline || "相关内容作者")} · ${escapeHtml(cluster.name)}</p>
        </div>
      </div>

      <section class="dialog-section">
        <h3>为什么推荐 TA</h3>
        <div class="reason-box"><p>${escapeHtml(person.connectionReason)}</p></div>
      </section>

      <section class="dialog-section">
        <h3>来自公开内容的交流起点</h3>
        <div class="quote-box">
          <blockquote>“${escapeHtml(person.quote?.text || evidence?.excerpt || "暂无可引用内容")}”</blockquote>
          <cite>${escapeHtml(evidence?.title || "内容来源整理中")}${evidence?.isSynthetic ? " · 演示内容" : " · 内容节选"}</cite>
        </div>
        <div class="dialog-actions">
          <a id="openSource" class="outline-button" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${sourceLabel}</a>
          <button id="generateDrafts" class="outline-button primary" type="button">生成破冰问题</button>
        </div>
      </section>

      <section id="icebreakerArea" class="icebreaker-area" hidden></section>
    </div>
  `;

  elements.dialog.showModal();
  document.querySelector("#openSource").addEventListener("click", () => { const branch = state.trail?.branches.get(state.result.clusters.indexOf(cluster)); const item = branch?.people.get(person.name || person.quote?.evidenceId); if (item) item.opened = true; });
  document.querySelector("#generateDrafts").addEventListener("click", (event) => {
    generateDrafts(event.currentTarget, person, evidence);
  });
}

async function generateDrafts(button, person, evidence) {
  button.disabled = true;
  button.textContent = "正在准备开场白…";

  try {
    const response = await fetch("/api/icebreakers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: state.result.question,
        person,
        evidence
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "破冰问题生成失败");
    renderDrafts(result.drafts);
    button.textContent = "已生成 3 种风格";
  } catch (error) {
    button.disabled = false;
    button.textContent = "重新生成";
    showToast(error.message);
  }
}

function renderDrafts(drafts) {
  const area = document.querySelector("#icebreakerArea");
  area.hidden = false;
  area.innerHTML = `
    <h3>选择一种开场方式</h3>
    <p>所有草稿都基于同一条公开内容证据，你可以继续修改。</p>
    <div class="draft-tabs"></div>
    <textarea class="draft-editor" maxlength="500" aria-label="可编辑的破冰草稿"></textarea>
    <div class="dialog-actions">
      <button id="copyDraft" class="outline-button primary" type="button">复制草稿</button>
    </div>
    <p class="review-note">发送前请再次核对原文和语气；知路不会自动代你发布。</p>
  `;

  const tabs = area.querySelector(".draft-tabs");
  const editor = area.querySelector(".draft-editor");

  function selectDraft(index) {
    editor.value = drafts[index].text;
    [...tabs.children].forEach((tab, tabIndex) => tab.classList.toggle("active", tabIndex === index));
  }

  drafts.forEach((draft, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "draft-tab";
    tab.textContent = draft.label;
    tab.addEventListener("click", () => selectDraft(index));
    tabs.append(tab);
  });

  selectDraft(0);
  area.querySelector("#copyDraft").addEventListener("click", () => copyText(editor.value));
  area.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  showToast("草稿已复制，发送前记得再看一遍。");
}


function track(type, payload) {
  if (!state.trail) return;
  if (type === "island") {
    if (!state.trail.branches.has(payload.index)) state.trail.branches.set(payload.index, { ...payload, people: new Map() });
    return;
  }
  const index = state.result.clusters.indexOf(payload.cluster);
  track("island", { index, name: payload.cluster.name, summary: payload.cluster.summary, color: safeColor(payload.color) });
  const branch = state.trail.branches.get(index);
  const key = payload.person.name || payload.person.quote?.evidenceId;
  const old = branch.people.get(key) || {};
  branch.people.set(key, { ...old, name: payload.person.name, headline: payload.person.headline || "相关内容作者", avatar: payload.person.avatar, opened: old.opened || false });
}

function ensureTrailStyles() {
  if (document.querySelector("#trail-styles")) return;
  const style = document.createElement("style");
  style.id = "trail-styles";
  style.textContent = ".trail-dialog{max-width:940px;background:linear-gradient(160deg,#fffdf7,#edf4e9)}.trail-note{color:#637466}.trail-tree{padding:18px 0;overflow-x:auto}.trail-trunk{position:relative;margin:0 auto 68px;width:min(280px,88%);padding:18px 22px;border-radius:30px;background:#234434;color:#fff;text-align:center;box-shadow:0 12px 25px #23443433}.trail-trunk small{display:block;opacity:.7;margin-bottom:5px}.trail-trunk strong{font-size:15px;line-height:1.45}.trail-trunk:after{content:'';position:absolute;left:50%;top:100%;width:7px;height:68px;background:#6b8b65;border-radius:8px}.trail-branches{display:flex;justify-content:center;align-items:stretch;gap:18px;min-width:max-content;padding:0 12px}.trail-branch{position:relative;width:210px;padding:17px;border:1px solid #d6e4d3;border-top:5px solid var(--trail-color);border-radius:17px;background:#fffefb;box-shadow:0 9px 20px #1d3e2911}.trail-branch:before{content:'';position:absolute;left:50%;bottom:100%;width:4px;height:40px;background:var(--trail-color);border-radius:4px}.trail-branch:after{content:'';position:absolute;left:50%;bottom:calc(100% + 37px);width:calc(50% + 9px);height:4px;background:var(--trail-color);transform:translateX(-50%);border-radius:4px}.trail-branch>small{color:#78917b;font-size:11px;letter-spacing:.08em}.trail-branch h3{margin:6px 0;font-size:18px}.trail-branch p{margin:0 0 12px;color:#6b7b6e;font-size:12px;line-height:1.5}.trail-leaf{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px;border-radius:12px;background:#f0f7ee}.trail-leaf .avatar{width:31px;height:31px;min-width:31px;font-size:13px}.trail-leaf span{min-width:0;flex:1}.trail-leaf strong,.trail-leaf small{display:block}.trail-leaf strong{font-size:13px}.trail-leaf small{font-size:11px;color:#6a7a6c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.trail-leaf em{font-style:normal;font-size:10px;color:#4e7655;white-space:nowrap}.trail-next{margin-top:14px}@media(max-width:640px){.trail-trunk{margin-bottom:48px}.trail-trunk:after{height:48px}.trail-branches{justify-content:flex-start}.trail-branch{width:190px}.trail-branch:after{display:none}}";
  document.head.append(style);
}

function showTrail(continueExplore) {
  ensureTrailStyles();
  const branches = [...(state.trail?.branches?.values() || [])];
  if (!branches.length) return continueExplore();
  const dialog = document.createElement("dialog");
  dialog.className = "person-dialog";
  dialog.innerHTML = '<div class="dialog-body trail-dialog"><button class="dialog-close" type="button">×</button><p class="eyebrow">知路 · 探索回顾</p><h2>你的探索航线</h2><p class="trail-note">1 个问题 · ' + branches.length + ' 座观点岛 · ' + branches.reduce((total, branch) => total + branch.people.size, 0) + ' 位知友</p><div class="trail-tree"><div class="trail-trunk"><small>本次问题</small><strong>' + escapeHtml(state.trail.question) + '</strong></div><div class="trail-branches">' + branches.map((branch) => '<section class="trail-branch" style="--trail-color:' + escapeHtml(branch.color) + '"><small>已点击观点岛</small><h3>' + escapeHtml(branch.name) + '</h3><p>' + escapeHtml(branch.summary) + '</p><div>' + [...branch.people.values()].map((person) => '<article class="trail-leaf">' + avatarMarkup(person) + '<span><strong>' + escapeHtml(person.name) + '</strong><small>' + escapeHtml(person.headline) + '</small></span><em>' + (person.opened ? "已查看主页" : "已查看人物") + '</em></article>').join("") + '</div></section>').join("") + '</div></div><button class="outline-button primary trail-next" type="button">换一个问题继续探索</button></div>';
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".trail-next").addEventListener("click", () => { dialog.close(); continueExplore(); });
  dialog.showModal();
}
function finishRestart() {
  if (elements.dialog.open) elements.dialog.close();
  elements.results.hidden = true; elements.progress.hidden = true; elements.hero.hidden = false; elements.restart.hidden = true;
  state.result = null; state.trail = null; window.scrollTo({ top: 0, behavior: "smooth" }); elements.input.focus();
}

let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function restart() { showTrail(finishRestart); }

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestion(elements.input.value.trim());
});

elements.input.addEventListener("input", updateCharCount);
document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.input.value = button.dataset.question;
    updateCharCount();
    elements.input.focus();
  });
});

elements.restart.addEventListener("click", restart);
elements.bottomRestart.addEventListener("click", restart);
elements.closeDialog.addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

updateCharCount();
checkHealth();
