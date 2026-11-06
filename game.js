/* =========================================================
   遊戲頁（01）：蘋果樹上摘蘋果，拖到五線譜正確位置
   ========================================================= */
window.AP = window.AP || {};

AP.Game = (function () {
  const C = AP.core, T = AP.theory;

  const GEOM = C.makeGeom({ cxY: 645, spacing: 44, x0: 150, x1: 1150, minS: -4, maxS: 12 });

  /* 每個譜號可選的位置：高音譜 −4…12、低音譜 0…13（第一線～上加二間） */
  const DOMAIN = { treble: [-4, 12], bass: [0, 13] };   // 低音譜：第一線（s0）～ 上加二間（s13）
  const BAND_TOP = 388, BAND_H = 508, CONTENT_PAD = 64;

  /** 依譜號產生 geometry：五線譜在面板帶狀區域中垂直置中 */
  function geomFor(clefId) {
    const d = DOMAIN[clefId] || DOMAIN.treble;
    const span = (d[1] - d[0]) * GEOM.half;
    const cxY = BAND_TOP + BAND_H / 2 - span / 2 + (d[1] - 4) * GEOM.half;
    const g = Object.assign({}, GEOM, { cxY, minS: d[0], maxS: d[1] });
    g.lineY = (s) => g.cxY - (s - 4) * g.half;
    g.stepOf = (y) => C.clamp(Math.round((g.cxY - y) / g.half) + 4, d[0], d[1]);
    g.panelTop = Math.max(BAND_TOP, g.lineY(d[1]) - CONTENT_PAD);
    g.panelH = Math.min(BAND_TOP + BAND_H, g.lineY(d[0]) + CONTENT_PAD) - g.panelTop;
    return g;
  }
  let G = GEOM;   // 目前使用中的 geometry（start 時依譜號切換）
  const gUse = () => G;
  const TREE_SCALE = 0.62;
  const NOTE_SCALE = 0.44;
  const DRAG_SCALE = 0.72;

  /* 樹冠上的蘋果位置（避開樹葉接縫，盡量散開） */
  const SLOTS = [
    { x: 296, y: 172 }, { x: 552, y: 148 }, { x: 800, y: 146 }, { x: 1046, y: 174 },
    { x: 206, y: 268 }, { x: 462, y: 250 }, { x: 706, y: 240 }, { x: 946, y: 254 }, { x: 1148, y: 286 },
    { x: 340, y: 348 }, { x: 600, y: 336 }, { x: 860, y: 348 },
    { x: 448, y: 412 }, { x: 762, y: 402 }
  ];
  /* 面板上緣（低音譜時五線譜往下移，最下排 slot 會壓到面板）→ 只用前 12 個位置 */
  const SAFE_SLOTS = { treble: SLOTS.length, bass: 12 };
  const COLS = 12, COL_X0 = 396, COL_W = 66;
  const GOAL = 10;   // 摘滿 10 顆過關

  const S = {
    cfg: null, running: false,
    score: 0, wrong: 0, streak: 0, bestStreak: 0,
    hearts: 3, maxHearts: 3,
    apples: [], placed: [], columnsUsed: 0,
    spawnTimer: null, selected: null, drag: null,
    hintOn: false, solved: 0, goal: 0, pitchPool: [],
    runId: 0, endTimer: null
  };

  let bgSvg, staffSvg, notesLayer, dragLayer, appleLayer, ghostLayer;
  const els = {};

  /* ================= 背景 ================= */
  /* 固定種子亂數，讓樹每次長得一樣 */
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 一片葉子（以中心為原點） */
  function leafShape(x, y, len, wid, rot, fill, op) {
    return '<path d="M 0,0 C ' + (-wid) + ',' + (-len * 0.45) + ' ' + (-wid * 0.6) + ',' + (-len) + ' 0,' + (-len) +
      ' C ' + (wid * 0.6) + ',' + (-len) + ' ' + wid + ',' + (-len * 0.45) + ' 0,0 Z" fill="' + fill + '"' +
      (op ? ' opacity="' + op + '"' : '') +
      ' transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + rot.toFixed(0) + ')"/>';
  }

  /* 一棵「樹叢」的邊緣：以波浪狀輪廓做出自然的葉團 */
  function blobPath(cx, cy, rx, ry, bumps, rnd, amp) {
    const pts = [];
    const n = bumps * 2;
    for (let i = 0; i < n; i++) {
      const t = (Math.PI * 2 * i) / n;
      const k = 1 + (i % 2 ? (rnd() * 0.55 + 0.45) : (rnd() * 0.35)) * (amp || 0.12);
      pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
    }
    let d = 'M ' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
      d += ' Q ' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' ' + mx.toFixed(1) + ',' + my.toFixed(1);
    }
    return d + ' Z';
  }

  /* 一團葉叢：由數片葉子呈放射狀組成 */
  function leafCluster(x, y, r, rnd, tones, op) {
    let s = '<g>';
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rnd() * 0.6;
      const px = x + Math.cos(a) * r * 0.42;
      const py = y + Math.sin(a) * r * 0.36;
      s += leafShape(px, py, r * (0.8 + rnd() * 0.5), r * (0.3 + rnd() * 0.14),
        a * 180 / Math.PI - 90 + (rnd() * 26 - 13),
        tones[Math.floor(rnd() * tones.length)], op || '0.95');
    }
    s += '</g>';
    return s;
  }

  /* 樹冠：多層次的葉叢 */
  function canopySVG() {
    const rnd = seeded(20241105);
    const cl = [
      [238, 214, 140, 104], [372, 132, 152, 108], [520, 186, 156, 116], [664, 116, 158, 106],
      [812, 168, 156, 112], [952, 116, 146, 100], [1078, 196, 132, 96], [1160, 268, 96, 74],
      [300, 320, 132, 92], [452, 288, 146, 98], [608, 300, 152, 98], [764, 282, 144, 96],
      [912, 306, 136, 92], [1042, 328, 118, 80], [172, 300, 86, 66],
      [520, 54, 122, 72], [700, 38, 116, 66], [866, 44, 104, 60], [1000, 58, 92, 54],
      [388, 46, 96, 58], [250, 92, 88, 56]
    ];

    let s = '';
    // 1) 底層陰影 + 主體（深）
    s += '<g>';
    cl.forEach((b, i) => {
      s += '<path d="' + blobPath(b[0], b[1] + 22, b[2] * 0.98, b[3] * 0.95, 7, seeded(100 + i), 0.1) +
        '" fill="#31691d" opacity="0.6"/>';
    });
    s += '</g>';

    // 2) 主體
    s += '<g>';
    cl.forEach((b, i) => {
      s += '<path d="' + blobPath(b[0], b[1], b[2], b[3], 7, seeded(500 + i), 0.13) +
        '" fill="url(#' + (i % 3 === 0 ? 'canopyA' : i % 3 === 1 ? 'canopyB' : 'canopyC') + ')"/>';
    });
    s += '</g>';

    // 3) 外緣葉叢（讓輪廓長出葉子）
    let rim = '';
    cl.forEach((b, i) => {
      const n = Math.round(b[2] / 17);
      for (let k = 0; k < n; k++) {
        const a = Math.PI * 2 * (k / n) + rnd() * 0.3;
        const px = b[0] + Math.cos(a) * b[2] * 0.93;
        const py = b[1] + Math.sin(a) * b[3] * 0.9;
        rim += leafCluster(px, py, 16 + rnd() * 10, rnd, ['#6dad39', '#5c9a30', '#79bf45', '#4d8a28'], (0.9 + rnd() * 0.1).toFixed(2));
      }
    });
    s += '<g>' + rim + '</g>';

    // 4) 中層亮面
    s += '<g>';
    cl.forEach((b) => {
      s += '<ellipse cx="' + (b[0] - b[2] * 0.14) + '" cy="' + (b[1] - b[3] * 0.24) + '" rx="' + (b[2] * 0.7) +
        '" ry="' + (b[3] * 0.66) + '" fill="#7cc247" opacity="0.5"/>';
    });
    s += '</g>';

    // 5) 內部葉叢與亮點
    let inner = '';
    const r2 = seeded(7723);
    for (let i = 0; i < 46; i++) {
      const b = cl[Math.floor(r2() * cl.length)];
      const a = r2() * Math.PI * 2;
      const rr = Math.sqrt(r2()) * 0.78;
      inner += leafCluster(b[0] + Math.cos(a) * b[2] * rr, b[1] + Math.sin(a) * b[3] * rr, 12 + r2() * 9, r2,
        ['#8fd15a', '#a2dc68', '#79bf45', '#b3e57c'], '0.55');
    }
    let dots = '';
    for (let i = 0; i < 120; i++) {
      const b = cl[Math.floor(r2() * cl.length)];
      const a = r2() * Math.PI * 2;
      const rr = Math.sqrt(r2()) * 0.8;
      dots += '<ellipse cx="' + (b[0] + Math.cos(a) * b[2] * rr).toFixed(0) + '" cy="' +
        (b[1] + Math.sin(a) * b[3] * rr).toFixed(0) + '" rx="' + (6 + r2() * 13).toFixed(0) +
        '" ry="' + (3.5 + r2() * 6).toFixed(0) + '" fill="' + (r2() > 0.5 ? '#c2f096' : '#a6e06a') +
        '" opacity="' + (0.12 + r2() * 0.2).toFixed(2) + '" transform="rotate(' + (r2() * 80 - 40).toFixed(0) +
        ')' + '"/>';
    }
    s += '<g>' + inner + dots + '</g>';

    // 6) 上緣高光（雲朵狀）
    const hr = seeded(3311);
    let hi = '';
    for (let i = 0; i < 16; i++) {
      const b = cl[Math.floor(hr() * cl.length)];
      const a = -Math.PI * (0.15 + hr() * 0.7);
      const px = b[0] + Math.cos(a) * b[2] * 0.7;
      const py = b[1] + Math.sin(a) * b[3] * 0.72;
      hi += '<ellipse cx="' + px.toFixed(0) + '" cy="' + py.toFixed(0) + '" rx="' + (30 + hr() * 46).toFixed(0) +
        '" ry="' + (14 + hr() * 18).toFixed(0) + '" fill="#c9f294" opacity="' + (0.2 + hr() * 0.24).toFixed(2) + '"/>';
    }
    s += '<g>' + hi + '</g>';

    // 7) 上緣暖光
    s += '<g opacity="0.45">' +
      '<ellipse cx="700" cy="76" rx="190" ry="70" fill="#e6ffb6" opacity="0.35"/>' +
      '<ellipse cx="900" cy="132" rx="130" ry="56" fill="#f2ffd0" opacity="0.25"/>' +
      '<ellipse cx="430" cy="108" rx="120" ry="50" fill="#dcfaa8" opacity="0.22"/>' +
      '</g>';
    return s;
  }

  /* 樹幹 + 樹枝 */
  function trunkSVG() {
    let s = '';
    // 主幹（上窄下寬、微微彎曲）
    s += '<path d="M 592,470 C 588,540 584,620 572,700 C 560,780 546,846 528,896 ' +
      'C 566,914 610,918 646,908 C 664,918 700,916 730,904 ' +
      'C 716,846 704,776 696,700 C 686,614 682,538 680,470 Z" ' +
      'fill="url(#trunkG)" stroke="#66401e" stroke-width="4"/>';
    // 根部
    s += '<path d="M 528,896 C 500,888 478,876 462,860 C 492,868 516,874 540,876 Z" fill="#a06c3c" stroke="#66401e" stroke-width="3"/>' +
      '<path d="M 730,904 C 762,894 788,880 806,860 C 774,872 752,880 722,882 Z" fill="#a06c3c" stroke="#66401e" stroke-width="3"/>';
    // 樹皮
    let bark = '';
    const rnd = seeded(4242);
    for (let i = 0; i < 12; i++) {
      const bx = 588 + i * 8.6;
      const y0 = 492 + rnd() * 80;
      const y1 = 820 + rnd() * 70;
      bark += '<path d="M ' + bx.toFixed(0) + ',' + y0.toFixed(0) + ' C ' + (bx + 6 + rnd() * 8).toFixed(0) + ',' +
        ((y0 + y1) * 0.5).toFixed(0) + ' ' + (bx - 5 - rnd() * 7).toFixed(0) + ',' + ((y0 + y1) * 0.74).toFixed(0) + ' ' +
        (bx + 3).toFixed(0) + ',' + y1.toFixed(0) + '" fill="none" stroke="#6c4523" stroke-width="' +
        (1.6 + rnd() * 2).toFixed(1) + '" opacity="' + (0.22 + rnd() * 0.22).toFixed(2) + '" stroke-linecap="round"/>';
    }
    s += '<g>' + bark + '</g>';
    // 樹瘤
    s += '<g opacity="0.9">' +
      '<ellipse cx="622" cy="742" rx="21" ry="14" fill="#8a5b2e" stroke="#5f3b1c" stroke-width="2.4"/>' +
      '<ellipse cx="622" cy="742" rx="11" ry="7" fill="none" stroke="#a27245" stroke-width="2.2"/>' +
      '</g>';
    // 亮面
    s += '<path d="M 610,486 C 606,570 600,646 588,720 C 576,788 562,846 546,884" fill="none" stroke="#d9a86f" stroke-width="10" opacity="0.35" stroke-linecap="round"/>';

    // 樹枝（向樹冠內伸展，不壓到譜面）
    const branches = [
      ['M 606,500 C 556,478 516,442 486,402', 22, 12],
      ['M 668,500 C 722,476 762,440 792,398', 21, 11],
      ['M 640,474 C 632,424 638,382 650,346', 17, 9],
      ['M 610,468 C 590,436 578,408 572,380', 12, 7],
      ['M 662,468 C 682,436 694,408 700,380', 12, 7]
    ];
    branches.forEach((b) => {
      s += '<path d="' + b[0] + '" fill="none" stroke="#6c4523" stroke-width="' + b[1] + '" stroke-linecap="round"/>';
      s += '<path d="' + b[0] + '" fill="none" stroke="url(#branchG)" stroke-width="' + b[2] + '" stroke-linecap="round"/>';
      s += '<path d="' + b[0] + '" fill="none" stroke="#e0b184" stroke-width="' + (b[2] * 0.3).toFixed(1) +
        '" stroke-linecap="round" stroke-dasharray="20 34" opacity="0.5"/>';
    });
    s += '<g opacity="0.9">' + C.grassTuft(516, 900, 1.0, '#4f9c35') + C.grassTuft(744, 902, 1.05, '#3f7d29') + '</g>';
    return s;
  }

  /* 藤蔓、花、蝴蝶 */
  function decorSVG() {
    const rnd = seeded(9091);
    let s = '';
    // 垂掛藤蔓
    const pieces = [
      { x0: 210, y0: 326, len: 96, dir: 1 }, { x0: 1008, y0: 344, len: 76, dir: -1 },
      { x0: 1156, y0: 296, len: 118, dir: -1 }, { x0: 286, y0: 120, len: 66, dir: 1 },
      { x0: 872, y0: 108, len: 84, dir: -1 }
    ];
    pieces.forEach((v) => {
      const cx = v.x0 + v.dir * 34;
      const cy = v.y0 + v.len * 0.6;
      s += '<path d="M ' + v.x0 + ',' + v.y0 + ' Q ' + cx + ',' + cy + ' ' + (v.x0 + v.dir * 10) + ',' + (v.y0 + v.len) +
        '" fill="none" stroke="#4a8b28" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>';
      for (let i = 1; i <= 5; i++) {
        const t = i / 6;
        const px = (1 - t) * (1 - t) * v.x0 + 2 * (1 - t) * t * cx + t * t * (v.x0 + v.dir * 10);
        const py = (1 - t) * (1 - t) * v.y0 + 2 * (1 - t) * t * cy + t * t * (v.y0 + v.len);
        s += leafShape(px, py, 15, 6, v.dir > 0 ? 40 : -40, i % 2 ? '#78bd45' : '#94d45c', 0.95);
      }
    });
    // 花朵
    const flowers = [[244, 168], [962, 118], [1120, 226], [412, 62], [700, 44]];
    flowers.forEach((f) => {
      s += '<g transform="translate(' + f[0] + ',' + f[1] + ')">';
      for (let i = 0; i < 5; i++) {
        s += '<ellipse cx="0" cy="-8" rx="6.4" ry="9" fill="' + (rnd() > 0.5 ? '#fff2f7' : '#ffe6ef') +
          '" stroke="#f2b9cd" stroke-width="1.2" transform="rotate(' + (i * 72) + ')"/>';
      }
      s += '<circle r="5.2" fill="#ffcf3d" stroke="#e0a500" stroke-width="1.2"/></g>';
    });
    // 蝴蝶
    s += '<g class="butterfly" transform="translate(1150,420)"><g class="flap">' +
      '<ellipse cx="-7" cy="-4" rx="9" ry="7" fill="#ff9ec4" stroke="#d8608f" stroke-width="1.4" transform="rotate(-24)"/>' +
      '<ellipse cx="7" cy="-4" rx="9" ry="7" fill="#ffb8d4" stroke="#d8608f" stroke-width="1.4" transform="rotate(24)"/>' +
      '<ellipse cx="-5" cy="5" rx="6" ry="4.6" fill="#ffc9de" stroke="#d8608f" stroke-width="1.2" transform="rotate(-16)"/>' +
      '<ellipse cx="5" cy="5" rx="6" ry="4.6" fill="#ffd7e6" stroke="#d8608f" stroke-width="1.2" transform="rotate(16)"/>' +
      '<rect x="-1.4" y="-7" width="2.8" height="14" rx="1.4" fill="#7a4a5e"/></g></g>';
    s += '<g class="butterfly2" transform="translate(150,486) scale(0.85)"><g class="flap">' +
      '<ellipse cx="-7" cy="-4" rx="9" ry="7" fill="#ffe08a" stroke="#c99b1f" stroke-width="1.4" transform="rotate(-24)"/>' +
      '<ellipse cx="7" cy="-4" rx="9" ry="7" fill="#ffeaa8" stroke="#c99b1f" stroke-width="1.4" transform="rotate(24)"/>' +
      '<rect x="-1.4" y="-7" width="2.8" height="14" rx="1.4" fill="#8a6a3a"/></g></g>';
    // 飄落的葉子
    for (let i = 0; i < 4; i++) {
      s += '<g class="float-leaf" style="animation-delay:' + (i * 1.7).toFixed(1) + 's" transform="translate(' +
        (200 + i * 260) + ',380)">' + leafShape(0, 0, 16, 6, 20 + i * 40, '#9ad35a', 0.85) + '</g>';
    }
    return s;
  }
  function buildBackground() {
    let s = '';
    s += '<defs>' +
      '<linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#a8d8ee"/><stop offset="36%" stop-color="#cfe8f6"/>' +
      '<stop offset="72%" stop-color="#e9f4e1"/><stop offset="100%" stop-color="#dcf0cb"/></linearGradient>' +
      '<radialGradient id="canopyA" cx="36%" cy="26%" r="84%">' +
      '<stop offset="0%" stop-color="#9adf66"/><stop offset="62%" stop-color="#6cb536"/><stop offset="100%" stop-color="#4e8f27"/></radialGradient>' +
      '<radialGradient id="canopyB" cx="52%" cy="32%" r="78%">' +
      '<stop offset="0%" stop-color="#aae271"/><stop offset="60%" stop-color="#63a830"/><stop offset="100%" stop-color="#457f22"/></radialGradient>' +
      '<radialGradient id="canopyC" cx="44%" cy="30%" r="80%">' +
      '<stop offset="0%" stop-color="#8fd35b"/><stop offset="70%" stop-color="#5da02c"/><stop offset="100%" stop-color="#3f7a1e"/></radialGradient>' +
      '<linearGradient id="trunkG" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0%" stop-color="#7d5029"/><stop offset="26%" stop-color="#c08a55"/>' +
      '<stop offset="55%" stop-color="#ab7543"/><stop offset="100%" stop-color="#774922"/></linearGradient>' +
      '<linearGradient id="branchG" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#c6905c"/><stop offset="100%" stop-color="#8d5f31"/></linearGradient>' +
      '<linearGradient id="grassG2" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#86c054"/><stop offset="100%" stop-color="#4d8a2e"/></linearGradient>' +
      '<linearGradient id="hillG2" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#d3e9ad"/><stop offset="100%" stop-color="#a7cf7b"/></linearGradient>' +
      '<radialGradient id="shadeG" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="#2f5f18" stop-opacity="0.6"/><stop offset="100%" stop-color="#2f5f18" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="#fffbe0" stop-opacity="0.95"/><stop offset="100%" stop-color="#fffbe0" stop-opacity="0"/></radialGradient>' +
      '<filter id="canopyShadow" x="-12%" y="-12%" width="126%" height="130%">' +
      '<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#1c4a10" flood-opacity="0.4"/></filter>' +
      '<filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">' +
      '<feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#1c3a05" flood-opacity="0.35"/></filter>' +
      '</defs>';

    s += '<rect width="1280" height="960" fill="url(#gSky)"/>';
    s += '<circle cx="1146" cy="86" r="150" fill="url(#sunGlow)"/>';
    s += '<circle cx="1146" cy="86" r="52" fill="#fff8cf" opacity="0.95"/>';
    // 陽光光束
    s += '<g opacity="0.16" fill="#fff8d0">' +
      '<path d="M 1146,86 L 820,960 L 980,960 Z"/>' +
      '<path d="M 1146,86 L 1080,960 L 1180,960 Z"/>' +
      '<path d="M 1146,86 L 640,700 L 700,760 Z"/>' +
      '</g>';
    s += C.cloud(190, 96, 0.95, 0.9) + C.cloud(600, 54, 0.6, 0.68) + C.cloud(880, 140, 0.5, 0.55);
    // 遠山與遠樹
    s += '<path d="M 0,556 C 200,498 400,538 620,508 C 860,476 1080,528 1280,490 L 1280,960 L 0,960 Z" fill="url(#hillG2)" opacity="0.9"/>';
    s += '<g opacity="0.35">' +
      '<ellipse cx="120" cy="486" rx="46" ry="34" fill="#7fb15a"/><rect x="116" y="500" width="8" height="30" fill="#8a6a45"/>' +
      '<ellipse cx="1190" cy="470" rx="54" ry="38" fill="#79ab55"/><rect x="1186" y="492" width="9" height="34" fill="#8a6a45"/>' +
      '</g>';
    // 地面
    s += '<ellipse cx="642" cy="902" rx="210" ry="38" fill="url(#shadeG)"/>';
    s += '<path d="M 0,868 C 240,846 460,884 700,866 C 940,848 1120,880 1280,860 L 1280,960 L 0,960 Z" fill="url(#grassG2)"/>';

    // 樹（樹冠在後、樹幹在中、再疊一層前景葉片）
    s += '<g class="tree" filter="url(#softShadow)">' + trunkSVG() + '</g>';
    s += '<g class="canopy" filter="url(#canopyShadow)">' + canopySVG() + '</g>';
    s += '<g class="trunk-front">' + trunkFront() + '</g>';
    s += decorSVG();

    // 前景草與花
    let tufts = '';
    [24, 120, 240, 360, 470, 610, 730, 860, 980, 1100, 1220].forEach((x, i) => {
      tufts += C.grassTuft(x, 960, 1.2 + (i % 3) * 0.2, i % 2 ? '#3f7d29' : '#5aa336');
    });
    s += tufts;
    [[70, 900, 0.8], [300, 926, 0.7], [640, 930, 0.85], [940, 902, 0.75], [1180, 930, 0.8]]
      .forEach((d) => { s += C.daisy(d[0], d[1], d[2]); });
    s += C.daisy(210, 902, 0.6, '#ffe9a8') + C.daisy(1060, 918, 0.65, '#ffe9a8');

    s += '<style>' +
      '.tree,.canopy,.trunk-front{animation:treeSway 9s ease-in-out infinite}' +
      '@keyframes treeSway{0%,100%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(2px,-3px) rotate(0.25deg)}}' +
      '.butterfly{animation:flyA 12s ease-in-out infinite}.butterfly2{animation:flyB 14s ease-in-out infinite}' +
      '@keyframes flyA{0%,100%{transform:translate(0,0)}30%{transform:translate(-60px,-40px)}60%{transform:translate(-20px,26px)}85%{transform:translate(30px,-14px)}}' +
      '@keyframes flyB{0%,100%{transform:translate(0,0) scale(.85)}40%{transform:translate(70px,-30px) scale(.85)}70%{transform:translate(20px,20px) scale(.85)}}' +
      '.flap{animation:flap .5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}' +
      '@keyframes flap{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.6)}}' +
      '.float-leaf{animation:leafFall 9s linear infinite;opacity:0}' +
      '@keyframes leafFall{0%{transform:translate(0,0) rotate(0);opacity:0}10%{opacity:.9}50%{transform:translate(30px,120px) rotate(120deg)}100%{transform:translate(-20px,300px) rotate(280deg);opacity:0}}' +
      '</style>';
    bgSvg.innerHTML = s;
  }

  /* 樹冠前面的一小段樹枝與葉片，增加層次 */
  function trunkFront() {
    let s = '';
    s += '<path d="M 646,470 C 640,440 646,412 660,388" fill="none" stroke="#8a5a32" stroke-width="14" stroke-linecap="round"/>';
    s += '<path d="M 600,470 C 584,442 574,414 572,386" fill="none" stroke="#8a5a32" stroke-width="11" stroke-linecap="round"/>';
    s += '<g opacity="0.95">' +
      leafShape(576, 372, 20, 8, -30, '#7cbf46') + leafShape(590, 356, 18, 7, 12, '#95d35e') +
      leafShape(662, 378, 19, 8, 26, '#7cbf46') + leafShape(650, 360, 17, 7, -16, '#a4dd6c') +
      leafShape(608, 342, 16, 6, 60, '#8ccc52') +
      '</g>';
    return s;
  }

  function buildStaff() {
    const g = G;
    let s = '';
    s += '<defs><linearGradient id="panelG2" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>' +
      '<stop offset="55%" stop-color="#ffffff" stop-opacity="0.46"/>' +
      '<stop offset="100%" stop-color="#ffffff" stop-opacity="0.56"/></linearGradient></defs>';
    s += '<rect x="70" y="' + g.panelTop + '" width="1140" height="' + g.panelH + '" rx="34" fill="url(#panelG2)" stroke="#ffffff" stroke-width="5" stroke-opacity="0.75"/>';
    s += C.staffLines(g);
    s += C.clefMarkup(S.cfg.clef, 180, g.cxY, g.spacing, '#20262c');
    staffSvg.innerHTML = s;
  }

  /* ================= 蘋果 ================= */
  function makeAppleNode(pitch, x, y, scale, useColor, showLetter) {
    const node = C.appleNode({
      color: useColor, letter: showLetter ? pitch.letter : '', dir: showLetter ? pitch.dir : 'mid',
      octave: pitch.octave, showLetter: showLetter, showOctave: false,
      labelMode: S.cfg.naming || 'letter',
      acc: showLetter ? (pitch.acc || '') : '',
      x: x, y: y, scale: scale
    });
    // 包一層做「彈出」動畫，才不會和定位 transform 打架
    const pop = C.el('g', { class: 'pop' });
    while (node.childNodes.length > 1) pop.appendChild(node.firstChild);
    node.insertBefore(pop, node.firstChild);
    return node;
  }

  function occupiedSlots() {
    return new Set(S.apples.filter((a) => !a.placed).map((a) => a.slot));
  }
  function pitchesOnTree() {
    return new Set(S.apples.filter((a) => !a.placed).map((a) => a.step));
  }
  function chooseStep() {
    const onTree = pitchesOnTree();
    const cand = S.pitchPool.filter((s) => !onTree.has(s));
    if (!cand.length) return null;
    const everPlaced = new Set(S.placed.map((a) => a.step));
    const fresh = cand.filter((s) => !everPlaced.has(s));
    if (fresh.length) return C.pick(fresh);
    // 全都放過了：挑最久沒出現的
    const lastSeen = {};
    S.placed.forEach((a, i) => { lastSeen[a.step] = i; });
    cand.sort((a, b) => (lastSeen[a] == null ? -1 : lastSeen[a]) - (lastSeen[b] == null ? -1 : lastSeen[b]));
    return cand[0];
  }

  function spawnApple() {
    if (!S.running) return;
    const remain = Math.max(1, S.goal - S.solved);
    const liveCount = S.apples.filter((a) => !a.placed).length;
    if (liveCount >= Math.min(6, S.pitchPool.length, remain)) return;
    const step = chooseStep();
    if (step == null) return;
    const occ = occupiedSlots();
    const maxSlot = SAFE_SLOTS[S.cfg.clef] || SLOTS.length;
    const free = SLOTS.map((sl, i) => i).filter((i) => i < maxSlot && !occ.has(i));
    if (!free.length) return;
    const slot = C.pick(free);
    const pitch = T.pitchFromStep(S.cfg.clef, step, S.cfg.acc ? { acc: S.cfg.acc } : {});
    const useColor = S.cfg.colorMode === 'color' ? pitch.color : '#e02b25';
    const node = makeAppleNode(pitch, SLOTS[slot].x, SLOTS[slot].y, TREE_SCALE, useColor, S.cfg.labelMode === 'show');
    const halo = C.el('g', { class: 'tree-halo' });
    halo.innerHTML = '<circle r="52" fill="#ffffff" opacity="0.30"/><circle r="42" fill="#ffffff" opacity="0.18"/>';
    halo.setAttribute('transform', 'translate(' + SLOTS[slot].x + ',' + SLOTS[slot].y + ')');
    halo.__haloFor = C.uid('h');
    node.__haloRef = halo;
    appleLayer.appendChild(halo);
    appleLayer.appendChild(node);
    const a = {
      key: C.uid('ap'), step, slot, node, pitch, placed: false, tries: 0,
      x: SLOTS[slot].x, y: SLOTS[slot].y, scale: TREE_SCALE
    };
    node.__apple = a;
    node.style.transform = 'translate(' + a.x + 'px,' + a.y + 'px) scale(' + a.scale + ')';
    S.apples.push(a);
    bindAppleNode(a);
  }

  function updateAppleCount() {
    const remain = Math.max(1, S.goal - S.solved);
    const target = Math.min(6, S.pitchPool.length, remain);
    const live = S.apples.filter((a) => !a.placed).length;
    let n = 0;
    for (let i = live; i < target; i++) {
      setTimeout(() => { if (S.running) spawnApple(); }, n * 200);
      n++;
    }
  }

  /* ================= 位置 ================= */
  function syncHalo(a) {
    const h = a.node.__haloRef;
    if (!h) return;
    if (a.placed) { h.remove(); a.node.__haloRef = null; return; }
    h.setAttribute('transform', 'translate(' + a.x + ',' + a.y + ')');
    h.style.opacity = (a.scale > 0.66) ? 0 : 1;
  }

  function setPos(a, x, y, scale, animate) {
    a.x = x; a.y = y; a.scale = scale;
    if (animate) {
      a.node.classList.add('moving');
      setTimeout(() => a.node.classList.remove('moving'), 400);
    }
    a.node.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    syncHalo(a);
  }

  function toStage(e) {
    const r = els.stage.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (1280 / r.width),
      y: (e.clientY - r.top) * (960 / r.height)
    };
  }

  function bindAppleNode(a) {
    const n = a.node;
    n.addEventListener('pointerdown', (e) => {
      if (a.placed || S.drag || !S.running) return;
      e.preventDefault();
      AP.sfx.unlock();
      const p = toStage(e);
      S.drag = { apple: a, dx: a.x - p.x, dy: a.y - p.y, moved: false, sx: p.x, sy: p.y };
      notesLayer.appendChild(n);
      n.classList.add('dragging');
      setPos(a, p.x + S.drag.dx, p.y + S.drag.dy, DRAG_SCALE, false);
      AP.sfx.note(a.pitch.midi, { dur: 0.5, gain: 0.18 });
      selectApple(null);
      try { n.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    });
    n.addEventListener('pointermove', (e) => {
      if (!S.drag || S.drag.apple !== a) return;
      const p = toStage(e);
      if (Math.abs(p.x - S.drag.sx) + Math.abs(p.y - S.drag.sy) > 7) S.drag.moved = true;
      const x = p.x + S.drag.dx, y = p.y + S.drag.dy;
      setPos(a, x, y, DRAG_SCALE, false);
      if (S.drag.moved) showGhost(y, x);
    });
    n.addEventListener('pointerup', (e) => {
      if (!S.drag || S.drag.apple !== a) return;
      const p = toStage(e);
      const moved = S.drag.moved;
      const x = p.x + S.drag.dx, y = p.y + S.drag.dy;
      S.drag = null;
      n.classList.remove('dragging');
      hideGhost();
      if (!moved) { selectApple(a); setPos(a, a.x, a.y, TREE_SCALE, true); return; }
      if (x < G.x0 - 160 || x > G.x1 + 160 || y < 380 || y > 900) { flyHome(a); return; }
      tryPlace(a, y, x);
    });
    n.addEventListener('pointercancel', () => {
      if (!S.drag || S.drag.apple !== a) return;
      S.drag = null; hideGhost(); n.classList.remove('dragging'); flyHome(a);
    });
  }

  function flyHome(a) {
    const sl = SLOTS[a.slot];
    setPos(a, sl.x, sl.y, TREE_SCALE, true);
  }

  /* ================= 判定 ================= */
  function tryPlace(a, y, x) {
    if (a.placed) return;
    const step = G.stepOf(y);
    if (Math.abs(y - G.lineY(step)) > G.spacing * 0.8) { flyHome(a); return; }
    if (step === a.step) {
      placeCorrect(a);
    } else {
      a.tries++;
      S.wrong++;
      S.streak = 0;
      updateCombo();
      loseHeart();
      AP.sfx.wrong();
      a.node.classList.add('wiggle');
      setTimeout(() => a.node.classList.remove('wiggle'), 470);
      const target = a.pitch;
      C.toast('再想想～ 這是 <b>' + T.nameText(target, S.cfg.naming || 'letter', true, true) + '</b>', 1500);
      flyHome(a);
      if (a.tries >= 2) showCorrectHint(a);
    }
  }

  function placeCorrect(a) {
    a.placed = true;
    const step = a.step;
    // 依放置順序往右排；若同一格已有相同音，往後找下一個空位
    let col = S.columnsUsed % COLS;
    const samePitchCols = new Set(S.placed.filter((q) => q.step === step).map((q) => q.col));
    let guard = 0;
    while (samePitchCols.has(col) && guard++ < COLS) col = (col + 1) % COLS;
    S.columnsUsed++;
    a.col = col;
    const x = COL_X0 + col * COL_W;
    const y = G.lineY(step);
    a.node.classList.remove('dragging');
    a.node.classList.add('note-node');
    a.node.style.transformBox = 'fill-box';
    a.node.style.transformOrigin = 'center';
    setPos(a, x, y, NOTE_SCALE, true);
    if (step < 0 || step > 8) {
      const lg = C.el('g', { class: 'note-node' });
      lg.innerHTML = C.ledger(G, step, x, 58);
      if (a.node.parentNode === notesLayer) notesLayer.insertBefore(lg, a.node); else notesLayer.appendChild(lg);
    }
    if (a.pitch.acc) {
      const ag = C.el('g', { class: 'note-node' });
      ag.innerHTML = C.accidentalMarkup(a.pitch.acc, x - 44, y, G.spacing, '#20262c');
      if (a.node.parentNode === notesLayer) notesLayer.insertBefore(ag, a.node); else notesLayer.appendChild(ag);
    }
    const tick = C.el('g', { class: 'spark', transform: 'translate(' + (x + 24) + ',' + (y - 20) + ')' });
    tick.innerHTML = '<circle r="10" fill="#4caf2a" stroke="#2f7320" stroke-width="2"/>' +
      '<path d="M -4.5,0 L -1,4.5 L 5.5,-4.5" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>';
    notesLayer.appendChild(tick);
    setTimeout(() => tick.remove(), 760);

    sparkle(x, y, a.pitch.color);
    AP.sfx.success(a.pitch.midi);
    S.score++; S.solved++; S.streak++;
    if (S.streak > S.bestStreak) S.bestStreak = S.streak;
    S.placed.push(a);
    updateScore();
    updateCombo();
    floatText(x, y - 40, '＋1');
    if (S.streak % 5 === 0 && S.hearts < S.maxHearts) {
      S.hearts++; renderHearts(true);
      C.toast('連對 ' + S.streak + ' 顆，補回一顆 ❤', 1200);
    }
    if (S.solved >= S.goal) {
      clearTimeout(S.endTimer);
      const runId = S.runId;
      S.endTimer = setTimeout(() => { if (S.runId === runId) finish(); }, 640);
    }
    else updateAppleCount();
  }

  function showCorrectHint(a) {
    const y = G.lineY(a.step);
    const band = C.el('g', { class: 'drop-cue' });
    band.innerHTML = '<rect x="150" y="' + (y - 17) + '" width="1000" height="34" rx="17" fill="#ffe066" opacity="0.6"/>' +
      '<circle cx="' + a.x + '" cy="' + a.y + '" r="44" fill="none" stroke="#ffd93b" stroke-width="5"/>';
    notesLayer.appendChild(band);
    requestAnimationFrame(() => band.classList.add('show'));
    setTimeout(() => { band.classList.remove('show'); setTimeout(() => band.remove(), 320); }, 1600);
  }

  function showGhost(y, x) {
    if (x < G.x0 - 80 || x > G.x1 + 80) { hideGhost(); return; }
    const step = G.stepOf(y);
    const gy = G.lineY(step);
    const gx = C.clamp(x, G.x0 + 30, G.x1 - 30);
    let s = '<rect x="150" y="' + (gy - 16) + '" width="1000" height="32" rx="16" fill="#fff3b0" opacity="0.7"/>';
    s += C.ledger(G, step, gx, 58);
    s += '<circle cx="' + gx + '" cy="' + gy + '" r="24" fill="#fff" opacity="0.6" stroke="#ffffff" stroke-width="3" stroke-dasharray="6 6"/>';
    if (S.hintOn) {
      const p = T.pitchFromStep(S.cfg.clef, step, S.cfg.acc ? { acc: S.cfg.acc } : {});
      const label = T.nameHTML(p, S.cfg.naming || 'letter', true, true);
      s += '<foreignObject x="' + (gx + 26) + '" y="' + (gy - 54) + '" width="150" height="44">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" class="hint-name">' + label + '</div></foreignObject>';
    }
    ghostLayer.innerHTML = '<g class="ghost-inner">' + s + '</g>';
    ghostLayer.classList.add('show');
  }
  function hideGhost() { ghostLayer.innerHTML = ''; ghostLayer.classList.remove('show'); }

  /* ================= 特效 ================= */
  function sparkle(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10 + C.rand(-0.2, 0.2);
      const dist = C.rand(26, 58);
      const g = C.el('g', { class: 'spark', transform: 'translate(' + x + ',' + y + ')' });
      g.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
      g.style.setProperty('--dy', (Math.sin(ang) * dist - 14).toFixed(0) + 'px');
      g.innerHTML = i % 3 === 0
        ? '<path d="M 0,-8 L 2.4,-2.4 L 8,0 L 2.4,2.4 L 0,8 L -2.4,2.4 L -8,0 L -2.4,-2.4 Z" fill="#ffd93b"/>'
        : '<circle r="' + C.rand(2.5, 5).toFixed(1) + '" fill="' + (i % 2 ? '#ffffff' : color) + '"/>';
      notesLayer.appendChild(g);
      setTimeout(() => g.remove(), 800);
    }
  }

  function floatText(x, y, txt) {
    const d = document.createElement('div');
    d.className = 'float-text';
    d.textContent = txt;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    els.stage.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  /* ================= HUD ================= */
  function updateScore() {
    els.scoreNum.textContent = S.score;
    els.scoreBadge.classList.remove('bump');
    void els.scoreBadge.offsetWidth;
    els.scoreBadge.classList.add('bump');
    updateProgress();
  }
  function updateCombo() {
    if (S.streak >= 2) {
      els.combo.textContent = '連對 ×' + S.streak;
      els.combo.classList.add('show');
    } else els.combo.classList.remove('show');
  }
  function renderHearts(pop) {
    let s = '';
    for (let i = 0; i < S.maxHearts; i++) s += C.heartSVG(i < S.hearts);
    els.hearts.innerHTML = s;
    if (pop) {
      const svgs = els.hearts.querySelectorAll('svg');
      const idx = Math.max(0, S.hearts - 1);
      if (svgs[idx]) svgs[idx].classList.add('pop');
    }
  }
  function loseHeart() {
    S.hearts = Math.max(0, S.hearts - 1);
    renderHearts(true);
    els.stage.classList.remove('shake');
    void els.stage.offsetWidth;
    els.stage.classList.add('shake');
    setTimeout(() => els.stage.classList.remove('shake'), 440);
    if (S.hearts <= 0) {
      clearTimeout(S.endTimer);
      const runId = S.runId;
      S.endTimer = setTimeout(() => { if (S.runId === runId) finish(); }, 760);
    }
  }
  function updateProgress() {
    if (!els.progress) return;
    els.progress.innerHTML = '<i class="dot-goal"></i>目標 ' + S.solved + ' / ' + S.goal;
  }
  function renderRangePill() {
    const arr = S.cfg.steps;
    const lo = T.pitchFromStep(S.cfg.clef, arr.length ? arr[0] : G.minS, S.cfg.acc ? { acc: S.cfg.acc } : {});
    const hi = T.pitchFromStep(S.cfg.clef, arr.length ? arr[arr.length - 1] : G.maxS, S.cfg.acc ? { acc: S.cfg.acc } : {});
    const f2 = (p) => T.nameText(p, S.cfg.naming || 'letter', false, true);
    const txt = arr.length ? (arr.length === 1 ? f2(lo) : f2(lo) + ' – ' + f2(hi)) : '不限';
    const reg = T.registerOf(lo.octave, hi.octave);
    els.rangePill.classList.remove('reg-low', 'reg-mid', 'reg-high');
    els.rangePill.classList.add('reg-' + reg.id);
    els.rangePill.innerHTML = '<span>' + T.clefInfo(S.cfg.clef).name + '</span>' +
      '<span class="reg ' + reg.id + '">' + reg.name + '</span>' +
      '<b>' + txt + '</b><span id="progressPill"></span>';
    els.progress = document.getElementById('progressPill');
    updateProgress();
  }

  /* ================= 點選 → 點譜面 ================= */
  function selectApple(a) {
    if (S.selected && S.selected !== a) S.selected.node.classList.remove('selected');
    S.selected = a;
    if (a) a.node.classList.add('selected');
  }

  function staffTap(e) {
    if (!S.selected || S.drag || !S.running) return;
    const p = toStage(e);
    if (p.x < G.x0 - 40 || p.x > G.x1 + 40 || p.y < 400 || p.y > 900) return;
    showGhost(p.y, p.x);
    setTimeout(hideGhost, 260);
    tryPlace(S.selected, p.y, p.x);
    selectApple(null);
  }

  /* ================= 流程 ================= */
  function reset() {
    clearInterval(S.spawnTimer);
    clearTimeout(S.endTimer);
    S.runId++;
    appleLayer.innerHTML = '';
    notesLayer.innerHTML = '';
    notesLayer.appendChild(ghostLayer);
    notesLayer.appendChild(appleLayer);
    S.apples = []; S.placed = []; S.score = 0; S.wrong = 0;
    S.streak = 0; S.bestStreak = 0; S.hearts = S.maxHearts;
    S.columnsUsed = 0; S.solved = 0; S.selected = null; S.drag = null; S.hintOn = false;
    els.scoreNum.textContent = '0';
    els.combo.classList.remove('show');
    renderHearts(false);
    updateProgress();
  }

  function start(cfg) {
    S.cfg = Object.assign({
      clef: 'treble', steps: [], mode: 'endless',
      labelMode: 'show', naming: 'letter', colorMode: 'color', sound: true
    }, cfg);
    AP.sfx.enabled = !!S.cfg.sound;
    if (!S.cfg.steps.length) {
      const all = [];
      for (let s = G.minS; s <= G.maxS; s++) all.push(s);
      S.cfg.steps = all;
    }
    G = geomFor(S.cfg.clef);
    S.pitchPool = S.cfg.steps.slice();
    S.goal = GOAL;   // 每一場都是摘滿 10 顆過關
    AP.ui.show('game');
    buildBackground();
    buildStaff();
    renderRangePill();
    reset();
    els.howto.classList.remove('gone');
    setTimeout(() => els.howto.classList.add('gone'), 5200);
    S.running = true;
    updateAppleCount();
    S.spawnTimer = setInterval(() => { if (S.running) updateAppleCount(); }, 2500);
  }

  function finish() {
    if (!S.running) return;
    S.running = false;
    clearInterval(S.spawnTimer);
    const total = S.score + S.wrong;
    const acc = total ? Math.round((S.score / total) * 100) : 0;
    let stars = 0;
    if (S.score > 0) stars = 1;
    if (acc >= 70 && S.score >= 6) stars = 2;
    if (acc >= 90 && S.score >= 10) stars = 3;
    if (S.score > 0) AP.sfx.win();
    const won = S.solved >= S.goal && S.hearts > 0;
    const title = S.score === 0 ? '再試一次吧！' : (won ? '過關！摘滿 10 顆蘋果' : '愛心用完了～');
    AP.ui.modal({
      title,
      stars,
      stats: [
        { b: S.score, s: '答對顆數' },
        { b: S.wrong, s: '失誤次數' },
        { b: acc + '%', s: '正確率' },
        { b: S.bestStreak, s: '最高連對' }
      ],
      buttons: [
        { t: '再玩一次', cls: 'green', fn: () => start(S.cfg) },
        { t: '回設定', cls: 'ghost', fn: () => AP.ui.show('setup') }
      ],
      melody: S.placed.map((a) => a.pitch.midi)
    });
  }

  /* ================= 按鈕 ================= */
  function bind() {
    els.stage = document.getElementById('stage');
    els.scoreNum = document.getElementById('scoreNum');
    els.scoreBadge = document.getElementById('scoreBadge');
    els.combo = document.getElementById('comboPill');
    els.hearts = document.getElementById('hearts');
    els.howto = document.getElementById('howto');
    els.rangePill = document.getElementById('rangePill');

    document.getElementById('btnBack').addEventListener('click', () => {
      S.running = false; clearInterval(S.spawnTimer); AP.ui.show('setup');
    });
    document.getElementById('btnReplay').addEventListener('click', () => { if (S.cfg) start(S.cfg); });
    document.getElementById('btnFinish').addEventListener('click', finish);
    document.getElementById('btnSound').addEventListener('click', (ev) => {
      AP.sfx.enabled = !AP.sfx.enabled;
      ev.currentTarget.classList.toggle('muted', !AP.sfx.enabled);
      ev.currentTarget.innerHTML = AP.sfx.enabled ? C.ICON.sound : C.ICON.muted;
      C.toast(AP.sfx.enabled ? '音效開' : '音效關', 800);
    });
    document.getElementById('btnHint').addEventListener('click', (ev) => {
      S.hintOn = !S.hintOn;
      ev.currentTarget.classList.toggle('muted', !S.hintOn);
      C.toast(S.hintOn ? '提示開：拖曳時顯示位置音名' : '提示關', 1100);
    });
    document.getElementById('btnShowAns').addEventListener('click', () => {
      const live = S.apples.filter((a) => !a.placed);
      if (!live.length) { C.toast('樹上沒有蘋果了', 900); return; }
      live.forEach((a, i) => {
        setTimeout(() => {
          const y = G.lineY(a.step);
          const g = C.el('g', { class: 'drop-cue' });
          g.innerHTML = '<circle cx="' + a.x + '" cy="' + a.y + '" r="40" fill="none" stroke="#ffd93b" stroke-width="6"/>' +
            '<path d="M ' + a.x + ',' + (a.y + 48) + ' Q ' + (a.x + 24) + ',' + (y + 34) + ' ' + (a.x + 8) + ',' + (y - 4) + '" fill="none" stroke="#ffd93b" stroke-width="5" stroke-dasharray="10 9" opacity="0.95"/>' +
            '<circle cx="' + a.x + '" cy="' + y + '" r="21" fill="#ffd93b" opacity="0.45"/>' +
            '<circle cx="' + a.x + '" cy="' + y + '" r="21" fill="none" stroke="#f0a800" stroke-width="4"/>' +
            C.ledger(G, a.step, a.x, 52);
          notesLayer.appendChild(g);
          requestAnimationFrame(() => g.classList.add('show'));
          setTimeout(() => { g.classList.remove('show'); setTimeout(() => g.remove(), 300); }, 2400);
        }, i * 80);
      });
      C.toast('黃圈＝這顆蘋果該放的位置', 1600);
    });

    els.btnMelody.addEventListener('click', () => {
      if (!S.placed.length) { C.toast('譜上還沒有蘋果喔', 1000); return; }
      S.placed.forEach((a, i) => {
        setTimeout(() => {
          AP.sfx.note(a.pitch.midi, { dur: 0.9, gain: 0.24 });
          a.node.classList.add('hl');
          setTimeout(() => a.node.classList.remove('hl'), 340);
        }, i * 280);
      });
    });

    document.getElementById('screen-game').addEventListener('pointerdown', (e) => {
      if (e.target.closest('.apple-node') || e.target.closest('button')) return;
      if (S.selected) staffTap(e);
    });
  }

  function init() {
    bgSvg = document.getElementById('gameBg');
    staffSvg = document.getElementById('gameStaff');
    notesLayer = document.getElementById('gameNotes');
    dragLayer = document.getElementById('gameDrag');
    appleLayer = C.el('g', { id: 'treeApples' });
    ghostLayer = C.el('g', { id: 'ghostLayer' });
    notesLayer.appendChild(ghostLayer);
    notesLayer.appendChild(appleLayer);
    els.btnMelody = document.getElementById('btnMelody');
    bind();
    renderHearts(false);
  }

  return { init, start, GEOM, S, geomFor };
})();
