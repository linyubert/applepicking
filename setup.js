/* =========================================================
   設定頁（001）：選譜號、點蘋果設定題目音域、預設音域、開始
   ========================================================= */
window.AP = window.AP || {};

AP.Setup = (function () {
  const C = AP.core, T = AP.theory;

  const BASE = C.makeGeom({ cxY: 405, spacing: 38, x0: 96, x1: 1184, minS: -4, maxS: 12 });

  /* 每個譜號可選的位置：高音譜 −4…12、低音譜 0…13（第一線～上加二間） */
  /* 低音譜：只出第一線（s0）到「上加二間」（s13＝上加二線之上的間） */
  const DOMAIN = { treble: [-4, 12], bass: [0, 13] };
  const BAND_TOP = 150, BAND_H = 404, CONTENT_PAD = 36;
  /** 依譜號產生 geometry：整串候選音垂直置中於面板帶狀區域 */
  function geoFor() {
    const d = DOMAIN[state.clef];
    const span = (d[1] - d[0]) * BASE.half;
    const mid = BAND_TOP + BAND_H / 2;
    const cxY = mid - span / 2 + (d[1] - 4) * BASE.half;
    const g = Object.assign({}, BASE, { cxY, minS: d[0], maxS: d[1] });
    g.lineY = (s) => g.cxY - (s - 4) * g.half;
    g.panelTop = g.lineY(d[1]) - CONTENT_PAD;
    g.panelH = (d[1] - d[0]) * g.half + CONTENT_PAD * 2 + 20;   // 預留下緣空間給音名
    return g;
  }
  const APPLE_SCALE = 0.54;
  /* 低音譜只有 13 個位置，位置較密，蘋果略為縮小以保持間距 */
  const appleScale = () => (state.clef === 'bass' ? 0.5 : APPLE_SCALE);
  const APPLE_X0 = 252, APPLE_X1 = 1180;

  const state = {
    clef: 'treble',
    steps: new Set(),
    mode: 'goal10',
    paintOn: false,
    label: 'show',
    naming: 'letter',
    color: 'color',
    sound: true,
    acc: 'none'
  };

  /* 預設起始音域：中央 Do～Si（切換譜號時自動換算位置） */
  function centralSteps(clefId) {
    const c = T.stepFromPitch(clefId, 'C', 4);
    const d = DOMAIN[clefId] || DOMAIN.treble;
    const r = [];
    for (let i = 0; i < 7; i++) {
      const s = c + i;
      if (s >= d[0] && s <= d[1]) r.push(s);   // 低音譜只到上加二間，超出面板的音不預選
    }
    return r;
  }

  const OPTIONS = [
    {
      key: 'naming', label: '標示', items: [
        { v: 'letter', t: '音名 C' }, { v: 'zhuyin', t: '注音 ㄉㄛ' }, { v: 'solfa', t: '唱名 Do' }
      ]
    },
    {
      key: 'color', label: '蘋果', items: [
        { v: 'color', t: '彩色' }, { v: 'mono', t: '紅色' }
      ]
    },
    {
      key: 'sound', label: '聲音', items: [
        { v: true, t: '開' }, { v: false, t: '關' }
      ]
    },
    {
      key: 'acc', label: '記號', items: [
        { v: 'none', t: '無' }, { v: 'sharp', t: '♯ 升' }, { v: 'flat', t: '♭ 降' }
      ]
    },
    {
      /* 動作型：按下去立即生效，不會停在「已選」狀態 */
      key: 'quick', label: '音域', items: [
        { v: 'all', t: '全選' }, { v: 'fit', t: '只看譜內' }, { v: 'none', t: '不限' }
      ], action: true
    }
  ];

  let staffSvg, bgSvg, appleSvgEl, appleLayer;

  /* ---------- 蘋果座標 ---------- */
  function appleX(s) {
    const g = geoFor();
    const n = g.maxS - g.minS;
    return APPLE_X0 + ((s - g.minS) / n) * (APPLE_X1 - APPLE_X0);
  }

  /* ---------- 畫五線譜 ---------- */
  function renderStaff() {
    const g = geoFor();
    const clefW = C.clefWidth(state.clef, g.spacing);
    let s = '';
    // 半透明面板
    s += '<defs><linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.62"/>' +
      '<stop offset="100%" stop-color="#ffffff" stop-opacity="0.86"/></linearGradient></defs>';
    s += '<rect x="40" y="' + g.panelTop + '" width="1200" height="' + g.panelH + '" rx="30" fill="url(#panelGrad)" ' +
      'stroke="#ffffff" stroke-width="4" opacity="0.92"/>';
    s += C.staffLines(g);
    s += C.clefMarkup(state.clef, 120, g.cxY, g.spacing, '#1d2227');
    // 每個候選音的加線（淡）
    for (let step = g.minS; step <= g.maxS; step++) {
      if (step < 0 || step > 8) {
        s += '<g opacity="0.5">' + C.ledger(g, step, appleX(step), 30) + '</g>';
      }
    }
    staffSvg.innerHTML = s;
  }

  /* ---------- 畫設定頁蘋果 ---------- */
  function renderApples() {
    let s = '';
    const g = geoFor();
    for (let step = g.minS; step <= g.maxS; step++) {
      const p = T.pitchFromStep(state.clef, step);
      const on = state.steps.size === 0 ? true : state.steps.has(step);
      const x = appleX(step), y = g.lineY(step);
      const col = state.color === 'mono' ? '#e02b25' : p.color;
      s += '<g class="setup-apple ' + (on ? 'on' : 'off') + '" data-step="' + step + '" ' +
        'transform="translate(' + x + ',' + y + ')">' +
        '<g class="halo"><circle r="52" fill="#ffe066" opacity="0.35"/></g>' +
        '<g transform="scale(' + appleScale() + ')">' +
        C.appleMarkup({
          color: col, letter: p.letter, dir: p.dir, octave: p.octave,
          showLetter: true, showOctave: false, labelMode: state.naming,
          acc: state.acc === 'none' ? '' : state.acc
        }) +
        '</g>' +
        '<circle class="hit" cx="0" cy="0" r="44" fill="transparent"/>' +
        '<title>' + T.nameText(p, state.naming, true, true) + '</title>' +
        '</g>';
    }
    appleLayer.innerHTML = s;
    refreshAppleHits();
  }

  /* ---------- 音域文字 ---------- */
  function accCfg() {
    return state.acc === 'none' ? {} : { acc: state.acc };
  }

  function rangeText() {
    const arr = Array.from(state.steps).sort((a, b) => a - b);
    if (!arr.length) {
      const g = geoFor();
      const lo0 = T.pitchFromStep(state.clef, g.minS, accCfg());
      const hi0 = T.pitchFromStep(state.clef, g.maxS, accCfg());
      return {
        main: '不限', note: '面板上所有位置皆可出題',
        reg: T.registerOf(lo0.octave, hi0.octave)
      };
    }
    const cfg = accCfg();
    const lo = T.pitchFromStep(state.clef, arr[0], cfg);
    const hi = T.pitchFromStep(state.clef, arr[arr.length - 1], cfg);
    const f = (p) => T.nameText(p, state.naming, false, true);
    const reg = T.registerOf(lo.octave, hi.octave);
    const main = arr.length === 1 ? f(lo) : f(lo) + ' – ' + f(hi);
    return { main, note: arr.length + ' 個音', reg };
  }

  /* 目前設定摘要：範圍 + 標示 / 模式 / 蘋果 / 聲音 / 記號 */
  function summaryText() {
    const nm = { letter: '音名', zhuyin: '注音', solfa: '唱名' }[state.naming] || '';
    const cl = state.color === 'mono' ? '紅色' : '彩色';
    const sd = state.sound ? '聲音開' : '靜音';
    const ac = { none: '', sharp: '・♯', flat: '・♭' }[state.acc] || '';
    return [nm, '10 顆過關', cl, sd].join('・') + ac;
  }

  function renderBadge() {
    const r = rangeText();
    const regChip = r.reg ? '<span class="reg ' + r.reg.id + '">' + r.reg.name + '</span>' : '';
    document.getElementById('rangeBadge').innerHTML =
      regChip + '<span class="lbl">範圍</span><b>' + r.main + '</b>' +
      '<span class="cnt">' + r.note + '</span>' +
      '<span class="sep">|</span><span class="cnt set">' + summaryText() + '</span>';
  }

  function refresh() {
    renderApples();
    renderBadge();
    const sub = document.getElementById('startRange');
    if (sub) sub.textContent = T.clefInfo(state.clef).name + '・' + rangeText().main;
  }

  /* ---------- 譜號卡 ---------- */
  function renderClefCards() {
    const wrap = document.getElementById('clefRow');
    const cards = [
      { id: 'treble', label: '高音譜號' },
      { id: 'bass', label: '低音譜號' }
    ];
    // 卡片內畫一個迷你五線譜 + 譜號
    const mg = C.makeGeom({ cxY: 30, spacing: 8, x0: 10, x1: 118, minS: 0, maxS: 8 });
    wrap.innerHTML = cards.map((c) => {
      const mini = '<svg viewBox="0 -14 128 82" width="112" height="72" class="mini-staff">' +
        C.staffLines(mg) +
        C.clefMarkup(c.id, 14, mg.cxY, mg.spacing, '#2f3a44') + '</svg>';
      return '<button class="clef-card" type="button" data-clef="' + c.id + '">' + mini +
        '<span class="clef-name">' + c.label + '</span></button>';
    }).join('');
    markClefCards();
    wrap.querySelectorAll('.clef-card').forEach((b) => {
      b.addEventListener('click', () => {
        if (state.clef === b.dataset.clef) return;
        state.clef = b.dataset.clef;
        AP.sfx.pop();
        state.steps = new Set(centralSteps(state.clef));
        renderClefCards();
        renderStaff();
        refresh();
      });
    });
  }

  function markClefCards() {
    document.querySelectorAll('.clef-card').forEach((b) => {
      const on = state.clef === b.dataset.clef;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ---------- 選項 ---------- */
  function renderOptions() {
    const row = document.getElementById('optionsRow');
    row.innerHTML = OPTIONS.map((g) =>
      '<div class="opt-row' + (g.action ? ' act-row' : '') + '" data-key="' + g.key +
        '" data-n="' + g.items.length + '">' +
        '<span class="glabel">' + g.label + '</span>' +
        g.items.map((it) => '<button class="chip' + (g.action ? ' act' : '') + '" type="button" data-v="' +
          String(it.v) + '">' + it.t + '</button>').join('') +
      '</div>'
    ).join('');
    row.querySelectorAll('.opt-row').forEach((grp) => {
      grp.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const k = grp.dataset.key;
          let v = chip.dataset.v;
          if (k === 'sound') v = (v === 'true');
          if (k === 'quick') {
            if (v === 'all') {
              state.steps = new Set();
              const g = geoFor();
              for (let st = g.minS; st <= g.maxS; st++) state.steps.add(st);
              flash('已全選：' + rangeText().main);
            } else if (v === 'none') {
              state.steps = new Set();
              flash('不限音域：面板上所有音都會出題');
            } else {
              state.steps = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
              flash('只看譜內：五線譜上的 9 個音');
            }
            AP.sfx.pop();
            refresh();
            return;
          }
          state[k] = v;
          AP.sfx.pop();
          markOptions();
          if (k === 'acc' || k === 'color' || k === 'naming') refresh();
          const g = OPTIONS.find((o) => o.key === k);
          const it = g && g.items.find((x) => String(x.v) === String(chip.dataset.v));
          if (g && it) flash(g.label + '：' + it.t);
        });
      });
    });
    markOptions();
  }

  function markOptions() {
    document.querySelectorAll('#optionsRow .opt-row').forEach((grp) => {
      const k = grp.dataset.key;
      if (k === 'quick') return;   // 動作型按鈕沒有「已選」狀態
      grp.querySelectorAll('.chip').forEach((chip) => {
        let v = chip.dataset.v;
        if (k === 'sound') v = (v === 'true');
        chip.classList.toggle('on', state[k] === v);
      });
    });
  }

  /* ---------- 點／拖曳選蘋果 ---------- */
  let paintMode = null; // true=選取, false=取消
  let painted = new Set();

  /* 以「最近的蘋果中心」判定命中：命中圓重疊時也不會選到隔壁那顆 */
  let appleHits = [];   // [{step, x, y}] 目前畫面上的蘋果中心（舞台座標）
  const HIT_RADIUS = 42;

  function refreshAppleHits() {
    appleHits = [];
    appleLayer.querySelectorAll('.setup-apple').forEach((g) => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
      if (m) appleHits.push({ step: Number(g.dataset.step), x: +m[1], y: +m[2] });
    });
  }

  function stepFromEvent(e) {
    const r = document.getElementById('stage').getBoundingClientRect();
    const x = (e.clientX - r.left) * (1280 / r.width);
    const y = (e.clientY - r.top) * (960 / r.height);
    let best = null, bestD = Infinity;
    for (const a of appleHits) {
      const d = (a.x - x) * (a.x - x) * 0.55 + (a.y - y) * (a.y - y);   // 水平方向權重稍低（斜向排列）
      if (d < bestD) { bestD = d; best = a; }
    }
    if (!best) return null;
    return Math.sqrt(bestD) <= HIT_RADIUS ? best.step : null;
  }

  /* 連續刷選：同一次拖曳中，把經過的蘋果設成同一個狀態 */
  function applyPaint(step) {
    if (step == null || painted.has(step)) return;
    painted.add(step);
    if (paintMode) state.steps.add(step); else state.steps.delete(step);
    refresh();
  }

  function bindApples() {
    appleLayer.addEventListener('pointerdown', (e) => {
      const step = stepFromEvent(e);
      if (step == null) return;
      e.preventDefault();
      AP.sfx.unlock();
      paintMode = !state.steps.has(step);
      painted = new Set([step]);
      if (paintMode) state.steps.add(step); else state.steps.delete(step);
      AP.sfx.note(T.pitchFromStep(state.clef, step).midi, { dur: 0.5, gain: 0.18 });
      refresh();
      appleLayer.setPointerCapture && appleLayer.setPointerCapture(e.pointerId);
    });
    appleLayer.addEventListener('pointermove', (e) => {
      if (paintMode === null || !state.paintOn) return;   // 預設關閉，避免一次掃掉一整排
      const step = stepFromEvent(e);
      applyPaint(step);
    });
    window.addEventListener('pointerup', () => { paintMode = null; painted = new Set(); });
  }

  /* ---------- 大字回饋（白板：老師背對螢幕也知道按到什麼） ---------- */
  let flashTimer = 0;
  function flash(msg) {
    const el = document.getElementById('setupFlash');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('show'), 1300);
  }

  /* ---------- 重設 ---------- */
  function resetAll() {
    state.naming = 'letter';
    state.mode = 'goal10';
    state.color = 'color';
    state.sound = true;
    state.acc = 'none';
    state.steps = new Set(centralSteps(state.clef));
    AP.sfx.pop();
    markOptions();
    refresh();
    flash('已重設：回到中央 Do–Si');
  }

  /* ---------- 開始 ---------- */
  function startGame() {
    const steps = Array.from(state.steps).sort((a, b) => a - b);
    const cfg = {
      clef: state.clef,
      steps,
      mode: state.mode,
      naming: state.naming,
      labelMode: 'show',
      colorMode: state.color,
      sound: state.sound,
      acc: state.acc === 'none' ? '' : state.acc
    };
    AP.Game.start(cfg);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    staffSvg = document.getElementById('setupStaff');
    bgSvg = document.getElementById('setupBg');
    bgSvg.innerHTML = C.skyBackdrop({});

    appleSvgEl = document.getElementById('setupApples');
    appleLayer = document.createElementNS(C.NS, 'g');
    appleLayer.setAttribute('id', 'setupAppleLayer');
    appleSvgEl.appendChild(appleLayer);
    bindApples();

    state.steps = new Set(centralSteps(state.clef));

    renderStaff();
    renderClefCards();
    renderOptions();
    refresh();

    document.getElementById('btnStart').addEventListener('click', startGame);
    document.getElementById('btnReset').addEventListener('click', resetAll);
    document.getElementById('btnPaint').addEventListener('click', () => {
      state.paintOn = !state.paintOn;
      document.getElementById('btnPaint').classList.toggle('on', state.paintOn);
      flash(state.paintOn ? '連續刷選：開（按住拖曳可連選）' : '連續刷選：關（一次只改一顆）');
    });
    document.getElementById('btnHelp').addEventListener('click', () => { AP.sfx.pop(); AP.ui.help(); });
    const homeJump = document.getElementById('btnHomeJump');
    if (homeJump) homeJump.addEventListener('click', () => { AP.sfx.pop(); AP.ui.show('home'); });
  }

  function show() {
    markClefCards();
    refresh();
  }

  return { init, show, state, geoFor, DOMAIN };
})();
