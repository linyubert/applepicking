/* =========================================================
   音效：以 Web Audio 合成的木琴／鋼琴感音色（不需外部音檔）
   ========================================================= */
window.AP = window.AP || {};

AP.Audio = class {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      const comp = this.ctx.createDynamicsCompressor ? this.ctx.createDynamicsCompressor() : null;
      if (comp) { this.master.connect(comp); comp.connect(this.ctx.destination); }
      else this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  unlock() { this.ensure(); }

  /** 單音；midi=60 為 C4 */
  note(midi, opt) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const o = opt || {};
    const dur = o.dur || 1.25;
    const when = o.when || 0;
    const gain = (o.gain == null ? 0.3 : o.gain);
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const t = ctx.currentTime + when + 0.001;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    lp.Q.value = 0.4;
    bus.connect(lp);
    lp.connect(this.master);

    // 主音 + 泛音，做出「木質敲擊」感
    const parts = [
      { mul: 1, type: 'triangle', amp: 1.0, det: 0 },
      { mul: 2, type: 'sine', amp: 0.34, det: 2 },
      { mul: 3.01, type: 'sine', amp: 0.12, det: -3 },
      { mul: 4.98, type: 'sine', amp: 0.05, det: 4 }
    ];
    parts.forEach((p) => {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = f * p.mul;
      osc.detune.value = p.det;
      const g = ctx.createGain();
      g.gain.value = p.amp;
      osc.connect(g); g.connect(bus);
      osc.start(t);
      osc.stop(t + dur + 0.08);
    });

    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(gain, t + 0.012);
    bus.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (lp.frequency) {
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    }
  }

  chord(midis, opt) {
    midis.forEach((m, i) => this.note(m, Object.assign({}, opt, { when: (opt && opt.when || 0) + i * 0.02 })));
  }

  success(midi) {
    if (!this.enabled) return;
    // 叮～ 大三和弦快速琶音
    const base = midi || 84;
    [0, 4, 7, 12].forEach((iv, i) => {
      this.note(base + iv, { when: i * 0.06, dur: 0.7, gain: 0.22 });
    });
  }

  wrong() {
    if (!this.enabled) return;
    this.note(55, { dur: 0.28, gain: 0.22 });
    this.note(52, { when: 0.13, dur: 0.42, gain: 0.22 });
  }

  pop() {
    if (!this.enabled) return;
    this.note(96, { dur: 0.12, gain: 0.12 });
  }

  win() {
    if (!this.enabled) return;
    const seq = [72, 76, 79, 84, 88, 91, 96];
    seq.forEach((m, i) => this.note(m, { when: i * 0.09, dur: 0.9, gain: 0.24 }));
    [72, 76, 79, 84].forEach((m) => this.note(m, { when: 0.75, dur: 1.6, gain: 0.16 }));
  }

  /** 把一串音符（MIDI 陣列）依序播成小樂句 */
  melody(midis, gap) {
    if (!this.enabled) return;
    const g = gap || 0.16;
    midis.forEach((m, i) => this.note(m, { when: i * g, dur: 0.6, gain: 0.22 }));
  }
};
