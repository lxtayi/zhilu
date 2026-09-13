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

export function createQuestionGlobe({ canvas, stage, motionSurface }) {
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