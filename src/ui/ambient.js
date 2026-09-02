// ============================================================
//  EchoChat · Ambient Layer
//  背景动态粒子 + 水波焦散光。挂在 #app 之下的固定层，
//  不随视图重渲染而重建，因此 render() 可以自由替换 #app 内容。
// ============================================================

const INTENSITY_MULT = { off: 0, weak: 0.6, medium: 1, strong: 1.35 };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hexToRgb(hex) {
  const m = String(hex || "").replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// 低分辨率缓冲 + 放大模糊：正弦干涉纹样近似水下焦散光
const Caustic = {
  canvas: null,
  ctx: null,
  buffer: null,
  bufferCtx: null,
  scale: 0.28,
  w: 0,
  h: 0,

  ensure(host) {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "ambient-caustic";
      this.canvas.setAttribute("aria-hidden", "true");
      this.ctx = this.canvas.getContext("2d");
    }
    if (host && this.canvas.parentNode !== host) host.appendChild(this.canvas);
  },

  resize(w, h) {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bw = Math.max(32, Math.ceil(w * this.scale));
    const bh = Math.max(24, Math.ceil(h * this.scale));
    if (!this.buffer || this.buffer.width !== bw || this.buffer.height !== bh) {
      this.buffer = document.createElement("canvas");
      this.buffer.width = bw;
      this.buffer.height = bh;
      this.bufferCtx = this.buffer.getContext("2d");
    }
  },

  intensityAt(x, y, t) {
    const v =
      (Math.sin(x * 0.042 + t * 0.62) +
        Math.sin(y * 0.051 - t * 0.48) +
        Math.sin((x * 0.72 + y * 0.88) * 0.028 + t * 0.38) +
        Math.sin((x - y) * 0.035 - t * 0.31)) /
      4;
    // 高次幂只留波峰，纹样才是细亮丝而不是大块团
    return Math.pow(Math.max(0, v), 3.6);
  },

  clear() {
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  },

  draw(mode, colors, mult, t) {
    if (!this.ctx || !this.bufferCtx || !this.buffer) return;
    if (mult === 0) {
      this.clear();
      return;
    }
    const bw = this.buffer.width;
    const bh = this.buffer.height;
    const landing = mode === "landing";
    const alphaBase = landing ? 0.16 : 0.07;
    const img = this.bufferCtx.createImageData(bw, bh);
    const d = img.data;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const fx = x / this.scale;
        const fy = y / this.scale;
        const c = this.intensityAt(fx, fy, t);
        const mix = 0.5 + 0.5 * Math.sin(fx * 0.0025 + fy * 0.0018 + t * 0.25);
        const i = (y * bw + x) * 4;
        d[i] = colors.primary.r * mix + colors.mint.r * (1 - mix);
        d[i + 1] = colors.primary.g * mix + colors.mint.g * (1 - mix);
        d[i + 2] = colors.primary.b * mix + colors.mint.b * (1 - mix);
        d[i + 3] = Math.min(255, c * alphaBase * mult * 255);
      }
    }
    this.bufferCtx.putImageData(img, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.save();
    this.ctx.filter = landing ? "blur(5px)" : "blur(9px)";
    this.ctx.globalCompositeOperation = "screen";
    this.ctx.drawImage(this.buffer, 0, 0, this.w, this.h);
    this.ctx.restore();
    if (landing) {
      const cx = this.w * 0.5;
      const cy = this.h * 0.38;
      const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(this.w, this.h) * 0.42);
      const p = colors.primary;
      g.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${0.12 * mult})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, this.w, this.h);
    }
  },
};

export const Ambient = {
  layer: null,
  canvas: null,
  ctx: null,
  raf: 0,
  frame: 0,
  w: 0,
  h: 0,
  mode: "off",
  running: false,
  intensity: "medium",
  particles: [],
  ripples: [],
  lastRippleAt: 0,
  primary: { r: 124, g: 184, b: 232 },
  mint: { r: 157, g: 217, b: 194 },

  mount() {
    if (this.layer || typeof document === "undefined") return;
    this.layer = document.createElement("div");
    this.layer.className = "ambient-layer";
    this.layer.setAttribute("aria-hidden", "true");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ambient-particles";
    this.ctx = this.canvas.getContext("2d");
    Caustic.ensure(this.layer);
    this.layer.appendChild(this.canvas);
    document.body.insertBefore(this.layer, document.body.firstChild);

    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
      else if (this.mode !== "off") this.start();
    });
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionPref = () => {
      if (motionMq.matches) {
        this.pause();
        this.clearCanvases();
      } else if (this.mode !== "off" && !document.hidden) {
        this.start();
      }
    };
    if (motionMq.addEventListener) motionMq.addEventListener("change", onMotionPref);
    else if (motionMq.addListener) motionMq.addListener(onMotionPref);
    this.resize();
  },

  setColors(primaryHex, mintHex) {
    this.primary = hexToRgb(primaryHex) || this.primary;
    this.mint = hexToRgb(mintHex) || this.mint;
  },

  setIntensity(level) {
    this.intensity = INTENSITY_MULT[level] != null ? level : "medium";
    this.spawn();
    if (this.mult() === 0) this.clearCanvases();
  },

  mult() {
    return INTENSITY_MULT[this.intensity] ?? 1;
  },

  density() {
    const mult = this.mult();
    if (mult === 0 || this.mode === "off") return 0;
    const wide = this.w >= 1024;
    const base = this.mode === "landing" ? (wide ? 42 : 26) : wide ? 20 : 12;
    return Math.round(base * mult);
  },

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === "off") {
      this.pause();
      this.clearCanvases();
      this.particles = [];
      this.ripples = [];
      return;
    }
    this.spawn();
    this.start();
  },

  spawn() {
    const n = this.density();
    if (!n) {
      this.particles = [];
      return;
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 1.8 + Math.random() * 4.4,
        vx: (Math.random() - 0.5) * 0.42,
        vy: (Math.random() - 0.5) * 0.34,
        warm: Math.random() > 0.45,
        a: 0.18 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
        glow: 0.4 + Math.random() * 0.6,
      });
    }
    this.particles = out;
  },

  resize() {
    if (!this.canvas) return;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(this.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Caustic.resize(this.w, this.h);
    if (this.particles.length !== this.density()) this.spawn();
  },

  addRipple(x, y) {
    if (this.mode !== "landing") return;
    this.ripples.push({ x, y, r: 0, max: Math.min(this.w, this.h) * 0.26, a: 0.28 });
    if (this.ripples.length > 5) this.ripples.shift();
  },

  clearCanvases() {
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
    Caustic.clear();
  },

  start() {
    if (!this.canvas || prefersReducedMotion() || this.mode === "off") return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (this.running) return;
    this.running = true;
    this.frame = 0;
    this.raf = requestAnimationFrame(() => this.draw());
  },

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  },

  draw() {
    if (!this.running || !this.ctx) return;
    const t = Date.now() / 1000;
    const mult = this.mult();
    const colors = { primary: this.primary, mint: this.mint };

    // 移动端隔帧绘制焦散层：逐像素缓冲是这里唯一的重活
    const narrow = this.w < 768;
    if (!narrow || this.frame % 2 === 0) Caustic.draw(this.mode, colors, mult, t);
    this.frame++;

    this.ctx.clearRect(0, 0, this.w, this.h);
    if (mult === 0) {
      this.raf = requestAnimationFrame(() => this.draw());
      return;
    }

    const pRgb = `${this.primary.r},${this.primary.g},${this.primary.b}`;
    const mRgb = `${this.mint.r},${this.mint.g},${this.mint.b}`;

    if (this.mode === "landing" && t - this.lastRippleAt > 2.2) {
      this.addRipple(this.w * (0.36 + Math.random() * 0.28), this.h * (0.3 + Math.random() * 0.2));
      this.lastRippleAt = t;
    }
    for (let k = this.ripples.length - 1; k >= 0; k--) {
      const rp = this.ripples[k];
      rp.r += 0.62;
      rp.a *= 0.982;
      if (rp.a < 0.008 || rp.r > rp.max) {
        this.ripples.splice(k, 1);
        continue;
      }
      this.ctx.beginPath();
      this.ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(${pRgb},${rp.a})`;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(rp.x, rp.y, rp.r * 0.7, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(${mRgb},${rp.a * 0.7})`;
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();
    }

    const linkDist = this.mode === "landing" ? 110 : 80;
    const linkAlpha = this.mode === "landing" ? 0.1 : 0.06;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -12) p.x = this.w + 12;
      if (p.x > this.w + 12) p.x = -12;
      if (p.y < -12) p.y = this.h + 12;
      if (p.y > this.h + 12) p.y = -12;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.35 + p.phase);
      const a = p.a * (this.mode === "app" ? 0.7 : 1) * (0.7 + 0.3 * pulse);
      const rgb = p.warm ? pRgb : mRgb;
      const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
      grad.addColorStop(0, `rgba(${rgb},${a * p.glow})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${rgb},${a})`;
      this.ctx.fill();
      for (let j = i + 1; j < this.particles.length; j++) {
        const q = this.particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dist = Math.hypot(dx, dy);
        if (dist < linkDist) {
          this.ctx.strokeStyle = `rgba(${pRgb},${(1 - dist / linkDist) * linkAlpha})`;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(q.x, q.y);
          this.ctx.stroke();
        }
      }
    }

    this.raf = requestAnimationFrame(() => this.draw());
  },
};

export default Ambient;
