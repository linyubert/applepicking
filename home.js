/* =========================================================
   首頁（000）：以「採蘋果的孩子」為主視覺 + 標題 + Start + 關於作者
   ========================================================= */
window.AP = window.AP || {};

AP.Home = (function () {
  const C = AP.core, T = AP.theory;

  /* 主視覺改用插畫（assets/home-hero.jpg，建置時內嵌）；這層只留少量飄動裝飾 */
  function renderDecor() {
    const bg = document.getElementById('homeBg');
    if (!bg) return;
    bg.innerHTML =
      '<g class="home-drift">' +
      C.daisy(120, 700, 1.15, '#ffffff') + C.daisy(1180, 760, 1.05, '#fff0a8') +
      '</g>';
  }

  function init() {
    renderDecor();

    document.getElementById('btnHomeStart').addEventListener('click', () => {
      AP.sfx.unlock();
      AP.sfx.pop();
      AP.ui.show('setup');
    });

    document.getElementById('btnAbout').addEventListener('click', () => {
      AP.sfx.pop();
      AP.ui.modal({
        plain: true,
        title: '關於作者',
        subtitle: '蘋果五線譜・拖曳認譜練習',
        links: [
          { label: 'Threads', text: '@lycbert', href: 'https://www.threads.com/@lycbert', ic: 'threads' },
          { label: 'YouTube', text: '@datoemusic', href: 'https://www.youtube.com/@datoemusic', ic: 'youtube' }
        ],
        buttons: [
          { t: '前往 Threads', cls: 'green', fn: () => AP.Home.openAuthor('https://www.threads.com/@lycbert') },
          { t: '前往 YouTube', cls: 'green', fn: () => AP.Home.openAuthor('https://www.youtube.com/@datoemusic') },
          { t: '關閉', cls: 'ghost' }
        ]
      });
    });
  }

  function openAuthor(url) {
    const w = window.open(url, '_blank', 'noopener');
    if (!w) location.href = url;   // 被瀏覽器阻擋時仍可前往
  }

  return { init, openAuthor };
})();
