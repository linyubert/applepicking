/* =========================================================
   主控：舞台縮放、頁面切換、共用對話框
   ========================================================= */
window.AP = window.AP || {};

AP.ui = (function () {
  let stage = null;

  /**
   * 電子白板最佳化：舞台「填滿寬度」為主（16:9 白板不再左右留黑邊），
   * 垂直方向允許小幅裁切（上限 12%，只裁到天空/草地的裝飾），
   * 並提供 1.45 倍上限，避免超寬螢幕把按鈕放太大。
   */
  const STAGE_W = 1280, STAGE_H = 960;
  const MAX_CROP = 0.12;
  const MAX_SCALE = 2.2;

  function fit() {
    if (!stage) stage = document.getElementById('stage');
    const vw = window.innerWidth, vh = window.innerHeight;
    const kFill = Math.max(vw / STAGE_W, vh / STAGE_H);      // 填滿（會裁切）
    const kFit = Math.min(vw / STAGE_W, vh / STAGE_H);       // 完整放入
    const crop = (STAGE_H * kFill - vh) / (STAGE_H * kFill); // 垂直被裁掉的比例
    let k = (kFill > kFit && crop <= MAX_CROP) ? kFill : kFit;
    k = Math.min(k, MAX_SCALE);
    // 水平永遠置中；垂直在裁切時也置中（上下各裁一點）
    stage.style.setProperty('--k', k);
    stage.style.setProperty('--tx', '0px');
    stage.style.setProperty('--ty', '0px');
    stage.style.transform = 'scale(' + k + ')';
    document.documentElement.style.setProperty('--stage-k', k);
    stage.dataset.fit = (k === kFill ? 'fill' : 'contain');
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === 'screen-' + id);
    });
    const vp = document.getElementById('viewport');
    if (vp) vp.classList.toggle('on-home', id === 'home');
    if (id === 'setup' && AP.Setup) AP.Setup.show();
  }

  function clearModals() {
    document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
  }

  function modal(opt) {
    clearModals();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    const stars = opt.stars || 0;
    const starHTML = [0, 1, 2].map((i) => '<span class="star">' + (i < stars ? AP.core.ICON.star : AP.core.ICON.starOff) + '</span>').join('');
    wrap.innerHTML =
      '<div class="modal">' +
      '<h2>' + (opt.title || '') + '</h2>' +
      (opt.plain ? '' :
        '<div class="big-score">' + (opt.stats && opt.stats[0] ? opt.stats[0].b : '') + '</div>' +
        '<div style="margin:2px 0 6px">' + starHTML + '</div>') +
      '<p>' + (opt.subtitle || '') + '</p>' +
      (opt.links && opt.links.length
        ? '<div class="links">' + opt.links.map((l) =>
            '<a href="' + l.href + '" target="_blank" rel="noopener noreferrer">' +
            (l.ic ? '<span class="ic ' + l.ic + '"></span>' : '') +
            '<b>' + l.label + '</b>' + l.text + '</a>').join('') + '</div>'
        : '') +
      '<div class="stats">' +
      (opt.stats || []).map((s) => '<div class="stat"><b>' + s.b + '</b><span>' + s.s + '</span></div>').join('') +
      '</div>' +
      '<div class="row"></div>' +
      '</div>';

    const row = wrap.querySelector('.row');
    (opt.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.type = 'button';
      btn.textContent = b.t;
      btn.addEventListener('click', () => {
        wrap.remove();
        if (b.fn) b.fn();
      });
      row.appendChild(btn);
    });
    document.getElementById('stage').appendChild(wrap);

    // 播放剛剛排好的旋律
    if (opt.melody && opt.melody.length) {
      setTimeout(() => AP.sfx.melody(opt.melody, 0.34), 420);
    }
  }

  function help() {
    clearModals();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML =
      '<div class="modal help">' +
      '<h2>怎麼玩？</h2>' +
      '<ol class="help-list">' +
      '<li><b>設定頁</b>：按一下蘋果，切換該音要不要出題（想看更多音可先按「<b>不限</b>」）。要連續刷一整排時，按「<b>連續刷選</b>」再按住拖曳。</li>' +
      '<li>蘋果上的記號可以用「<b>標示</b>」切換：<b>音名</b>（C D E…）、<b>注音</b>（ㄉㄛ ㄖㄨㄝ ㄇㄧ ㄈㄚ ㄙㄛ ㄌㄚ ㄒㄧ）、<b>唱名</b>（Do Re Mi…），三者都適用。</li>' +
      '<li>出題範圍以「<b>中央 Do ～ Si</b>」為主，切換高／低音譜號時會自動換算成該譜號的位置；蘋果上的 <b>▲</b> 表示比中央 Si 高、<b>▽</b> 表示比中央 Do 低，中央 Do–Si 這幾個音不標箭頭。</li>' +
      '<li>按 <b>開始</b> 後，樹上會不斷長出蘋果。把蘋果<b>拖到五線譜上對應的位置</b>；也可以先點蘋果、再點譜面。</li>' +
      '<li>每場都是<b>摘滿 10 顆蘋果就過關</b>；放對會加一顆並發出聲音，放錯會扣一顆愛心，連對 5 顆可以補回愛心。</li>' +
      '<li>設定頁右上角有「<b>↺ 重設</b>」，按一下回到預設（中央 Do–Si、彩色蘋果、聲音開）。</li>' +
      '<li>右下角可以「聽旋律」（播放譜上的蘋果）、「顯示答案」；右上角燈泡鈕打開後，拖曳時會顯示位置音名。</li>' +
      '</ol>' +
      '<div class="row"><button class="btn" type="button">知道了</button></div>' +
      '</div>';
    wrap.querySelector('button').addEventListener('click', () => wrap.remove());
    document.getElementById('stage').appendChild(wrap);
  }

  return { fit, show, modal, help };
})();

document.addEventListener('DOMContentLoaded', function () {
  if (AP.core && AP.core.injectZhuyinFont) AP.core.injectZhuyinFont();
  AP.sfx = new AP.Audio();
  AP.gameAudio = AP.sfx;

  document.getElementById('scoreIcon').innerHTML = AP.core.ICON.apple;
  document.getElementById('btnSound').innerHTML = AP.core.ICON.sound;
  document.getElementById('btnHint').innerHTML = AP.core.ICON.hint;
  document.getElementById('btnReplay').innerHTML = AP.core.ICON.replay;
  document.getElementById('btnBack').innerHTML = AP.core.ICON.back;

  AP.Setup.init();
  AP.Game.init();
  if (AP.Home) AP.Home.init();
  AP.ui.fit();
  AP.ui.show('home');

  window.addEventListener('resize', AP.ui.fit);
  window.addEventListener('orientationchange', () => setTimeout(AP.ui.fit, 120));

  // 任意互動解鎖音訊
  const unlock = () => { AP.sfx.unlock(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // 快捷鍵
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const wrap = document.querySelector('.modal-wrap');
      if (wrap) { wrap.remove(); return; }
    }
  });

  // 關閉右鍵選單，避免長按拖曳時跳出
  document.getElementById('stage').addEventListener('contextmenu', (e) => e.preventDefault());
});
