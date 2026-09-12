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
  const closing = document.querySelector(".closing-section") || elements.results;
  if (closing && !closing.querySelector(".trail-trigger")) { const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button trail-trigger"; button.textContent = "结束本次探索 · 生成航线"; button.addEventListener("click", () => showTrail(() => {})); closing.insertBefore(button, closing.querySelector("#bottomRestart")); }
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
  style.textContent = ".person-dialog:has(.trail-dialog){width:min(1060px,calc(100vw - 28px));max-width:none;background:#f5efe1;border:1px solid #b6955c;border-radius:22px;box-shadow:0 28px 80px #1d2d214d}.trail-dialog{position:relative;max-width:none;min-height:620px;padding:42px 42px 26px;background:radial-gradient(ellipse at 50% 70%,#dfe7db77 0 19%,transparent 50%),repeating-radial-gradient(ellipse at 50% 76%,transparent 0 17px,#b6925230 18px 19px,transparent 20px 33px),#f7f1e4;color:#26372c;overflow:hidden}.trail-dialog:before{content:'';position:absolute;inset:12px;border:1px solid #b692525c;pointer-events:none}.trail-dialog .eyebrow{margin:0;text-align:center;color:#6a7867;font-size:11px;letter-spacing:.18em}.trail-dialog h2{margin:9px 0 5px;text-align:center;font-family:Georgia,serif;font-size:38px;color:#263a2d}.trail-note{margin:0 auto 16px;text-align:center;color:#677363;font-size:14px}.trail-dialog .dialog-close{z-index:2;color:#435545;background:transparent}.trail-tree{position:relative;min-height:410px;padding:0 18px;overflow-x:auto}.trail-tree:before{content:'✦  探 索 航 线';position:absolute;top:4px;right:28px;color:#b69252;font-size:10px;letter-spacing:.24em}.trail-trunk{position:absolute;left:50%;bottom:0;transform:translateX(-50%);z-index:2;width:min(360px,72vw);padding:15px 24px;border:1px solid #b69252;border-radius:14px;background:#334b3a;color:#fffaf0;text-align:center;box-shadow:0 5px 0 #b69252}.trail-trunk:before{content:'⛵';position:absolute;left:50%;bottom:100%;transform:translate(-50%,8px);font-size:27px}.trail-trunk:after{content:'';position:absolute;left:50%;bottom:100%;height:112px;border-left:3px dashed #687c63}.trail-trunk small{display:block;color:#ead9b5;font-size:11px;margin-bottom:4px}.trail-trunk strong{font-family:Georgia,serif;font-size:19px}.trail-branches{position:absolute;inset:40px 0 104px;display:flex;align-items:flex-end;justify-content:center;gap:24px;min-width:740px}.trail-branch{position:relative;z-index:2;width:235px;padding:18px 16px 14px;border:1px solid #b6925294;border-radius:48% 52% 44% 54% / 30% 32% 55% 50%;background:radial-gradient(circle at 50% 32%,#91a08b,#5d705b 62%,#445843);box-shadow:inset 0 0 0 5px #e8e0ce55,0 14px 24px #334b3a2b;color:#fffaf0}.trail-branch:nth-child(2){transform:translateY(-65px)}.trail-branch:before{content:'';position:absolute;left:50%;top:100%;height:94px;border-left:3px dashed #687c63}.trail-branch:nth-child(2):before{height:160px}.trail-branch:after{content:'';position:absolute;left:50%;top:calc(100% + 91px);width:calc(50% + 23px);height:3px;background:#687c63;transform:translateX(-50%);border-radius:3px}.trail-branch:nth-child(2):after{top:calc(100% + 157px)}.trail-branch>small{display:block;color:#ead9b5;text-align:center;font-size:10px;letter-spacing:.12em}.trail-branch h3{margin:6px 0 4px;text-align:center;font-family:Georgia,serif;font-size:20px}.trail-branch p{margin:0 0 12px;text-align:center;color:#edf0e7;font-size:12px;line-height:1.45}.trail-leaf{display:flex;align-items:center;gap:7px;margin-top:7px;padding:6px 8px;border:1px solid #e7dcc166;border-radius:20px;background:#faf7ed;color:#334536;box-shadow:0 4px 12px #1f342426}.trail-leaf .avatar{width:29px;height:29px;min-width:29px;background:#7b8b71;font-size:12px}.trail-leaf span{min-width:0;flex:1}.trail-leaf strong,.trail-leaf small{display:block}.trail-leaf strong{font-size:12px}.trail-leaf small{color:#687466;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.trail-leaf em{font-style:normal;color:#6a7a60;font-size:9px;white-space:nowrap}.trail-next{display:block;margin:14px 0 0 auto;border-color:#687c63;background:#425b45}@media(max-width:720px){.trail-dialog{padding:34px 20px 20px}.trail-dialog h2{font-size:30px}.trail-tree{min-height:435px;padding:0}.trail-branches{justify-content:flex-start}.trail-next{width:100%}.trail-tree:before{display:none}}";
  document.head.append(style);
}

function ensureVoyageStyles() {
  if (document.querySelector("#trail-voyage-styles")) return;
  const style = document.createElement("style");
  style.id = "trail-voyage-styles";
  style.textContent = ".trail-route-water{position:absolute;inset:0;z-index:1;pointer-events:none}.trail-route-water:before{content:'';position:absolute;left:50%;bottom:78px;width:3px;height:122px;border-left:2px dashed #b69252;transform:translateX(-50%)}.trail-route-water:after{content:'';position:absolute;left:17%;right:17%;bottom:197px;border-top:2px dashed #b69252;opacity:.75}.trail-boat{position:absolute;z-index:5;left:50%;bottom:70px;font-size:30px;filter:drop-shadow(0 4px 3px #263a2d55);animation:trail-sail 6.2s cubic-bezier(.4,.05,.3,1) both}.trail-boat:after{content:'航向已探索的岛屿';position:absolute;top:32px;left:50%;transform:translateX(-50%);width:130px;color:#8a6b35;font-size:10px;text-align:center;letter-spacing:.08em}.trail-stop{position:absolute;z-index:4;width:10px;height:10px;border:3px solid #f7f1e4;border-radius:50%;background:#b69252;box-shadow:0 0 0 2px #667a62}.trail-stop:nth-child(2){left:27%;bottom:196px}.trail-stop:nth-child(3){left:50%;bottom:265px}.trail-stop:nth-child(4){right:27%;bottom:196px}.trail-actions{position:relative;z-index:6;margin-top:8px;padding:15px 18px;border:1px solid #b6925273;border-radius:14px;background:#fffaf0c9}.trail-actions-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.trail-actions h3{margin:0;color:#304838;font-family:Georgia,serif;font-size:18px}.trail-actions-top small{color:#8a6b35;font-size:11px}.trail-action-list{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px;padding:0;list-style:none}.trail-action-list li{padding:6px 9px;border-radius:20px;background:#e7eee3;color:#415844;font-size:12px}.trail-action-list li strong{color:#294333}.trail-action-buttons{display:flex;justify-content:flex-end;gap:10px}.trail-keep{border:1px solid #687c63;background:#fffaf0;color:#3d5541}@keyframes trail-sail{0%{left:50%;bottom:70px;transform:translate(-50%,0) rotate(0deg);opacity:0}8%{opacity:1}28%{left:50%;bottom:184px;transform:translate(-50%,0) rotate(-8deg)}52%{left:27%;bottom:205px;transform:translate(-50%,0) rotate(-13deg)}76%{left:50%;bottom:274px;transform:translate(-50%,0) rotate(8deg)}100%{left:73%;bottom:205px;transform:translate(-50%,0) rotate(12deg)}}@media(max-width:720px){.trail-actions-top,.trail-action-buttons{display:block}.trail-action-buttons button{width:100%;margin-top:8px}.trail-route-water:after{left:8%;right:8%}.trail-stop:nth-child(2){left:18%}.trail-stop:nth-child(4){right:18%}.trail-boat{animation:trail-sail-mobile 5.2s ease both}@keyframes trail-sail-mobile{0%{left:50%;bottom:70px;opacity:0}10%{opacity:1}45%{left:25%;bottom:205px}100%{left:50%;bottom:274px}}}";
  document.head.append(style);
}

function showTrail(continueExplore) {
  ensureTrailStyles();
  ensureVoyageStyles();
  const branches = [...(state.trail?.branches?.values() || [])];
  if (!branches.length) return continueExplore();
  const peopleSeen = branches.reduce((total, branch) => total + branch.people.size, 0);
  const profilesOpened = branches.reduce((total, branch) => total + [...branch.people.values()].filter((person) => person.opened).length, 0);
  const dialog = document.createElement("dialog");
  dialog.className = "person-dialog";
  dialog.innerHTML = '<div class="dialog-body trail-dialog"><button class="dialog-close" type="button">×</button><p class="eyebrow">知路 · 探索回顾</p><h2>你的探索航线</h2><p class="trail-note">1 个问题 · ' + branches.length + ' 座观点岛 · ' + peopleSeen + ' 位知友</p><div class="trail-tree"><div class="trail-route-water" aria-hidden="true"><span class="trail-boat">⛵</span>' + branches.slice(0, 3).map(() => '<span class="trail-stop"></span>').join("") + '</div><div class="trail-trunk"><small>本次问题</small><strong>' + escapeHtml(state.trail.question) + '</strong></div><div class="trail-branches">' + branches.map((branch) => '<section class="trail-branch" style="--trail-color:' + escapeHtml(branch.color) + '"><small>已点击观点岛</small><h3>' + escapeHtml(branch.name) + '</h3><p>' + escapeHtml(branch.summary) + '</p><div>' + [...branch.people.values()].map((person) => '<article class="trail-leaf">' + avatarMarkup(person) + '<span><strong>' + escapeHtml(person.name) + '</strong><small>' + escapeHtml(person.headline) + '</small></span><em>' + (person.opened ? "已查看主页" : "已查看人物") + '</em></article>').join("") + '</div></section>').join("") + '</div></div><section class="trail-actions"><div class="trail-actions-top"><h3>本次探索收获</h3><small>把下一步留给你决定</small></div><ul class="trail-action-list"><li>看过 <strong>' + branches.length + '</strong> 座观点岛</li><li>认识 <strong>' + peopleSeen + '</strong> 位相关作者</li><li>打开 <strong>' + profilesOpened + '</strong> 个原文主页</li><li>下一步：选择一位作者，带着共同问题继续了解</li></ul><div class="trail-action-buttons"><button class="outline-button trail-keep" type="button">继续探索此问题</button><button class="outline-button primary trail-next" type="button">换一个问题</button></div></section></div>';
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".trail-keep").addEventListener("click", () => dialog.close());
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
