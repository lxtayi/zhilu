const DEG = Math.PI / 180;

const LANDMASSES = [
  [[72,-168],[68,-135],[58,-121],[50,-92],[52,-66],[34,-76],[17,-88],[18,-109],[33,-124],[54,-148]],
  [[13,-81],[5,-75],[-7,-78],[-20,-69],[-39,-63],[-54,-70],[-35,-52],[-11,-48],[3,-55]],
  [[70,-12],[72,34],[65,74],[68,122],[55,154],[37,141],[21,112],[9,80],[24,55],[18,34],[37,22],[45,-8]],
  [[36,-17],[36,18],[24,40],[3,43],[-20,34],[-36,19],[-31,1],[-7,-16],[14,-17]],
  [[-12,112],[-18,146],[-38,153],[-44,132],[-30,114]],
  [[82,-52],[72,-24],[61,-42],[64,-62]]
];

const CITIES = [
  { lat: 39.9, lon: 116.4 }, { lat: 31.2, lon: 121.5 },
  { lat: 22.5, lon: 114.1 }, { lat: 35.7, lon: 139.7 },
  { lat: 1.3, lon: 103.8 }, { lat: 51.5, lon: -.1 },
  { lat: 40.7, lon: -74 }, { lat: -33.9, lon: 151.2 }
];

const ROUTES = [[0, 4], [1, 5], [3, 6]];

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function pointInPolygon(latitude, longitude, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0]; const xi = polygon[i][1];
    const yj = polygon[j][0]; const xj = polygon[j][1];
    if (((yi > latitude) !== (yj > latitude)) &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function buildLandDots() {
  const random = seededRandom(20260913);
  const dots = [];
  for (let latitude = -58; latitude <= 82; latitude += 2.15) {
    for (let longitude = -178; longitude <= 178; longitude += 2.15) {
      const lat = latitude + (random() - .5) * 1.55;
      const lon = longitude + (random() - .5) * 1.55;
      if (LANDMASSES.some((land) => pointInPolygon(lat, lon, land))) {
        dots.push({ lat, lon, size: .44 + random() * 1.05, tone: random() });
      }
    }
  }
  return dots;
}

const LAND_DOTS = buildLandDots();
const PAPER_SPECKS = Array.from({ length: 280 }, (_, index) => {
  const random = seededRandom(index * 97 + 31);
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random());
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, alpha: .018 + random() * .035 };
});

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
    width: 0, height: 0, radius: 0, frame: 0,
    yaw: -.46, pitch: -.08, velocityX: 0, velocityY: 0,
    hoverX: 0, hoverY: 0, targetHoverX: 0, targetHoverY: 0,
    dragging: false, pointerId: null, lastX: 0, lastY: 0, lastTime: 0
  };

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(1, bounds.width);
    state.height = Math.max(1, bounds.height);
    state.radius = Math.min(state.width, state.height) * .465;
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
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      context.strokeStyle = latitude === 0 ? "rgba(231,225,199,.24)" : "rgba(231,225,199,.14)";
      const points = [];
      for (let longitude = -180; longitude <= 180; longitude += 3) points.push([latitude, longitude]);
      strokeVisible(context, points, project);
    }
    for (let longitude = -180; longitude < 180; longitude += 45) {
      context.strokeStyle = "rgba(231,225,199,.14)";
      const points = [];
      for (let latitude = -90; latitude <= 90; latitude += 2) points.push([latitude, longitude]);
      strokeVisible(context, points, project);
    }
    context.restore();
  }

  function drawLand() {
    context.save();
    [false, true].forEach((lightTone) => {
      context.beginPath();
      LAND_DOTS.forEach((dot) => {
        if ((dot.tone > .82) !== lightTone) return;
        const point = project(dot.lat, dot.lon);
        if (point.z <= .015) return;
        const size = dot.size * (.38 + point.z * .62);
        context.moveTo(point.x + size, point.y);
        context.arc(point.x, point.y, size, 0, Math.PI * 2);
      });
      context.fillStyle = lightTone ? "rgba(214,203,158,.48)" : "rgba(43,58,44,.74)";
      context.fill();
    });

    context.lineWidth = .65;
    context.strokeStyle = "rgba(228,218,178,.35)";
    LANDMASSES.forEach((land) => {
      const points = [];
      for (let index = 0; index < land.length; index += 1) {
        const current = land[index];
        const next = land[(index + 1) % land.length];
        for (let step = 0; step < 10; step += 1) {
          const amount = step / 10;
          points.push([
            current[0] + (next[0] - current[0]) * amount,
            interpolateLongitude(current[1], next[1], amount)
          ]);
        }
      }
      points.push(land[0]);
      strokeVisible(context, points, project);
    });
    context.restore();
  }

  function drawRoutes(now) {
    context.save();
    context.setLineDash([2.2, 4.8]);
    context.lineDashOffset = reducedMotion.matches ? 0 : -now * .008;
    context.lineWidth = .85;
    context.strokeStyle = "rgba(185,128,76,.46)";
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
      context.fillStyle = `rgba(192,139,73,${alpha})`;
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, 5.5 + pulse, 0, Math.PI * 2);
      context.strokeStyle = `rgba(214,177,111,${alpha * .52})`;
      context.lineWidth = .7;
      context.stroke();
    });
  }

  function drawPaperSpecks() {
    context.save();
    context.fillStyle = "#f7efd8";
    PAPER_SPECKS.forEach((speck) => {
      context.globalAlpha = speck.alpha;
      context.fillRect(
        state.width / 2 + speck.x * state.radius,
        state.height / 2 + speck.y * state.radius,
        1, 1
      );
    });
    context.restore();
  }

  function drawBezel() {
    const centerX = state.width / 2; const centerY = state.height / 2;
    context.save();
    context.strokeStyle = "rgba(52,68,55,.68)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(centerX, centerY, state.radius + 1, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(111,94,62,.28)";
    context.beginPath();
    context.arc(centerX, centerY, state.radius + 7, 0, Math.PI * 2);
    context.stroke();
    for (let angle = 0; angle < 360; angle += 12) {
      const radians = angle * DEG;
      const major = angle % 36 === 0;
      const start = state.radius + (major ? 3 : 5);
      const end = state.radius + (major ? 11 : 8);
      context.beginPath();
      context.moveTo(centerX + Math.cos(radians) * start, centerY + Math.sin(radians) * start);
      context.lineTo(centerX + Math.cos(radians) * end, centerY + Math.sin(radians) * end);
      context.strokeStyle = major ? "rgba(96,76,42,.48)" : "rgba(96,76,42,.2)";
      context.lineWidth = major ? .8 : .55;
      context.stroke();
    }
    context.restore();
  }

  function draw(now) {
    state.hoverX += (state.targetHoverX - state.hoverX) * .045;
    state.hoverY += (state.targetHoverY - state.hoverY) * .045;
    if (!state.dragging && !reducedMotion.matches) {
      state.yaw += .00018 + state.velocityX;
      state.pitch = Math.max(-.6, Math.min(.6, state.pitch + state.velocityY));
      state.velocityX *= .955;
      state.velocityY *= .92;
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
    ocean.addColorStop(0, "#98a28f");
    ocean.addColorStop(.38, "#738577");
    ocean.addColorStop(.73, "#50675a");
    ocean.addColorStop(1, "#33493e");
    context.fillStyle = ocean;
    context.fillRect(0, 0, state.width, state.height);
    drawGrid();
    drawRoutes(now);
    drawLand();
    drawMarkers(now);
    drawPaperSpecks();
    const shade = context.createLinearGradient(centerX - state.radius, 0, centerX + state.radius, 0);
    shade.addColorStop(0, "rgba(20,36,29,.12)");
    shade.addColorStop(.24, "rgba(255,249,220,.1)");
    shade.addColorStop(.62, "rgba(255,255,255,0)");
    shade.addColorStop(1, "rgba(15,28,22,.4)");
    context.fillStyle = shade;
    context.fillRect(0, 0, state.width, state.height);
    context.restore();
    drawBezel();
    state.yaw = yawBeforeHover;
    state.pitch = pitchBeforeHover;
    state.frame = requestAnimationFrame(draw);
  }

  function updateParallax(event) {
    const bounds = motionSurface.getBoundingClientRect();
    state.targetHoverX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    state.targetHoverY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    questions.forEach((question, index) => {
      const depth = .2 + (index % 4) * .07;
      const direction = index % 2 === 0 ? 1 : -1;
      question.style.translate = `${(state.targetHoverX * 7 * depth * direction).toFixed(2)}px ${(state.targetHoverY * 5 * depth).toFixed(2)}px`;
    });
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
    questions.forEach((question) => { question.style.translate = "0 0"; });
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
    question.addEventListener("pointerenter", () => activateQuestion(question));
    question.addEventListener("focus", () => activateQuestion(question));
    question.addEventListener("click", () => activateQuestion(question));
  });
  activateQuestion(questions[0]);
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
