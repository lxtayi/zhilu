(() => {
const DEG = Math.PI / 180;

const LANDMASSES = [
  [[72,-168],[68,-135],[58,-121],[50,-92],[52,-66],[34,-76],[17,-88],[18,-109],[33,-124],[54,-148]],
  [[13,-81],[5,-75],[-7,-78],[-20,-69],[-39,-63],[-54,-70],[-35,-52],[-11,-48],[3,-55]],
  [[70,-12],[72,34],[65,74],[68,122],[55,154],[37,141],[21,112],[9,80],[24,55],[18,34],[37,22],[45,-8]],
  [[36,-17],[36,18],[24,40],[3,43],[-20,34],[-36,19],[-31,1],[-7,-16],[14,-17]],
  [[-12,112],[-18,146],[-38,153],[-44,132],[-30,114]],
  [[82,-52],[72,-24],[61,-42],[64,-62]]
];

function spherePoint(latitude, longitude, yaw, pitch) {
  const lat = latitude * DEG;
  const lon = longitude * DEG + yaw;
  const cosLat = Math.cos(lat);
  const x = cosLat * Math.sin(lon);
  const y = -Math.sin(lat);
  const z = cosLat * Math.cos(lon);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return { x, y: y * cosPitch - z * sinPitch, z: y * sinPitch + z * cosPitch };
}

function strokeVisible(context, points, project) {
  let drawing = false;
  context.beginPath();
  points.forEach(([latitude, longitude]) => {
    const point = project(latitude, longitude);
    if (point.z <= 0) {
      drawing = false;
      return;
    }
    if (drawing) context.lineTo(point.x, point.y);
    else context.moveTo(point.x, point.y);
    drawing = true;
  });
  context.stroke();
}

function createQuestionGlobe({ canvas, stage, motionSurface }) {
  if (!canvas || !stage || !motionSurface) return () => {};
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const questions = [...stage.querySelectorAll(".floating-question")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = { width: 0, height: 0, radius: 0, x: 0, y: 0, targetX: 0, targetY: 0, frame: 0 };

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(1, bounds.width);
    state.height = Math.max(1, bounds.height);
    state.radius = Math.min(state.width, state.height) * .49;
    canvas.width = Math.round(state.width * ratio);
    canvas.height = Math.round(state.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function project(latitude, longitude, yaw, pitch) {
    const point = spherePoint(latitude, longitude, yaw, pitch);
    return {
      x: state.width / 2 + point.x * state.radius,
      y: state.height / 2 + point.y * state.radius,
      z: point.z
    };
  }

  function drawGrid(yaw, pitch) {
    context.save();
    context.strokeStyle = "rgba(236,229,195,.18)";
    context.lineWidth = 1;
    for (let latitude = -45; latitude <= 45; latitude += 45) {
      const points = [];
      for (let longitude = -180; longitude <= 180; longitude += 4) points.push([latitude, longitude]);
      strokeVisible(context, points, (lat, lon) => project(lat, lon, yaw, pitch));
    }
    for (let longitude = -180; longitude < 180; longitude += 45) {
      const points = [];
      for (let latitude = -90; latitude <= 90; latitude += 3) points.push([latitude, longitude]);
      strokeVisible(context, points, (lat, lon) => project(lat, lon, yaw, pitch));
    }
    context.restore();
  }

  function drawLand(yaw, pitch) {
    LANDMASSES.forEach((land, index) => {
      const points = land.map(([latitude, longitude]) => project(latitude, longitude, yaw, pitch));
      const visible = points.filter((point) => point.z > -.05);
      if (visible.length < 3) return;
      context.save();
      context.beginPath();
      visible.forEach((point, pointIndex) => {
        if (pointIndex) context.lineTo(point.x, point.y);
        else context.moveTo(point.x, point.y);
      });
      context.closePath();
      const gradient = context.createLinearGradient(0, 0, state.width, state.height);
      gradient.addColorStop(0, index % 2 ? "rgba(189,184,143,.88)" : "rgba(205,198,157,.9)");
      gradient.addColorStop(1, "rgba(118,132,92,.92)");
      context.fillStyle = gradient;
      context.strokeStyle = "rgba(237,229,191,.34)";
      context.lineWidth = 1.1;
      context.lineJoin = "round";
      context.shadowColor = "rgba(23,34,25,.25)";
      context.shadowBlur = 8;
      context.fill();
      context.shadowBlur = 0;
      context.stroke();
      context.restore();
    });
  }

  function drawMarkers(yaw, pitch) {
    const markers = [[39,116],[31,121],[22,114],[35,-74],[51,-.1],[-34,151],[1,104],[-23,-46]];
    markers.forEach(([latitude, longitude], index) => {
      const point = project(latitude, longitude, yaw, pitch);
      if (point.z <= .05) return;
      const alpha = .28 + point.z * .58;
      context.beginPath();
      context.arc(point.x, point.y, index % 3 === 0 ? 3.2 : 2.2, 0, Math.PI * 2);
      context.fillStyle = `rgba(215,174,92,${alpha})`;
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, 7, 0, Math.PI * 2);
      context.strokeStyle = `rgba(224,194,126,${alpha * .45})`;
      context.stroke();
    });
  }

  function draw(now) {
    state.x += (state.targetX - state.x) * .055;
    state.y += (state.targetY - state.y) * .055;
    if (document.hidden || motionSurface.hidden) {
      state.frame = requestAnimationFrame(draw);
      return;
    }
    const yaw = -.4 + (reducedMotion.matches ? 0 : now * .000035) + state.x * .72;
    const pitch = -.1 + state.y * .32;
    context.clearRect(0, 0, state.width, state.height);
    const centerX = state.width / 2;
    const centerY = state.height / 2;

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, state.radius, 0, Math.PI * 2);
    context.clip();
    const ocean = context.createRadialGradient(
      centerX - state.radius * .32 - state.x * 12,
      centerY - state.radius * .34 - state.y * 9,
      state.radius * .08,
      centerX,
      centerY,
      state.radius * 1.08
    );
    ocean.addColorStop(0, "#87927a");
    ocean.addColorStop(.46, "#566c52");
    ocean.addColorStop(.82, "#314b3a");
    ocean.addColorStop(1, "#1e3429");
    context.fillStyle = ocean;
    context.fillRect(0, 0, state.width, state.height);
    drawGrid(yaw, pitch);
    drawLand(yaw, pitch);
    drawMarkers(yaw, pitch);
    const shade = context.createLinearGradient(0, 0, state.width, 0);
    shade.addColorStop(0, "rgba(255,250,224,.12)");
    shade.addColorStop(.52, "rgba(255,255,255,0)");
    shade.addColorStop(1, "rgba(8,19,13,.34)");
    context.fillStyle = shade;
    context.fillRect(0, 0, state.width, state.height);
    context.restore();

    context.beginPath();
    context.arc(centerX, centerY, state.radius - .75, 0, Math.PI * 2);
    context.strokeStyle = "rgba(48,67,49,.9)";
    context.lineWidth = 1.5;
    context.stroke();
    state.frame = requestAnimationFrame(draw);
  }

  function move(event) {
    const bounds = motionSurface.getBoundingClientRect();
    state.targetX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    state.targetY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    questions.forEach((question, index) => {
      const depth = .2 + (index % 4) * .07;
      const direction = index % 2 === 0 ? 1 : -1;
      question.style.translate = `${(state.targetX * 7 * depth * direction).toFixed(2)}px ${(state.targetY * 5 * depth).toFixed(2)}px`;
    });
  }

  function leave() {
    state.targetX = 0;
    state.targetY = 0;
    questions.forEach((question) => { question.style.translate = "0 0"; });
  }

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  motionSurface.addEventListener("pointermove", move);
  motionSurface.addEventListener("pointerleave", leave);
  state.frame = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(state.frame);
    observer.disconnect();
    motionSurface.removeEventListener("pointermove", move);
    motionSurface.removeEventListener("pointerleave", leave);
  };
}
;


const elements = {
  form: document.querySelector("#questionForm"),
  input: document.querySelector("#questionInput"),
  charCount: document.querySelector("#charCount"),
  hero: document.querySelector("#heroSection"),
  globeStage: document.querySelector("#questionGlobeStage"),
  globeCanvas: document.querySelector("#questionGlobeCanvas"),
  viewpointGate: document.querySelector("#viewpointGate"),
  viewpointGateCards: document.querySelector("#viewpointGateCards"),
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
  viewpoint: document.querySelector("#viewpointSection"),
  viewpointCards: document.querySelector("#viewpointCards"),
  viewpointMapButton: document.querySelector("#viewpointMapButton"),
  mapSection: document.querySelector(".map-section"),
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

// Keep journal integration independent of the evolving voyage implementation.
// Delegate at call-time so the final voyage-aware person wrapper is always used.
window.openPerson = (...args) => openPerson(...args);
const finishRestartWithoutJournal = finishRestart;
finishRestart = function () {
  window.resetJournal?.();
  return finishRestartWithoutJournal();
};

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
    const response = await staticApi("/api/health");
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
  window.resetJournal?.();
  const submitButton = elements.form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  elements.hero.hidden = true;
  elements.results.hidden = true;
  elements.progress.hidden = true;
  elements.restart.hidden = true;
  state.selectedViewpointIndex = -1;
  showViewpointGate();

  const request = staticApi("/api/explore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "探索失败，请稍后重试。");
    return payload;
  });

  try {
    const payload = await request;
    renderViewpointGate(payload.viewpoints || [], payload.clusters || []);
    const selectedIndex = await new Promise((resolve) => { state.viewpointSelection = resolve; });
    state.selectedViewpointIndex = selectedIndex;
    state.viewpointSelection = null;
    elements.viewpointGate.hidden = true;
    document.body.classList.remove("viewpoint-mode");
    elements.progress.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    startProgress();
    await delay(700);

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
    elements.mapSection.hidden = false;
    await enterIsland(Math.min(selectedIndex, Math.max(0, payload.clusters.length - 1)));
    elements.mapSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    stopProgress();
    elements.progress.hidden = true;
    elements.viewpointGate.hidden = true;
    document.body.classList.remove("viewpoint-mode");
    elements.hero.hidden = false;
    showToast(error.message || "探索失败，请稍后重试。");
  } finally {
    state.viewpointSelection = null;
    submitButton.disabled = false;
  }
}

function showViewpointGate() {
  elements.viewpointGateCards.innerHTML = '<div class="viewpoint-cloud-loading">正在从知乎讨论中寻找不同的声音……</div>';
  document.body.classList.add("viewpoint-mode");
  elements.viewpointGate.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// One synthesized navigation question per island, not an attributed user quotation.
function islandCoreQuestion(cluster) {
  const explicit = cluster.coreQuestion || cluster.question;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const key = `${cluster.id || ""} ${cluster.name || ""}`;
  if (/opportunity|机会|远望/.test(key)) return "这个选择能带来什么新机会，值得我尝试吗？";
  if (/capability|能力|底牌/.test(key)) return "我具备哪些能力，还需要补齐什么条件？";
  if (/risk|风险|校准/.test(key)) return "我可能付出哪些代价，有什么风险被忽略了？";
  if (/path|行动|启程/.test(key)) return "怎样先做一次小尝试，验证这条路是否适合我？";
  return `关于${cluster.name || "这个方向"}，我应该如何判断与选择？`;
}

function renderViewpointGate(viewpoints, clusters) {
  const host = elements.viewpointGateCards;
  host.dataset.islandCount = String(clusters.length);
  host.style.setProperty("--question-rows", String(Math.max(1, Math.ceil(clusters.length / 2))));
  host.innerHTML = clusters.length ? `
    <div class="viewpoint-center-island" aria-hidden="true"><img src="./assets/hand-island-1.png" alt=""></div>
    ${clusters.map((cluster, index) => `
      <button class="viewpoint-quote-card island-question-card" type="button"
        data-viewpoint-index="${index}" style="--viewpoint-color:${safeColor(cluster.color)};--question-row:${Math.floor(index / 2) + 1};--question-column:${index % 2 ? 3 : 1}">
        <span class="viewpoint-quote-copy">
          <small class="island-question-heading"><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(cluster.name || "观点岛")}</span><em>岛屿核心问题</em></small>
          <strong>${escapeHtml(islandCoreQuestion(cluster))}</strong>
          <span class="island-question-summary">${escapeHtml(cluster.summary || "从这个角度，寻找与你有关的经历和观点。")}</span>
          <span class="island-question-enter">探索这座岛 <span aria-hidden="true">→</span></span>
        </span>
      </button>`).join("")}
  ` : '<div class="viewpoint-cloud-empty">暂无可探索的岛屿，请重新输入问题。</div>';
  const title = document.querySelector("#viewpointGateTitle");
  if (title) title.textContent = clusters.length ? `${clusters.length} 座岛，${clusters.length} 个值得思考的问题` : "暂未找到观点岛";
  host.querySelectorAll("[data-viewpoint-index]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.viewpointSelection) state.viewpointSelection(Number(button.dataset.viewpointIndex));
    });
  });
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
  window.renderJournal?.(result);
  elements.resultQuestion.textContent = result.question;
  if (elements.coreTension) elements.coreTension.textContent = result.analysis?.coreTension || "正在比较不同的思考路径";
  if (elements.queryPills) elements.queryPills.innerHTML = (result.analysis?.searchQueries || [])
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
  elements.viewpoint.hidden = true;
  const closing = document.querySelector(".closing-section") || elements.results;
  if (closing && !closing.querySelector(".trail-trigger")) { const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button trail-trigger"; button.textContent = "结束探索，查看链路树"; button.addEventListener("click", () => showTrail(() => {})); closing.insertBefore(button, closing.querySelector("#bottomRestart")); }
}

function renderViewpointChoices() {
  const clusters = state.result?.clusters || [];
  elements.viewpointCards.innerHTML = clusters.map((cluster, index) => `
    <button class="viewpoint-card" type="button" data-viewpoint-index="${index}" style="--viewpoint-color:${safeColor(cluster.color)}">
      <span class="viewpoint-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="viewpoint-card-copy">
        <strong>${escapeHtml(cluster.name)}</strong>
        <span>${escapeHtml(cluster.summary || "从这个角度重新看待当前问题")}</span>
        <small>${cluster.people?.length || 0} 位代表知友 · 进入这座岛</small>
      </span>
      <span class="viewpoint-arrow" aria-hidden="true">→</span>
    </button>
  `).join("");

  elements.viewpointCards.querySelectorAll("[data-viewpoint-index]").forEach((button) => {
    button.addEventListener("click", () => enterSelectedViewpoint(Number(button.dataset.viewpointIndex)));
  });
}

async function enterSelectedViewpoint(index) {
  elements.viewpoint.hidden = true;
  elements.mapSection.hidden = false;
  elements.mapSection.scrollIntoView({ behavior: "smooth", block: "start" });
  await delay(180);
  enterIsland(index);
}

const islandLayouts = {
  1: [[50, 50]],
  2: [[25, 50], [75, 50]],
  3: [[50, 22], [25, 76], [75, 76]],
  4: [[25, 22], [75, 22], [25, 78], [75, 78]],
  5: [[25, 20], [75, 20], [25, 80], [75, 80], [50, 50]]
};

// Local vector terrain: shared by each overview island and its detail scene.
const islandCoastlines = [
  "M45 111Q19 86 51 66Q47 36 85 44Q109 16 141 36Q174 16 190 43Q233 27 245 57Q284 53 277 85Q308 110 274 130Q286 163 249 166Q227 198 195 177Q159 207 137 184Q97 205 82 175Q41 181 49 147Q22 136 45 111Z",
  "M39 110Q15 69 61 62Q70 28 104 42Q125 13 157 35Q202 17 222 47Q266 33 273 75Q308 95 281 124Q296 156 256 166Q249 199 211 181Q179 207 154 179Q111 203 96 175Q58 190 49 154Q23 147 39 110Z",
  "M47 118Q21 92 48 73Q37 41 83 48Q93 19 128 40Q158 16 181 40Q215 23 235 52Q280 47 270 83Q303 110 276 138Q279 171 237 168Q219 205 184 180Q150 201 126 179Q84 196 79 169Q36 168 47 142Q27 129 47 118Z"
];

function islandTerrainMarkup(index) {
  const assetIndex = (Number(index) % 4) + 1;
  return `<img class="island-terrain hand-drawn-island" src="./assets/hand-island-${assetIndex}.png" alt="" aria-hidden="true">`;
}

function mapRoutesMarkup(positions) {
  const count = positions.length;
  const edges = count === 5 ? [[4, 0], [4, 1], [4, 2], [4, 3]]
    : count === 4 ? [[0, 1], [1, 3], [3, 2], [2, 0]]
    : count === 3 ? [[0, 1], [0, 2]] : count === 2 ? [[0, 1]] : [];
  return `<svg class="map-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">${edges.map(([from, to]) => {
    const [x1, y1] = positions[from];
    const [x2, y2] = positions[to];
    return `<path d="M${x1} ${y1} L${x2} ${y2}" />`;
  }).join("")}</svg>`;
}

function renderIslands() {
  elements.mapTitle.textContent = `${state.result.clusters.length} 座可探索的观点岛`;
  elements.islandMap.className = "island-map island-layout";
  elements.islandMap.dataset.islandCount = String(state.result.clusters.length);
  elements.islandMap.innerHTML = `${mapRoutesMarkup(islandLayouts[state.result.clusters.length])}
    <span class="map-compass" aria-hidden="true"><small>N</small>✧</span>`;
  state.result.clusters.forEach((cluster, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `island-button island-position-${index} island-variant-${index}`;
    const [x, y] = islandLayouts[state.result.clusters.length][index];
    button.style.setProperty("--island-x", `${x}%`);
    button.style.setProperty("--island-y", `${y}%`);
    button.style.setProperty("--island-color", safeColor(cluster.color));
    button.setAttribute("aria-label", `探索${cluster.name}，${cluster.people?.length || 0} 位代表知友`);
    button.innerHTML = `
      ${islandTerrainMarkup(index)}
      <span class="island-label">
        <span class="island-marker" aria-hidden="true"></span>
        <strong>${escapeHtml(cluster.name)}</strong>
      </span>
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
  elements.islandMap.className = "island-map island-scene";
  elements.islandMap.style.setProperty("--scene-color", color);
  elements.islandMap.innerHTML = `
    <div class="scene-terrain" aria-hidden="true">${islandTerrainMarkup(index)}</div>
    <button class="map-back-button" type="button" aria-label="返回群岛地图">
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
    requestAnimationFrame(() => elements.islandMap.classList.add("scene-ready"));
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
        <span class="portrait-frame">${avatarMarkup(person)}</span>
        <span class="map-person-name">
          <span class="person-card-kicker">岛上知友 · ${String(personIndex + 1).padStart(2, "0")}</span>
          <strong class="person-name">${escapeHtml(person.name)}</strong>
          <small>${escapeHtml(person.recommendationType || "值得了解")}</small>
          <span class="person-viewpoint">${escapeHtml(person.viewpoint)}</span>
        </span>
        
      </span>
      <span class="map-person-thought">
        <span class="scroll-ribbon">一纸知友名帖</span>
        <em>${escapeHtml(person.headline || "相关内容作者")}</em>
        <strong>${escapeHtml(person.viewpoint)}</strong>
        <q>${escapeHtml(person.quote?.text || "从公开内容继续了解 TA 的判断")}</q>
        <small>点击展开名帖，查看原文与破冰话术</small>
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
  const restoreScrollY = window.scrollY;
  const evidence = findEvidence(person.quote?.evidenceId || person.evidenceIds?.[0]);
  const sourceUrl = safeZhihuUrl(evidence?.url);
  const sourceLabel = evidence?.isSynthetic ? "打开知乎搜索" : "查看知乎原文";
  track("person", { person, cluster, color, evidence });
  elements.personContent.innerHTML = `
    <div class="dialog-body" style="--person-color:${color}">
      <div class="dialog-scroll-title"><span>PERSON NOTE · 知友名帖</span><i aria-hidden="true"></i></div>
      <div class="dialog-person">
        <span class="dialog-portrait">${avatarMarkup(person)}</span>
        <div><h2>${escapeHtml(person.name)}</h2><p>${escapeHtml(person.headline || "相关内容作者")}</p><span class="person-island-name">${escapeHtml(cluster.name)}</span></div>
      </div>
      <section class="dialog-section person-evidence">
        <div class="quote-box"><blockquote>“${escapeHtml(person.quote?.text || evidence?.excerpt || "暂无可引用内容")}”</blockquote>
        <cite>${escapeHtml(evidence?.title || "内容来源整理中")}${evidence?.isSynthetic ? " · 演示内容" : " · 内容节选"}</cite></div>
        <div class="dialog-actions person-primary-actions">
          <a id="openSource" class="outline-button" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${sourceLabel}</a>
          <button id="generateDrafts" class="outline-button primary" type="button">生成破冰问题</button>
          <button id="shareExperience" class="outline-button" type="button">分享我的经历</button>
        </div>
      </section>
      <section class="person-context"><span aria-hidden="true">✦</span><h3>为什么值得相遇</h3><p>${escapeHtml(person.connectionReason || "从一个共同的问题开始，交换具体的经验与想法。")}</p></section>
      <section class="person-log-preview"><h3>与本次问题有关的航海日志</h3><p>${escapeHtml(state.result.question)}</p><p class="profile-note">把你的经历留在这个问题下，也读读同路人的记录。</p><button id="personTopicJournal" class="text-button" type="button">阅读话题航迹 →</button></section>
      <section id="icebreakerArea" class="icebreaker-area" hidden></section>
    </div>`;
  elements.dialog.showModal();
  elements.dialog.addEventListener("close", () => { window.scrollTo({ top: restoreScrollY, left: 0, behavior: "instant" }); }, { once: true });
  document.querySelector("#shareExperience").onclick = () => { elements.dialog.close(); window.openJournal(person); };
  document.querySelector("#personTopicJournal").onclick = () => { elements.dialog.close(); window.openTopicJournal?.(person); };
  document.querySelector("#openSource").addEventListener("click", () => { const branch = state.trail?.branches.get(state.result.clusters.indexOf(cluster)); const item = branch?.people.get(person.name || person.quote?.evidenceId); if (item) item.opened = true; });
  document.querySelector("#generateDrafts").addEventListener("click", event => generateDrafts(event.currentTarget, person, evidence));
}

async function generateDrafts(button, person, evidence) {
  button.disabled = true;
  button.textContent = "正在准备开场白…";

  try {
    const response = await staticApi("/api/icebreakers", {
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
  dialog.innerHTML = '<div class="dialog-body trail-dialog"><button class="dialog-close" type="button">×</button><p class="eyebrow">知路 · 探索回顾</p><h2>你的探索航线</h2><p class="trail-note">1 个问题 · ' + branches.length + ' 座观点岛 · ' + peopleSeen + ' 位知友</p><div class="trail-tree"><div class="trail-route-water" aria-hidden="true"><span class="trail-boat" aria-label="航行中的船">⛵</span>' + branches.slice(0, 3).map(() => '<span class="trail-stop"></span>').join("") + '</div><div class="trail-trunk"><small>本次问题</small><strong>' + escapeHtml(state.trail.question) + '</strong></div><div class="trail-branches">' + branches.map((branch) => '<section class="trail-branch" style="--trail-color:' + escapeHtml(branch.color) + '"><small>已点击观点岛</small><h3>' + escapeHtml(branch.name) + '</h3><p>' + escapeHtml(branch.summary) + '</p><div>' + [...branch.people.values()].map((person) => '<article class="trail-leaf">' + avatarMarkup(person) + '<span><strong>' + escapeHtml(person.name) + '</strong><small>' + escapeHtml(person.headline) + '</small></span><em>' + (person.opened ? "已查看主页" : "已查看人物") + '</em></article>').join("") + '</div></section>').join("") + '</div></div><section class="trail-actions"><div class="trail-actions-top"><h3>本次探索收获</h3><small>把下一步留给你决定</small></div><ul class="trail-action-list"><li>看过 <strong>' + branches.length + '</strong> 座观点岛</li><li>认识 <strong>' + peopleSeen + '</strong> 位相关作者</li><li>打开 <strong>' + profilesOpened + '</strong> 个原文主页</li><li>下一步：选择一位作者，带着共同问题继续了解</li></ul><div class="trail-action-buttons"><button class="outline-button trail-keep" type="button">继续探索此问题</button><button class="outline-button primary trail-next" type="button">换一个问题</button></div></section></div>';
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".trail-keep").addEventListener("click", () => dialog.close());
  dialog.querySelector(".trail-next").addEventListener("click", () => { dialog.close(); continueExplore(); });
  dialog.showModal();
}
function finishRestart() {
  if (elements.dialog.open) elements.dialog.close();
  elements.results.hidden = true; elements.progress.hidden = true; elements.viewpointGate.hidden = true; document.body.classList.remove("viewpoint-mode"); elements.hero.hidden = false; elements.restart.hidden = true;
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
    elements.globeStage?.classList.add("question-selected");
    window.setTimeout(() => elements.globeStage?.classList.remove("question-selected"), 650);
  });
});

createQuestionGlobe({
  canvas: elements.globeCanvas,
  stage: elements.globeStage,
  motionSurface: elements.hero
});

elements.restart.addEventListener("click", restart);
elements.bottomRestart.addEventListener("click", restart);
elements.viewpointMapButton.addEventListener("click", () => {
  elements.viewpoint.hidden = true;
  elements.mapSection.hidden = false;
  elements.mapSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.closeDialog.addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

updateCharCount();
checkHealth();

/* Voyage map modal v2 */
(() => {
  if (window.__ZHILU_VOYAGE_MAP_V2__) return;
  window.__ZHILU_VOYAGE_MAP_V2__ = true;

  const voyageState = {
    islands: new Map(),
    order: [],
    dialog: null,
    animationFrame: 0
  };
  let bypassLegacyTrail = false;

  function layoutFor(record) {
    const count = state.result?.clusters?.length || 1;
    const [x, y] = islandLayouts[count]?.[record.index] || [50, 50];
    return { x: x * 11, y: (12 + y * .66) * 5.5 };
  }

  function resetVoyage() {
    voyageState.islands.clear();
    voyageState.order.length = 0;
  }

  function rememberIsland(index, clusterOverride) {
    const cluster = clusterOverride || state.result?.clusters?.[index];
    if (!cluster) return null;
    let record = voyageState.islands.get(index);
    if (!record) {
      record = { index, cluster, people: new Map() };
      voyageState.islands.set(index, record);
      voyageState.order.push(index);
    } else {
      record.cluster = cluster;
    }
    return record;
  }

  function rememberPerson(person, cluster) {
    const index = Math.max(0, state.result?.clusters?.indexOf(cluster) ?? 0);
    const record = rememberIsland(index, cluster);
    if (!record || !person) return;
    const key = person.id || person.url || person.name || String(record.people.size);
    record.people.set(key, person);
  }

  function returnToSearch() {
    bypassLegacyTrail = true;
    try {
      restart();
    } finally {
      setTimeout(() => { bypassLegacyTrail = false; }, 0);
    }
  }

  function ensureTrigger() {
    const host = document.querySelector(".closing-section") || elements.results;
    if (!host) return;
    host.querySelectorAll("button.trail-trigger, button.trail").forEach((legacyButton) => {
      if (!legacyButton.classList.contains("voyage-launch")) legacyButton.remove();
    });
    let button = host.querySelector("button.voyage-launch");
    if (!button) {
      button = document.createElement("button");
      const restartButton = host.querySelector("#bottomRestart");
      if (restartButton) host.insertBefore(button, restartButton);
      else host.prepend(button);
    }
    button.type = "button";
    button.className = "secondary-button voyage-launch";
    button.textContent = "结束本次探索 · 生成航线";
    button.setAttribute("aria-label", "结束本次探索并生成动态航线");
    button.onclick = (event) => {
      event.preventDefault();
      showVoyage();
    };
  }

  const baseRenderResult = renderResult;
  renderResult = function voyageRenderResult() {
    const result = baseRenderResult.apply(this, arguments);
    ensureStyles();
    ensureTrigger();
    return result;
  };

  const baseEnterIsland = enterIsland;
  enterIsland = async function voyageEnterIsland(index) {
    rememberIsland(index);
    return baseEnterIsland.apply(this, arguments);
  };

  const baseOpenPerson = openPerson;
  openPerson = function voyageOpenPerson(person, cluster) {
    rememberPerson(person, cluster);
    return baseOpenPerson.apply(this, arguments);
  };

  const baseSubmitQuestion = submitQuestion;
  submitQuestion = async function voyageSubmitQuestion() {
    resetVoyage();
    return baseSubmitQuestion.apply(this, arguments);
  };

  function branchRecords() {
    const own = voyageState.order
      .map((index) => voyageState.islands.get(index))
      .filter(Boolean);
    if (own.length) return own;

    const legacy = typeof state !== "undefined" ? state.trail?.branches : null;
    if (!legacy) return [];
    const values = legacy instanceof Map ? [...legacy.values()] : Array.isArray(legacy) ? legacy : Object.values(legacy);
    return values.map((branch, order) => ({
      index: Number.isInteger(branch.index) ? branch.index : order,
      cluster: branch.cluster || branch,
      people: branch.people instanceof Map ? branch.people : new Map(Object.entries(branch.people || {}))
    }));
  }

  function routePath(points) {
    if (points.length < 2) return "";
    let value = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const direction = index % 2 ? -1 : 1;
      const controlX = (previous.x + current.x) / 2 + direction * Math.min(84, Math.abs(current.y - previous.y) * 0.34);
      const controlY = (previous.y + current.y) / 2 + direction * Math.min(62, Math.abs(current.x - previous.x) * 0.12);
      value += ` Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${current.x} ${current.y}`;
    }
    return value;
  }

  function branchPath(start, point, index) {
    const sway = index % 2 ? 82 : -82;
    return `M ${start.x} ${start.y} Q ${((start.x + point.x) / 2 + sway).toFixed(1)} ${((start.y + point.y) / 2 - 36).toFixed(1)} ${point.x} ${point.y}`;
  }

  function initials(name) {
    const value = String(name || "知友").trim();
    return escapeHtml(value.slice(0, 1) || "知");
  }

  function avatarFor(person) {
    const raw = (typeof person?.avatar === "string" ? person.avatar : person?.avatar?.url) || person?.avatarUrl || person?.avatar_url || "";
    const url = raw && typeof safeAvatarUrl === "function" ? safeAvatarUrl(raw) : "";
    if (url) return `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
    return `<span aria-hidden="true">${initials(person?.name)}</span>`;
  }

  function personCards(records) {
    const cards = [];
    records.forEach((record) => {
      const people = record.people instanceof Map ? [...record.people.values()] : Object.values(record.people || {});
      people.forEach((person) => {
        const status = "已查看人物与内容节选";
        cards.push(`
          <article class="voyage-person-card" style="--person-color:${safeColor(record.cluster?.color)}">
            <span class="voyage-person-avatar">${avatarFor(person)}</span>
            <span class="voyage-person-copy">
              <strong>${escapeHtml(person.name || "知乎知友")}</strong>
              <small>${escapeHtml(person.headline || person.recommendationType || "相关内容创作者")}</small>
              <em><i aria-hidden="true">●</i>${status}</em>
            </span>
          </article>
        `);
      });
    });
    return cards.join("");
  }

  function islandCards(records) {
    return records.map((record, order) => {
      const cluster = record.cluster || {};
      const layout = layoutFor(record);
      return `
        <article class="voyage-island-label" style="--island-x:${(layout.x / 11).toFixed(2)}%;--island-y:${(layout.y / 5.5).toFixed(2)}%;--island-delay:${order * 90}ms;--island-color:${safeColor(cluster.color)}">
          ${islandTerrainMarkup(record.index)}
          <strong>${escapeHtml(cluster.name || `观点岛 ${order + 1}`)}</strong>
          <small>${escapeHtml(cluster.summary || "从不同的视角看见更多可能")}</small>
          <span>${order + 1}</span>
        </article>
      `;
    }).join("");
  }

  // Draw a self-contained PNG. No third-party image is loaded, so export never
  // depends on cross-origin avatar permissions or a screenshot service.
  async function saveVoyageImage(button, records, question, mainPath) {
    button.disabled = true; button.textContent = "正在绘制图片…";
    try {
      await document.fonts?.ready;
      const canvas = document.createElement("canvas");
      const c = canvas.getContext("2d");
      if (!c) throw new Error("浏览器不支持图片导出");
      const width = 1200, pad = 72, textWidth = width - pad * 2;
      const font = '"Microsoft YaHei", "PingFang SC", sans-serif';
      function wrap(text, maxWidth, size) {
        c.font = size + "px " + font;
        const lines = [];
        String(text || "").split("\n").forEach(paragraph => {
          let line = "";
          for (const char of paragraph) {
            if (line && c.measureText(line + char).width > maxWidth) { lines.push(line); line = char; }
            else line += char;
          }
          lines.push(line);
        });
        return lines;
      }
      const sections = [];
      const add = (text, size=22, color="#344f40", gap=18) => sections.push({lines:wrap(text,textWidth,size),size,color,gap});
      add("本次探索的问题",18,"#998051",10); add(question,32,"#263f31",28);
      add("我探索了  " + records.map(r=>r.cluster?.name || "观点岛").join(" · "),22,"#455a44",20);
      const people = records.flatMap(r=>[...r.people.values()]);
      add("遇到了谁  " + (people.map(p=>p.name).join("、") || "尚未打开人物卡片"),22,"#455a44",26);
      add("我收获了",25,"#263f31",18);
      if (!people.length) add("还没有阅读人物内容。下一程，从一张人物卡片开始。",21,"#657157");
      people.forEach(p=>{
        const evidence=findEvidence(p.quote?.evidenceId || p.evidenceIds?.[0]);
        add(p.name + " · " + (evidence?.title || "人物观点"),23,"#263f31",10);
        add(p.quote?.text || evidence?.excerpt || p.viewpoint || "暂无内容节选",21,"#657157",24);
      });
      add("下一步  把看见变成行动：记录你的经历，或带着一个具体问题开始交流。",22,"#455a44",22);
      const bodyHeight=sections.reduce((h,s)=>h+s.lines.length*s.size*1.65+s.gap,0);
      canvas.width=width; canvas.height=Math.ceil(870+bodyHeight+90);
      c.fillStyle="#f5efdf"; c.fillRect(0,0,width,canvas.height);
      c.strokeStyle="#b49b62"; c.lineWidth=2; c.strokeRect(24,24,width-48,canvas.height-48);
      c.strokeStyle="#d2c39c"; c.strokeRect(34,34,width-68,canvas.height-68);
      c.fillStyle="#8c794e"; c.font="18px "+font; c.fillText("ZHILU  /  VOYAGE JOURNAL",pad,90);
      c.fillStyle="#263f31"; c.font="46px "+font; c.fillText("你的探索航线",pad,159);
      c.font="20px "+font; c.fillStyle="#758065";
      c.fillText(records.length+" 座观点岛 · "+people.length+" 位相遇的人 · 一次具体的出发",pad,204);
      c.save(); c.translate(50,250); c.beginPath(); c.rect(0,0,1100,550); c.clip();
      c.fillStyle="#e9e8d5"; c.fillRect(0,0,1100,550);
      c.strokeStyle="#d2d3b6"; c.lineWidth=1;
      for(let r=70;r<1100;r+=65){c.beginPath();c.ellipse(550,180,r,r*.64,0,0,Math.PI*2);c.stroke()}
      c.setLineDash([10,9]); c.lineWidth=4; c.strokeStyle="#8b9978"; c.stroke(new Path2D(mainPath));c.setLineDash([]);
      records.forEach((r,i)=>{
        const pos=layoutFor(r); c.save();c.translate(pos.x,pos.y);
        c.fillStyle="#b7c0a0";c.strokeStyle="#909d78";c.lineWidth=3;
        c.beginPath();c.ellipse(0,-15,72,40,-.1,0,Math.PI*2);c.fill();c.stroke();
        c.fillStyle="#e6e5cf";c.beginPath();c.moveTo(-32,0);c.lineTo(-7,-51);c.lineTo(25,0);c.closePath();c.fill();
        c.fillStyle="#263f31";c.font="bold 21px "+font;c.textAlign="center";
        wrap(r.cluster?.name||"观点岛",230,21).forEach((line,n)=>c.fillText(line,0,48+n*26));
        c.fillStyle="#fbf7eb";c.beginPath();c.arc(68,-49,15,0,Math.PI*2);c.fill();
        c.fillStyle="#4d654d";c.font="16px "+font;c.fillText(String(i+1),68,-43);c.restore();
      });
      c.fillStyle="#354f40";c.beginPath();c.moveTo(538,506);c.lineTo(562,506);c.lineTo(557,517);c.lineTo(543,517);c.closePath();c.fill();
      c.strokeStyle="#a18b52";c.beginPath();c.moveTo(550,506);c.lineTo(550,478);c.stroke();c.fillStyle="#fff8e5";c.beginPath();c.moveTo(548,480);c.lineTo(531,503);c.lineTo(548,503);c.closePath();c.fill();c.restore();
      let y=865;
      sections.forEach(s=>{c.font=s.size+"px "+font;c.fillStyle=s.color;s.lines.forEach(line=>{c.fillText(line,pad,y);y+=s.size*1.65});y+=s.gap});
      c.fillStyle="#9a8860";c.font="16px "+font;c.fillText("知路 · 本次点击记录 / "+new Date().toLocaleDateString('zh-CN'),pad,canvas.height-60);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!blob)throw new Error("图片生成失败，请重试");
      const url=URL.createObjectURL(blob), link=document.createElement("a");
      link.href=url;link.download="知路-探索航线-"+new Date().toISOString().slice(0,10)+".png";
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      showToast("航线图片已生成，请在浏览器下载中查看。");
    } catch(error) { showToast(error.message || "图片保存失败，请重试"); }
    finally {button.disabled=false;button.textContent="保存图片";}
  }

  function showVoyage(nextAction) {
    if (bypassLegacyTrail) {
      if (typeof nextAction === "function") nextAction();
      return;
    }
    const records = branchRecords();
    if (!records.length) {
      if (typeof nextAction === "function") return nextAction();
      showToast("先点击一座岛屿，再生成你的探索航线。");
      return;
    }

    if (voyageState.dialog?.open) voyageState.dialog.close();
    ensureStyles();

    const visited = records.slice(0, 5);
    const people = visited.flatMap((record) => record.people instanceof Map ? [...record.people.values()] : Object.values(record.people || {}));
    const start = { x: 550, y: 510 };
    const routePoints = [start, ...visited.map((record, order) => {
      const layout = layoutFor(record);
      return { x: layout.x, y: layout.y };
    })];
    const mainPath = routePath(routePoints);
    const routeId = `voyage-route-${Date.now()}`;
    const branchLines = routePoints.slice(1).map((point, index) => `<path class="voyage-branch-route" d="${branchPath(start, point, index)}"></path>`).join("");
    const stopMarkers = routePoints.slice(1).map((point, index) => `<g class="voyage-stop" transform="translate(${point.x} ${point.y})"><circle r="12"></circle><circle r="4"></circle><text y="-17">${index + 1}</text></g>`).join("");
    const names = visited.map((record) => record.cluster?.name || "观点岛");
    const personNames = people.map((person) => person?.name).filter(Boolean);
    const question = state.result?.question || state.trail?.question || "本次探索的问题";

    const dialog = document.createElement("dialog");
    dialog.className = "voyage-map-dialog";
    dialog.setAttribute("aria-labelledby", "voyageMapTitle");
    dialog.innerHTML = `
      <div class="voyage-map-shell">
        <button class="voyage-map-close" type="button" aria-label="关闭航线回顾">×</button>
        <header class="voyage-map-header">
          <p><span></span>知路 · 探索回顾<span></span></p>
          <h2 id="voyageMapTitle">你的探索航线<i aria-hidden="true"></i></h2>
          <strong>1 个问题 · ${visited.length} 座观点岛 · ${people.length} 位知友</strong>
        </header>

        <section class="voyage-chart" aria-label="本次探索的动态航海地图">
          <p class="voyage-quote">“ 世界不只有一个答案<br>但总有更广阔的视角 ”</p>
          <div class="voyage-compass" aria-hidden="true"><b>N</b><i></i><span>W&nbsp;&nbsp;&nbsp;&nbsp;E</span><em>S</em></div>
          <svg class="voyage-routes" viewBox="0 0 1100 550" preserveAspectRatio="none" aria-hidden="true">
            ${branchLines}
            <path class="voyage-main-route" id="${routeId}" d="${mainPath}"></path>
            <path class="voyage-route-progress" d="${mainPath}"></path>
            ${stopMarkers}
            <g class="voyage-ship" transform="translate(${start.x} ${start.y})">
              <path class="ship-hull" d="M-22 8 Q0 20 24 7 L17 17 Q0 27 -20 16 Z"></path>
              <path class="ship-mast" d="M0 8 V-29"></path>
              <path class="ship-sail-a" d="M-2 -27 L-20 2 L-2 6 Z"></path>
              <path class="ship-sail-b" d="M3 -24 L19 3 L3 6 Z"></path>
              <path class="ship-flag" d="M1 -29 L13 -24 L1 -20 Z"></path>
            </g>
          </svg>
          ${islandCards(visited)}
          <div class="voyage-question-plaque">
            <small>本次问题</small>
            <strong>${escapeHtml(question)}</strong>
          </div>
          <p class="voyage-map-note">演示航线 · 仅展示本次点击记录</p>
        </section>

        <section class="voyage-people" aria-label="本次查看的人物">${personCards(visited)}</section>
        <section class="voyage-harvest">
          <div class="voyage-harvest-title"><span aria-hidden="true">✦</span><div><small>本次探索收获</small><strong>把看见，变成下一步行动</strong><img class="harvest-island" src="./assets/hand-island-1.png" alt="" aria-hidden="true"></div></div>
          <div class="voyage-harvest-copy">
            <p><b>我探险了</b>${escapeHtml(names.join("、"))}</p>
            <p><b>遇到了谁</b>${personNames.length ? escapeHtml(personNames.join("、")) : "还没有打开人物卡片"}</p>
            <div class="voyage-seen-content"><b>我收获了</b><ul>${people.length ? people.map(person => { const evidence = findEvidence(person.quote?.evidenceId || person.evidenceIds?.[0]); return `<li><strong>${escapeHtml(person.name)} · ${escapeHtml(evidence?.title || "人物卡片中的观点")}</strong><q>${escapeHtml(person.quote?.text || evidence?.excerpt || person.viewpoint || "暂无内容节选")}</q></li>`; }).join("") : "<li>尚未打开人物内容。继续探索，读一段具体经历。</li>"}</ul></div>
            <p><b>下一步</b>${people.length ? "继续认识感兴趣的人，带着一个具体问题发起交流。" : "选择一位岛上的知友，看看 TA 的公开观点。"}</p>
          </div>
          <div class="voyage-map-actions">
            <button class="outline-button voyage-continue" type="button">继续探索</button>
            <button class="outline-button voyage-save" type="button">保存图片</button>
            <button class="outline-button primary voyage-next" type="button">换一个问题</button>
          </div>
        </section>
      </div>
    `;

    const sourceMapBackground = elements.islandMap
      ? getComputedStyle(elements.islandMap).backgroundImage
      : "";
    if (sourceMapBackground && sourceMapBackground !== "none") {
      dialog.querySelector(".voyage-chart").style.backgroundImage =
        `linear-gradient(rgba(250,244,230,.07),rgba(250,244,230,.07)),${sourceMapBackground}`;
    }

    document.body.append(dialog);
    voyageState.dialog = dialog;
    let finished = false;
    const finish = (runNext) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(voyageState.animationFrame);
      if (dialog.open) dialog.close();
      dialog.remove();
      voyageState.dialog = null;
      if (runNext && typeof nextAction === "function") nextAction();
      else if (runNext) returnToSearch();
    };

    dialog.querySelector(".voyage-map-close").addEventListener("click", () => finish(false));
    dialog.querySelector(".voyage-continue").addEventListener("click", () => finish(false));
    dialog.querySelector(".voyage-save").addEventListener("click", event => saveVoyageImage(event.currentTarget, visited, question, mainPath));
    dialog.querySelector(".voyage-next").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) finish(false); });
    dialog.showModal();
    requestAnimationFrame(() => animateShip(dialog));
  }

  function animateShip(dialog) {
    const path = dialog.querySelector(".voyage-main-route");
    const progress = dialog.querySelector(".voyage-route-progress");
    const ship = dialog.querySelector(".voyage-ship");
    if (!path || !progress || !ship) return;
    const length = path.getTotalLength();
    progress.style.strokeDasharray = `${length} ${length}`;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      progress.style.strokeDashoffset = "0";
      const end = path.getPointAtLength(length);
      ship.setAttribute("transform", `translate(${end.x} ${end.y})`);
      return;
    }
    const duration = Math.max(7200, length * 10.5);
    const startedAt = performance.now();
    const frame = (now) => {
      if (!dialog.isConnected || !dialog.open) return;
      const ratio = ((now - startedAt) % duration) / duration;
      const distance = ratio * length;
      const point = path.getPointAtLength(distance);
      // Keep the vessel facing the user: the sail always points to the top of the page.
      ship.setAttribute("transform", `translate(${point.x} ${point.y})`);
      ship.style.display = "block";
      ship.style.visibility = "visible";
      ship.style.opacity = "1";
      progress.style.strokeDashoffset = String(length * (1 - ratio));
      voyageState.animationFrame = requestAnimationFrame(frame);
    };
    voyageState.animationFrame = requestAnimationFrame(frame);
  }

  function ensureStyles() {
    if (document.querySelector("#voyage-map-v2-styles")) return;
    const style = document.createElement("style");
    style.id = "voyage-map-v2-styles";
    style.textContent = `
      .voyage-launch{min-width:260px!important;background:#263f31!important;color:#fffdf5!important;border-color:#b29254!important;box-shadow:0 12px 28px rgba(35,57,45,.18)!important;font-weight:700!important;letter-spacing:.08em!important}
      .voyage-launch::before{content:"⛵";margin-right:.55em}.voyage-launch:hover{transform:translateY(-2px);box-shadow:0 16px 32px rgba(35,57,45,.25)!important}
      .voyage-map-dialog{width:min(1240px,96vw);max-width:none;max-height:96vh;margin:auto;padding:0;border:1px solid #ad8950;border-radius:24px;background:#f6edd9;color:#223b30;box-shadow:0 32px 90px rgba(16,27,22,.48);overflow:auto}
      .voyage-map-dialog::backdrop{background:rgba(25,39,32,.76);backdrop-filter:blur(5px)}
      .voyage-map-shell{position:relative;display:grid;grid-template-rows:auto minmax(390px,1fr) auto;max-height:96vh;padding:22px;background:linear-gradient(rgba(252,247,235,.92),rgba(247,238,218,.94)),radial-gradient(circle at 18% 10%,rgba(170,143,89,.18),transparent 28%);box-sizing:border-box}
      .voyage-map-shell::before{content:"";position:absolute;inset:10px;border:1px solid rgba(151,116,58,.45);border-radius:17px;pointer-events:none}
      .voyage-map-close{position:absolute;right:30px;top:22px;z-index:20;width:44px;height:44px;border:0;background:transparent;color:#233c31;font:300 40px/1 Georgia,serif;cursor:pointer;transition:.2s}.voyage-map-close:hover{transform:rotate(8deg);color:#99723a}
      .voyage-map-header{position:relative;z-index:2;text-align:center;padding:3px 60px 13px}.voyage-map-header p{display:flex;align-items:center;justify-content:center;gap:16px;margin:0 0 3px;font-family:serif;font-size:15px;font-weight:700;letter-spacing:.22em}.voyage-map-header p span{width:60px;height:1px;background:#a9874f}.voyage-map-header h2{display:inline-flex;align-items:center;margin:2px 0 0;font-family:serif;font-size:clamp(30px,4vw,52px);line-height:1.08;letter-spacing:.08em}.voyage-map-header h2 i{width:46px;height:13px;margin-left:8px;border-top:3px solid #b59a63;border-radius:50%;transform:rotate(-9deg)}.voyage-map-header>strong{display:block;margin-top:6px;color:#695c42;font-family:serif;font-size:17px;letter-spacing:.14em}
      .voyage-chart{position:relative;min-height:520px;border:1px solid rgba(151,116,58,.24);border-radius:14px;overflow:hidden;background-color:#f8f0dc;background-image:radial-gradient(ellipse at center,rgba(198,216,202,.38),transparent 68%);background-size:cover;background-position:center;box-shadow:inset 0 0 55px rgba(120,96,52,.13)}
      .voyage-chart::after{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-radial-gradient(ellipse at center,transparent 0 56px,rgba(132,111,70,.035) 58px 59px,transparent 60px 92px);mix-blend-mode:multiply}
      .voyage-quote{position:absolute;left:25px;top:19px;z-index:5;margin:0;color:#71664c;font:italic 14px/1.8 serif;letter-spacing:.08em}.voyage-compass{position:absolute;right:28px;top:16px;z-index:5;width:76px;height:76px;border:1px solid rgba(142,108,50,.55);border-radius:50%;color:#8c6c36;text-align:center;font:10px/1 serif}.voyage-compass::before,.voyage-compass::after{content:"";position:absolute;left:50%;top:8px;width:1px;height:60px;background:#9b7b43}.voyage-compass::after{transform:rotate(90deg)}.voyage-compass i{position:absolute;left:23px;top:23px;width:27px;height:27px;border:1px solid #99783f;transform:rotate(45deg);background:linear-gradient(135deg,#99783f 0 49%,transparent 50%)}.voyage-compass b{position:absolute;top:-13px;left:33px}.voyage-compass em{position:absolute;bottom:-14px;left:34px;font-style:normal}.voyage-compass span{position:absolute;left:-12px;top:34px;white-space:pre;word-spacing:54px}
      .voyage-routes{position:absolute;inset:0;z-index:4;width:100%;height:100%;overflow:visible}.voyage-branch-route{fill:none;stroke:#a47d3d;stroke-width:1.7;stroke-dasharray:7 8;opacity:.42}.voyage-main-route{fill:none;stroke:#385744;stroke-width:4;stroke-linecap:round;stroke-dasharray:10 8;opacity:.72}.voyage-route-progress{fill:none;stroke:#c39b50;stroke-width:6;stroke-linecap:round;filter:drop-shadow(0 1px 2px rgba(54,63,43,.35))}.voyage-stop circle:first-child{fill:#f7efdb;stroke:#385744;stroke-width:3}.voyage-stop circle:nth-child(2){fill:#b6904c}.voyage-stop text{fill:#314c3d;font:700 13px serif;text-anchor:middle}.voyage-ship{display:block!important;visibility:visible!important;opacity:1!important;filter:drop-shadow(0 5px 4px rgba(33,50,40,.32));transform-box:fill-box;transform-origin:center;transform-style:flat}.ship-hull{fill:#233f32;stroke:#f0dfb1;stroke-width:1.4}.ship-mast{fill:none;stroke:#263f32;stroke-width:2.4}.ship-sail-a{fill:#f7eed6;stroke:#263f32;stroke-width:1.3}.ship-sail-b{fill:#526b55;stroke:#263f32;stroke-width:1.2}.ship-flag{fill:#b78f48}
      .voyage-island-label{position:absolute;z-index:6;left:calc(var(--island-x)/1100*100%);top:calc(var(--island-y)/550*100%);width:170px;min-height:84px;padding:13px 15px 12px;color:#fffef4;text-align:center;background:radial-gradient(ellipse at 50% 20%,rgba(125,144,103,.97),rgba(59,79,57,.97) 70%);border:1px solid rgba(248,232,190,.72);border-radius:44% 56% 47% 53%/55% 42% 58% 45%;box-shadow:0 9px 18px rgba(29,46,35,.26),inset 0 0 0 3px rgba(244,232,196,.12);transform:translate(-50%,-50%);animation:voyageIslandIn .5s both;animation-delay:var(--island-delay)}.voyage-island-label::before,.voyage-island-label::after{content:"";position:absolute;z-index:-1;background:#6d7c5d;border:2px solid rgba(247,234,201,.55);border-radius:50%}.voyage-island-label::before{width:22px;height:15px;left:-18px;top:42px}.voyage-island-label::after{width:15px;height:11px;right:-12px;bottom:18px}.voyage-island-icon{display:block;font:24px/1 serif;color:#fff5d5}.voyage-island-label strong{display:block;margin:2px 0;font:700 18px/1.2 serif;letter-spacing:.08em}.voyage-island-label small{display:block;max-width:145px;margin:auto;font:11px/1.35 sans-serif;opacity:.9}.voyage-island-label>span:last-child{position:absolute;right:9px;top:8px;width:18px;height:18px;border:1px solid rgba(255,255,255,.65);border-radius:50%;font:700 10px/17px sans-serif}
      .voyage-person-card{position:absolute;z-index:9;left:calc(var(--card-x)/1100*100%);top:calc(var(--card-y)/550*100%);display:flex;align-items:center;gap:9px;width:180px;min-height:54px;padding:6px 10px 6px 6px;background:rgba(255,252,243,.94);border:1px solid rgba(166,132,76,.28);border-radius:32px;color:#263f33;box-shadow:0 6px 16px rgba(39,52,42,.2);animation:voyageCardIn .55s .25s both}.voyage-person-card.right{transform:translateX(-25%)}.voyage-person-avatar{flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;overflow:hidden;border:2px solid #c6a363;border-radius:50%;background:#dce1d1;color:#39533e;font:700 18px serif}.voyage-person-avatar img{width:100%;height:100%;object-fit:cover}.voyage-person-copy{display:block;min-width:0}.voyage-person-copy strong,.voyage-person-copy small,.voyage-person-copy em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.voyage-person-copy strong{font:700 14px/1.25 serif}.voyage-person-copy small{max-width:112px;color:#665c49;font-size:10px}.voyage-person-copy em{margin-top:2px;color:#48634c;font:normal 9px/1.2 sans-serif}.voyage-person-copy em i{color:#799070;font-size:7px;margin-right:4px}
      .voyage-question-plaque{position:absolute;z-index:8;left:50%;bottom:12px;width:min(460px,50%);padding:9px 28px 12px;text-align:center;color:#fff9e7;background:linear-gradient(180deg,#385442,#223b31);border:2px solid #bc9752;border-radius:38px 38px 24px 24px;box-shadow:0 0 0 3px #314a3a,0 0 0 5px #d2b16a,0 8px 19px rgba(28,45,35,.25);transform:translateX(-50%)}.voyage-question-plaque::before,.voyage-question-plaque::after{content:"";position:absolute;top:50%;width:30px;height:1px;background:#cfb475}.voyage-question-plaque::before{left:16px}.voyage-question-plaque::after{right:16px}.voyage-question-plaque small{display:block;color:#d8c795;font:11px/1.4 serif;letter-spacing:.18em}.voyage-question-plaque strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 20px/1.35 serif;letter-spacing:.06em}.voyage-map-note{position:absolute;z-index:7;left:18px;bottom:9px;margin:0;color:#796a4c;font:11px/1.2 serif}
      .voyage-harvest{position:relative;z-index:3;display:grid;grid-template-columns:210px minmax(0,1fr) auto;gap:20px;align-items:center;margin-top:12px;padding:13px 12px 2px}.voyage-harvest-title{display:flex;align-items:center;gap:11px}.voyage-harvest-title>span{display:grid;place-items:center;width:40px;height:40px;border:1px solid #a78750;border-radius:50%;color:#9a773e}.voyage-harvest-title small,.voyage-harvest-title strong{display:block}.voyage-harvest-title small{color:#927341;font:700 12px serif;letter-spacing:.12em}.voyage-harvest-title strong{margin-top:2px;font:700 14px serif}.voyage-harvest-copy{min-width:0;padding-left:18px;border-left:1px solid rgba(150,117,61,.35)}.voyage-harvest-copy p{margin:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#5e5a4b;font-size:12px}.voyage-harvest-copy b{display:inline-block;width:54px;color:#294536;font-family:serif}.voyage-map-actions{display:flex;gap:10px}.voyage-map-actions button{min-width:126px;white-space:nowrap}
      @keyframes voyageIslandIn{from{opacity:0;transform:translate(-50%,-44%) scale(.88)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes voyageCardIn{from{opacity:0;filter:blur(3px)}to{opacity:1;filter:blur(0)}}
      @media(max-width:820px){.voyage-map-dialog{width:100vw;max-height:100vh;border-radius:0}.voyage-map-shell{grid-template-rows:auto auto auto;max-height:100vh;overflow:auto;padding:14px}.voyage-map-header{padding:4px 38px 10px}.voyage-map-header h2{font-size:30px}.voyage-map-header>strong{font-size:13px}.voyage-chart{min-height:570px;background-size:auto 100%;background-position:center}.voyage-quote,.voyage-compass{display:none}.voyage-island-label{width:138px;min-height:72px;padding:9px}.voyage-island-label strong{font-size:14px}.voyage-island-label small{font-size:9px}.voyage-person-card{width:136px}.voyage-person-copy small{max-width:72px}.voyage-question-plaque{width:76%}.voyage-harvest{grid-template-columns:1fr;gap:9px}.voyage-harvest-copy{padding:8px 0 0;border-left:0;border-top:1px solid rgba(150,117,61,.35)}.voyage-harvest-copy p{white-space:normal}.voyage-map-actions{width:100%}.voyage-map-actions button{flex:1}.voyage-map-note{display:none}}
      @media(prefers-reduced-motion:reduce){.voyage-island-label,.voyage-person-card{animation:none}.voyage-launch{transition:none}}
      .voyage-island-label{left:var(--island-x);top:var(--island-y)}
      .voyage-person-card{left:var(--card-x);top:var(--card-y)}
      @media(max-height:820px) and (min-width:821px){.voyage-map-shell{grid-template-rows:auto minmax(360px,1fr) auto;padding:14px}.voyage-map-header{padding-bottom:7px}.voyage-map-header h2{font-size:38px}.voyage-map-header>strong{font-size:14px}.voyage-chart{min-height:410px}.voyage-harvest{margin-top:8px;padding-top:9px}}
    `;
    document.head.append(style);
  }

  document.addEventListener("click", (event) => {
    const restartButton = event.target.closest?.("#restartButton, #bottomRestart");
    if (!restartButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToSearch();
  }, true);

  if (typeof showTrail !== "undefined") showTrail = showVoyage;
  ensureStyles();
})();























})();