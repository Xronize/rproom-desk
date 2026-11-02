export function normalizePoints(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : payload && (payload.points || payload.equity || payload.values || payload.series);
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const value =
      typeof item === "number"
        ? item
        : Number(item && (item.v ?? item.value ?? item.equity ?? item.y ?? item.close));
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

export function drawChart(canvas, values) {
  const parent = canvas.parentElement;
  const width = parent ? parent.clientWidth : 0;
  const height = 200;
  if (width < 10 || !values.length) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 16;
  const coords = values.map((value, index) => {
    const x =
      values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y];
  });

  if (values.length === 1) {
    ctx.fillStyle = "#00d35a";
    ctx.beginPath();
    ctx.arc(coords[0][0], coords[0][1], 3.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  coords.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#00d35a";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.lineTo(coords[coords.length - 1][0], height);
  ctx.lineTo(coords[0][0], height);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 211, 90, 0.16)";
  ctx.fill();
}
