/* ============================================================================
 * nucleo/modulos.js · M1 — os módulos do sistema num lugar só
 * ----------------------------------------------------------------------------
 * H10 (23/10/2026, chat central). Desenho: processos/hub-h10-layout-desenho.md.
 *
 * Uma fonte só para: o nome, a frase, a cor e a miniatura de cada módulo. O
 * hub desenha os cards com isto; cada módulo pinta a própria MOLDURA com isto
 * (opção A do Bruno: logo, menu lateral, item ativo, faixa do topo e barra da
 * janela; botões e cores de significado NÃO mudam); e o botão "Trocar de
 * módulo" abre o menu de UMA coluna com os módulos que a pessoa pode abrir.
 *
 * Como usar numa página (depois do nucleo.js):
 *   <script src="../nucleo/modulos.js?v=M1"></script>
 *   TapModulos.aplicar('tapfin');               // a moldura (variáveis CSS)
 *   TapModulos.trocador(botao, 'tapfin');       // o botão abre o menu
 *   (no Manager, que tem várias áreas: trocador(botao, () => chaveDaAreaAtual))
 * Variáveis que a página pode usar no CSS da moldura:
 *   --mod (a cor do card) · --mod-escuro (fundo do menu lateral)
 *   --mod-claro (texto/realce sobre fundo escuro) · --mod-suave (fundo claro)
 *
 * Quem pode abrir o quê vem do SERVIDOR (tf_hub_modulos, a mesma regra do
 * hub). A lista fica guardada no aparelho para abrir sem sinal.
 * Arquivo novo: não mexe no nucleo.js (N2) nem obriga trocar o ?v= dele.
 * ⚠ Mudou este arquivo? Troque o ?v=M1 em todas as páginas e nos sw.js.
 * ========================================================================== */
(function () {
  'use strict';
  var VERSAO = 'M1';

  // A raiz do app: este arquivo mora em <raiz>/nucleo/.
  var RAIZ = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return new URL('../', s).href;
    } catch (e) {}
    return new URL('./', location.href).href;
  })();

  var IC = {
    tapflow: '<rect x="3" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="15" width="8" height="6" rx="1.5"/><path d="M7 9v6a2 2 0 0 0 2 2h4"/><path d="M11 15l2 2-2 2"/><path d="M15 6h3a2 2 0 0 1 2 2v3"/><path d="M18 9.5l2 2 2-2"/>',
    tapcrm: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.2a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M3 12.5h18M10.5 12.5v2h3v-2"/>',
    tapfin: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M13.6 9.6c-.4-.6-1-.9-1.7-.9-1 0-1.7.5-1.7 1.3 0 1.8 3.5.9 3.5 2.7 0 .8-.8 1.4-1.8 1.4-.8 0-1.5-.4-1.8-.9M12 7.6v1.1M12 14.1v1.1"/><path d="M5.5 9v6M18.5 9v6"/>',
    taprh: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6"/><circle cx="17" cy="8.8" r="2.5"/><path d="M16.2 14.5c2.8.2 4.8 2.2 4.8 5.2"/>',
    tapseg: '<path d="M4 17a8 8 0 0 1 16 0z"/><path d="M2.5 17h19M12 9V5.5M9 6.5V11M15 6.5V11"/>',
    tapdoc: '<rect x="5.5" y="4.5" width="13" height="16.5" rx="2"/><path d="M9 4.5V3.2h6v1.3"/><path d="M8.8 10.5l1.4 1.4 2.6-2.6M14.5 11h1.5M8.8 16l1.4 1.4 2.6-2.6M14.5 16.5h1.5"/>',
    cadastros: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6"/><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
    gestao: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="7" rx=".8"/><rect x="10.5" y="6" width="3" height="12" rx=".8"/><rect x="15.5" y="13" width="3" height="5" rx=".8"/>',
    campo: '<path d="M9 3.5 4 6v13l5-2.5 6 3 5-2.5V4l-5 2.5z"/><path d="M9 3.5v13M15 6.5v13"/>',
    seg: '<rect x="4" y="3" width="16" height="18" rx="2.2"/><path d="M9.5 3v2.2h5V3"/><circle cx="12" cy="11" r="2.6"/><path d="M7.8 17.5c.6-2 2.3-3.2 4.2-3.2s3.6 1.2 4.2 3.2"/>',
    tapweb: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    inicio: '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/>'
  };

  // A ordem é a dos cards do hub. `chave` = a porta do servidor (tf_hub_modulos).
  var LISTA = [
    { chave: 'tapflow',   titulo: 'TapFlow',    texto: 'OS, quadros e agenda',          cor: '#1D4ED8', href: 'manager/?ir=adm' },   // S87: abre no quadro da Administrativa
    { chave: 'tapcrm',    titulo: 'TapCRM',     texto: 'Negócios e propostas',          cor: '#C2410C', href: 'manager/?ir=com' },
    { chave: 'tapfin',    titulo: 'TapFin',     texto: 'Financeiro e cartões',          cor: '#15803D', href: 'fin/' },
    { chave: 'taprh',     titulo: 'TapRH',      texto: 'Pessoal, diárias e ponto',      cor: '#6D28D9', href: 'manager/?ir=rhf' },
    { chave: 'tapseg',    titulo: 'TapSeg',     texto: 'EPI, ASO e treinamentos',       cor: '#BE123C', href: 'manager/?ir=rhs' },
    { chave: 'tapdoc',    titulo: 'TapDoc',     texto: 'Preparar a inspeção NR-13',     cor: '#A16207', href: 'doc/' },
    { chave: 'cadastros', titulo: 'Cadastros',  texto: 'Clientes e catálogo',           cor: '#334155', href: 'manager/?ir=cad' },
    { chave: 'gestao',    titulo: 'Gestão',     texto: 'Relatórios',                    cor: '#A21CAF', href: 'manager/?ir=rel' },   // S87: os quadros passaram ao TapFlow
    { chave: 'campo',     titulo: 'Campo',      texto: 'Levantamento, mesmo sem sinal', cor: '#0E7490', href: 'field/' },
    // "Minha área" (antes "Minha Segurança"): o autoatendimento de quem não usa o Campo.
    { chave: 'seg',       titulo: 'Minha área', texto: 'EPI, ponto e diárias',          cor: '#5B7189', href: 'field/' }
  ];
  var EM_BREVE = [{ chave: 'tapweb', titulo: 'TapWeb', texto: 'Portal do cliente' }];

  function porChave(k) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].chave === k) return LISTA[i]; return null; }
  function icone(k, cls, cor) {
    return '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="' + (cor || 'currentColor')
      + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || '') + '</svg>';
  }
  function url(m) { return RAIZ + m.href; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ── tons da moldura ────────────────────────────────────────────────────
  function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function hex(a) { return '#' + a.map(function (x) { return ('0' + Math.round(Math.max(0, Math.min(255, x))).toString(16)).slice(-2); }).join(''); }
  function mistura(a, b, t) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function tons(cor) {
    return { mod: cor, escuro: mistura(cor, '#05090E', 0.72), claro: mistura(cor, '#FFFFFF', 0.45), suave: mistura(cor, '#FFFFFF', 0.9) };
  }

  /** Pinta a moldura do módulo: variáveis CSS na raiz e a cor da barra da janela. */
  function aplicar(chave) {
    var m = porChave(chave); if (!m) return null;
    var t = tons(m.cor), r = document.documentElement.style;
    r.setProperty('--mod', t.mod); r.setProperty('--mod-escuro', t.escuro);
    r.setProperty('--mod-claro', t.claro); r.setProperty('--mod-suave', t.suave);
    document.documentElement.setAttribute('data-modulo', chave);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = t.mod;
    return t;
  }

  // ── quem abre o quê ────────────────────────────────────────────────────
  var K_PORTAS = 'tf_portas';
  function quem() { try { var s = window.Nucleo && Nucleo.sessao && Nucleo.sessao(); return (s && (s.email || s.usuario_id)) || ''; } catch (e) { return ''; } }
  function guardarPortas(portas, dono) {
    try { localStorage.setItem(K_PORTAS, JSON.stringify({ q: dono || quem(), p: portas || [] })); } catch (e) {}
  }
  function portasGuardadas() {
    try { var g = JSON.parse(localStorage.getItem(K_PORTAS) || 'null'); if (g && g.p && (!g.q || g.q === quem())) return g.p; } catch (e) {}
    return null;
  }
  /** A lista do servidor; sem sinal, a guardada; sem nenhuma, null. */
  function portas() {
    var g = portasGuardadas();
    var api = window.Nucleo && Nucleo.api && Nucleo.api.rpc;
    if (!api || navigator.onLine === false) return Promise.resolve(g);
    return Nucleo.api.rpc('tf_hub_modulos', {}).then(function (p) {
      if (Array.isArray(p)) { guardarPortas(p); return p; }
      return g;
    }, function () { return g; });
  }

  // ── o menu "Trocar de módulo" (uma coluna) ─────────────────────────────
  var CSS = '.tm-fundo{position:fixed;inset:0;z-index:9998;background:transparent}'
    + '.tm{position:fixed;z-index:9999;width:340px;max-width:calc(100vw - 16px);max-height:calc(100vh - 24px);overflow-y:auto;background:#fff;color:#14181B;'
    + 'border:1px solid #DBE0E3;border-radius:12px;box-shadow:0 18px 40px -12px rgba(15,23,25,.35);padding:10px;'
    + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left}'
    + '.tm-cab{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#78838A;padding:4px 8px 8px}'
    + '.tm-i{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;text-decoration:none;color:inherit;position:relative;outline:0}'
    + '.tm-i:hover,.tm-i:focus-visible{background:#F1F3F4}'
    + '.tm-i.at{background:var(--tm-suave,#EEF2F6);box-shadow:inset 0 0 0 1px var(--tm-borda,#CBD5E1)}'
    + '.tm-q{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}'
    + '.tm-q svg{width:18px;height:18px}'
    + '.tm-t{min-width:0}.tm-t b{display:block;font-size:14px;color:#14181B;line-height:1.25}'
    + '.tm-t small{display:block;font-size:12px;color:#78838A;line-height:1.3}'
    + '.tm-v{margin-left:auto;font-size:11px;font-weight:700;padding-left:8px}'
    + '.tm-sep{height:1px;background:#EBEFF1;margin:8px 4px}'
    + '.tm-vazio{font-size:13px;color:#78838A;padding:6px 8px}'
    + '@media(max-width:520px){.tm{left:8px !important;right:8px !important;width:auto;max-width:none}}';
  function css() {
    if (document.getElementById('tm-css')) return;
    var s = document.createElement('style'); s.id = 'tm-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  var aberto = null;
  function fechar() {
    if (!aberto) return;
    aberto.fundo.remove(); aberto.menu.remove();
    document.removeEventListener('keydown', aberto.tecla, true);
    var b = aberto.botao; aberto = null;
    if (b) { b.setAttribute('aria-expanded', 'false'); try { b.focus(); } catch (e) {} }
  }
  function item(m, atual) {
    var at = m.chave === atual, t = tons(m.cor);
    return '<a class="tm-i' + (at ? ' at' : '') + '" role="menuitem" href="' + esc(url(m)) + '" data-chave="' + esc(m.chave) + '"'
      + (at ? ' aria-current="page" style="--tm-suave:' + t.suave + ';--tm-borda:' + mistura(m.cor, '#FFFFFF', 0.7) + '"' : '') + '>'
      + '<span class="tm-q" style="background:' + m.cor + '">' + icone(m.chave, '', '#fff') + '</span>'
      + '<span class="tm-t"><b>' + esc(m.titulo) + '</b><small>' + esc(m.texto) + '</small></span>'
      + (at ? '<span class="tm-v" style="color:' + m.cor + '">aqui</span>' : '') + '</a>';
  }
  function montarMenu(lista, atual) {
    var h = '<div class="tm-cab">Trocar de módulo</div>';
    var ms = LISTA.filter(function (m) { return lista ? lista.indexOf(m.chave) >= 0 : m.chave === atual; });
    if (!ms.length) h += '<div class="tm-vazio">Sem sinal: abra o TapHub para ver os módulos.</div>';
    ms.forEach(function (m) { h += item(m, atual); });
    if (lista === null) h += '<div class="tm-vazio">Sem sinal: a lista completa aparece quando a conexão voltar.</div>';
    h += '<div class="tm-sep"></div><a class="tm-i" role="menuitem" href="' + esc(RAIZ) + '" data-chave="inicio">'
      + '<span class="tm-q" style="background:#1F2937">' + icone('inicio', '', '#fff') + '</span>'
      + '<span class="tm-t"><b>Início</b><small>Voltar ao TapHub</small></span></a>';
    return h;
  }
  function posicionar(menu, botao) {
    var r = botao.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + h > innerHeight - 8 && r.top - 6 - h > 8) top = r.top - 6 - h;   // sem espaço embaixo: abre para cima
    menu.style.left = left + 'px'; menu.style.top = Math.max(8, Math.min(top, innerHeight - h - 8)) + 'px';
  }
  /** Abre o menu junto do botão. `atual` = a chave do módulo onde a pessoa está. */
  function abrir(botao, atual) {
    if (aberto) { fechar(); return; }
    if (typeof atual === 'function') { try { atual = atual(); } catch (e) { atual = null; } }
    css();
    var fundo = document.createElement('div'); fundo.className = 'tm-fundo';
    var menu = document.createElement('nav'); menu.className = 'tm'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Trocar de módulo');
    menu.innerHTML = montarMenu(portasGuardadas(), atual);
    document.body.appendChild(fundo); document.body.appendChild(menu);
    posicionar(menu, botao);
    var tecla = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var l = Array.prototype.slice.call(menu.querySelectorAll('.tm-i')), i = l.indexOf(document.activeElement);
        e.preventDefault(); (l[(i + (e.key === 'ArrowDown' ? 1 : l.length - 1)) % l.length] || l[0]).focus();
      }
    };
    aberto = { fundo: fundo, menu: menu, botao: botao, tecla: tecla };
    fundo.addEventListener('click', fechar);
    document.addEventListener('keydown', tecla, true);
    botao.setAttribute('aria-expanded', 'true');
    var a = menu.querySelector('.tm-i.at') || menu.querySelector('.tm-i'); if (a) a.focus();
    // a lista do servidor chega depois (com sinal) e substitui a guardada
    portas().then(function (p) {
      if (!aberto || aberto.menu !== menu || p === null) return;
      menu.innerHTML = montarMenu(p, atual); posicionar(menu, botao);
      var b = menu.querySelector('.tm-i.at') || menu.querySelector('.tm-i'); if (b) b.focus();
    });
  }
  /** Liga o botão: troca o texto para "Trocar de módulo" e abre o menu no clique. */
  function trocador(botao, atual) {
    if (!botao) return;
    botao.setAttribute('aria-haspopup', 'menu'); botao.setAttribute('aria-expanded', 'false');
    botao.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); abrir(botao, atual); });
  }

  window.TapModulos = {
    versao: VERSAO, raiz: RAIZ, lista: LISTA, emBreve: EM_BREVE, porChave: porChave,
    icone: icone, url: url, tons: tons, aplicar: aplicar,
    portas: portas, guardarPortas: guardarPortas, portasGuardadas: portasGuardadas,
    trocador: trocador, abrir: abrir, fechar: fechar
  };
})();
