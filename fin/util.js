/* ============================================================================
 * TAPFIN · fin/util.js — PLANO B do Núcleo N2 (provisório)
 * ----------------------------------------------------------------------------
 * Os utilitários do contrato `processos/nucleo-n2-contrato.md`, seção 2, com os
 * MESMOS nomes e o MESMO comportamento do Manager S72. Só preenche o que o
 * núcleo ainda não tem: quando o N2 chegar com `Nucleo.util`, `Nucleo.api.req`
 * e `Nucleo.janela`, este arquivo não faz nada e pode ser apagado — o código
 * do fin/ não muda.
 *
 * Carregar DEPOIS de ../nucleo/nucleo.js e ANTES do script da página.
 * A página diz quem ela é em <body data-app="tapfin"> (para onde o hub volta).
 * ========================================================================== */
(function () {
  'use strict';
  var N = window.Nucleo = window.Nucleo || {};

  // ── Nucleo.util ───────────────────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg, tipo) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast on' + (tipo ? ' ' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 4200);
  }
  function copiarVelho(texto, feito) {
    try {
      var t = document.createElement('textarea');
      t.value = texto; t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove(); feito();
    } catch (e) { toast('Não deu para copiar — selecione e copie à mão.', 'err'); }
  }
  async function semDuploEnvio(btn, fn) {
    if (btn && btn.dataset.enviando === '1') return;
    if (btn) btn.dataset.enviando = '1';
    var txt = btn ? btn.textContent : null;
    var desab = btn ? btn.disabled : false;
    if (btn) { btn.disabled = true; btn.classList.add('ocupado'); btn.textContent = 'Processando…'; }
    try { return await fn(); }
    finally {
      if (btn) { btn.disabled = desab; btn.classList.remove('ocupado');
                 btn.textContent = txt; delete btn.dataset.enviando; }
    }
  }
  var util = {
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); },
    toast: toast,
    BRL: function (v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
    dataBR: function (d) {
      if (!d) return new Date().toLocaleDateString('pt-BR');
      var t = String(d);
      return new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T12:00' : t).toLocaleDateString('pt-BR');
    },
    isoHoje: function (d) { var x = d || new Date();
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')
           + '-' + String(x.getDate()).padStart(2, '0'); },
    copiar: function (texto, msgOk) {
      var feito = function () { toast(msgOk || 'Copiado.', 'ok'); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(texto).then(feito, function () { copiarVelho(texto, feito); });
      } else copiarVelho(texto, feito);
    },
    arquivoParaBase64: function (f) { return new Promise(function (ok, err) {
      var r = new FileReader();
      r.onerror = function () { err(new Error('Não consegui ler o arquivo.')); };
      r.onload = function () { ok(r.result); };
      r.readAsDataURL(f);
    }); },
    semDuploEnvio: semDuploEnvio
  };
  N.util = N.util || {};
  Object.keys(util).forEach(function (k) { if (!N.util[k]) N.util[k] = util[k]; });

  // ── Nucleo.janela ─────────────────────────────────────────────────────────
  var focoAntes = null;
  function abrir(titulo, corpoHtml, botoes) {
    focoAntes = document.activeElement;
    document.getElementById('mTit').textContent = titulo;
    document.getElementById('mBody').innerHTML = corpoHtml;
    delete document.getElementById('mBody').dataset.ausOk;
    var f = document.getElementById('mFoot'); f.innerHTML = '';
    (botoes || []).forEach(function (b) {
      var el = document.createElement('button');
      el.className = 'btn' + (b.pri ? ' pri' : '') + (b.cls ? ' ' + b.cls : '');
      el.textContent = b.label;
      el.addEventListener('click', function () { N.util.semDuploEnvio(el, function () { return b.onClick(el); }); });
      f.appendChild(el);
    });
    document.getElementById('mScrim').hidden = false;
    document.getElementById('modal').hidden = false;
    requestAnimationFrame(function () {
      var alvo = document.querySelector('#mBody input,#mBody select,#mBody textarea')
              || document.querySelector('#mFoot .btn');
      if (alvo) alvo.focus();
    });
  }
  function fechar() {
    document.getElementById('mScrim').hidden = true;
    document.getElementById('modal').hidden = true;
    document.getElementById('modal').classList.remove('largo');
    if (focoAntes && document.body.contains(focoAntes)) { try { focoAntes.focus(); } catch (e) {} }
    focoAntes = null;
  }
  function confirmar(titulo, corpoHtml, rotuloSim, perigo) {
    return new Promise(function (ok) {
      N.janela.abrir(titulo, corpoHtml, [
        { label: 'Cancelar', onClick: function () { N.janela.fechar(); ok(false); } },
        { label: rotuloSim || 'Confirmar', pri: !perigo, onClick: function () { N.janela.fechar(); ok(true); } }
      ]);
    });
  }
  if (!N.janela) {
    N.janela = { abrir: abrir, fechar: fechar, confirmar: confirmar };
    // o X, o fundo e o Esc fecham (como no Manager)
    document.addEventListener('DOMContentLoaded', function () {
      var x = document.getElementById('mX'), s = document.getElementById('mScrim');
      if (x) x.addEventListener('click', function () { N.janela.fechar(); });
      if (s) s.addEventListener('click', function () { N.janela.fechar(); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      var m = document.getElementById('modal');
      if (m && !m.hidden) N.janela.fechar();
    });
  }

  // ── Nucleo.api.req / get / rpc ────────────────────────────────────────────
  // A camada de rede do Manager S72: 30 s leitura / 45 s escrita, escrita não
  // se repete sozinha (só com p_client_uid/p_uid), 401 renova o token UMA vez
  // e, sem jeito, devolve ao hub com o recado.
  if (N.api && N.api.req) return;
  var K = 'tf_sessao';
  function cfg() { var c = window.TF_CONFIG || {}; return { url: c.SUPABASE_URL || '', anon: c.SUPABASE_ANON_KEY || '' }; }
  function lerS() { try { return JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) { return {}; } }
  function gravarS(s) { try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) {} }
  function sinal(escrita) {
    try { if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(escrita ? 45000 : 30000); } catch (e) {}
    return undefined;
  }
  var ehTimeout = function (e) { return !!e && (e.name === 'TimeoutError' || e.name === 'AbortError'
    || /timed out|timeout|aborted/i.test(String(e.message || ''))); };
  var tokenVencido = function (e) { return e && (e.status === 401 || /jwt expired|invalid jwt|token.*expired|not authenticated/i.test(e.message || '')); };
  var renovando = null;
  function renovarToken() {
    var s = lerS(), c = cfg();
    if (!s.refresh) return Promise.resolve(false);
    if (renovando) return renovando;
    renovando = (async function () {
      try {
        var r = await fetch(c.url + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', headers: { apikey: c.anon, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: s.refresh }), signal: sinal(true) });
        var j = await r.json().catch(function () { return null; });
        if (!r.ok || !j || !j.access_token) return false;
        var n = lerS(); n.token = j.access_token; if (j.refresh_token) n.refresh = j.refresh_token;
        gravarS(n);
        return true;
      } catch (e) { return false; }
      finally { setTimeout(function () { renovando = null; }, 0); }
    })();
    return renovando;
  }
  function sessaoExpirou() {
    try { localStorage.removeItem(K); } catch (e) {}
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try { sessionStorage.setItem('tf_recado', 'Sua sessão expirou. Entre de novo.'); } catch (e) {}
      var app = (document.body && document.body.dataset.app) || '';
      location.href = '../' + (app ? '?para=' + app : '');
    }
  }
  async function req(caminho, opts, tentativas) {
    opts = opts || {}; if (tentativas == null) tentativas = 2;
    var escrita = (opts.method || 'GET').toUpperCase() !== 'GET';
    var ultimo, jaRenovou = false, c = cfg();
    for (var i = 0; i <= tentativas; i++) {
      try {
        var s = lerS();
        var r = await fetch(c.url + caminho, Object.assign({}, opts, {
          signal: sinal(escrita),
          headers: Object.assign({ apikey: c.anon, 'Content-Type': 'application/json' },
            s.token ? { Authorization: 'Bearer ' + s.token } : {}, opts.headers || {})
        }));
        var txt = await r.text();
        if (txt.trim().startsWith('<')) throw new Error('O servidor devolveu HTML — verifique a URL do projeto');
        var corpo = null;
        if (txt) { try { corpo = JSON.parse(txt); } catch (e) { throw new Error('Resposta inválida: ' + txt.slice(0, 80)); } }
        if (!r.ok) {
          var msg = (corpo && (corpo.message || corpo.error_description || corpo.error || corpo.hint)) || ('HTTP ' + r.status);
          var err = new Error(msg); err.negocio = (r.status >= 400 && r.status < 500); err.status = r.status;
          if (tokenVencido(err)) {
            if (!jaRenovou && s.refresh) {
              jaRenovou = true;
              if (await renovarToken()) { i--; continue; }
            }
            sessaoExpirou();
            throw Object.assign(new Error('Sua sessão expirou. Entre de novo — nada se perdeu.'), { negocio: true, sessaoMorta: true });
          }
          throw err;
        }
        return corpo;
      } catch (e) {
        ultimo = e;
        if (ehTimeout(e)) {
          ultimo = new Error('O servidor não respondeu em ' + (escrita ? '45' : '30') + 's'
            + (escrita ? ' — a operação pode NÃO ter sido gravada.' : '.'));
        }
        var transitorio = ehTimeout(e) || !e.negocio && (
          /Failed to fetch|NetworkError|Load failed/i.test(e.message) ||
          /devolveu HTML/.test(e.message) || /^HTTP 5\d\d$/.test(e.message));
        if (!transitorio || i === tentativas || (escrita && !opts.idempotente)) { throw ultimo; }
        await new Promise(function (ok) { setTimeout(ok, 600 * (i + 1)); });
      }
    }
    throw ultimo;
  }
  // No N1, `Nucleo.api` é uma função: os nomes novos entram como propriedades dela.
  if (!N.api) N.api = {};
  N.api.req = req;
  N.api.get = function (q) { return req('/rest/v1/' + q); };
  N.api.rpc = function (f, p) { return req('/rest/v1/rpc/' + f, { method: 'POST', body: JSON.stringify(p || {}),
    idempotente: !!(p && (p.p_client_uid || p.p_uid)) }); };
})();
