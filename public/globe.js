import { COASTLINES } from "./world-data.js";

const DEG = Math.PI / 180;

const CITIES = [
  { lat: 39.9, lon: 116.4 }, { lat: 31.2, lon: 121.5 },
  { lat: 22.5, lon: 114.1 }, { lat: 35.7, lon: 139.7 },
  { lat: 1.3, lon: 103.8 }, { lat: 51.5, lon: -.1 },
  { lat: 40.7, lon: -74 }, { lat: -33.9, lon: 151.2 }
];

const ROUTES = [[0, 4], [1, 5]];
const QUESTION_ANCHORS = [
  { lat: 34, lon: -105 }, { lat: -12, lon: 80 },
  { lat: 52, lon: 20 }, { lat: 8, lon: 140 },
  { lat: -38, lon: -45 }, { lat: 22, lon: 45 },
  { lat: -7, lon: -135 }, { lat: 43, lon: 105 }
];

const MANSION_NAMES = ["角", "亢", "氐", "房", "心", "尾", "箕", "斗", "牛", "女", "虚", "危", "室", "壁"];

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
    if (point.z <= .015) { drawing = false; return; }
    if (drawing) context.lineTo(point.x, point.y);
    else context.moveTo(point.x, point.y);
    drawing = true;
  });
  context.stroke();
}

function interpolateLongitude(start, end, amount) {
  let distance = end - start;
  if (distance > 180) distance -= 360;
  if (distance < -180) distance += 360;
  return start + distance * amount;
}

export function createQuestionGlobe({ canvas, stage, motionSurface }) {
  if (!canvas || !stage || !motionSurface) return () => {};
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const questions = [...stage.querySelectorAll(".floating-question")];
  const previewIndex = stage.querySelector("#globeQuestionIndex");
  const previewText = stage.querySelector("#globeQuestionText");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    width: 0, height: 0, radius: 0, canvasLeft: 0, canvasTop: 0, frame: 0,
    yaw: -.46, pitch: -.08, velocityX: 0, velocityY: 0,
    hoverX: 0, hoverY: 0, targetHoverX: 0, targetHoverY: 0,
    dragging: false, pointerId: null, lastX: 0, lastY: 0, lastTime: 0,
    focusedIndex: -1, focusYaw: 0, focusPitch: 0
  };

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(1, bounds.width);
    state.height = Math.max(1, bounds.height);
    state.radius = Math.min(state.width, state.height) * .465;
    const stageBounds = stage.getBoundingClientRect();
    state.canvasLeft = bounds.left - stageBounds.left;
    state.canvasTop = bounds.top - stageBounds.top;
    canvas.width = Math.round(state.width * ratio);
    canvas.height = Math.round(state.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function project(latitude, longitude) {
    const point = spherePoint(latitude, longitude, state.yaw, state.pitch);
    return {
      x: state.width / 2 + point.x * state.radius,
      y: state.height / 2 + point.y * state.radius,
      z: point.z
    };
  }

  function drawGrid() {
    context.save();
    context.lineWidth = .72;
    for (let latitude = -45; latitude <= 45; latitude += 45) {
      context.strokeStyle = latitude === 0 ? "rgba(232,218,175,.42)" : "rgba(237,233,205,.2)";
      const points = [];
      for (let longitude = -180; longitude <= 180; longitude += 3) points.push([latitude, longitude]);
      strokeVisible(context, points, project);
    }
    for (let longitude = -180; longitude < 180; longitude += 60) {
      context.strokeStyle = "rgba(237,233,205,.2)";
      const points = [];
      for (let latitude = -90; latitude <= 90; latitude += 2) points.push([latitude, longitude]);
      strokeVisible(context, points, project);
    }
    context.restore();
  }

  function drawLand() {
    context.save();
    context.beginPath();
    COASTLINES.forEach((coastline) => {
      const vertices = coastline.map(([latitude, longitude]) => spherePoint(latitude, longitude, state.yaw, state.pitch));
      const visible = [];
      let previous = vertices[vertices.length - 1];
      let previousInside = previous.z >= .015;
      vertices.forEach((current) => {
        const currentInside = current.z >= .015;
        if (currentInside !== previousInside) {
          const amount = (.015 - previous.z) / (current.z - previous.z);
          visible.push({
            x: previous.x + (current.x - previous.x) * amount,
            y: previous.y + (current.y - previous.y) * amount,
            z: .015
          });
        }
        if (currentInside) visible.push(current);
        previous = current;
        previousInside = currentInside;
      });
      if (visible.length < 3) return;
      visible.forEach((point, index) => {
        const x = state.width / 2 + point.x * state.radius;
        const y = state.height / 2 + point.y * state.radius;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
    });
    const land = context.createLinearGradient(0, state.height * .12, state.width, state.height * .88);
    land.addColorStop(0, "#718261");
    land.addColorStop(.42, "#4b684c");
    land.addColorStop(1, "#2d503b");
    context.fillStyle = land;
    context.fill("evenodd");

    context.lineWidth = .62;
    context.strokeStyle = "rgba(244,230,191,.62)";
    COASTLINES.forEach((coastline) => strokeVisible(context, coastline, project));
    context.restore();
  }

  function drawCelestialSystem(now) {
    const activeIndex = questions.findIndex((question) => question.classList.contains("is-active"));
    const ecliptic = [];
    for (let longitude = -180; longitude <= 180; longitude += 3) {
      ecliptic.push([Math.sin(longitude * DEG) * 18, longitude]);
    }

    context.save();
    context.setLineDash([2, 5]);
    context.lineDashOffset = reducedMotion.matches ? 0 : -now * .004;
    context.lineWidth = .72;
    context.strokeStyle = "rgba(238,215,160,.5)";
    strokeVisible(context, ecliptic, project);
    context.setLineDash([]);

    for (let index = 0; index < 28; index += 1) {
      const longitude = -180 + index * (360 / 28);
      const latitude = Math.sin(longitude * DEG) * 18;
      const point = project(latitude, longitude);
      if (point.z <= .035) continue;
      const major = index % 2 === 0;
      context.beginPath();
      context.arc(point.x, point.y, major ? 1.25 : .72, 0, Math.PI * 2);
      context.fillStyle = major ? "rgba(255,246,213,.88)" : "rgba(249,242,216,.62)";
      context.fill();
      if (major && point.z > .5) {
        context.fillStyle = "rgba(255,239,198,.58)";
        context.font = "8px STKaiti, KaiTi, serif";
        context.fillText(MANSION_NAMES[(index / 2) % MANSION_NAMES.length], point.x + 4, point.y - 4);
      }
    }

    QUESTION_ANCHORS.forEach((anchor, index) => {
      const companions = [
        [anchor.lat, anchor.lon],
        [anchor.lat + (index % 2 ? 6 : -5), anchor.lon + 8],
        [anchor.lat + (index % 3 ? -4 : 7), anchor.lon + 16]
      ];
      const active = activeIndex === index;
      context.beginPath();
      let drawing = false;
      companions.forEach(([latitude, longitude]) => {
        const point = project(latitude, longitude);
        if (point.z <= .025) { drawing = false; return; }
        if (drawing) context.lineTo(point.x, point.y);
        else context.moveTo(point.x, point.y);
        drawing = true;
      });
      context.lineWidth = active ? 1.15 : .58;
      context.strokeStyle = active ? "rgba(255,233,174,.95)" : "rgba(246,238,210,.38)";
      context.stroke();

      companions.forEach(([latitude, longitude], companionIndex) => {
        const point = project(latitude, longitude);
        if (point.z <= .025) return;
        const radius = companionIndex === 0 ? (active ? 3.1 : 1.8) : 1.05;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = active ? "rgba(255,247,222,.99)" : "rgba(252,249,232,.82)";
        context.fill();
        if (active && companionIndex === 0) {
          const pulse = reducedMotion.matches ? 0 : (Math.sin(now * .003) + 1) * 1.5;
          context.beginPath();
          context.arc(point.x, point.y, 7 + pulse, 0, Math.PI * 2);
          context.strokeStyle = "rgba(255,231,171,.66)";
          context.lineWidth = .8;
          context.stroke();
        }
      });
    });
    context.restore();
  }

  function drawRoutes(now) {
    context.save();
    context.setLineDash([2.2, 4.8]);
    context.lineDashOffset = reducedMotion.matches ? 0 : -now * .008;
    context.lineWidth = .85;
    context.strokeStyle = "rgba(151,91,48,.58)";
    ROUTES.forEach(([fromIndex, toIndex]) => {
      const from = CITIES[fromIndex]; const to = CITIES[toIndex];
      const points = [];
      for (let step = 0; step <= 40; step += 1) {
        const amount = step / 40;
        const arc = Math.sin(amount * Math.PI) * 4.5;
        points.push([
          from.lat + (to.lat - from.lat) * amount - arc,
          interpolateLongitude(from.lon, to.lon, amount)
        ]);
      }
      strokeVisible(context, points, project);
    });
    context.restore();
  }

  function drawMarkers(now) {
    CITIES.forEach((city, index) => {
      const point = project(city.lat, city.lon);
      if (point.z <= .05) return;
      const pulse = reducedMotion.matches ? 0 : Math.sin(now * .0022 + index) * .8;
      const alpha = .34 + point.z * .52;
      context.beginPath();
      context.arc(point.x, point.y, 2.15 + (index % 3 === 0 ? .7 : 0), 0, Math.PI * 2);
      context.fillStyle = `rgba(255,253,239,${alpha})`;
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, 5.5 + pulse, 0, Math.PI * 2);
      context.strokeStyle = `rgba(255,229,166,${alpha * .62})`;
      context.lineWidth = .7;
      context.stroke();
    });
  }

  function drawBezel() {
    const centerX = state.width / 2; const centerY = state.height / 2;
    context.save();
    context.strokeStyle = "rgba(101,85,49,.5)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(centerX, centerY, state.radius + 1, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(74,106,87,.23)";
    context.beginPath();
    context.arc(centerX, centerY, state.radius + 7, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function positionQuestions() {
    questions.forEach((question, index) => {
      const anchor = QUESTION_ANCHORS[index % QUESTION_ANCHORS.length];
      const point = project(anchor.lat, anchor.lon);
      const frontDepth = Math.max(0, point.z);
      const scale = .76 + frontDepth * .24;
      question.style.setProperty("left", `${state.canvasLeft + point.x}px`, "important");
      question.style.setProperty("top", `${state.canvasTop + point.y}px`, "important");
      question.style.setProperty("right", "auto", "important");
      question.style.setProperty("bottom", "auto", "important");
      question.style.setProperty("--depth-scale", scale.toFixed(3));
      question.style.opacity = (.28 + (point.z + 1) * .34).toFixed(3);
      question.style.zIndex = question.classList.contains("is-active") ? "12" : String(4 + Math.round(frontDepth * 4));
      question.classList.toggle("is-left", point.x < state.width / 2);
      question.classList.toggle("is-behind", point.z < 0);
    });
  }

  function draw(now) {
    state.hoverX += (state.targetHoverX - state.hoverX) * .045;
    state.hoverY += (state.targetHoverY - state.hoverY) * .045;
    if (!state.dragging && !reducedMotion.matches) {
      if (state.focusedIndex >= 0) {
        const yawDistance = Math.atan2(Math.sin(state.focusYaw - state.yaw), Math.cos(state.focusYaw - state.yaw));
        const pitchDistance = state.focusPitch - state.pitch;
        state.yaw += yawDistance * .07;
        state.pitch += pitchDistance * .07;
        if (Math.abs(yawDistance) < .001 && Math.abs(pitchDistance) < .001) state.focusedIndex = -1;
      } else {
        state.yaw += .00018 + state.velocityX;
        state.pitch = Math.max(-.6, Math.min(.6, state.pitch + state.velocityY));
        state.velocityX *= .955;
        state.velocityY *= .92;
      }
    }
    if (document.hidden || motionSurface.hidden) {
      state.frame = requestAnimationFrame(draw);
      return;
    }

    const yawBeforeHover = state.yaw;
    const pitchBeforeHover = state.pitch;
    state.yaw += state.hoverX * .11;
    state.pitch = Math.max(-.6, Math.min(.6, state.pitch + state.hoverY * .055));
    context.clearRect(0, 0, state.width, state.height);
    const centerX = state.width / 2; const centerY = state.height / 2;
    context.save();
    context.beginPath();
    context.arc(centerX, centerY, state.radius, 0, Math.PI * 2);
    context.clip();
    const ocean = context.createRadialGradient(
      centerX - state.radius * .35 - state.hoverX * 8,
      centerY - state.radius * .37 - state.hoverY * 6,
      state.radius * .04,
      centerX, centerY, state.radius * 1.12
    );
    ocean.addColorStop(0, "#a9c0ad");
    ocean.addColorStop(.34, "#819f89");
    ocean.addColorStop(.72, "#587967");
    ocean.addColorStop(1, "#365344");
    context.fillStyle = ocean;
    context.fillRect(0, 0, state.width, state.height);
    drawGrid();
    drawRoutes(now);
    drawLand();
    drawCelestialSystem(now);
    drawMarkers(now);
    const shade = context.createLinearGradient(centerX - state.radius, 0, centerX + state.radius, 0);
    shade.addColorStop(0, "rgba(42,61,44,.15)");
    shade.addColorStop(.24, "rgba(255,249,218,.16)");
    shade.addColorStop(.62, "rgba(255,255,255,0)");
    shade.addColorStop(1, "rgba(28,48,37,.38)");
    context.fillStyle = shade;
    context.fillRect(0, 0, state.width, state.height);
    context.restore();
    drawBezel();
    positionQuestions();
    state.yaw = yawBeforeHover;
    state.pitch = pitchBeforeHover;
    state.frame = requestAnimationFrame(draw);
  }

  function updateParallax(event) {
    const bounds = motionSurface.getBoundingClientRect();
    state.targetHoverX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    state.targetHoverY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
  }

  function startDrag(event) {
    if (event.button !== 0) return;
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.lastTime = performance.now();
    state.velocityX = 0;
    state.velocityY = 0;
    state.focusedIndex = -1;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
  }

  function drag(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(12, now - state.lastTime);
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.yaw += dx * .006;
    state.pitch = Math.max(-.6, Math.min(.6, state.pitch + dy * .0045));
    state.velocityX = (dx * .006) / Math.max(1, elapsed / 16);
    state.velocityY = (dy * .0045) / Math.max(1, elapsed / 16);
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.lastTime = now;
  }

  function stopDrag(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    canvas.classList.remove("is-dragging");
  }

  function leave() {
    state.targetHoverX = 0;
    state.targetHoverY = 0;
  }

  function activateQuestion(question) {
    const index = questions.indexOf(question);
    if (index < 0) return;
    questions.forEach((item) => {
      const active = item === question;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
    if (previewIndex) previewIndex.textContent = `QUESTION ${String(index + 1).padStart(2, "0")}`;
    if (previewText) previewText.textContent = question.dataset.question || question.textContent.trim();
  }

  function focusQuestion(question) {
    const index = questions.indexOf(question);
    const anchor = QUESTION_ANCHORS[index % QUESTION_ANCHORS.length];
    if (!anchor) return;
    const targetYaw = .23 - anchor.lon * DEG;
    const yawDistance = Math.atan2(Math.sin(targetYaw - state.yaw), Math.cos(targetYaw - state.yaw));
    state.focusYaw = state.yaw + yawDistance;
    state.focusPitch = Math.max(-.55, Math.min(.55, -anchor.lat * DEG));
    state.focusedIndex = index;
    state.velocityX = 0;
    state.velocityY = 0;
  }

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  motionSurface.addEventListener("pointermove", updateParallax);
  motionSurface.addEventListener("pointerleave", leave);
  canvas.addEventListener("pointerdown", startDrag);
  canvas.addEventListener("pointermove", drag);
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);
  questions.forEach((question) => {
    question.addEventListener("focus", () => { activateQuestion(question); focusQuestion(question); });
    question.addEventListener("click", () => { activateQuestion(question); focusQuestion(question); });
  });
  state.frame = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(state.frame);
    observer.disconnect();
    motionSurface.removeEventListener("pointermove", updateParallax);
    motionSurface.removeEventListener("pointerleave", leave);
    canvas.removeEventListener("pointerdown", startDrag);
    canvas.removeEventListener("pointermove", drag);
    canvas.removeEventListener("pointerup", stopDrag);
    canvas.removeEventListener("pointercancel", stopDrag);
  };
}

function bootQuestionGlobe() {
  const canvas = document.querySelector('#questionGlobeCanvas');
  const stage = document.querySelector('#questionGlobeStage');
  const motionSurface = document.querySelector('#heroSection');
  if (canvas && stage && motionSurface) createQuestionGlobe({ canvas, stage, motionSurface });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootQuestionGlobe, { once: true });
else bootQuestionGlobe();

