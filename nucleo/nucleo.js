/* ============================================================================
 * TAPHUB · NÚCLEO COMUM — N1
 * ----------------------------------------------------------------------------
 * Código que serve a mais de um módulo e por isso NÃO mora dentro de nenhum:
 * sessão, conexão com o banco, PIN e a trava. Regra de negócio nunca entra
 * aqui (fica no módulo e nas funções tf_*). Sem framework, sem build.
 *
 * COMO UM MÓDULO USA (duas linhas no <head> e uma no boot):
 *   <script src="../nucleo/config.js?v=N1"></script>
 *   <script src="../nucleo/nucleo.js?v=N1"></script>
 *   ...
 *   const g = Nucleo.porteiro({ app:'manager', demo:DEMO, url:SUPABASE_URL, anon:SUPABASE_ANON_KEY });
 *   if (g === 'hub') { irParaHub(Nucleo.recado); return; }     // ANTES do iniciar()
 *
 * O ?v=N1 NÃO é enfeite: o service worker do Field guarda tudo o que não é
 * página com cache primeiro; sem a versão no endereço o Field ficaria preso
 * numa versão velha do núcleo. E o endereço guardado nos ESSENCIAIS dos
 * service workers tem que ser IGUAL a este, com o ?v=.
 *
 * O QUE ELE GARANTE
 *  · O PIN é uma TRAVA por cima da sessão (tf_sessao), não uma sessão nova.
 *  · Trava depois de 5 min em segundo plano (celular) ou ao fechar o navegador /
 *    depois de 12 h (computador). A trava COBRE a tela com o PIN, por cima da
 *    página: NUNCA troca de página, senão se perde o que a pessoa estava
 *    digitando (foto no Field, janela aberta no Manager).
 *  · Com sinal, o SERVIDOR confere o PIN e conta os erros (5 = 15 min, o mesmo
 *    contador de quem assina EPI). Sem sinal, o aparelho confere um resumo
 *    (PBKDF2) guardado depois de um PIN conferido com sinal, e limita a 5
 *    tentativas. O hash do servidor nunca vai para o aparelho.
 *  · Modo demonstração e arquivo aberto do disco não passam pelo porteiro.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.Nucleo && window.Nucleo.versao) return;

  var VERSAO = 'N1';
  var SCRIPT = (document.currentScript && document.currentScript.src) || '';
  var RAIZ = SCRIPT ? new URL('../', SCRIPT).href : (location.origin + '/');
  var NO_SERVIDOR = location.protocol === 'http:' || location.protocol === 'https:';

  // limites (milissegundos). `Nucleo.limites` é mexível só para o teste de tela.
  var L = { bg: 5 * 60 * 1000, h12: 12 * 3600 * 1000, tentativas_local: 5, iter: 150000 };

  var K_SESSAO = 'tf_sessao', K_TRAVA = 'tf_trava', K_TRAVADO = 'tf_travado',
      K_DESTRAV = 'tf_destrav', K_OCULTO = 'tf_oculto', K_TENT = 'tf_pin_tent',
      K_EFEMERO = 'tf_efemero', K_VOLTAS = 'tf_hub_voltas';

  var conf = { url: '', anon: '', app: '', demo: false };

  /* ── armazenamento: nunca derruba a página ─────────────────────────────── */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function jget(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  function marcaNavegador() {
    try { document.cookie = 'tf_nav=1; path=/; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) {}
  }
  function temNavegador() { return /(?:^|;\s*)tf_nav=1/.test(document.cookie || ''); }

  function celular() {
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPod|iPad|Mobile/i.test(ua) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /* ── sessão ────────────────────────────────────────────────────────────── */
  function sessao() { return jget(K_SESSAO) || {}; }
  function gravarSessao(s) { lsSet(K_SESSAO, JSON.stringify(s)); }
  function limparSessao() { lsDel(K_SESSAO); lsDel('tapflow_sessao'); lsDel('tff_sessao'); }
  function primeiroNome(s) { return String((s && (s.nome || s.email)) || '').split(' ')[0]; }
  function iniciais(s) {
    var p = String((s && (s.nome || s.email)) || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  /* ── conexão com o banco ───────────────────────────────────────────────── */
  function cfgDoBanco() {
    var c = window.TF_CONFIG || {};
    return { url: c.SUPABASE_URL || conf.url || '', anon: c.SUPABASE_ANON_KEY || conf.anon || '' };
  }
  function comPrazo(ms) {
    var c = new AbortController();
    setTimeout(function () { c.abort(); }, ms || 12000);
    return c.signal;
  }
  function erro(msg, status, rede) { var e = new Error(msg); e.status = status; e.rede = !!rede; return e; }

  var renovando = null;
  function renovar() {
    var s = sessao();
    if (!s.refresh) return Promise.resolve(false);
    if (renovando) return renovando;
    var c = cfgDoBanco();
    renovando = fetch(c.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: c.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh }), signal: comPrazo(12000)
    }).then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); })
      .then(function (x) {
        if (!x[0] || !x[1] || !x[1].access_token) return false;
        var n = sessao(); n.token = x[1].access_token; if (x[1].refresh_token) n.refresh = x[1].refresh_token;
        gravarSessao(n); return true;
      })
      .catch(function () { return false; })
      .then(function (ok) { setTimeout(function () { renovando = null; }, 0); return ok; });
    return renovando;
  }

  /** chamada ao PostgREST/Auth. 401 → renova o token e tenta de novo uma vez. */
  function api(caminho, opt, _jaRenovou) {
    opt = opt || {};
    var c = cfgDoBanco(), s = sessao();
    var h = { apikey: c.anon, 'Content-Type': 'application/json' };
    if (s.token) h.Authorization = 'Bearer ' + s.token;
    return fetch(c.url + caminho, {
      method: opt.method || 'GET', headers: h,
      body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined, signal: comPrazo(opt.ms)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.status === 401 && !_jaRenovou) {
          return renovar().then(function (ok) {
            if (ok) return api(caminho, opt, true);
            throw erro('Sua sessão expirou.', 401);
          });
        }
        if (!r.ok) throw erro((j && (j.message || j.error_description || j.msg || j.hint)) || ('Erro ' + r.status), r.status);
        return j;
      });
    }, function () { throw erro('Sem sinal.', 0, true); });
  }
  function rpc(nome, corpo) { return api('/rest/v1/rpc/' + nome, { method: 'POST', body: corpo || {} }); }

  /* ── resumo local do PIN (só para destravar SEM SINAL) ─────────────────── */
  function b64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(t) { var s = atob(t), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function derivar(pin, salB64, iter) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error('sem crypto'));
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salB64), iterations: iter, hash: 'SHA-256' }, k, 256);
      }).then(b64);
  }

  /* ── configuração da trava, por pessoa (e-mail) neste navegador ────────── */
  function todasCfg() { return jget(K_TRAVA) || {}; }
  function cfgDe(email) { var m = todasCfg(); return (email && m[String(email).toLowerCase()]) || null; }
  function gravarCfg(email, obj) { var m = todasCfg(); m[String(email).toLowerCase()] = obj; lsSet(K_TRAVA, JSON.stringify(m)); }
  function apagarCfg(email) { var m = todasCfg(); delete m[String(email).toLowerCase()]; lsSet(K_TRAVA, JSON.stringify(m)); }
  function guardarResumo(email, ap, pin) {
    var sal = b64(crypto.getRandomValues(new Uint8Array(16)));
    return derivar(pin, sal, L.iter).then(function (h) {
      gravarCfg(email, { ap: ap, ver: { s: sal, i: L.iter, h: h } });
    });
  }
  function nomeDoAparelho() {
    var ua = navigator.userAgent || '', n = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' :
      /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
    return (celular() ? 'Celular' : 'Computador') + ' · ' + n;
  }

  /* ── estado da trava ───────────────────────────────────────────────────── */
  function destravar() {
    lsSet(K_DESTRAV, String(Date.now())); lsDel(K_TRAVADO); lsDel(K_OCULTO); marcaNavegador();
  }
  /** Por que precisa travar agora? (null = não precisa) */
  function motivoDeTravar() {
    if (lsGet(K_TRAVADO) === '1') return 'marcada';
    var t = Number(lsGet(K_DESTRAV) || 0);
    if (!t) return 'sem_destrave';
    if (celular()) {
      var oc = Number(lsGet(K_OCULTO) || 0);
      return (oc && Date.now() - oc > L.bg) ? 'segundo_plano' : null;
    }
    if (!temNavegador()) return 'navegador_fechado';
    return (Date.now() - t > L.h12) ? 'doze_horas' : null;
  }

  /* ── sair para o login do hub ──────────────────────────────────────────── */
  function sairParaLogin(recado, limpar) {
    if (limpar !== false) limparSessao();
    try { sessionStorage.setItem('tf_recado', recado || ''); } catch (e) {}
    var para = conf.app && conf.app !== 'hub' ? ('?para=' + conf.app) : '';
    location.href = RAIZ + para;
  }

  /* ── a tela do PIN ─────────────────────────────────────────────────────── */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var tela = null;

  function fecharTela() {
    if (!tela) return;
    document.removeEventListener('keydown', tela.teclado, true);
    if (tela.el && tela.el.parentNode) tela.el.parentNode.removeChild(tela.el);
    document.documentElement.removeAttribute('data-tf-trava');
    if (tela.foco && tela.foco.focus) { try { tela.foco.focus(); } catch (e) {} }
    tela = null;
  }

  /**
   * Abre a tela do PIN (cobre a página, não troca de página).
   * Devolve { pin(), msg(t,ehErro), limpar(), ocupado(b), titulo(t), fechar(), cancelar() }.
   * pin() devolve uma promessa com os 6 dígitos (ou null se a tela foi cancelada).
   */
  function abrirTela(o) {
    fecharTela();
    var s = sessao(), dig = [], esperando = null, trancado = false;
    var el = document.createElement('div');
    el.id = 'tfPin'; el.className = 'tf-pin';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', o.titulo || 'PIN');
    // estilo mínimo EMBUTIDO: se o nucleo.css não carregar, a tela ainda cobre a página
    el.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:#0E1621;color:#E8EEF5;overflow:auto';
    var teclas = '';
    ['1','2','3','4','5','6','7','8','9','','0','<'].forEach(function (k) {
      teclas += k === '' ? '<span></span>'
        : '<button type="button" class="tf-k' + (k === '<' ? ' tf-apaga' : '') + '" data-k="' + k + '" ' +
          (k === '<' ? 'aria-label="Apagar"' : '') + '>' + (k === '<' ? '⌫' : k) + '</button>';
    });
    var links = (o.links || []).map(function (l, i) { return '<button type="button" class="tf-link" data-l="' + i + '">' + esc(l.txt) + '</button>'; }).join('');
    el.innerHTML =
      '<div class="tf-pin-in">' +
        '<div class="tf-logo" aria-hidden="true">T</div>' +
        '<div class="tf-marca"><span>Tap</span><b>Hub</b></div>' +
        '<div class="tf-quem"><span class="tf-av" aria-hidden="true">' + esc(iniciais(s)) + '</span>' +
          '<div class="tf-tit" id="tfPinTit">' + esc(o.titulo || '') + '</div>' +
          (o.sub ? '<div class="tf-sub" id="tfPinSub">' + esc(o.sub) + '</div>' : '<div class="tf-sub" id="tfPinSub"></div>') + '</div>' +
        '<div class="tf-pontos" id="tfPinPts" role="img" aria-label="0 de 6 dígitos digitados">' +
          '<i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="tf-msg" id="tfPinMsg" role="alert" aria-live="assertive"></div>' +
        '<div class="tf-teclas" id="tfPinTec">' + teclas + '</div>' +
        '<div class="tf-links">' + links + '</div>' +
      '</div>';
    var foco = document.activeElement;
    document.body.appendChild(el);
    document.documentElement.setAttribute('data-tf-trava', '1');

    var pts = el.querySelectorAll('#tfPinPts i');
    function pintar() {
      for (var i = 0; i < 6; i++) pts[i].className = i < dig.length ? 'on' : '';
      el.querySelector('#tfPinPts').setAttribute('aria-label', dig.length + ' de 6 dígitos digitados');
    }
    function tecla(k) {
      if (trancado || !esperando) return;
      if (k === '<') { dig.pop(); pintar(); return; }
      if (dig.length >= 6) return;
      dig.push(k); pintar();
      if (dig.length === 6) { var r = esperando; esperando = null; r(dig.join('')); }
    }
    el.querySelector('#tfPinTec').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-k]') : null; if (b) tecla(b.getAttribute('data-k'));
    });
    var h = {
      el: el, foco: foco,
      teclado: function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); tecla(e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); tecla('<'); }
      },
      pin: function () { return new Promise(function (ok) { esperando = ok; if (dig.length === 6) { dig = []; pintar(); } }); },
      msg: function (t, ehErro) { var m = el.querySelector('#tfPinMsg'); m.textContent = t || ''; m.className = 'tf-msg' + (ehErro ? ' erro' : ''); },
      limpar: function () { dig = []; pintar(); },
      ocupado: function (b) { trancado = !!b; el.classList.toggle('ocupado', !!b); },
      titulo: function (t, sub) { el.querySelector('#tfPinTit').textContent = t; if (sub !== undefined) el.querySelector('#tfPinSub').textContent = sub; },
      fechar: fecharTela,
      cancelar: function () { if (esperando) { var r = esperando; esperando = null; r(null); } }
    };
    (o.links || []).forEach(function (l, i) {
      el.querySelector('[data-l="' + i + '"]').addEventListener('click', function () { l.fn(h); });
    });
    document.addEventListener('keydown', h.teclado, true);
    tela = h;
    try { el.querySelector('.tf-k').focus(); } catch (e) {}
    return h;
  }

  /** Pergunta simples em tela cheia: devolve o índice do botão escolhido. */
  function perguntar(titulo, texto, botoes) {
    return new Promise(function (ok) {
      fecharTela();
      var s = sessao(), el = document.createElement('div');
      el.id = 'tfPin'; el.className = 'tf-pin';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', titulo);
      el.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:#0E1621;color:#E8EEF5;overflow:auto';
      el.innerHTML = '<div class="tf-pin-in"><div class="tf-logo" aria-hidden="true">T</div>' +
        '<div class="tf-marca"><span>Tap</span><b>Hub</b></div>' +
        '<div class="tf-quem"><span class="tf-av" aria-hidden="true">' + esc(iniciais(s)) + '</span>' +
        '<div class="tf-tit">' + esc(titulo) + '</div><div class="tf-sub">' + esc(texto) + '</div></div>' +
        '<div class="tf-botoes">' + botoes.map(function (b, i) {
          return '<button type="button" class="tf-bt' + (i === 0 ? ' pri' : '') + '" data-b="' + i + '">' + esc(b) + '</button>';
        }).join('') + '</div></div>';
      document.body.appendChild(el);
      document.documentElement.setAttribute('data-tf-trava', '1');
      tela = { el: el, teclado: function () {}, foco: null };
      el.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-b]') : null;
        if (b) { fecharTela(); ok(Number(b.getAttribute('data-b'))); }
      });
      try { el.querySelector('button').focus(); } catch (e) {}
    });
  }

  function limpaMsg(m) { return String(m || '').replace(/^.*?(O PIN|Usuário|Crie|Sua)/, '$1'); }
  function horaDe(iso) { try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

  /* ── conferir o PIN: servidor com sinal, aparelho sem sinal ────────────── */
  function conferirLocal(pin, c) {
    if (!c || !c.ver || !(window.crypto && crypto.subtle))
      return Promise.resolve({ ok: false, msg: 'Sem sinal. Conecte-se à internet para destravar.' });
    var t = Number(lsGet(K_TENT) || 0);
    if (t >= L.tentativas_local)
      return Promise.resolve({ ok: false, sair: true, recado: 'Erros demais sem sinal. Entre com e-mail e senha.' });
    return derivar(pin, c.ver.s, c.ver.i).then(function (h) {
      if (h === c.ver.h) { lsDel(K_TENT); return { ok: true, local: true }; }
      t++; lsSet(K_TENT, String(t));
      if (t >= L.tentativas_local) return { ok: false, sair: true, recado: 'Erros demais sem sinal. Entre com e-mail e senha.' };
      return { ok: false, msg: 'PIN errado (sem sinal). Restam ' + (L.tentativas_local - t) + ' tentativas.' };
    }, function () { return { ok: false, msg: 'Este navegador não consegue conferir o PIN sem sinal.' }; });
  }

  function conferir(pin, c, s) {
    return rpc('tf_meu_pin_conferir', { p_pin: pin, p_aparelho: c && c.ap || null }).then(function (j) {
      if (j && j.status === 'ok') {
        lsDel(K_TENT);
        var depois = c && !c.ver && window.crypto && crypto.subtle ? guardarResumo(s.email, c.ap, pin).catch(function () {}) : Promise.resolve();
        return depois.then(function () {
          return rpc('tf_aparelho_ok', { p_aparelho: c && c.ap || null }).then(function (ok) {
            if (ok === false) { apagarCfg(s.email); return { ok: false, sair: true, recado: 'Este aparelho foi desconectado. Entre com e-mail e senha.' }; }
            return { ok: true };
          }, function () { return { ok: true }; });   // aparelho_ok sem sinal: o PIN já foi aceito
        });
      }
      if (j && j.status === 'pin_errado') return { ok: false, msg: 'PIN errado. Restam ' + j.restantes + ' tentativas.' };
      if (j && j.status === 'bloqueado') return { ok: false, msg: 'PIN travado até ' + horaDe(j.ate) + '. Espere ou entre com e-mail e senha.' };
      return { ok: false, sair: true, recado: 'Crie o seu PIN para continuar.' };
    }, function (e) {
      if (e.rede) return conferirLocal(pin, c);
      if (e.status === 401) return { ok: false, sair: true, recado: 'Sua sessão expirou. Entre de novo.' };
      return { ok: false, msg: limpaMsg(e.message) || 'Não deu para conferir o PIN.' };
    });
  }

  /** Cobre a tela e pede o PIN. Resolve quando destravou (ou quando mandou para o login). */
  var destravando = null;
  function pedirDestrave() {
    if (destravando) return destravando;
    var s = sessao(), c = cfgDe(s.email);
    lsSet(K_TRAVADO, '1');
    var t = abrirTela({
      titulo: primeiroNome(s) + ', digite seu PIN',
      links: [
        { txt: 'Esqueci o PIN (entrar com e-mail e senha)', fn: function () { sairParaLogin('Entre com e-mail e senha. Se esqueceu o PIN, peça para o RH liberar.'); } },
        { txt: 'Não é você? Trocar de conta', fn: function () { sairParaLogin(''); } }
      ]
    });
    destravando = (function laco() {
      return t.pin().then(function (pin) {
        if (pin === null) return false;
        t.ocupado(true); t.msg('');
        return conferir(pin, c, s).then(function (r) {
          t.ocupado(false);
          if (r.ok) { destravar(); t.fechar(); return true; }
          t.limpar(); t.msg(r.msg || '', true);
          if (r.sair) { setTimeout(function () { sairParaLogin(r.recado); }, 900); return false; }
          return laco();
        });
      });
    })().then(function (v) { destravando = null; return v; }, function (e) { destravando = null; throw e; });
    return destravando;
  }

  /* ── fluxo de entrada (hub): criar PIN e lembrar o aparelho ────────────── */
  function criarPin(t) {
    // pede duas vezes; devolve o PIN criado no servidor
    t.titulo('Crie o seu PIN', '6 números. Ele destrava o TapHub neste aparelho e confirma assinaturas.');
    return (function laco() {
      return t.pin().then(function (p1) {
        if (p1 === null) return null;
        t.limpar(); t.msg('');
        t.titulo('Digite de novo para confirmar');
        return t.pin().then(function (p2) {
          if (p2 === null) return null;
          t.limpar();
          if (p1 !== p2) { t.titulo('Crie o seu PIN'); t.msg('Os dois PINs não batem. Comece de novo.', true); return laco(); }
          t.ocupado(true);
          return rpc('tf_meu_pin_definir', { p_pin_novo: p1 }).then(function (r) {
            t.ocupado(false);
            if (r && r.status === 'ok') return p1;
            t.titulo('Crie o seu PIN'); t.msg('Não deu para criar o PIN.', true); return laco();
          }, function (e) {
            t.ocupado(false); t.titulo('Crie o seu PIN');
            t.msg(e.rede ? 'Sem sinal. Tente de novo com internet.' : limpaMsg(e.message), true);
            return laco();
          });
        });
      });
    })();
  }
  function lembrarAparelho(s, pin) {
    return rpc('tf_aparelho_registrar', { p_nome: nomeDoAparelho() }).then(function (ap) {
      lsDel(K_EFEMERO);
      var p = window.crypto && crypto.subtle ? guardarResumo(s.email, ap, pin) : (gravarCfg(s.email, { ap: ap }), Promise.resolve());
      return p.catch(function () { gravarCfg(s.email, { ap: ap }); }).then(function () { destravar(); return 'ok'; });
    });
  }
  function naoLembrar() { lsSet(K_EFEMERO, '1'); destravar(); return 'efemero'; }

  /**
   * Depois de entrar com a senha (ou com sessão antiga e sem PIN neste aparelho):
   * cria o PIN se não tem e pergunta se lembra o aparelho.
   * Devolve 'ok' | 'efemero' | 'offline'.
   */
  function fluxoEntrada() {
    var s = sessao(), c = cfgDe(s.email);
    function seguir() {
      return rpc('tf_meu_pin_situacao').then(function (sit) {
        var pinNovo = null;
        var pronto = (!sit || !sit.tem_pin)
          ? (function () {
              var t = abrirTela({ titulo: 'Crie o seu PIN', links: [] });
              return criarPin(t).then(function (p) { t.fechar(); pinNovo = p; return p !== null; });
            })()
          : Promise.resolve(true);
        return pronto.then(function (ok) {
          if (!ok) return 'offline';
          return perguntar('Lembrar este aparelho?',
            'Se for o seu celular ou computador, lembre: ele passa a pedir só o PIN. Em computador de uso comum, escolha não lembrar: ao fechar o navegador você sai.',
            ['Lembrar este aparelho', 'Não lembrar (uso comum)']).then(function (i) {
            if (i === 1) return naoLembrar();
            if (pinNovo) return lembrarAparelho(s, pinNovo);
            // já tinha PIN: confirma com ele antes de registrar o aparelho
            var t = abrirTela({ titulo: 'Digite seu PIN', sub: 'Para lembrar este aparelho.',
              links: [{ txt: 'Não lembrar neste aparelho', fn: function (h) { h.cancelar(); } }] });
            return (function laco() {
              return t.pin().then(function (pin) {
                if (pin === null) { t.fechar(); return naoLembrar(); }
                t.ocupado(true);
                return rpc('tf_meu_pin_conferir', { p_pin: pin, p_aparelho: null }).then(function (j) {
                  t.ocupado(false);
                  if (j && j.status === 'ok') { t.fechar(); return lembrarAparelho(s, pin); }
                  t.limpar();
                  t.msg(j && j.status === 'pin_errado' ? 'PIN errado. Restam ' + j.restantes + ' tentativas.'
                        : j && j.status === 'bloqueado' ? 'PIN travado até ' + horaDe(j.ate) + '.' : 'Não deu para conferir.', true);
                  return laco();
                }, function (e) {
                  t.ocupado(false); t.limpar(); t.msg(e.rede ? 'Sem sinal. Tente de novo com internet.' : limpaMsg(e.message), true);
                  return laco();
                });
              });
            })();
          });
        });
      }, function (e) {
        if (e.rede) { ssSet('tf_pin_pulou', '1'); return 'offline'; }
        throw e;
      });
    }
    if (c) {   // aparelho já lembrado: entrou com a senha, não pede o PIN de novo
      return rpc('tf_aparelho_ok', { p_aparelho: c.ap }).then(function (ok) {
        if (ok === false) { apagarCfg(s.email); return seguir(); }
        destravar(); return 'ok';
      }, function (e) {
        if (e.rede) { destravar(); return 'ok'; }
        throw e;
      });
    }
    return seguir();
  }

  /* ── monitoramento: voltar do segundo plano, 12 h ──────────────────────── */
  var monitorando = false;
  function monitorar() {
    if (monitorando) return; monitorando = true;
    function avaliar() {
      if (!cfgDe(sessao().email)) return;
      if (motivoDeTravar()) pedirDestrave();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { lsSet(K_OCULTO, String(Date.now())); }
      else { avaliar(); if (!motivoDeTravar() && !destravando) lsDel(K_OCULTO); }
    });
    window.addEventListener('storage', function (e) {      // outra aba travou/destravou
      if (e.key === K_TRAVADO && e.newValue === '1') avaliar();
      if (e.key === K_TRAVADO && e.newValue === null && tela && tela.el && !destravando) fecharTela();
    });
    setInterval(avaliar, 30000);
  }

  /* ── o porteiro ────────────────────────────────────────────────────────── */
  var api_ = {
    versao: VERSAO, recado: '', limites: L,
    /**
     * Chamar no boot, ANTES do iniciar().  opts: { app, demo, url, anon }
     * Devolve:
     *   'livre'   → pode seguir (inclui "travado, cobrindo a tela com o PIN")
     *   'hub'     → sem trava configurada: o app manda para o hub (Nucleo.recado diz o porquê)
     *   'entrada' → só no hub: rode Nucleo.fluxoEntrada() (criar PIN / lembrar aparelho)
     */
    porteiro: function (opts) {
      opts = opts || {};
      conf.app = opts.app || ''; conf.demo = !!opts.demo; conf.url = opts.url || ''; conf.anon = opts.anon || '';
      if (conf.demo || !NO_SERVIDOR) return 'livre';
      var c = cfgDoBanco();
      if (!c.url || !c.anon) return 'livre';
      var s = sessao();
      if (!s.token) return 'livre';                    // sem sessão, o próprio app manda ao hub
      var cfg = cfgDe(s.email);
      if (cfg) {
        monitorar();
        if (motivoDeTravar()) { pedirDestrave(); }
        else { lsDel(K_OCULTO); }
        return 'livre';
      }
      // sem trava neste aparelho
      if (lsGet(K_EFEMERO) === '1') {
        if (temNavegador()) { monitorar(); return 'livre'; }
        limparSessao();
        api_.recado = 'Você saiu ao fechar o navegador. Entre de novo.';
        return conf.app === 'hub' ? 'livre' : 'hub';
      }
      if (conf.app === 'hub') return 'entrada';
      // sessão de antes do PIN: online, o hub cria o PIN; sem sinal, deixa entrar
      var voltas = Number(ssGet(K_VOLTAS) || 0);
      if (ssGet('tf_pin_pulou') === '1' || voltas >= 2 || navigator.onLine === false) return 'livre';
      ssSet(K_VOLTAS, String(voltas + 1));
      api_.recado = 'Crie o seu PIN para continuar.';
      return 'hub';
    },
    fluxoEntrada: fluxoEntrada,
    pedirDestrave: pedirDestrave,
    travarAgora: function () { lsSet(K_TRAVADO, '1'); if (cfgDe(sessao().email)) pedirDestrave(); },
    configurar: function (o) { conf.url = o.url || conf.url; conf.anon = o.anon || conf.anon; if (o.app) conf.app = o.app; },
    rpc: rpc, api: api, sessao: sessao, primeiroNome: primeiroNome,
    /** Sair de verdade (botão Sair): apaga a sessão, mantém o aparelho lembrado. */
    sair: function () { limparSessao(); lsDel(K_TRAVADO); }
  };
  window.Nucleo = api_;
})();
