/* VORONKOV.DESIGN — подпись студии в подвале сайта.
   Подключение: <script src="vd-stamp.js" defer></script> ... <vd-stamp></vd-stamp> */
(function () {
  var CSS =
    'vd-stamp{display:block}' +
    'vd-stamp .vd-stamp{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin:0;color:inherit;font:inherit;font-size:max(12px,1em);line-height:1.4;letter-spacing:normal;text-transform:none}' +
    'vd-stamp .vd-stamp__mark{display:flex;flex-direction:row;align-items:center;gap:8px;color:inherit;text-decoration:none}' +
    'vd-stamp .vd-stamp__logo{width:13px;height:13px;flex:none}' +
    'vd-stamp .vd-stamp__box{display:inline-block;border:1px solid currentColor;padding:3px 6px;font-size:10px;line-height:1;letter-spacing:.12em;text-transform:uppercase;opacity:.85;white-space:nowrap}' +
    'vd-stamp .vd-stamp__box i{font-style:normal;opacity:.6;margin-left:.25em}' +
    'vd-stamp .vd-stamp__year{font-size:10px;letter-spacing:.1em;opacity:.65}' +
    'vd-stamp .vd-stamp__note{opacity:.8;max-width:none}' +
    'vd-stamp .vd-stamp__note a{color:inherit;text-decoration:underline;text-underline-offset:2px}' +
    '@media (prefers-reduced-motion:no-preference){vd-stamp .vd-stamp__note a{transition:opacity .2s}vd-stamp .vd-stamp__note a:hover{opacity:.7}}';

  var HTML =
    '<div class="vd-stamp">' +
    '<a class="vd-stamp__mark" href="https://voronkov-design.ru/" target="_blank" rel="noopener">' +
    '<svg class="vd-stamp__logo" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M0 0h32v32H0Zm7 8h5.6L16 21.4 19.4 8H25l-5.4 16h-7.2Z"/></svg>' +
    '<span class="vd-stamp__box">VORONKOV<i>.DESIGN</i></span>' +
    '<span class="vd-stamp__year">2026</span>' +
    '</a>' +
    '<span class="vd-stamp__note">Задизайнено в студии <a href="https://voronkov-design.ru/" target="_blank" rel="noopener">Воронкова</a></span>' +
    '</div>';

  if (!document.getElementById('vd-stamp-style')) {
    var style = document.createElement('style');
    style.id = 'vd-stamp-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  if (!customElements.get('vd-stamp')) {
    customElements.define('vd-stamp', class extends HTMLElement {
      connectedCallback() {
        if (this.childElementCount) return;
        this.innerHTML = HTML;
      }
    });
  }
})();
