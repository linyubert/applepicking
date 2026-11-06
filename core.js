/* =========================================================
   core：共用工具、蘋果向量、五線譜、背景裝飾
   ========================================================= */
window.AP = window.AP || {};

AP.core = (function () {
  const T = AP.theory;
  const NS = 'http://www.w3.org/2000/svg';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  let uidSeq = 0;
  const uid = (p) => (p || 'id') + '-' + (++uidSeq);

  /** 建立 SVG 元素 */
  function el(tag, attrs, html) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) {
      if (attrs[k] == null) continue;
      n.setAttribute(k, attrs[k]);
    }
    if (html != null) n.innerHTML = html;
    return n;
  }

  /** 升降記號向量：以「垂直中心對齊 y、高度 = height」擺放 */
  function accGlyph(kind, x, y, height, fill, stroke) {
    const p = AP.SYM_PATHS && AP.SYM_PATHS[kind];
    if (!p) return '';
    const uni = kind === 'sharp' ? 698 : 614;   // 字形高度（1000 單位 = 4 個線間距）
    const mid = kind === 'sharp' ? 1 : 132;     // 字形垂直中心
    const k = height / uni;
    const ty = y + mid * k;
    const outline = stroke ? ' stroke="' + stroke + '" stroke-width="' + (3 / k * 0.02).toFixed(2) + '"' : '';
    return '<g class="acc" transform="translate(' + x + ',' + ty + ') scale(' + k + ',' + (-k) + ')">' +
      '<path d="' + p.d + '" fill="' + (fill || '#fff') + '"' + outline + '/></g>';
  }

  /* ---------------- 注音字形（內嵌子集字型，離線可用） ---------------- */
  function injectZhuyinFont() {
    if (document.getElementById('zyFont')) return;
    const st = document.createElement('style');
    st.id = 'zyFont';
    st.textContent = AP.ZY_FONT_CSS || '';
    document.head.appendChild(st);
  }

  /* 組合注音（橫式）：把「聲符／介符／韻符／調號」排成一列 */
  const ZY_INITIALS = 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ';
  const ZY_MEDIALS = 'ㄧㄨㄩ';
  const ZY_TONES = 'ˊˇˋ˙';

  /** 把一串注音符號轉成 HTML（橫式、調號自動縮小上移） */
  function zhuyinInline(str, cls) {
    const chars = Array.from(str || '');
    let out = '';
    chars.forEach((ch) => {
      if (ZY_TONES.indexOf(ch) >= 0) {
        out += '<i class="zy-tone">' + ch + '</i>';
      } else if (ZY_INITIALS.indexOf(ch) >= 0) {
        out += '<i class="zy-i">' + ch + '</i>';
      } else {
        out += '<i class="zy-f">' + ch + '</i>';
      }
    });
    return '<span class="zy-inline ' + (cls || '') + '">' + out + '</span>';
  }

  /**
   * 注音符號轉成 SVG 文字
   * 橫式時 chars 由上而下逐列堆疊（每列 1~3 個符號），例如 ㄖㄨㄝ 會排成 ㄖ / ㄨㄝ 兩列、ㄉㄛ 只有一列
   */
  function zhuyinSVG(str, opt) {
    const o = opt || {};
    const size = o.size || 20;
    const color = o.color || '#ffffff';
    const stroke = o.stroke || '#33383d';
    const sw = o.strokeWidth != null ? o.strokeWidth : 4.5;
    const cx = o.cx || 0;
    const cy = o.cy || 0;
    const lines = o.lines || splitZhuyin(str);
    const lh = size * 0.98;
    const totalH = (lines.length - 1) * lh;
    const fam = "font-family=\"APZy, 'Noto Sans TC', 'Noto Sans CJK TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif\" ";
    let out = '<g class="zy" text-anchor="middle" ' + fam +
      'font-size="' + size + '" font-weight="900" fill="' + color + '" stroke="' + stroke + '" stroke-width="' + sw + '" ' +
      'paint-order="stroke" stroke-linejoin="round">';
    lines.forEach((ln, i) => {
      const y = cy - totalH / 2 + lh * i + size * 0.35;
      out += '<text x="' + cx.toFixed(2) + '" y="' + y.toFixed(2) + '">' + ln + '</text>';
    });
    return out + '</g>';
  }

  /** 注音斷行：聲符｜介符＋韻符（含調號） */
  function splitZhuyin(str) {
    const chars = Array.from(str || '');
    if (chars.length <= 1) return chars;
    /* 只有 2 個符號（例：ㄉㄛ）→ 排成一列；3 個以上（例：ㄖㄨㄝ）才分聲符／韻符兩列 */
    if (chars.length === 2) return [chars.join('')];
    if (ZY_INITIALS.indexOf(chars[0]) >= 0) {
      return [chars[0], chars.slice(1).join('')];
    }
    return [chars.join('')];
  }

  /* ---------------- 蘋果 ---------------- */
  /**
   * 產生蘋果向量（本地座標：寬 112、高 118，中心 (0,0)）
   * o = { color, letter, dir:'up'|'down'|'mid', octave, showLetter, showOctave, outline }
   */
  /** 小三角形箭頭（▲／▽），畫在蘋果標示旁 */
  function triMarkup(dir, x, y, h) {
    const up = dir === 'up';
    const d = up
      ? 'M ' + x + ',' + (y - h) + ' L ' + (x + h * 0.92) + ',' + (y + h * 0.72) + ' L ' + (x - h * 0.92) + ',' + (y + h * 0.72) + ' Z'
      : 'M ' + x + ',' + (y + h) + ' L ' + (x + h * 0.92) + ',' + (y - h * 0.72) + ' L ' + (x - h * 0.92) + ',' + (y - h * 0.72) + ' Z';
    return '<path class="lbl-tri ' + dir + '" d="' + d + '" fill="#ffffff" stroke="#33383d" ' +
      'stroke-width="3.4" stroke-linejoin="round"/>';
  }

  function appleMarkup(o) {
    const color = o.color || '#e02b25';
    const dark = T.shade(color, -0.42);
    const light = T.shade(color, 0.34);
    const letter = o.letter || '';
    const showLetter = o.showLetter !== false;
    const parts = [];

    // 陰影
    parts.push('<ellipse cx="0" cy="46" rx="45" ry="9" fill="#1d3a24" opacity="0.16"/>');

    // 果蒂
    parts.push('<path class="stem" d="M -4,-30 C -9,-44 -13,-54 -8,-61" fill="none" stroke="#6d4525" stroke-width="9" stroke-linecap="round"/>');
    // 葉子
    parts.push('<path class="leaf" d="M -7,-54 C 3,-70 24,-74 34,-63 C 29,-47 8,-44 -7,-54 Z" fill="#43a94a" stroke="#2d7d34" stroke-width="2.5" stroke-linejoin="round"/>');
    parts.push('<path class="leaf" d="M -5,-55 C 8,-60 22,-63 32,-62" fill="none" stroke="#7dc980" stroke-width="2" opacity="0.9"/>');

    // 果身
    const body = 'M 0,-27 C 9,-41 28,-45 41,-37 C 54,-29 58,-11 57,5 ' +
      'C 56,29 41,48 21,49 C 10,49.5 4,45 0,45 C -4,45 -10,49.5 -21,49 ' +
      'C -41,48 -56,29 -57,5 C -58,-11 -54,-29 -41,-37 C -28,-45 -9,-41 0,-27 Z';
    parts.push('<path class="body" d="' + body + '" fill="' + color + '" stroke="' + dark + '" stroke-width="3.5"/>');
    // 底部暗面
    parts.push('<path class="body" d="M -51,16 C -44,38 -26,49 -8,49 C -20,49 -41,44 -51,16 Z" fill="' + dark + '" opacity="0.45"/>');
    parts.push('<path class="body" d="M 51,16 C 44,38 26,49 8,49 C 20,49 41,44 51,16 Z" fill="' + dark + '" opacity="0.35"/>');
    // 左上高光
    parts.push('<ellipse class="gloss" cx="-26" cy="-14" rx="16" ry="11" fill="#ffffff" opacity="0.4" transform="rotate(-28 -26 -14)"/>');
    parts.push('<ellipse class="gloss" cx="20" cy="-24" rx="9" ry="6" fill="' + light + '" opacity="0.55" transform="rotate(24 20 -24)"/>');

    if (showLetter) {
      if (o.acc) {
        parts.push(accGlyph(o.acc, -40, 2, 46, '#ffffff', '#33383d'));
      }
      const mode = o.labelMode || 'letter';
      if (mode === 'zhuyin') {
        // 直式注音：每欄 3 個符號，置於果身中央
        const zy = T.ZHUYIN[letter] || letter;
        parts.push(zhuyinSVG(zy, {
          size: 27, cx: 0, cy: 6, color: '#ffffff', stroke: '#33383d', strokeWidth: 5.6
        }));
      } else {
        const text = mode === 'solfa' ? (T.SOLFA[letter] || letter) : letter;
        const fs = text.length > 2 ? 36 : text.length > 1 ? 44 : 60;
        parts.push('<text class="lbl" x="0" y="' + (text.length > 2 ? 12 : 18) + '" text-anchor="middle" ' +
          'font-family="Nunito, Baloo 2, PingFang TC, system-ui, sans-serif" font-size="' + fs + '" font-weight="900" ' +
          'fill="#ffffff" stroke="#33383d" stroke-width="9" stroke-linejoin="round" paint-order="stroke">' +
          text + '</text>');
      }
      // 箭頭：中央 Do–Si 不畫；下方音標 ▽、上方音標 ▲（畫在名字右上角）
      if (o.dir === 'up' || o.dir === 'down') {
        const big = (o.labelMode || 'letter') === 'letter';
        parts.push(triMarkup(o.dir, big ? 38 : 36, big ? -29 : -27, big ? 14 : 11));
      }
    }

    return '<g class="apple-g">' + parts.join('') + '</g>';
  }

  /** 產生可拖曳的蘋果 DOM <g> */
  function appleNode(o) {
    const g = el('g', { class: 'apple-node' + (o.cls ? ' ' + o.cls : ''), 'data-key': o.key || '' });
    g.innerHTML = appleMarkup(o) +
      '<circle class="hit" cx="0" cy="0" r="58" fill="transparent"/>';
    g.setAttribute('transform', 'translate(' + (o.x || 0) + ',' + (o.y || 0) + ') scale(' + (o.scale || 1) + ')');
    return g;
  }

  /* ---------------- 五線譜 ---------------- */
  /**
   * staffGeom：{ cxY: 第三線 y, spacing, x0, x1, stepsRange:[min,max] }
   * step -> y
   */
  function makeGeom(opts) {
    const g = Object.assign({
      cxY: 470, spacing: 46, x0: 100, x1: 900, minS: -4, maxS: 12
    }, opts);
    g.half = g.spacing / 2;
    g.lineY = (s) => g.cxY - (s - 4) * g.half;   // s=4 就是第三線
    g.stepOf = (y) => clamp(Math.round((g.cxY - y) / g.half) + 4, g.minS, g.maxS);
    g.bottomY = g.lineY(0);
    g.topY = g.lineY(8);
    return g;
  }

  /** 五條線 */
  function staffLines(geom, cls) {
    let s = '<g class="staff-lines ' + (cls || '') + '">';
    for (let i = 0; i < 5; i++) {
      const y = geom.lineY(i * 2);
      s += '<rect x="' + geom.x0 + '" y="' + (y - 2) + '" width="' + (geom.x1 - geom.x0) +
        '" height="4" rx="2" fill="#22282e"/>';
    }
    return s + '</g>';
  }

  /** 升降記號（SMuFL） */
  function accidentalMarkup(kind, x, y, spacing, color) {
    const p = AP.SYM_PATHS && AP.SYM_PATHS[kind];
    if (!p) return '';
    const k = (spacing * 4) / 1000;
    return '<g class="accident" transform="translate(' + x + ',' + y + ') scale(' + k + ',' + (-k) + ')">' +
      '<path d="' + p.d + '" fill="' + (color || '#20262c') + '"/></g>';
  }

  /** 加線（ledger lines），step 在 0..8 之外 */
  function ledger(geom, step, x, w) {
    const half = w || 54;
    let s = '';
    if (step < 0) {
      for (let t = -2; t >= step; t -= 2) {
        const y = geom.lineY(t);
        s += '<rect x="' + (x - half / 2) + '" y="' + (y - 2) + '" width="' + half + '" height="4" rx="2" fill="#22282e"/>';
      }
    } else if (step > 8) {
      for (let t = 10; t <= step; t += 2) {
        const y = geom.lineY(t);
        s += '<rect x="' + (x - half / 2) + '" y="' + (y - 2) + '" width="' + half + '" height="4" rx="2" fill="#22282e"/>';
      }
    }
    return s;
  }

  /**
   * 譜號（SMuFL：1 em = 4 個線間距）
   * 量測結果：高音譜號的捲曲中心在字形原點上方 1.35 個間距 →
   *   把原點放在 G 線（第 2 線）下方 1.35 個間距，捲曲就會正好繞住 G 線。
   *   低音譜號的視覺中心在原點上方 2.05 個間距 → 原點放在 F 線（第 4 線）下方 2.05 個間距。
   * @param x 左緣 x；cxY 第三線 y；spacing 線間距
   */
  function clefMarkup(clefId, x, cxY, spacing, color) {
    const p = AP.CLEF_PATHS[clefId];
    if (!p) return '';
    const k = (spacing * 4) / 1000; // 1 em = 4 個線間距 => 1000 單位 = 4 spacing
    const anchorLine = clefId === 'treble' ? 2 : 6;    // 高音 G 線 / 低音 F 線
    const below = 0; // Bravura 的譜號原點正好落在該線（高音＝G 線、低音＝F 線）
    const anchorY = cxY - (anchorLine - 4) * (spacing / 2);
    const gy = anchorY + below * spacing;
    return '<g class="clef" transform="translate(' + x + ',' + gy + ') scale(' + k + ',' + (-k) + ')">' +
      '<path d="' + p.d + '" fill="' + (color || '#1d2227') + '"/></g>';
  }
  function clefWidth(clefId, spacing) {
    const p = AP.CLEF_PATHS[clefId];
    return p ? p.adv * (spacing * 4) / 1000 : spacing * 3;
  }

  /* ---------------- 背景裝飾 ---------------- */
  function cloud(x, y, s, op) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')" opacity="' + (op || 0.92) + '">' +
      '<ellipse cx="0" cy="0" rx="70" ry="34" fill="#fff"/>' +
      '<ellipse cx="-48" cy="10" rx="44" ry="24" fill="#fff"/>' +
      '<ellipse cx="48" cy="10" rx="52" ry="26" fill="#fff"/>' +
      '<ellipse cx="6" cy="-20" rx="38" ry="26" fill="#fff"/>' +
      '</g>';
  }
  function daisy(x, y, s, color) {
    let petals = '';
    for (let i = 0; i < 8; i++) {
      petals += '<ellipse cx="0" cy="-10" rx="4.4" ry="9" fill="' + (color || '#fff') + '" transform="rotate(' + i * 45 + ')"/>';
    }
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' + petals +
      '<circle r="5" fill="#ffcf3d"/></g>';
  }
  function bee(x, y, s, flip) {
    return '<g class="bee" transform="translate(' + x + ',' + y + ') scale(' + (flip ? -s : s) + ',' + s + ')">' +
      '<ellipse cx="0" cy="0" rx="17" ry="12" fill="#f6c945" stroke="#8a5c00" stroke-width="2"/>' +
      '<path d="M -5,-11 L -1,11 M 5,-11 L 9,11" stroke="#3a2a00" stroke-width="3.4"/>' +
      '<ellipse cx="-8" cy="-11" rx="10" ry="7" fill="#fff" opacity="0.85" transform="rotate(-20 -8 -11)"/>' +
      '<ellipse cx="8" cy="-11" rx="9" ry="6" fill="#fff" opacity="0.7" transform="rotate(15 8 -11)"/>' +
      '<circle cx="13" cy="-2" r="2.4" fill="#2b2b2b"/>' +
      '</g>';
  }
  function sunflower(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<circle r="10" fill="#8a4b12"/>' + daisy(0, 0, 1.05, '#ffd23f') + '</g>';
  }
  function grassTuft(x, y, s, c) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')" fill="' + (c || '#4f9c35') + '">' +
      '<path d="M 0,0 C -6,-18 -14,-30 -24,-38 C -12,-32 -2,-18 2,-2 Z"/>' +
      '<path d="M 4,0 C 6,-22 14,-34 26,-42 C 14,-30 8,-16 8,0 Z"/>' +
      '<path d="M -2,0 C -2,-14 0,-28 4,-40 C 6,-26 6,-12 4,0 Z" opacity="0.9"/>' +
      '</g>';
  }

  /** 天空＋山丘＋草地（設定頁與遊戲頁共用） */
  function skyBackdrop(o) {
    const hills = o.hills !== false;
    const grass = o.grass !== false;
    let s = '';
    s += '<defs>' +
      '<linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#a9ddf2"/><stop offset="45%" stop-color="#d3ecf8"/>' +
      '<stop offset="100%" stop-color="#eaf6df"/></linearGradient>' +
      '<linearGradient id="hillBack" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#b9dc92"/><stop offset="100%" stop-color="#8cc063"/></linearGradient>' +
      '<linearGradient id="hillFront" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#86c25c"/><stop offset="100%" stop-color="#5da23a"/></linearGradient>' +
      '<linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#6cb045"/><stop offset="100%" stop-color="#3f7d29"/></linearGradient>' +
      '</defs>';
    s += '<rect width="1280" height="960" fill="url(#skyGrad)"/>';
    s += '<circle cx="1120" cy="96" r="70" fill="#fff6c4" opacity="0.75"/>';
    s += '<circle cx="1120" cy="96" r="46" fill="#fffbe0" opacity="0.9"/>';
    s += cloud(210, 120, 1.05) + cloud(760, 70, 0.85, 0.8) + cloud(560, 190, 0.6, 0.65);
    if (hills) {
      s += '<path d="M 0,640 C 180,560 320,600 520,570 C 760,534 980,592 1280,548 L 1280,960 L 0,960 Z" fill="url(#hillBack)" opacity="0.9"/>';
      s += '<path d="M 0,730 C 240,660 420,720 700,688 C 940,660 1100,712 1280,676 L 1280,960 L 0,960 Z" fill="url(#hillFront)"/>';
    }
    if (grass) s += grassBand();
    return s;
  }

  function grassBand() {
    let s = '<g>';
    s += '<path d="M 0,806 C 220,782 420,822 640,806 C 880,788 1080,818 1280,796 L 1280,960 L 0,960 Z" fill="url(#grassGrad)"/>';
    const xs = [30, 95, 150, 230, 300, 380, 450, 520, 610, 690, 760, 840, 910, 980, 1050, 1120, 1190, 1250];
    xs.forEach((x, i) => {
      s += grassTuft(x, 960, 1.15 + (i % 3) * 0.18, i % 2 ? '#3f7d29' : '#549b33');
    });
    [[90, 890, 0.85], [330, 930, 0.7], [690, 918, 0.9], [1010, 884, 0.75], [1190, 926, 0.8], [520, 872, 0.6]]
      .forEach((d) => { s += daisy(d[0], d[1], d[2]); });
    return s + '</g>';
  }


  /* ---------------- 圖示（不用 emoji，避免字型缺字） ---------------- */
  const ICON = {
    sound: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#3f7d29" stroke="#2f5f1d" stroke-width="1.2" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="#3f7d29" stroke-width="2" stroke-linecap="round"/><path d="M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="#3f7d29" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg>',
    muted: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#9aa6ae" stroke="#7d8a92" stroke-width="1.2" stroke-linejoin="round"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="#c0392b" stroke-width="2" stroke-linecap="round"/></svg>',
    hint: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2.6c3.7 0 6.6 2.8 6.6 6.3 0 2.3-1.2 3.6-2.3 4.9-.7.9-1.2 1.7-1.2 2.7h-6.2c0-1-.5-1.8-1.2-2.7-1.1-1.3-2.3-2.6-2.3-4.9 0-3.5 2.9-6.3 6.6-6.3z" fill="#ffd93b" stroke="#c99a00" stroke-width="1.3"/><path d="M9.6 19.4h4.8M10.4 21.4h3.2" stroke="#c99a00" stroke-width="1.6" stroke-linecap="round"/></svg>',
    replay: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4.5 12a7.5 7.5 0 1 1 2.6 5.7" fill="none" stroke="#41505a" stroke-width="2.4" stroke-linecap="round"/><path d="M3.6 8.2l.4 4.5 4.4-.8z" fill="#41505a"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M10.5 4.5l-6.6 6.1a2 2 0 0 0 0 2.8l6.6 6.1" fill="none" stroke="#41505a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.6 12h8.2a6.4 6.4 0 0 1 6.4 6.4" fill="none" stroke="#41505a" stroke-width="2.3" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="3.1" fill="none" stroke="#41505a" stroke-width="2.1"/><path d="M12 2.8v2.6M12 18.6v2.6M4.5 12H1.9M22.1 12h-2.6M6.7 6.7L4.9 4.9M19.1 19.1l-1.8-1.8M17.3 6.7l1.8-1.8M4.9 19.1l1.8-1.8" stroke="#41505a" stroke-width="2.1" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="54" height="54"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z" fill="#ffc531" stroke="#c98a00" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    starOff: '<svg viewBox="0 0 24 24" width="54" height="54"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z" fill="#dfe6ea" stroke="#b9c4ca" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    apple: '<svg viewBox="-62 -70 124 128" width="30" height="30"><path d="M 0,-27 C 9,-41 28,-45 41,-37 C 54,-29 58,-11 57,5 C 56,29 41,48 21,49 C 10,49.5 4,45 0,45 C -4,45 -10,49.5 -21,49 C -41,48 -56,29 -57,5 C -58,-11 -54,-29 -41,-37 C -28,-45 -9,-41 0,-27 Z" fill="#ef4136" stroke="#8f120c" stroke-width="5"/><path d="M -4,-30 C -9,-44 -13,-54 -8,-61" fill="none" stroke="#6d4525" stroke-width="9" stroke-linecap="round"/><path d="M -7,-54 C 3,-70 24,-74 34,-63 C 29,-47 8,-44 -7,-54 Z" fill="#43a94a" stroke="#2d7d34" stroke-width="3"/></svg>',
    infinity: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7.6 8.3c2.2 0 3 1.6 4.4 3.7 1.4 2.1 2.2 3.7 4.4 3.7a3.7 3.7 0 0 0 0-7.4c-2.2 0-3 1.6-4.4 3.7-1.4 2.1-2.2 3.7-4.4 3.7a3.7 3.7 0 0 1 0-7.4z" fill="none" stroke="#3f7d29" stroke-width="2.1" stroke-linecap="round"/></svg>',
    target: '<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="8.4" fill="none" stroke="#3f7d29" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="#3f7d29" stroke-width="2"/><circle cx="12" cy="12" r="1.4" fill="#3f7d29"/></svg>'
  };

  /* ---------------- 小工具 ---------------- */
  function heartSVG(filled) {
    return '<svg viewBox="0 0 24 24" class="' + (filled ? '' : 'lost') + '"><defs>' +
      '<linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#ff6a5e"/><stop offset="100%" stop-color="#d61f16"/></linearGradient></defs>' +
      '<path d="M12 21s-8.4-5.3-10.2-10.1C0.5 6.6 3.2 3.4 6.6 3.4c2 0 3.6 1 4.5 2.6l0.9 1.5 0.9-1.5c0.9-1.6 2.5-2.6 4.5-2.6 3.4 0 6.1 3.2 4.8 7.5C20.4 15.7 12 21 12 21z" fill="url(#hg)" stroke="#8f120c" stroke-width="1.2"/></svg>';
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1500);
  }

  return {
    NS, clamp, rand, randInt, pick, shuffle, uid, el,
    appleMarkup, appleNode, accGlyph, triMarkup, zhuyinSVG, zhuyinInline, splitZhuyin, injectZhuyinFont,
    makeGeom, staffLines, ledger, clefMarkup, clefWidth, accidentalMarkup,
    cloud, daisy, bee, sunflower, grassTuft, skyBackdrop, grassBand,
    heartSVG, toast, ICON
  };
})();
