/* =========================================================
   樂理核心：譜號、線與間、音名、音高、顏色
   step 定義：s=0 為五線譜「最下面那一條線」，每上升半格（一條線→一個間）= +1
   高音譜號 s=0 -> E4 、中線 s=4 -> B4
   低音譜號 s=0 -> G2 、中線 s=4 -> D3
   ========================================================= */
window.AP = window.AP || {};

AP.theory = (function () {
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // 蘋果顏色（參考原版：C紅 D橘 E黃 F綠 G藍綠 A紫 B桃紅）
  const COLOR = {
    C: '#e02b25', D: '#f18b1d', E: '#f5d211', F: '#8dc63f',
    G: '#1f9c92', A: '#8c53cf', B: '#ef2f9b'
  };

  const CLEFS = {
    treble: { id: 'treble', name: '高音譜號', bottomLetter: 'E', bottomOctave: 4, minS: -4, maxS: 12 },
    bass:   { id: 'bass',   name: '低音譜號', bottomLetter: 'G', bottomOctave: 2, minS: -4, maxS: 12 }
  };

  function clefInfo(id) { return CLEFS[id] || CLEFS.treble; }

  /** 箭頭：中央 Do（C4）～ Si（B4）不標；中央 Do 以下 ▽、Si 以上 ▲ */
  const TRI = { up: '▲', down: '▽' };
  function triOf(letter, octave) {
    /* 中央 Do（C4）～ Si（B4）不標箭頭；低於中央 C 標 ▽、高於中央 B 標 ▲ */
    if (octave < 4) return 'down';
    if (octave === 4) return 'mid';
    return 'up';
  }
  function triOfPitch(p) { return TRI[triOf(p.letter, p.octave)] || ''; }

  /** step -> 音名/八度/MIDI */
  function pitchFromStep(clefId, s, cfg) {
    const c = clefInfo(clefId);
    const base = LETTERS.indexOf(c.bottomLetter);
    const total = base + s;
    const idx = ((total % 7) + 7) % 7;
    const octave = c.bottomOctave + Math.floor(total / 7);
    const letter = LETTERS[idx];
    const acc = (cfg && cfg.acc) || '';
    return {
      letter, octave, step: s, acc,
      midi: (octave + 1) * 12 + SEMI[letter] + (acc === 'sharp' ? 1 : acc === 'flat' ? -1 : 0),
      color: COLOR[letter],
      /* 中央 Do–Si（C4–B4）不加箭頭；低於中央 Do 標 ▽、高於 Si 標 ▲ */
      dir: triOf(letter, octave)
    };
  }

  /** 音名+八度 -> step（找不到回傳 null） */
  function stepFromPitch(clefId, letter, octave) {
    const c = clefInfo(clefId);
    for (let s = c.minS; s <= c.maxS; s++) {
      const p = pitchFromStep(clefId, s);
      if (p.letter === letter && p.octave === octave) return s;
    }
    return null;
  }

  /* 中央 Do（C4）到 Si（B4）：高音譜為 -2..3；低音譜為 10..15 */
  function centralDoSteps(clefId) {
    const s0 = stepFromPitch(clefId, 'C', 4);
    const out = [];
    for (let i = 0; i < 7; i++) out.push(s0 + i);
    return out;
  }

  /** 範圍內每個音是否為中央 Do~Si */
  function inCentralDo(clefId) {
    const set = new Set(centralDoSteps(clefId));
    return (s) => set.has(s);
  }

  function isLine(s) { return ((s % 2) + 2) % 2 === 0; }

  const ACC_SIGN = { sharp: '♯', flat: '♭' };

  /* 唱名（固定調）：台灣音樂課本的注音唱名與 Do Re Mi */
  const ZHUYIN = { C: 'ㄉㄛ', D: 'ㄖㄨㄝ', E: 'ㄇㄧ', F: 'ㄈㄚ', G: 'ㄙㄛ', A: 'ㄌㄚ', B: 'ㄒㄧ' };
  const SOLFA = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Ti' };
  /* 音區（register）標籤：依八度號碼判斷，僅供顏色與文字提示，不顯示數字 */
  function registerOf(lo, hi) {
    const mid = (lo + hi) / 2;
    if (mid < 3.5) return { id: 'low', name: '低音域', short: '低' };
    if (mid <= 4.5) return { id: 'mid', name: '中音域', short: '中' };
    return { id: 'high', name: '高音域', short: '高' };
  }

  /** 中央 C（C4）是哪個音域 */
  function octaveBadgeColor(oct) {
    if (oct <= 2) return '#2f6fa8';
    if (oct === 3) return '#2f8f7a';
    if (oct === 4) return '#4a8f26';
    if (oct === 5) return '#c07b12';
    return '#b8352a';
  }

  const NAMING = [
    { id: 'letter', name: '音名', sample: 'C' },
    { id: 'zhuyin', name: '注音', sample: 'ㄉㄛ' },
    { id: 'solfa', name: '唱名', sample: 'Do' }
  ];

  /** 取得某個音在指定標示法下的文字片段 */
  function nameParts(p, mode) {
    return {
      pre: p.acc ? ACC_SIGN[p.acc] : '',
      base: mode === 'zhuyin' ? ZHUYIN[p.letter] : mode === 'solfa' ? SOLFA[p.letter] : p.letter,
      tri: triOfPitch(p),
      dir: p.dir || 'mid',
      oct: p.octave,
      kind: mode === 'zhuyin' ? 'pill' : 'outline'
    };
  }

  /** 純文字（SVG、提示、toast 用）：例 ㄇㄧ / C / Do；withTri 時加上 ▲／▽（不輸出八度數字） */
  function nameText(p, mode, withOctave, withTri) {
    const q = nameParts(p, mode);
    return q.pre + q.base + (withTri ? q.tri : '');
  }

  /** HTML（DOM 用）；不輸出八度數字 */
  function nameHTML(p, mode, withOctave, withTri) {
    const q = nameParts(p, mode);
    const base = mode === 'zhuyin' && AP.core && AP.core.zhuyinInline
      ? AP.core.zhuyinInline(q.base, 'pill')
      : '<span class="nb ' + q.kind + '">' + q.base + '</span>';
    return q.pre + base +
      (withTri && q.tri ? '<span class="ntri ' + q.dir + '">' + q.tri + '</span>' : '');
  }

  /** 文字：例如 G 或 C4 */
  function label(p, opts) {
    const tri = triOfPitch(p);
    return '<span class="nname">' + (p.acc ? ACC_SIGN[p.acc] : '') + p.letter + '</span>' +
      (tri ? '<span class="ntri ' + (p.dir || 'mid') + '">' + tri + '</span>' : '');
  }

  function plain(p) {
    return (p.acc ? ACC_SIGN[p.acc] : '') + p.letter + triOfPitch(p);
  }

  function midiToName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  function shade(hex, amt) { // amt <0 變暗, >0 變亮
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  return {
    LETTERS, SEMI, COLOR, CLEFS, clefInfo, pitchFromStep, stepFromPitch,
    isLine, label, plain, midiToName, shade, ACC_SIGN, centralDoSteps, inCentralDo,
    ZHUYIN, SOLFA, NAMING, nameParts, nameText, nameHTML, TRI, triOf, triOfPitch,
    registerOf, octaveBadgeColor
  };
})();
