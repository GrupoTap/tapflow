/* ============================================================================
 * TAPHUB · NÚCLEO COMUM — N14 (N7: o celular da empresa; N11: a fila avisa quando o aparelho está sem espaço;
 *   N12: renovar devolve ok/recusado/sem rede; a fila não trava no erro do servidor; os leitores únicos de valor e de .xlsx;
 *   N13: a janela devolve o campo digitado e não fecha por engano com algo digitado;
 *   N14: a fila envia pelo tratador que a página registra, `fila.tratador`)
 * ----------------------------------------------------------------------------
 * Código que serve a mais de um módulo e por isso NÃO mora dentro de nenhum:
 * sessão, conexão com o banco, PIN e a trava. Regra de negócio nunca entra
 * aqui (fica no módulo e nas funções tf_*). Sem framework, sem build.
 *
 * COMO UM MÓDULO USA (duas linhas no <head> e uma no boot):
 *   <script src="../nucleo/config.js?v=N14"></script>
 *   <script src="../nucleo/nucleo.js?v=N14"></script>
 *   ...
 *   const g = Nucleo.porteiro({ app:'manager', demo:DEMO, url:SUPABASE_URL, anon:SUPABASE_ANON_KEY });
 *   if (g === 'hub') { irParaHub(Nucleo.recado); return; }     // ANTES do iniciar()
 *
 * N7 (S136): o celular da empresa — ver o bloco "N7 · CELULAR DA EMPRESA" logo abaixo da sessão.
 * O N4 aceita tudo o que o N3, o N2 e o N1 aceitavam (o arquivo é um só). O N4 só
 * soma o "Pedir PIN novo" e a troca do PIN provisório (207, desenho
 * processos/recuperar-acesso-desenho.md). O N3 tinha somado a
 * digital (Passkey 1) na trava e o Nucleo.confirmarPessoa(). Os utilitários e a fila do N2 estão
 * no fim deste arquivo; o contrato está em processos/nucleo-n2-contrato.md.
 *
 * O ?v= NÃO é enfeite: o service worker do Field guarda tudo o que não é
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

  var VERSAO = 'N14';   // N14 (S202): Rodada R10 da auditoria — issues 106, 107 e 177 (a fila envia também os envios antigos do TapField — levantamento, extras, execução e fotos do Drive — pelo tratador que a página registra: recusado fica parado com o motivo, nada some)
  // var VERSAO = 'N13';   // N13 (S196): Rodada R5 da auditoria — issues 108, 109, 126, 144, 169 (a janela devolve o campo digitado e confere o obrigatório/CONFIRMO; com algo digitado não fecha clicando fora e o X/Esc pede 2º toque; o Esc fecha a janela em todas as páginas)
  // var VERSAO = 'N12';   // N12 (S195): Rodada R4 da auditoria — issues 142, 146, 153, 154, 167 e 189 (renovar com 3 respostas, fila que não trava, aviso fixo, relato com rascunho, janela no X = Cancelar, destraves só apagados depois de enviados, storage.pedir, util.lerValor, planilha.lerXLSX)
  // var VERSAO = 'N11';   // N11 (S171): issue 35 — a fila avisa em vermelho quando o aparelho está sem espaço (nada some calado); quem tem dado guardado ajuda a liberar espaço (fila.aoFaltarEspaco)
  // var VERSAO = 'N10';   // N10 (S160): issue 29 — confirmarPessoa({ soDigital:true }): sem o teclado do PIN (aprovar o laudo); Nucleo.temDigital()
  // var VERSAO = 'N9';   // N9 (S157): issue 10 — o acesso vencido ("exp" claim) é renovado antes de enviar a fila e no envio das fotos
  // var VERSAO = 'N8';   // N8 (S142): no Relatar, o print colado com Ctrl+V (item 37 da lista)
  // var VERSAO = 'N7';   // N7 (S136): o celular da empresa (210; desenho processos/aparelho-empresa-desenho.md, A1–A12)
  // var VERSAO = 'N6';   // N6 (S132): "Relatar problema ou sugerir" em todos os módulos (209; item #1 da lista) e os últimos erros do app para irem junto
  // var VERSAO = 'N5';   // N5 (S131): o IndexedDB reabre quando o iPhone fecha a ligação
  var SCRIPT = (document.currentScript && document.currentScript.src) || '';
  var RAIZ = SCRIPT ? new URL('../', SCRIPT).href : (location.origin + '/');
  var NO_SERVIDOR = location.protocol === 'http:' || location.protocol === 'https:';

  // limites (milissegundos). `Nucleo.limites` é mexível só para o teste de tela.
  var L = { bg: 5 * 60 * 1000, h12: 12 * 3600 * 1000, tentativas_local: 5, iter: 150000 };

  var K_SESSAO = 'tf_sessao', K_TRAVA = 'tf_trava', K_TRAVADO = 'tf_travado',
      K_DESTRAV = 'tf_destrav', K_OCULTO = 'tf_oculto', K_TENT = 'tf_pin_tent',
      K_EFEMERO = 'tf_efemero', K_VOLTAS = 'tf_hub_voltas',
      K_EMP = 'tf_empresa', K_SESSOES = 'tf_sessoes';   // N7 · celular da empresa

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
  function gravarSessao(s) { lsSet(K_SESSAO, JSON.stringify(s)); lembrarSessaoEmp(s); }

  /* ══════════════════════════════════════════════════════════════════════════
   * N7 · CELULAR DA EMPRESA (banco 210; desenho processos/aparelho-empresa-desenho.md)
   * O celular que fica com a dupla de inspeção (ou o da administração) é marcado
   * aqui (tf_empresa = { id, nome }) quando a 1ª pessoa entra e escolhe "É um
   * celular da empresa". A partir daí:
   *  · cada pessoa que já entrou nele fica guardada (tf_sessoes, por e-mail) e
   *    volta com o NOME + o PIN dela ("Quem vai usar?"), sem e-mail e senha (A5);
   *  · sem digital, sem ponto, sem assinaturas e sem a parte "Eu" (A2–A4);
   *  · a fila envia cada coisa COM A SESSÃO DE QUEM FEZ, mesmo que outra pessoa
   *    esteja usando o celular (A7) — então o "feito por" é a própria conta;
   *  · o celular conta ao banco a fila de envios (A9: aviso de 24 h).
   * ⚠ As sessões guardadas: a de quem está usando é SEMPRE a tf_sessao (a cópia
   *   em tf_sessoes dela pode estar velha); a dos outros, a cópia. Trocar de
   *   pessoa copia a tf_sessao para tf_sessoes ANTES de trocar — senão o token de
   *   renovação velho seria usado de novo e o Supabase derrubaria a sessão.
   * ════════════════════════════════════════════════════════════════════════ */
  function empresa() { var e = jget(K_EMP); return e && e.id ? e : null; }
  function sessoesEmp() { return jget(K_SESSOES) || {}; }
  function gravarSessoesEmp(m) { lsSet(K_SESSOES, JSON.stringify(m || {})); }
  function lembrarSessaoEmp(s) {
    if (!empresa() || !s || !s.email || !s.token) return;
    var m = sessoesEmp(), k = String(s.email).toLowerCase(), velha = m[k] || {};
    m[k] = Object.assign({}, s, { _soEnvio: !!velha._soEnvio && !s._entrou, _em: Date.now() });
    delete m[k]._entrou;
    gravarSessoesEmp(m);
  }
  function sessaoDeEmp(email) {
    var m = sessoesEmp(), k = String(email || '').toLowerCase();
    if (!k) return null;
    var atual = sessao();
    if (atual.email && String(atual.email).toLowerCase() === k) return atual;
    return m[k] || null;
  }
  /** Renova o token de uma pessoa que NÃO está usando o celular (só a cópia dela).
   *  N12 (issue 153): devolve true/false como antes; `renovarEmpEstado` diz 'ok' | 'recusado' | 'sem_rede'. */
  var renovandoEmp = {};
  function renovarEmpEstado(email) {
    var k = String(email || '').toLowerCase(), m = sessoesEmp(), s = m[k];
    if (!s || !s.refresh) return Promise.resolve('recusado');
    if (renovandoEmp[k]) return renovandoEmp[k];
    renovandoEmp[k] = pedirRenovacao(s.refresh).then(function (x) {
      if (x.estado !== 'ok') return x.estado;
      var m2 = sessoesEmp(); if (!m2[k]) return 'recusado';
      m2[k].token = x.j.access_token; if (x.j.refresh_token) m2[k].refresh = x.j.refresh_token;
      gravarSessoesEmp(m2); return 'ok';
    }).then(function (e) { setTimeout(function () { delete renovandoEmp[k]; }, 0); return e; });
    return renovandoEmp[k];
  }
  function renovarEmp(email) { return renovarEmpEstado(email).then(function (e) { return e === 'ok'; }); }
  /** "Quem vai usar?": quem já entrou neste celular (sem quem saiu de vez). */
  function pessoasEmp() {
    var m = sessoesEmp(), L = [];
    Object.keys(m).forEach(function (k) { var s = m[k]; if (s && !s._soEnvio && s.token) L.push({ email: s.email || k, nome: s.nome || s.email || k }); });
    return L.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  }
  /** Trocar de pessoa: guarda a sessão de quem está usando e volta ao início ("Quem vai usar?"). */
  function trocarPessoa() {
    var s = sessao();
    if (empresa() && s.email && s.token) lembrarSessaoEmp(s);
    lsDel(K_SESSAO); lsDel(K_TRAVADO); lsDel(K_DESTRAV);
    ssSet('tf_recado', '');
    location.href = RAIZ + '?trocar=1';
  }
  /** Escolheu o nome: a sessão guardada dela volta, e a trava pede o PIN dela. */
  function entrarComo(email) {
    var m = sessoesEmp(), k = String(email || '').toLowerCase(), s = m[k];
    if (!s || !s.token) return false;
    lsSet(K_SESSAO, JSON.stringify(s));
    lsSet(K_TRAVADO, '1'); lsDel(K_DESTRAV);
    return true;
  }
  /** Quantos envios da fila são desta pessoa (os do núcleo e os antigos do Field). */
  function filaDe(email) {
    var k = String(email || '').toLowerCase();
    return (jget('tff_fila') || []).filter(function (x) { return x && x.por && String(x.por).toLowerCase() === k; }).length;
  }
  /** Sair deste celular de vez: some do "Quem vai usar?" e o aparelho dela é desconectado.
   *  Com envio na fila, a sessão fica guardada SÓ para enviar (e é apagada quando a fila dela esvaziar). */
  function sairDeste(email) {
    var k = String(email || sessao().email || '').toLowerCase(), m = sessoesEmp(), c = cfgDe(k);
    var atual = sessao();
    if (atual.email && String(atual.email).toLowerCase() === k && atual.token) m[k] = Object.assign({}, atual);
    var revogar = c && c.ap ? rpc('tf_aparelho_revogar', { p_aparelho: c.ap }).catch(function () {}) : Promise.resolve();
    return revogar.then(function () {
      if (m[k]) { if (filaDe(k) > 0) m[k]._soEnvio = true; else delete m[k]; }
      gravarSessoesEmp(m); apagarCfg(k);
      if (atual.email && String(atual.email).toLowerCase() === k) { limparSessao(); lsDel(K_TRAVADO); }
    });
  }
  /** Desmarca o celular (desativado no banco): volta a ser um aparelho comum. */
  function desmarcarEmp() {
    var m = sessoesEmp();
    Object.keys(m).forEach(function (k) { apagarCfg(k); });
    lsDel(K_EMP); lsDel(K_SESSOES);
  }
  // A9: o celular conta ao banco a fila de envios (no máximo uma vez por minuto, ou quando muda)
  var ultFila = { t: 0, sig: '' };
  function contarFila() {
    var e = empresa(); if (!e || !sessao().token) return;
    var f = (jget('tff_fila') || []).filter(function (x) { return !!x; });
    var pend = f.length, par = f.filter(function (x) { return x.parado; }).length;
    var antiga = f.reduce(function (a, x) { return (x.em && (!a || x.em < a)) ? x.em : a; }, null);
    var sig = pend + '|' + par + '|' + antiga;
    if (sig === ultFila.sig && Date.now() - ultFila.t < 60000) return;
    ultFila = { t: Date.now(), sig: sig };
    rpc('tf_aparelho_empresa_fila', { p_empresa: e.id, p_pendentes: pend, p_parados: par, p_mais_antiga: antiga }).catch(function () {});
  }
  // A2/A4: avisos com o app fechado não chegam ao celular da empresa (seriam do ponto de alguém)
  var pushLimpo = false;
  function limparPushEmp() {
    if (pushLimpo || !empresa()) return; pushLimpo = true;
    try {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
          if (!reg.pushManager) return;
          reg.pushManager.getSubscription().then(function (sub) {
            if (!sub) return;
            var ep = sub.endpoint;
            sub.unsubscribe().catch(function () {});
            if (sessao().token) rpc('tf_push_remover', { p_endpoint: ep }).catch(function () {});
          }).catch(function () {});
        });
      }).catch(function () {});
    } catch (e) {}
  }
  var MSG_EMPRESA = 'Este é um celular da empresa: ponto, EPI e assinaturas só no seu celular.';
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

  /** N12 (issue 153): a renovação do acesso diz POR QUE não deu.
   *   'ok'       → renovou;
   *   'recusado' → o servidor respondeu e recusou (sessão acabou de verdade: login de novo);
   *   'sem_rede' → não deu para falar com o servidor (sem sinal, demorou ou erro passageiro 5xx):
   *                o login FICA; tenta de novo depois. Antes as duas viravam "false" e a queda de
   *                sinal na hora errada apagava o login. */
  function pedirRenovacao(refresh) {
    var c = cfgDoBanco();
    if (!refresh) return Promise.resolve({ estado: 'recusado' });
    return fetch(c.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: c.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }), signal: comPrazo(12000)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.ok && j && j.access_token) return { estado: 'ok', j: j };
        if (r.status >= 500 || r.status === 408 || r.status === 429) return { estado: 'sem_rede' };
        return { estado: 'recusado' };
      });
    }, function () { return { estado: 'sem_rede' }; });
  }
  var renovando = null;
  function renovarEstado() {
    var s = sessao();
    if (!s.refresh) return Promise.resolve('recusado');
    if (renovando) return renovando;
    renovando = pedirRenovacao(s.refresh).then(function (x) {
      if (x.estado !== 'ok') return x.estado;
      var n = sessao(); n.token = x.j.access_token; if (x.j.refresh_token) n.refresh = x.j.refresh_token;
      gravarSessao(n); return 'ok';
    }).then(function (e) { setTimeout(function () { renovando = null; }, 0); return e; });
    return renovando;
  }
  /** O de antes (true/false), para quem só quer saber se renovou. */
  function renovar() { return renovarEstado().then(function (e) { return e === 'ok'; }); }
  var MSG_SEM_SINAL = 'Sem sinal. Tente de novo com internet.';
  function erroSemSinal() { return Object.assign(erro(MSG_SEM_SINAL, 0, true), { semSinal: true }); }

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
          return renovarEstado().then(function (e) {
            if (e === 'ok') return api(caminho, opt, true);
            if (e === 'sem_rede') throw erroSemSinal();      // N12 (issue 153): sem sinal não é sessão vencida
            throw erro('Sua sessão expirou.', 401);
          });
        }
        if (!r.ok) throw erro((j && (j.message || j.error_description || j.msg || j.hint)) || ('O servidor deu erro (código ' + r.status + '). Tente de novo.'), r.status);
        return j;
      });
    }, function () { throw erroSemSinal(); });
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
  // N4: o PIN mudou (troca do provisório): o resumo local passa a ser o do PIN novo,
  // sem perder o resto da configuração do aparelho (a digital, por exemplo).
  function atualizarResumo(email, pin) {
    var c = cfgDe(email);
    if (!c || !(window.crypto && crypto.subtle)) return Promise.resolve();
    var sal = b64(crypto.getRandomValues(new Uint8Array(16)));
    return derivar(pin, sal, L.iter).then(function (h) {
      c.ver = { s: sal, i: L.iter, h: h }; gravarCfg(email, c);
    }).catch(function () {});
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
  // N12 (issue 154, item 3): a tela do relato não é destruída quando a trava do PIN entra por cima (voltar da
  // galeria depois de 5 min): ela fica escondida, guardada aqui, e volta igual (texto e prints) quando a trava sai.
  var telaGuardada = null;

  function fecharTela() {
    if (!tela) return;
    var t = tela; tela = null;
    document.removeEventListener('keydown', t.teclado, true);
    if (t.guardar && !t.fechando && !telaGuardada) {
      if (t.el) t.el.style.display = 'none';
      telaGuardada = t;
      return;                                   // quem abriu a tela nova (a trava) já vai cobrir a página
    }
    if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
    document.documentElement.removeAttribute('data-tf-trava');
    if (telaGuardada && telaGuardada !== t) {
      var g = telaGuardada; telaGuardada = null;
      if (g.el && document.body.contains(g.el)) {
        g.el.style.display = ''; tela = g;
        document.addEventListener('keydown', g.teclado, true);
        document.documentElement.setAttribute('data-tf-trava', '1');
        return;
      }
    }
    if (t.foco && t.foco.focus) { try { t.foco.focus(); } catch (e) {} }
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

  var MSG_PIN_VENCIDO = 'O PIN provisório venceu (24 horas). Toque em "Esqueci o PIN: pedir um novo".';
  var MSG_PEDIDO_PIN = 'Pedido enviado a quem autoriza os acessos. Quando receber o PIN provisório, digite aqui.';   // N13 (issue 155): sem nomes fixos (quem recebe é a caixa "Autoriza acesso")
  /** N4 · "Esqueci o PIN: pedir um novo" (decisão 2). h = a tela do PIN. */
  function pedirPinNovo(h) {
    h.msg('Enviando o pedido…');
    return rpc('tf_acesso_pedir_pin').then(function () { h.msg(MSG_PEDIDO_PIN); },
      function (e) { h.msg(e.rede ? 'Sem sinal. Tente de novo com internet.' : (limpaMsg(e.message) || 'Não deu para pedir agora.'), true); });
  }
  function conferir(pin, c, s) {
    return rpc('tf_meu_pin_conferir', { p_pin: pin, p_aparelho: c && c.ap || null }).then(function (j) {
      if (j && j.status === 'ok') {
        lsDel(K_TENT);
        var depois = c && !c.ver && window.crypto && crypto.subtle ? guardarResumo(s.email, c.ap, pin).catch(function () {}) : Promise.resolve();
        return depois.then(function () {
          return rpc('tf_aparelho_ok', { p_aparelho: c && c.ap || null }).then(function (ok) {
            if (ok === false) {
              apagarCfg(s.email);
              // N7: no celular da empresa, quem foi tirado da lista (ou o celular desativado) some do "Quem vai usar?"
              if (empresa()) { var m = sessoesEmp(); delete m[String(s.email || '').toLowerCase()]; gravarSessoesEmp(m); }
              return { ok: false, sair: true, recado: 'Este aparelho foi desconectado. Entre com e-mail e senha.' };
            }
            return { ok: true };
          }, function () { return { ok: true }; });   // aparelho_ok sem sinal: o PIN já foi aceito
        });
      }
      if (j && j.status === 'pin_errado') return { ok: false, msg: 'PIN errado. Restam ' + j.restantes + ' tentativas.' };
      if (j && j.status === 'bloqueado') return { ok: false, msg: 'PIN travado até ' + horaDe(j.ate) + '. Espere ou entre com e-mail e senha.' };
      // N4 (207): o PIN provisório confere, mas só serve para criar o PIN da pessoa
      if (j && j.status === 'trocar_pin') return { ok: false, trocar: true, msg: 'Este é o PIN provisório: crie o seu PIN na trava do TapHub.' };
      if (j && j.status === 'pin_vencido') return { ok: false, msg: MSG_PIN_VENCIDO };
      return { ok: false, sair: true, recado: 'Crie o seu PIN para continuar.' };
    }, function (e) {
      if (e.rede) return conferirLocal(pin, c);
      if (e.status === 401) return { ok: false, sair: true, recado: 'Sua sessão expirou. Entre de novo.' };
      return { ok: false, msg: limpaMsg(e.message) || 'Não deu para conferir o PIN.' };
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * N3 · PASSKEY 1: a digital (ou o rosto) do aparelho destrava a trava do PIN
   * Desenho: processos/passkey-desenho.md (decisões 1–12, 03/11/2026).
   *  · Por aparelho LEMBRADO e opcional: depois de acertar o PIN, pergunta
   *    "Usar digital neste aparelho?" uma vez. Quem recusa segue só com PIN.
   *  · O PIN nunca some: a trava tem sempre "Usar PIN".
   *  · Erro de digital não conta em lugar nenhum (o aparelho limita).
   *  · O sistema guarda só o identificador e a chave PÚBLICA; a digital, o
   *    rosto e a chave secreta ficam no aparelho (padrão WebAuthn).
   *  · Destravar confere NO APARELHO (funciona sem sinal): a assinatura é
   *    conferida aqui com a chave pública. Com sinal, pergunta antes ao banco se
   *    a digital ainda vale (removida ou aparelho desconectado = usa o PIN).
   *  · confirmarPessoa(): a função única que a batida do ponto (modo 'local') e
   *    as assinaturas (modo 'servidor', conferido pela Edge Function
   *    confirmar-pessoa) vão chamar na etapa de integração (decisão 10).
   * ════════════════════════════════════════════════════════════════════════ */
  var K_DFILA = 'tf_destraves_fila';
  function b64u(buf) { return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(t) { t = String(t || '').replace(/-/g, '+').replace(/_/g, '/'); return unb64(t + '==='.slice((t.length + 3) % 4)); }

  function ehIOS() {
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  /** O navegador tem digital/rosto (ou Windows Hello) de verdade neste aparelho? */
  var suporteMemo = null;
  function suporteDigital() {
    if (suporteMemo) return suporteMemo;
    suporteMemo = (function () {
      try {
        if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials ||
            typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return Promise.resolve(false);
        return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function (s) { return !!s; }, function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    })();
    return suporteMemo;
  }

  // CBOR mínimo: só para achar a chave pública (COSE) dentro do cadastro.
  function lerCbor(b, p) {
    var ini = b[p++], maior = ini >> 5, menor = ini & 31, n = menor, i, l, m, x, y;
    if (menor === 24) n = b[p++];
    else if (menor === 25) { n = (b[p] << 8) | b[p + 1]; p += 2; }
    else if (menor === 26) { n = ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]; p += 4; }
    else if (menor > 26) throw new Error('cbor');
    if (maior === 0) return [n, p];
    if (maior === 1) return [-1 - n, p];
    if (maior === 2) return [b.slice(p, p + n), p + n];
    if (maior === 3) return [new TextDecoder().decode(b.slice(p, p + n)), p + n];
    if (maior === 4) { l = []; for (i = 0; i < n; i++) { x = lerCbor(b, p); l.push(x[0]); p = x[1]; } return [l, p]; }
    if (maior === 5) { m = new Map(); for (i = 0; i < n; i++) { x = lerCbor(b, p); y = lerCbor(b, x[1]); m.set(x[0], y[0]); p = y[1]; } return [m, p]; }
    if (maior === 7) return [menor === 21 ? true : menor === 20 ? false : null, p];
    throw new Error('cbor');
  }
  /** Do cadastro (attestationObject) tira o identificador e a chave pública COSE. */
  function lerCadastro(att) {
    var o = lerCbor(new Uint8Array(att), 0)[0], ad = o.get('authData');
    if (!(ad[32] & 0x40)) throw new Error('O aparelho não devolveu a chave.');
    var lc = (ad[53] << 8) | ad[54], cred = ad.slice(55, 55 + lc);
    var ini = 55 + lc, fim = lerCbor(ad, ini)[1], cose = ad.slice(ini, fim);
    var alg = lerCbor(cose, 0)[0].get(3);
    return { id: b64u(cred), k: b64u(cose), alg: alg };
  }
  function importarChave(k, alg) {
    var m = lerCbor(unb64u(k), 0)[0];
    if (alg === -7) return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(m.get(-2)), y: b64u(m.get(-3)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.importKey('jwk', { kty: 'RSA', n: b64u(m.get(-1)), e: b64u(m.get(-2)), alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  function derParaBruta(der) {
    if (der[0] !== 0x30) return der;
    var p = (der[1] & 0x80) ? 2 + (der[1] & 0x7f) : 2, r = new Uint8Array(64);
    for (var i = 0; i < 2; i++) {
      var l = der[p + 1], v = der.slice(p + 2, p + 2 + l); p += 2 + l;
      while (v.length > 32 && v[0] === 0) v = v.slice(1);
      r.set(v, i * 32 + 32 - v.length);
    }
    return r;
  }
  /** Confere NO APARELHO a resposta da digital (sem sinal também). */
  function conferirNoAparelho(dig, desafio, a) {
    var r = a.response, ad = new Uint8Array(r.authenticatorData), cdb = new Uint8Array(r.clientDataJSON), cd;
    try { cd = JSON.parse(new TextDecoder().decode(cdb)); } catch (e) { return Promise.resolve(false); }
    if (cd.type !== 'webauthn.get' || cd.challenge !== b64u(desafio) || cd.origin !== location.origin) return Promise.resolve(false);
    if (!(ad[32] & 0x01) || !(ad[32] & 0x04)) return Promise.resolve(false);      // presença e verificação (digital/rosto)
    return Promise.all([crypto.subtle.digest('SHA-256', cdb), crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.hostname)),
                        importarChave(dig.k, dig.alg)]).then(function (x) {
      var rp = new Uint8Array(x[1]);
      for (var i = 0; i < 32; i++) if (rp[i] !== ad[i]) return false;
      var dados = new Uint8Array(ad.length + 32); dados.set(ad); dados.set(new Uint8Array(x[0]), ad.length);
      var sig = new Uint8Array(r.signature);
      return dig.alg === -7
        ? crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, x[2], derParaBruta(sig), dados)
        : crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, x[2], sig, dados);
    }).catch(function () { return false; });
  }
  /** Pede a digital ao aparelho. Devolve a resposta (ou rejeita com 'cancelou'/'falhou'). */
  function pedirAoAparelho(dig, desafio) {
    return navigator.credentials.get({ publicKey: {
      challenge: desafio, rpId: location.hostname, timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: unb64u(dig.id) }]
    } }).then(function (a) {
      if (!a || a.id !== dig.id) throw new Error('falhou');
      return a;
    }, function (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'cancelou' : 'falhou'); });
  }

  /* ── fila dos destraves sem sinal (para o indicador) ─────────────────────── */
  function registrarDestrave(metodo, c) {
    var item = { m: metodo, ap: c && c.ap || null, cr: metodo === 'digital' && c && c.dig ? c.dig.id : null, em: new Date().toISOString() };
    return rpc('tf_destrave_registrar', { p_metodo: item.m, p_aparelho: item.ap, p_credencial: item.cr }).then(function (r) {
      esvaziarFilaDestraves(); return r;
    }, function (e) {
      if (e.rede) { var f = jget(K_DFILA) || []; f.push(item); lsSet(K_DFILA, JSON.stringify(f.slice(-50))); }
      throw e;
    });
  }
  // N12 (issue 154, item 5): cada registro só sai da fila DEPOIS de enviado (antes a fila era apagada antes do
  // envio e, se ele falhasse, o registro se perdia). Um envio por vez; o que falhar fica para a próxima.
  var esvaziandoDestraves = false;
  function esvaziarFilaDestraves() {
    if (esvaziandoDestraves) return;
    var f = jget(K_DFILA) || []; if (!f.length) return;
    esvaziandoDestraves = true;
    function tirar(x) {
      var g = jget(K_DFILA) || [];
      var i = -1;
      for (var k = 0; k < g.length; k++) if (g[k] && g[k].em === x.em && g[k].m === x.m) { i = k; break; }
      if (i >= 0) g.splice(i, 1);
      if (g.length) lsSet(K_DFILA, JSON.stringify(g)); else lsDel(K_DFILA);
    }
    f.reduce(function (p, x) {
      return p.then(function () {
        return rpc('tf_destrave_registrar', { p_metodo: x.m, p_aparelho: x.ap, p_credencial: null, p_em: x.em }).then(function () { tirar(x); },
          function (e) { if (!e || !e.rede) tirar(x); else throw e; });   // recusado pelo banco: reenviar não adianta
      });
    }, Promise.resolve()).catch(function () {}).then(function () { esvaziandoDestraves = false; });
  }

  /* ── a tela de trava com digital ──────────────────────────────────────────── */
  var ICONE_DIGITAL = '<svg aria-hidden="true" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">' +
    '<path d="M6.5 8.5a6 6 0 0 1 11 0"/><path d="M5 12.5c0-1 .1-1.8.4-2.6"/><path d="M8 18.5c.9-1.6 1.4-3.6 1.4-6a2.6 2.6 0 0 1 5.2 0c0 1-.1 2-.2 2.9"/>' +
    '<path d="M12 12.5c0 3.2-.9 6-2.6 8"/><path d="M14 18.3c-.3 1-.7 1.9-1.2 2.7"/><path d="M17.3 11.4c.2.7.2 1.3.2 1.6 0 2-.3 3.8-.9 5.5"/><path d="M7.4 21c.4-.5.7-1 1-1.5"/></svg>';

  /**
   * Abre a tela que confirma a pessoa: digital (se este aparelho tem) com
   * "Usar PIN" sempre à vista, ou o teclado do PIN.
   * o: { titulo, sub, dig (cfg.dig ou null), digital(t) → Promise<{ok,msg?,sair?,recado?}>,
   *      pin(pin,t) → Promise<{ok,msg?,sair?,recado?}>, links: [{txt, fn}],
   *      semPin (N10): só a digital; sem "Usar PIN" e sem o teclado (exige o.dig) }
   * Resolve true quando confirmou; false quando cancelou.
   */
  function telaConfirmar(o) {
    return new Promise(function (fim) {
      var t = abrirTela({ titulo: o.titulo, sub: o.sub, links: (o.links || []).map(function (l) {
        return { txt: l.txt, fn: function (h) { if (l.cancela) { h.cancelar(); acabou(false); } else l.fn(h); } };
      }) });
      var feito = false;
      function acabou(v) { if (feito) return; feito = true; t.fechar(); fim(v); }
      var el = t.el, tec = el.querySelector('#tfPinTec'), pts = el.querySelector('#tfPinPts');
      var bloco = null;
      if (o.dig) {
        bloco = document.createElement('div');
        bloco.className = 'tf-dig-bloco';
        bloco.innerHTML = '<button type="button" class="tf-bt pri tf-dig" id="tfDigBt">' + ICONE_DIGITAL + '<span>Usar digital</span></button>' +
          (o.semPin ? '' : '<button type="button" class="tf-bt tf-usar-pin" id="tfUsarPin">Usar PIN</button>');
        tec.parentNode.insertBefore(bloco, tec);
        var alt = document.createElement('button');
        alt.type = 'button'; alt.className = 'tf-link tf-voltar-dig'; alt.id = 'tfVoltarDig'; alt.textContent = 'Usar digital';
        tec.parentNode.insertBefore(alt, tec.nextSibling);
      }
      function modo(m) {
        if (!bloco) return;
        var dig = m === 'digital';
        bloco.hidden = !dig; tec.hidden = dig; pts.hidden = dig;
        el.querySelector('#tfVoltarDig').hidden = dig || !!o.semPin;
        try { (dig ? el.querySelector('#tfDigBt') : el.querySelector('.tf-k')).focus(); } catch (e) {}
      }
      var tentando = false;
      function tentarDigital() {
        if (tentando || feito) return;
        tentando = true; t.msg('Toque no sensor ou olhe para a câmera…');
        o.digital(t).then(function (r) {
          tentando = false;
          if (r.ok) return acabou(true);
          t.msg(r.msg || '', !!r.msg);
          if (r.sair) setTimeout(function () { sairParaLogin(r.recado); }, 900);
          if (r.semDigital && !o.semPin) { bloco.hidden = true; bloco = null; tec.hidden = false; pts.hidden = false; el.querySelector('#tfVoltarDig').hidden = true; }
        }, function () { tentando = false; t.msg(o.semPin ? 'Não reconheceu. Toque em "Usar digital" e tente de novo.' : 'Não reconheceu. Tente de novo ou use o PIN.', true); });
      }
      if (bloco) {
        el.querySelector('#tfDigBt').addEventListener('click', tentarDigital);   // o clique é o "gesto" que o iPhone exige
        if (!o.semPin) el.querySelector('#tfUsarPin').addEventListener('click', function () { t.msg(''); modo('pin'); });
        el.querySelector('#tfVoltarDig').addEventListener('click', function () { t.msg(''); modo('digital'); });
        modo('digital');
        if (o.autoDigital) setTimeout(tentarDigital, 250);                       // Android e computador abrem sozinhos
      }
      if (o.semPin && bloco) return;                                             // N10: só a digital, o teclado nunca aparece
      (function laco() {
        t.pin().then(function (pin) {
          if (pin === null || feito) return;
          t.ocupado(true); t.msg('');
          o.pin(pin, t).then(function (r) {
            t.ocupado(false);
            if (r.ok) return acabou(true);
            t.limpar(); t.msg(r.msg || '', true);
            if (r.sair) { setTimeout(function () { sairParaLogin(r.recado); }, 900); return; }
            laco();
          }, function (e) { t.ocupado(false); t.limpar(); t.msg(limpaMsg(e && e.message) || 'Não deu para conferir.', true); laco(); });
        });
      })();
    });
  }

  /** Destravar com a digital: confere no aparelho; com sinal, o banco diz se ainda vale. */
  function digitalDestravar(c, s) {
    var desafio = crypto.getRandomValues(new Uint8Array(32));
    return pedirAoAparelho(c.dig, desafio).then(function (a) {
      return conferirNoAparelho(c.dig, desafio, a).then(function (ok) {
        if (!ok) return { ok: false, msg: 'A resposta do aparelho não conferiu. Use o PIN.' };
        return registrarDestrave('digital', c).then(function (r) {
          if (r && r.digital_ativa === false) {
            delete c.dig; gravarCfg(s.email, c);
            return { ok: false, semDigital: true, msg: 'A digital deste aparelho foi removida. Use o PIN.' };
          }
          return { ok: true };
        }, function (e) {
          if (e.status === 401) return { ok: false, sair: true, recado: 'Sua sessão expirou. Entre de novo.' };
          return { ok: true };                                // sem sinal: vale a conferência do aparelho
        });
      });
    }, function (e) {
      return { ok: false, msg: e.message === 'cancelou' ? 'Não reconheceu ou foi cancelado. Toque em "Usar digital" de novo ou use o PIN.' : 'Não reconheceu. Tente de novo ou use o PIN.' };
    });
  }

  /** Cobre a tela e pede a digital ou o PIN. Resolve quando destravou (ou quando mandou para o login). */
  var destravando = null;
  function pedirDestrave() {
    if (destravando) return destravando;
    var s = sessao(), c = cfgDe(s.email);
    lsSet(K_TRAVADO, '1');
    var pinUsado = null;
    destravando = suporteDigital().then(function (sup) {
      var dig = sup && c && c.dig ? c.dig : null;
      return telaConfirmar({
        titulo: primeiroNome(s) + (dig ? ', confirme que é você' : ', digite seu PIN'),
        sub: empresa() ? empresa().nome + ' · celular da empresa' : '',
        // iPhone/iPad: o Safari só abre a digital/o rosto com um toque na tela; nos outros, abre sozinho
        dig: dig, autoDigital: !ehIOS(),
        digital: function () { return digitalDestravar(c, s); },
        pin: function (pin, t) {
          return conferir(pin, c, s).then(function (r) {
            if (r.ok) { pinUsado = pin; registrarDestrave('pin', c).catch(function () {}); }
            // N4: digitou o PIN provisório → cria o PIN dele ali mesmo, na trava
            if (r.trocar && t) {
              t.ocupado(false); t.limpar(); t.msg('');
              return criarPin(t, pin).then(function (novo) {
                if (!novo) return { ok: false, msg: 'Crie o seu PIN para continuar.' };
                return atualizarResumo(s.email, novo).then(function () {
                  pinUsado = novo; registrarDestrave('pin', c).catch(function () {});
                  toast('PIN novo criado.', 'ok');
                  return { ok: true };
                });
              });
            }
            return r;
          });
        },
        links: empresa() ? [
          // N7 · A6: no celular da empresa, quem pega o aparelho travado troca de pessoa daqui
          { txt: 'Trocar de pessoa', fn: function () { trocarPessoa(); } },
          { txt: 'Esqueci o PIN: pedir um novo', fn: function (h) { pedirPinNovo(h); } }
        ] : [
          { txt: 'Esqueci o PIN: pedir um novo', fn: function (h) { pedirPinNovo(h); } },
          { txt: 'Entrar com e-mail e senha', fn: function () { sairParaLogin('Entre com e-mail e senha.'); } },
          { txt: 'Não é você? Trocar de conta', fn: function () { sairParaLogin(''); } }
        ]
      });
    }).then(function (ok) {
      if (ok) {
        destravar();
        if (pinUsado) oferecerDigital(s, cfgDe(s.email), pinUsado);
      }
      return ok;
    }).then(function (v) { destravando = null; return v; }, function (e) { destravando = null; throw e; });
    return destravando;
  }

  /* ── cadastrar a digital neste aparelho ──────────────────────────────────── */
  /** Tela simples com botões que agem DENTRO do clique (o iPhone exige o gesto). */
  function telaBotoes(titulo, texto, botoes) {
    return new Promise(function (fim) {
      fecharTela();
      var s = sessao(), el = document.createElement('div');
      el.id = 'tfPin'; el.className = 'tf-pin';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', titulo);
      el.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:#0E1621;color:#E8EEF5;overflow:auto';
      el.innerHTML = '<div class="tf-pin-in"><div class="tf-logo" aria-hidden="true">T</div>' +
        '<div class="tf-marca"><span>Tap</span><b>Hub</b></div>' +
        '<div class="tf-quem"><span class="tf-av" aria-hidden="true">' + esc(iniciais(s)) + '</span>' +
        '<div class="tf-tit">' + esc(titulo) + '</div><div class="tf-sub">' + esc(texto) + '</div></div>' +
        '<div class="tf-msg" id="tfPinMsg" role="alert" aria-live="assertive"></div>' +
        '<div class="tf-botoes">' + botoes.map(function (b, i) {
          return '<button type="button" class="tf-bt' + (b.pri ? ' pri' : '') + '" data-b="' + i + '">' + (b.icone ? ICONE_DIGITAL : '') + '<span>' + esc(b.txt) + '</span></button>';
        }).join('') + '</div></div>';
      document.body.appendChild(el);
      document.documentElement.setAttribute('data-tf-trava', '1');
      tela = { el: el, teclado: function () {}, foco: null };
      var h = { msg: function (t, e) { var m = el.querySelector('#tfPinMsg'); m.textContent = t || ''; m.className = 'tf-msg' + (e ? ' erro' : ''); },
                fechar: function (v) { fecharTela(); fim(v); }, el: el };
      el.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-b]') : null;
        if (b && !b.disabled) botoes[Number(b.getAttribute('data-b'))].fn(h, b);
      });
      try { el.querySelector('button').focus(); } catch (e) {}
    });
  }

  /** Cria a chave no aparelho (pede a digital) e grava a parte PÚBLICA no banco. */
  function cadastrarDigital(s, c, pin) {
    var desafio = crypto.getRandomValues(new Uint8Array(32));
    var usuario = new TextEncoder().encode(String(c.ap).slice(0, 64));      // o nº do aparelho, não dado pessoal
    return navigator.credentials.create({ publicKey: {
      rp: { id: location.hostname, name: 'TapHub' },
      user: { id: usuario, name: s.email || 'tapflow', displayName: s.nome || s.email || 'TapHub' },
      challenge: desafio, timeout: 60000, attestation: 'none',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }
    } }).then(function (cred) {
      var d = lerCadastro(cred.response.attestationObject);
      if (d.alg !== -7 && d.alg !== -257) throw new Error('Este aparelho usa um tipo de chave que o sistema não aceita.');
      return rpc('tf_digital_cadastrar', { p_aparelho: c.ap, p_credencial: d.id, p_chave: d.k, p_alg: d.alg, p_pin: pin }).then(function (r) {
        if (r && r.status === 'ok') {
          var n = cfgDe(s.email) || c; n.dig = d; delete n.digNao; gravarCfg(s.email, n);
          return { status: 'ok' };
        }
        return r || { status: 'erro' };
      });
    }, function (e) {
      if (e && e.name === 'InvalidStateError') throw new Error('Este aparelho já tem uma digital do TapHub. Remova em "Meus aparelhos e digital" e cadastre de novo.');
      throw new Error(e && e.name === 'NotAllowedError' ? 'Cancelado. Nada foi cadastrado.' : 'O aparelho não conseguiu cadastrar a digital.');
    });
  }

  /** Depois de um PIN certo: "Usar digital neste aparelho?" — uma vez por aparelho. */
  function oferecerDigital(s, c, pin) {
    if (!c || !c.ap || c.dig || c.digNao || lsGet(K_EFEMERO) === '1' || navigator.onLine === false) return Promise.resolve('nao');
    if (empresa()) return Promise.resolve('nao');   // N7 · A3: celular da empresa não usa digital
    return suporteDigital().then(function (sup) {
      if (!sup) return 'nao';
      return rpc('tf_digital_situacao', { p_aparelho: c.ap }).then(function (sit) {
        if (!sit || !sit.aparelho_ok || sit.digital_aqui) return 'nao';
        if (sit.precisa_autorizacao) {
          // já usou digital em outro aparelho: aparelho novo só com liberação (não insiste toda vez)
          if (ssGet('tf_dig_pedido') === '1' || sit.pedido_pendente) return 'nao';
          ssSet('tf_dig_pedido', '1');
          return telaBotoes('Digital em aparelho novo',
            'Você já usou a digital em outro aparelho. Para cadastrar neste, quem autoriza os acessos precisa liberar (troca ou perda de celular).',
            [{ txt: 'Pedir a liberação', pri: true, fn: function (h, b) {
                b.disabled = true;
                rpc('tf_digital_pedir').then(function () { h.fechar('pedido'); toast('Pedido enviado. Quando liberarem, abra "Meus aparelhos e digital".', 'ok'); },
                  function () { b.disabled = false; h.msg('Não deu para pedir agora. Tente de novo.', true); });
              } },
             { txt: 'Agora não (seguir com o PIN)', fn: function (h) { h.fechar('nao'); } }]);
        }
        return telaBotoes('Usar digital neste aparelho?',
          'Na próxima vez, destrave com a digital ou o rosto, em vez de digitar o PIN. O PIN continua valendo. A sua digital não sai do aparelho: o sistema guarda só uma chave.',
          [{ txt: 'Usar digital', pri: true, icone: true, fn: function (h, b) {
              b.disabled = true; h.msg('Toque no sensor ou olhe para a câmera…');
              cadastrarDigital(s, c, pin).then(function (r) {
                if (r.status === 'ok') { h.fechar('ok'); toast('Digital cadastrada neste aparelho.', 'ok'); return; }
                b.disabled = false;
                h.msg(r.status === 'precisa_autorizacao' ? 'Este aparelho precisa de liberação de quem autoriza os acessos.'
                      : r.status === 'bloqueado' ? 'PIN travado. Tente mais tarde.' : 'Não deu para cadastrar. Tente de novo.', true);
              }, function (e) { b.disabled = false; h.msg(e.message, true); });
            } },
           { txt: 'Não, seguir só com o PIN', fn: function (h) {
              var n = cfgDe(s.email) || c; n.digNao = true; gravarCfg(s.email, n); h.fechar('nao');
            } }]);
      }, function () { return 'nao'; });
    });
  }

  /* ── "Meus aparelhos e digital" (aberta pelo nome no topo do hub) ───────── */
  function quando(t) { try { return new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function meusAparelhos() {
    var s = sessao(), c = cfgDe(s.email) || null;
    fecharTela();
    var el = document.createElement('div');
    el.id = 'tfPin'; el.className = 'tf-pin tf-meus';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Meus aparelhos e digital');
    el.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:#0E1621;color:#E8EEF5;overflow:auto';
    el.innerHTML = '<div class="tf-pin-in tf-meus-in"><div class="tf-meus-topo"><div class="tf-tit">Meus aparelhos e digital</div>' +
      '<button type="button" class="tf-link" id="tfMeusFechar">Fechar</button></div>' +
      '<div class="tf-msg" id="tfPinMsg" role="status" aria-live="polite"></div><div id="tfMeusCorpo" class="tf-meus-corpo">Carregando…</div></div>';
    document.body.appendChild(el);
    document.documentElement.setAttribute('data-tf-trava', '1');
    var teclado = function (e) { if (e.key === 'Escape') fechar(); };
    tela = { el: el, teclado: teclado, foco: document.activeElement };
    document.addEventListener('keydown', teclado, true);
    function fechar() { fecharTela(); }
    function msg(t, e) { var m = el.querySelector('#tfPinMsg'); m.textContent = t || ''; m.className = 'tf-msg' + (e ? ' erro' : ''); }
    el.querySelector('#tfMeusFechar').addEventListener('click', fechar);
    el.querySelector('#tfMeusFechar').focus();

    function desenhar() {
      c = cfgDe(s.email) || null;
      var corpo = el.querySelector('#tfMeusCorpo');
      Promise.all([rpc('tf_minhas_digitais'), suporteDigital()]).then(function (x) {
        var d = x[0] || {}, sup = x[1], aqui = c && c.ap ? (d.aparelhos || []).filter(function (a) { return a.id === c.ap; })[0] : null;
        var h = '';
        // este aparelho
        h += '<section class="tf-meus-sec"><h3>Este aparelho</h3>';
        if (!aqui) h += '<p>Este aparelho não está lembrado. A digital só funciona em aparelho lembrado: saia, entre com e-mail e senha e escolha "Lembrar este aparelho".</p>';
        else if (!sup) h += '<p>Este navegador não tem digital, rosto ou Windows Hello disponível. Continue com o PIN.</p>';
        else if (aqui.digital) h += '<p><b>Digital ligada</b> desde ' + esc(quando(aqui.digital_em)) + '. A trava pede a digital; o PIN continua valendo.</p>' +
          '<button type="button" class="tf-bt" data-acao="remover" data-ap="' + esc(aqui.id) + '">Remover a digital deste aparelho</button>';
        else if (d.ja_cadastrou && !d.liberada) h += d.pedido_pendente
          ? '<p>Pedido de liberação enviado. Quando quem autoriza os acessos liberar, volte aqui para cadastrar (a liberação vale 24 horas).</p>'
          : '<p>Você já usou a digital em outro aparelho. Para cadastrar neste, quem autoriza os acessos precisa liberar.</p>' +
            '<button type="button" class="tf-bt pri" data-acao="pedir">Pedir a liberação</button>';
        else h += '<p>' + (d.liberada ? 'Liberado para cadastrar a digital neste aparelho. ' : '') + 'Destrave com a digital ou o rosto em vez de digitar o PIN.</p>' +
          '<button type="button" class="tf-bt pri" data-acao="cadastrar">' + ICONE_DIGITAL + '<span>Usar digital neste aparelho</span></button>';
        h += '</section>';
        // a lista
        h += '<section class="tf-meus-sec"><h3>Aparelhos lembrados</h3>';
        if (!(d.aparelhos || []).length) h += '<p>Nenhum.</p>';
        (d.aparelhos || []).forEach(function (a) {
          var meu = c && c.ap === a.id;
          h += '<div class="tf-ap"><div><b>' + esc(a.nome || 'Aparelho') + '</b>' + (meu ? ' <span class="tf-tag">este</span>' : '') +
            '<div class="tf-ap-sub">' + (a.digital ? 'Com digital · ' : 'Sem digital · ') + 'último uso ' + esc(quando(a.ultimo_uso || a.criado_em)) + '</div></div>' +
            '<div class="tf-ap-bts">' + (a.digital && !meu ? '<button type="button" class="tf-link" data-acao="remover" data-ap="' + esc(a.id) + '">Remover digital</button>' : '') +
            (!meu ? '<button type="button" class="tf-link" data-acao="desconectar" data-ap="' + esc(a.id) + '">Desconectar</button>' : '') + '</div></div>';
        });
        h += '<p class="tf-ap-sub">Perdeu o celular? Desconecte-o aqui: ele volta a pedir e-mail e senha, e a digital dele é apagada. ' +
          'O sistema guarda só uma chave do aparelho, nunca a sua digital ou o seu rosto.</p></section>';
        corpo.innerHTML = h;
      }, function (e) {
        corpo.innerHTML = '<p>Não deu para abrir agora' + (e && e.rede ? ' (sem sinal)' : '') + '.</p><button type="button" class="tf-bt" data-acao="tentar">Tentar de novo</button>';
      });
    }
    // ação que apaga pede um 2º toque no mesmo botão (sem janela do navegador, que trava o app)
    function certeza(b, txt) {
      if (b.dataset.certo === '1') return true;
      b.dataset.certo = '1'; b.textContent = txt; b.classList.add('tf-certo');
      setTimeout(function () { if (b.isConnected) { delete b.dataset.certo; desenhar(); } }, 5000);
      return false;
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-acao]') : null; if (!b || b.disabled) return;
      var acao = b.getAttribute('data-acao'), ap = b.getAttribute('data-ap');
      if (acao === 'tentar') return desenhar();
      if (acao === 'pedir') {
        b.disabled = true;
        return rpc('tf_digital_pedir').then(function () { msg('Pedido enviado.'); desenhar(); }, function (x) { b.disabled = false; msg(limpaMsg(x.message) || 'Não deu.', true); });
      }
      if (acao === 'remover') {
        if (!certeza(b, 'Toque de novo para remover')) return;
        b.disabled = true;
        return rpc('tf_digital_remover', { p_aparelho: ap }).then(function () {
          if (c && c.ap === ap && c.dig) { delete c.dig; c.digNao = true; gravarCfg(s.email, c); }
          msg('Digital removida.'); desenhar();
        }, function (x) { b.disabled = false; msg(limpaMsg(x.message) || 'Não deu.', true); });
      }
      if (acao === 'desconectar') {
        if (!certeza(b, 'Toque de novo para desconectar')) return;
        b.disabled = true;
        return rpc('tf_aparelho_revogar', { p_aparelho: ap }).then(function () { msg('Aparelho desconectado.'); desenhar(); },
          function (x) { b.disabled = false; msg(limpaMsg(x.message) || 'Não deu.', true); });
      }
      if (acao === 'cadastrar') {
        // a digital é cadastrada DENTRO deste clique (o iPhone exige); antes, o PIN
        fecharTela();
        var pinT = abrirTela({ titulo: 'Digite seu PIN', sub: 'Para ligar a digital neste aparelho.',
          links: [{ txt: 'Cancelar', fn: function (h) { h.cancelar(); } }] });
        (function laco() {
          pinT.pin().then(function (pin) {
            if (pin === null) { pinT.fechar(); return meusAparelhos(); }
            pinT.ocupado(true);
            rpc('tf_meu_pin_conferir', { p_pin: pin, p_aparelho: c.ap }).then(function (j) {
              pinT.ocupado(false);
              if (!j || j.status !== 'ok') {
                pinT.limpar(); pinT.msg(j && j.status === 'pin_errado' ? 'PIN errado. Restam ' + j.restantes + ' tentativas.'
                  : j && j.status === 'bloqueado' ? 'PIN travado até ' + horaDe(j.ate) + '.' : 'Não deu para conferir.', true);
                return laco();
              }
              pinT.fechar();
              telaBotoes('Ligar a digital', 'Toque em "Usar digital" e confirme com a digital ou o rosto.',
                [{ txt: 'Usar digital', pri: true, icone: true, fn: function (h, bt) {
                    bt.disabled = true; h.msg('Toque no sensor ou olhe para a câmera…');
                    cadastrarDigital(s, c, pin).then(function (r) {
                      if (r.status === 'ok') { h.fechar('ok'); meusAparelhos(); toast('Digital cadastrada neste aparelho.', 'ok'); return; }
                      bt.disabled = false;
                      h.msg(r.status === 'precisa_autorizacao' ? 'Este aparelho precisa de liberação de quem autoriza os acessos.' : 'Não deu para cadastrar.', true);
                    }, function (x) { bt.disabled = false; h.msg(x.message, true); });
                  } },
                 { txt: 'Cancelar', fn: function (h) { h.fechar('nao'); meusAparelhos(); } }]);
            }, function (x) { pinT.ocupado(false); pinT.limpar(); pinT.msg(x.rede ? 'Sem sinal.' : limpaMsg(x.message), true); laco(); });
          });
        })();
      }
    });
    desenhar();
  }

  /* ── confirmarPessoa: a função única (decisão 10: a batida e as assinaturas chamam) ── */
  /**
   * Nucleo.confirmarPessoa({ modo, finalidade, referencia, titulo, sub })
   *   modo 'local'    → confere no aparelho (funciona sem sinal). Para a batida do ponto.
   *   modo 'servidor' → a digital é conferida pela Edge Function confirmar-pessoa e o PIN
   *                     pelo banco; a confirmação fica gravada com a hora do servidor.
   *                     Para as assinaturas (EPI, espelho e Termo Mensal do ponto).
   * Resolve: { ok:true, metodo:'digital'|'pin', aparelho, em, offline?, confirmacao? (servidor) }
   *       ou { ok:false, cancelado:true } · { ok:false, semSinal:true } (servidor sem sinal: fica pendente)
   * A digital só vale num aparelho cadastrado em nome da pessoa (decisão 6).
   * N10 · soDigital:true (aprovar o laudo, issue 29): o PIN não aparece. Sem digital neste aparelho,
   *       não abre tela nenhuma e resolve { ok:false, semDigital:true } (quem chamou avisa).
   */
  function temDigital() {
    if (empresa()) return Promise.resolve(false);
    var c = cfgDe(sessao().email);
    return suporteDigital().then(function (sup) { return !!(sup && c && c.dig); });
  }
  function confirmarPessoa(o) {
    o = o || {};
    var modoS = o.modo === 'servidor', s = sessao(), c = cfgDe(s.email);
    var fin = String(o.finalidade || (modoS ? '' : 'local'));
    if (modoS && !/^[a-z_]{2,30}$/.test(fin)) return Promise.reject(new Error('confirmarPessoa: finalidade inválida.'));
    // N7 · A4: no celular da empresa não se bate ponto nem se assina (o banco também recusa)
    if (empresa()) { toast(MSG_EMPRESA, 'err'); return Promise.resolve({ ok: false, cancelado: true, empresa: true, msg: MSG_EMPRESA }); }
    if (modoS && navigator.onLine === false) return Promise.resolve({ ok: false, semSinal: true });
    var res = null, so = !!o.soDigital;
    var semPinTxt = function (r) {   // N10: sem PIN, as mensagens não mandam usar o PIN
      if (so && r && r.msg) r.msg = String(r.msg).replace(/ ?Tente de novo ou use o PIN\./, ' Toque em "Usar digital" e tente de novo.').replace(/ ?Use o PIN\./, ' Tente de novo.');
      return r;
    };
    return suporteDigital().then(function (sup) {
      var dig = sup && c && c.dig ? c.dig : null;
      if (so && !dig) { res = { ok: false, semDigital: true }; return false; }
      return telaConfirmar({
        titulo: o.titulo || 'Confirme que é você', sub: o.sub || '', dig: dig, autoDigital: so && !ehIOS(), semPin: so,
        digital: function () { return digitalDe().then(semPinTxt); },
        pin: function (pin) { return pinDe(pin); },
        links: [{ txt: 'Cancelar', cancela: true }]
      });
      function digitalDe() {
          if (!modoS) {
            var d = crypto.getRandomValues(new Uint8Array(32));
            return pedirAoAparelho(dig, d).then(function (a) {
              return conferirNoAparelho(dig, d, a).then(function (ok) {
                if (!ok) return { ok: false, msg: 'A resposta do aparelho não conferiu. Use o PIN.' };
                res = { ok: true, metodo: 'digital', aparelho: c.ap, em: new Date().toISOString(), offline: navigator.onLine === false };
                return { ok: true };
              });
            }, function () { return { ok: false, msg: 'Não reconheceu. Tente de novo ou use o PIN.' }; });
          }
          return rpc('tf_digital_desafio', { p_finalidade: fin, p_referencia: o.referencia || null }).then(function (x) {
            return pedirAoAparelho(dig, unb64u(x.desafio)).then(function (a) {
              var cfg = cfgDoBanco(), h = { apikey: cfg.anon, 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao().token };
              return fetch(cfg.url + '/functions/v1/confirmar-pessoa', { method: 'POST', headers: h, signal: comPrazo(20000),
                body: JSON.stringify({ desafio: x.id, credencial: a.id, cliente: b64u(a.response.clientDataJSON),
                  autenticador: b64u(a.response.authenticatorData), assinatura: b64u(a.response.signature) }) })
                .then(function (r) { return r.json().catch(function () { return {}; }); })
                .then(function (j) {
                  if (!j || !j.ok) return { ok: false, msg: (j && j.erro) || 'O servidor não confirmou. Use o PIN.' };
                  res = { ok: true, metodo: 'digital', aparelho: c.ap, em: j.em, confirmacao: j.confirmacao };
                  return { ok: true };
                }, function () { return { ok: false, msg: 'Sem sinal. A assinatura fica pendente até ter sinal.' }; });
            }, function () { return { ok: false, msg: 'Não reconheceu. Tente de novo ou use o PIN.' }; });
          }, function (e) { return { ok: false, msg: e.rede ? 'Sem sinal. A assinatura fica pendente até ter sinal.' : limpaMsg(e.message) }; });
      }
      function pinDe(pin) {
          if (!modoS) return conferir(pin, c, s).then(function (r) {
            if (r.ok) res = { ok: true, metodo: 'pin', aparelho: c && c.ap || null, em: new Date().toISOString(), offline: !!r.local };
            return r;
          });
          return rpc('tf_confirmar_pin', { p_pin: pin, p_aparelho: c && c.ap || null, p_finalidade: fin, p_referencia: o.referencia || null }).then(function (j) {
            if (j && j.status === 'ok') { res = { ok: true, metodo: 'pin', aparelho: c && c.ap || null, em: j.em, confirmacao: j.confirmacao }; return { ok: true }; }
            if (j && j.status === 'pin_errado') return { ok: false, msg: 'PIN errado. Restam ' + j.restantes + ' tentativas.' };
            if (j && j.status === 'bloqueado') return { ok: false, msg: 'PIN travado até ' + horaDe(j.ate) + '.' };
            if (j && j.status === 'trocar_pin') return { ok: false, msg: 'Este é o PIN provisório: crie o seu PIN na trava do TapHub antes.' };
            if (j && j.status === 'pin_vencido') return { ok: false, msg: MSG_PIN_VENCIDO };
            return { ok: false, msg: 'Crie o seu PIN no início do TapHub.' };
          }, function (e) { return { ok: false, msg: e.rede ? 'Sem sinal. A assinatura fica pendente até ter sinal.' : limpaMsg(e.message) }; });
      }
    }).then(function (ok) { return ok && res ? res : (res && res.semDigital ? res : { ok: false, cancelado: true }); });
  }

  /* ── fluxo de entrada (hub): criar PIN e lembrar o aparelho ────────────── */
  function criarPin(t, provisorio) {
    // pede duas vezes; devolve o PIN criado no servidor.
    // N4: com o PIN provisório (207), ele vai como "PIN atual" e o novo tem que ser diferente.
    t.titulo('Crie o seu PIN', provisorio ? 'O PIN provisório confere. Agora crie o seu: 6 números, diferente do provisório.'
                             : '6 números. Ele destrava o TapHub neste aparelho e confirma assinaturas.');
    return (function laco() {
      return t.pin().then(function (p1) {
        if (p1 === null) return null;
        t.limpar(); t.msg('');
        t.titulo('Digite de novo para confirmar');
        return t.pin().then(function (p2) {
          if (p2 === null) return null;
          t.limpar();
          if (p1 !== p2) { t.titulo('Crie o seu PIN'); t.msg('Os dois PINs não batem. Comece de novo.', true); return laco(); }
          if (provisorio && p1 === provisorio) { t.titulo('Crie o seu PIN'); t.msg('O PIN novo tem que ser diferente do provisório.', true); return laco(); }
          t.ocupado(true);
          return rpc('tf_meu_pin_definir', provisorio ? { p_pin_novo: p1, p_pin_atual: provisorio } : { p_pin_novo: p1 }).then(function (r) {
            t.ocupado(false);
            if (r && r.status === 'ok') return p1;
            t.titulo('Crie o seu PIN');
            t.msg(r && r.status === 'pin_vencido' ? MSG_PIN_VENCIDO : 'Não deu para criar o PIN.', true);
            return laco();
          }, function (e) {
            t.ocupado(false); t.titulo('Crie o seu PIN');
            t.msg(e.rede ? 'Sem sinal. Tente de novo com internet.' : limpaMsg(e.message), true);
            return laco();
          });
        });
      });
    })();
  }
  function lembrarAparelho(s, pin, emp) {
    // N7: p_empresa só vai quando é celular da empresa (banco sem a 210 não conhece o parâmetro)
    var corpo = emp ? { p_nome: nomeDoAparelho(), p_empresa: emp.id } : { p_nome: nomeDoAparelho() };
    return rpc('tf_aparelho_registrar', corpo).then(function (ap) {
      lsDel(K_EFEMERO);
      if (emp) { lsSet(K_EMP, JSON.stringify({ id: emp.id, nome: emp.nome })); }
      var p = window.crypto && crypto.subtle ? guardarResumo(s.email, ap, pin) : (gravarCfg(s.email, { ap: ap }), Promise.resolve());
      return p.catch(function () { gravarCfg(s.email, { ap: ap }); }).then(function () {
        destravar();
        if (emp) { lembrarSessaoEmp(Object.assign(sessao(), { _entrou: true })); limparPushEmp(); return 'ok'; }
        // N3: logo depois de lembrar o aparelho com o PIN, a pergunta da digital (uma vez)
        return oferecerDigital(s, cfgDe(s.email), pin).catch(function () {}).then(function () { return 'ok'; });
      });
    }, function (e) {
      if (!emp || e.rede) throw e;
      var msg = limpaMsg(e.message) || 'Não deu para entrar neste celular.';
      if (/desativado/i.test(msg)) {          // o celular foi desativado: volta a ser um aparelho comum
        desmarcarEmp();
        return perguntar('Celular desativado', msg + ' Ele volta a ser um aparelho comum.', ['Entendi']).then(function () { return 'refazer'; });
      }
      // A5: fora da lista → pode pedir para entrar
      return perguntar('Você não está na lista deste celular', msg, ['Pedir para entrar', 'Voltar']).then(function (i) {
        if (i !== 0) return 'fora';
        return rpc('tf_aparelho_empresa_pedir', { p_empresa: emp.id }).then(function () {
          return perguntar('Pedido enviado', 'Quem autoriza os acessos recebe o pedido. Quando incluir você, entre de novo neste celular.', ['Entendi']);
        }, function () {}).then(function () { return 'fora'; });
      });
    });
  }
  /** N7 · "É um celular da empresa": qual? (só os celulares em que a pessoa está na lista) */
  function escolherEmpresa() {
    return rpc('tf_aparelho_empresa_opcoes').then(function (L) {
      L = Array.isArray(L) ? L : [];
      if (!L.length) {
        return perguntar('Celular da empresa', 'Você não está na lista de nenhum celular da empresa. Peça a quem autoriza os acessos para incluir você em Pessoas e acessos › Celulares da empresa.', ['Voltar'])
          .then(function () { return null; });
      }
      return perguntar('Qual celular é este?', 'Escolha o nome do celular da empresa que está na sua mão. Nele não há digital, ponto, EPI nem dados pessoais.',
        L.map(function (x) { return x.nome; }).concat(['Voltar'])).then(function (i) { return L[i] || null; });
    }, function (e) {
      return perguntar('Celular da empresa', e.rede ? 'Sem sinal. Tente de novo com internet.' : 'O banco ainda não tem o celular da empresa.', ['Voltar'])
        .then(function () { return null; });
    });
  }
  function naoLembrar() { lsSet(K_EFEMERO, '1'); destravar(); return 'efemero'; }

  /** N4 · a pessoa tem PIN provisório (207): digita o provisório e cria o dela.
   *  Devolve o PIN novo, ou null ("Agora não"). */
  function trocarPinProvisorio() {
    var t = abrirTela({ titulo: 'Digite o PIN provisório', sub: 'O que quem autoriza os acessos te passou. Depois você cria o seu.',
      links: [{ txt: 'Esqueci o PIN: pedir um novo', fn: function (h) { pedirPinNovo(h); } },
              { txt: 'Agora não', fn: function (h) { h.cancelar(); } }] });
    return (function laco() {
      return t.pin().then(function (pin) {
        if (pin === null) { t.fechar(); return null; }
        t.ocupado(true);
        return rpc('tf_meu_pin_conferir', { p_pin: pin, p_aparelho: null }).then(function (j) {
          t.ocupado(false); t.limpar();
          if (j && j.status === 'trocar_pin') {
            t.msg('');
            return criarPin(t, pin).then(function (novo) { t.fechar(); toast('PIN novo criado.', 'ok'); return novo; });
          }
          if (j && j.status === 'ok') { t.fechar(); return pin; }   // já tinha trocado em outro aparelho
          t.msg(j && j.status === 'pin_errado' ? 'PIN errado. Restam ' + j.restantes + ' tentativas.'
                : j && j.status === 'bloqueado' ? 'PIN travado até ' + horaDe(j.ate) + '.'
                : j && j.status === 'pin_vencido' ? MSG_PIN_VENCIDO : 'Não deu para conferir.', true);
          return laco();
        }, function (e) {
          t.ocupado(false); t.limpar(); t.msg(e.rede ? 'Sem sinal. Tente de novo com internet.' : limpaMsg(e.message), true);
          return laco();
        });
      });
    })();
  }

  /**
   * Depois de entrar com a senha (ou com sessão antiga e sem PIN neste aparelho):
   * cria o PIN se não tem e pergunta se lembra o aparelho.
   * Devolve 'ok' | 'efemero' | 'offline' | 'fora' (N7: fora da lista do celular da empresa: a sessão foi apagada).
   */
  function fluxoEntrada() {
    var s = sessao(), c = cfgDe(s.email);
    function seguir() {
      // N4: banco sem a 207 → tf_minha_troca dá erro e tudo segue como no N3
      var troca = rpc('tf_minha_troca').catch(function () { return null; });
      return Promise.all([rpc('tf_meu_pin_situacao'), troca]).then(function (x) {
        var sit = x[0], tr = x[1];
        var pinNovo = null;
        var pronto = (tr && tr.pin)
          ? trocarPinProvisorio().then(function (p) { pinNovo = p; return p !== null; })
          : (!sit || !sit.tem_pin)
          ? (function () {
              var t = abrirTela({ titulo: 'Crie o seu PIN', links: [] });
              return criarPin(t).then(function (p) { t.fechar(); pinNovo = p; return p !== null; });
            })()
          : Promise.resolve(true);
        return pronto.then(function (ok) {
          if (!ok) return 'offline';
          // N7: o celular já está marcado como da empresa → não pergunta; senão, 3 escolhas
          function qual() {
            var e = empresa();
            if (e) return Promise.resolve({ emp: e });
            return perguntar('Lembrar este aparelho?',
              'Se for o seu celular ou computador, lembre: ele passa a pedir só o PIN. Em computador de uso comum, escolha não lembrar: ao fechar o navegador você sai. Celular da empresa (o da equipe ou da administração): escolha "É um celular da empresa".',
              // a ordem dos dois primeiros não muda (quem já usa toca no mesmo lugar); o novo vem por último
              ['Lembrar este aparelho', 'Não lembrar (uso comum)', 'É um celular da empresa']).then(function (i) {
              if (i === 1) return { nao: true };
              if (i === 2) return escolherEmpresa().then(function (emp) { return emp ? { emp: emp } : qual(); });
              return {};
            });
          }
          function lembrar(pin, emp) {
            return lembrarAparelho(s, pin, emp).then(function (r) {
              if (r === 'refazer') return qual().then(function (q) { return q.nao ? naoLembrar() : lembrar(pin, q.emp); });
              if (r === 'fora') { limparSessao(); return 'fora'; }
              return r;
            });
          }
          return qual().then(function (q) {
            if (q.nao) return naoLembrar();
            var emp = q.emp || null;
            if (pinNovo) return lembrar(pinNovo, emp);
            // já tinha PIN: confirma com ele antes de registrar o aparelho
            var t = abrirTela({ titulo: 'Digite seu PIN', sub: emp ? 'Para entrar no ' + emp.nome + '.' : 'Para lembrar este aparelho.',
              links: [{ txt: emp ? 'Cancelar' : 'Não lembrar neste aparelho', fn: function (h) { h.cancelar(); } },
                      { txt: 'Esqueci o PIN: pedir um novo', fn: function (h) { pedirPinNovo(h); } }] });
            return (function laco() {
              return t.pin().then(function (pin) {
                if (pin === null) { t.fechar(); if (emp) { limparSessao(); return 'fora'; } return naoLembrar(); }
                t.ocupado(true);
                return rpc('tf_meu_pin_conferir', { p_pin: pin, p_aparelho: null }).then(function (j) {
                  t.ocupado(false);
                  if (j && j.status === 'ok') { t.fechar(); return lembrar(pin, emp); }
                  t.limpar();
                  // N4: o provisório chegou depois do login: cria o PIN e lembra o aparelho com ele
                  if (j && j.status === 'trocar_pin') {
                    t.msg('');
                    return criarPin(t, pin).then(function (novo) {
                      if (!novo) { t.fechar(); if (emp) { limparSessao(); return 'fora'; } return naoLembrar(); }
                      t.fechar(); return lembrar(novo, emp);
                    });
                  }
                  t.msg(j && j.status === 'pin_errado' ? 'PIN errado. Restam ' + j.restantes + ' tentativas.'
                        : j && j.status === 'bloqueado' ? 'PIN travado até ' + horaDe(j.ate) + '.'
                        : j && j.status === 'pin_vencido' ? MSG_PIN_VENCIDO : 'Não deu para conferir.', true);
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
        destravar(); lembrarSessaoEmp(Object.assign(sessao(), { _entrou: true })); return 'ok';
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
      if (e.key === K_TRAVADO && e.newValue === null && tela && tela.el && !tela.guardar && !destravando) fecharTela();
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
        if (empresa()) { limparPushEmp(); setTimeout(contarFila, 3000); }   // N7 · A2/A9
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
    // N3 · Passkey 1
    confirmarPessoa: confirmarPessoa,
    temDigital: temDigital,                            // N10 · issue 29: este aparelho tem a digital da pessoa (antes de pedir)
    meusAparelhos: meusAparelhos,
    relatar: relatar,                                  // N6 · "Relatar problema ou sugerir" (209)
    errosRecentes: function () { return ERROS.slice(); },
    suporteDigital: suporteDigital,
    travarAgora: function () { lsSet(K_TRAVADO, '1'); if (cfgDe(sessao().email)) pedirDestrave(); },
    configurar: function (o) { conf.url = o.url || conf.url; conf.anon = o.anon || conf.anon; if (o.app) conf.app = o.app; },
    rpc: rpc, api: api, sessao: sessao, primeiroNome: primeiroNome,
    /** Sair de verdade (botão Sair): apaga a sessão, mantém o aparelho lembrado.
     *  N7: no celular da empresa, a pessoa continua no "Quem vai usar?" (é o mesmo que trocar de pessoa). */
    sair: function () { var s = sessao(); if (empresa() && s.email && s.token) lembrarSessaoEmp(s); limparSessao(); lsDel(K_TRAVADO); },
    /** N7 · o celular da empresa (210). atual() = { id, nome } ou null. */
    empresa: {
      atual: empresa, pessoas: pessoasEmp, entrarComo: entrarComo, trocarPessoa: trocarPessoa,
      sairDeste: sairDeste, sessaoDe: sessaoDeEmp, renovarDe: renovarEmp, desmarcar: desmarcarEmp,
      lembrar: lembrarSessaoEmp, contarFila: contarFila, aviso: MSG_EMPRESA
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
   * N2 · UTILITÁRIOS COMUNS (contrato: processos/nucleo-n2-contrato.md)
   * Cada um faz EXATAMENTE o que a versão do Manager S72 faz (mesma entrada,
   * mesma saída). O Manager continua com as cópias dele até migrar: a
   * duplicação é temporária e aceita (decisão F1, 22/10).
   * ════════════════════════════════════════════════════════════════════════ */
  function BRL(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

  /* ── N12 (issues 167 e 189): UM SÓ leitor de valor digitado ────────────────────
     Antes cada tela tinha o seu: o dos contratos tirava todos os pontos ("2.5" virava 25, "1500.50" virava
     150.050) e o da Conta corrente Proper e dos Cartões tratava o ponto como centavos quando não havia vírgula
     ("1.250" virava 1,25). A regra agora, para todas:
       · tira "R$", espaços; aceita negativo ("-10", "(10)", "10-");
       · com vírgula: a vírgula é o decimal e os pontos são milhar ("1.500,50", "1500,50", "0,5");
       · sem vírgula e com UM ponto seguido de exatamente 3 algarismos e um começo de 1 a 3 algarismos sem zero na
         frente: milhar ("1.250" = 1.250; "12.500" = 12.500);
       · sem vírgula e com vários pontos: só se forem de milhar ("1.250.000");
       · sem vírgula e com um ponto no resto dos casos: o ponto é o decimal ("2.5", "0.5", "1500.50", "0.125");
       · qualquer outra coisa (letras, "1.5,0", duas vírgulas) não é número.
     lerValor(t) devolve o número, null (campo vazio) ou NaN (não é número). lerValorDetalhe(t) devolve
     { n, vazio, invalido, milharSemVirgula, pontoDecimal } para a tela avisar como entendeu. */
  function lerValorDetalhe(v) {
    if (typeof v === 'number') return isFinite(v) ? { n: v } : { n: NaN, invalido: true };
    var t = String(v == null ? '' : v).replace(/R\$|\s|\u00a0/g, '');
    if (!t) return { n: null, vazio: true };
    var inval = { n: NaN, invalido: true }, neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (/^[-\u2212]/.test(t)) { neg = !neg; t = t.slice(1); }
    else if (/^\+/.test(t)) t = t.slice(1);
    else if (/-$/.test(t)) { neg = !neg; t = t.slice(0, -1); }
    if (!/^[0-9.,]+$/.test(t) || !/\d/.test(t)) return inval;
    var virgulas = t.split(',').length - 1, inteiro, dec = '', milhar = false, pontoDec = false;
    if (virgulas > 1) return inval;
    if (virgulas === 1) {
      var p = t.split(','); inteiro = p[0]; dec = p[1];
      if (dec.indexOf('.') >= 0) return inval;
      if (inteiro.indexOf('.') >= 0) { if (!/^\d{1,3}(\.\d{3})+$/.test(inteiro)) return inval; inteiro = inteiro.replace(/\./g, ''); }
    } else {
      var pontos = t.split('.').length - 1;
      if (pontos === 0) inteiro = t;
      else if (pontos > 1) { if (!/^\d{1,3}(\.\d{3})+$/.test(t)) return inval; inteiro = t.replace(/\./g, ''); milhar = true; }
      else {
        var q = t.split('.');
        if (/^[1-9]\d{0,2}$/.test(q[0]) && /^\d{3}$/.test(q[1])) { inteiro = q[0] + q[1]; milhar = true; }
        else { inteiro = q[0]; dec = q[1]; pontoDec = true; }
      }
    }
    if (inteiro === '' && dec === '') return inval;
    var n = Number((inteiro || '0') + (dec ? '.' + dec : ''));
    if (!isFinite(n)) return inval;
    return { n: neg && n !== 0 ? -n : n, milharSemVirgula: milhar, pontoDecimal: pontoDec };
  }
  function lerValor(v) { return lerValorDetalhe(v).n; }
  /** Como o sistema entendeu o valor, para mostrar ao lado do campo: tipo 'moeda' ("R$ 1.500,50"), 'm3' ("2,5 m³") ou 'num'. */
  function valorEntendido(v, tipo) {
    var d = lerValorDetalhe(v);
    if (d.vazio) return { txt: '', ok: true };
    if (d.invalido) return { txt: 'Não é um número: use só algarismos, com vírgula nos decimais (ex.: 1.500,50).', ok: false };
    var t = tipo === 'moeda' ? BRL(d.n)
      : d.n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + (tipo === 'm3' ? ' m³' : '');
    return { txt: 'Entendi: ' + t, ok: true, n: d.n };
  }
  // Campos com data-valor="moeda|m3|num" ganham, embaixo, "Entendi: …" enquanto se digita (issue 167, item 2).
  function mostrarValor(inp) {
    if (!inp || !inp.getAttribute) return;
    var tipo = inp.getAttribute('data-valor'); if (!tipo) return;
    var r = valorEntendido(inp.value, tipo);
    var sm = inp.nextElementSibling;
    if (!sm || !sm.classList || !sm.classList.contains('tfn-valor')) {
      sm = document.createElement('small'); sm.className = 'tfn-valor'; sm.setAttribute('aria-live', 'polite');
      sm.style.cssText = 'display:block;font-size:11.5px;margin-top:3px';
      inp.parentNode.insertBefore(sm, inp.nextSibling);
    }
    sm.textContent = r.txt;
    sm.style.color = r.ok ? 'var(--ink-3,#78838A)' : 'var(--crit,#A62D18)';
  }
  document.addEventListener('input', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-valor')) mostrarValor(e.target); }, true);
  document.addEventListener('focusin', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-valor')) mostrarValor(e.target); }, true);

  /* ── N12 (issue 146): UM SÓ leitor de planilha .xlsx (Cadastros › Importar do TapWeb e TapFin › Conta corrente).
     O de antes (copiado nas duas páginas) procurava "<c …>…</c>": a célula VAZIA mas formatada ("<c r="B2" s="1"/>")
     não tem "</c>" e ele seguia até o fim da próxima célula, pondo o valor dela na coluna da vazia. O mesmo com a
     linha vazia ("<row …/>"), que engolia a de baixo. Agora a vazia é lida primeiro, e cada linha vai para o
     número dela (r="7" é a 7ª), com as linhas que faltam vazias. Número sai como número; texto, como texto.
     `JSZipLib` é a biblioteca que a página já carrega (carregarJSZip). */
  function xmlTexto(t) {
    return String(t == null ? '' : t)
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function colDaRef(ref) {
    var n = 0, l = String(ref).replace(/\d+/g, '');
    for (var i = 0; i < l.length; i++) n = n * 26 + (l.charCodeAt(i) - 64);
    return n - 1;
  }
  /** Lê o XML de uma aba (e os textos compartilhados) e devolve as linhas: [[célula, …], …]. Separada para o teste. */
  function linhasDoXml(wsXml, compart) {
    compart = compart || [];
    var linhas = [];
    (wsXml.match(/<row\b[^>]*?\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) || []).forEach(function (row) {
      var cels = [];
      var cab = (row.match(/^<row\b[^>]*>/) || [''])[0];
      var nr = Number((cab.match(/\sr="(\d+)"/) || [])[1]);
      if (!/\/>$/.test(cab)) {
        (row.match(/<c\b[^>]*?\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach(function (c) {
          var abre = (c.match(/^<c\b[^>]*>/) || [''])[0];
          var ref = (abre.match(/\sr="([A-Z]+\d+)"/) || [])[1];
          var tipo = (abre.match(/\st="([^"]+)"/) || [])[1];
          var v = null;
          if (!/\/>$/.test(abre)) {
            if (tipo === 'inlineStr') {
              var is = (c.match(/<is>[\s\S]*?<\/is>/) || [''])[0];
              v = xmlTexto((is.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); }).join(''));
            } else {
              var bruto = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
              if (bruto == null) v = null;
              else if (tipo === 's') v = compart[Number(bruto)] != null ? compart[Number(bruto)] : '';
              else if (tipo === 'str' || tipo === 'e') v = xmlTexto(bruto);
              else v = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(bruto) ? Number(bruto) : xmlTexto(bruto);
            }
          }
          cels[ref ? colDaRef(ref) : cels.length] = v;
        });
      }
      for (var k = 0; k < cels.length; k++) if (cels[k] === undefined) cels[k] = null;
      var idx = (nr >= 1) ? nr - 1 : linhas.length;
      while (linhas.length < idx) linhas.push([]);
      linhas[idx] = cels;
    });
    return linhas;
  }
  function lerXLSX(file, JSZipLib) {
    if (!JSZipLib || !JSZipLib.loadAsync) return Promise.reject(new Error('A biblioteca de planilha não carregou. Tente de novo com internet.'));
    return JSZipLib.loadAsync(file).then(function (zip) {
      function textoDe(nome) { var f = zip.file(nome); return f ? f.async('string') : Promise.resolve(null); }
      return Promise.all([textoDe('xl/sharedStrings.xml'), textoDe('xl/workbook.xml'), textoDe('xl/_rels/workbook.xml.rels')]).then(function (x) {
        var compart = [];
        (x[0] && x[0].match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
          // o texto da célula, sem a pronúncia fonética (<rPh>) que o Excel japonês põe junto
          var sem = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
          compart.push(xmlTexto((sem.match(/<t[^>]*>([\s\S]*?)<\/t>|<t[^>]*\/>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join('')));
        });
        // a PRIMEIRA aba pela ordem do workbook (não "sheet1.xml", que nem sempre é a primeira)
        var alvo = 'xl/worksheets/sheet1.xml', wb = x[1], rel = x[2];
        if (wb && rel) {
          var rid = (wb.match(/<sheet\b[^>]*\sr:id="([^"]+)"/) || [])[1];
          if (rid) {
            var re = new RegExp('<Relationship\\b[^>]*Id="' + rid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*Target="([^"]+)"');
            var re2 = new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + rid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
            var alvoRel = (rel.match(re) || rel.match(re2) || [])[1];
            if (alvoRel) alvo = 'xl/' + alvoRel.replace(/^\/?xl\//, '').replace(/^\//, '');
          }
        }
        return textoDe(alvo).then(function (ws) { return ws || textoDe('xl/worksheets/sheet1.xml'); }).then(function (ws) {
          if (!ws) throw new Error('Não achei nenhuma planilha dentro do arquivo.');
          return linhasDoXml(ws, compart);
        });
      });
    });
  }
  function dataBR(d) {
    if (!d) return new Date().toLocaleDateString('pt-BR');
    var t = String(d);
    return new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T12:00' : t).toLocaleDateString('pt-BR');
  }
  function isoHoje(d) {
    var x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function arquivoParaBase64(f) {
    return new Promise(function (ok, err) {
      var r = new FileReader();
      r.onerror = function () { err(new Error('Não consegui ler o arquivo.')); };
      r.onload = function () { ok(r.result); };
      r.readAsDataURL(f);
    });
  }

  // O aviso e a janela usam os MESMOS ids do Manager (#toast, #modal, #mTit,
  // #mBody, #mFoot, #mScrim): código levado do Manager para um módulo novo
  // continua achando os elementos. Se a página já tem os dela, o núcleo usa os
  // dela; se não tem, cria os seus, com a classe tfn-* (CSS no nucleo.css).
  var toastTimer = null;
  function garantirToast() {
    var el = document.getElementById('toast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast tfn-toast';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    return el;
  }
  /** N12 (issue 154, item 2): aviso de ERRO longo (mais de TOAST_LONGO letras) ou com { fixo:true } fica na tela até
   *  a pessoa tocar em "Entendi" (o de "aparelho sem espaço" sumia em 4 s, sem dar tempo de ler). O resto some sozinho. */
  var TOAST_LONGO = 120, toastFora = function () {};
  function toast(msg, tipo, opt) {
    var el = garantirToast();
    var meu = el.classList.contains('tfn-toast');
    var fixo = !!(opt && opt.fixo) || (tipo === 'err' && String(msg == null ? '' : msg).length > TOAST_LONGO);
    var base = 'toast' + (meu ? ' tfn-toast' : '');
    function some() { el.className = base; el.style.pointerEvents = ''; el.removeAttribute('data-fixo'); document.removeEventListener('pointerdown', fora, true); }
    // o aviso fixo não trava a tela: só o botão "Entendi" recebe o toque; tocar em outra coisa (seguir trabalhando) também o fecha
    function fora(e) { if (!el.contains(e.target)) some(); }
    document.removeEventListener('pointerdown', toastFora, true); toastFora = fora;
    el.textContent = msg;
    el.className = 'toast on' + (tipo ? ' ' + tipo : '') + (meu ? ' tfn-toast' : '');
    clearTimeout(toastTimer);
    if (fixo) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tfn-entendi'; b.textContent = 'Entendi';
      b.style.cssText = 'display:block;margin:8px 0 0 auto;padding:6px 14px;border:1px solid rgba(255,255,255,.7);border-radius:3px;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer';
      b.style.pointerEvents = 'auto';
      b.addEventListener('click', function (e) { e.stopPropagation(); some(); });
      el.appendChild(b);
      el.style.pointerEvents = 'none'; el.setAttribute('data-fixo', '1');
      setTimeout(function () { if (el.getAttribute('data-fixo') === '1' && toastFora === fora) document.addEventListener('pointerdown', fora, true); }, 600);
      return;
    }
    el.style.pointerEvents = ''; el.removeAttribute('data-fixo');
    toastTimer = setTimeout(some, 4200);
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
  function copiar(texto, msgOk) {
    var feito = function () { toast(msgOk || 'Copiado.', 'ok'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(feito, function () { copiarVelho(texto, feito); });
    } else copiarVelho(texto, feito);
  }
  function semDuploEnvio(btn, fn) {
    if (btn && btn.dataset.enviando === '1') return Promise.resolve();   // o segundo clique morre aqui
    if (btn) btn.dataset.enviando = '1';
    var txt = btn ? btn.textContent : null;
    var desab = btn ? btn.disabled : false;
    if (btn) { btn.disabled = true; btn.classList.add('ocupado'); btn.textContent = 'Processando…'; }
    var fim = function () {
      if (btn) { btn.disabled = desab; btn.classList.remove('ocupado'); btn.textContent = txt; delete btn.dataset.enviando; }
    };
    return Promise.resolve().then(fn).then(function (r) { fim(); return r; }, function (e) { fim(); throw e; });
  }

  var focoAntes = null;
  // N12 (issue 154, item 4): fechar a janela pelo X, pela tecla Esc ou clicando fora vale como "Cancelar": quem
  // perguntou (confirmarJanela, ou abrirJanela com { aoFechar }) recebe a resposta e nada fica esperando para sempre.
  // Vale também nas páginas que já têm o #modal delas (o fechar é delas; o "Cancelar" é avisado daqui).
  var aoFecharJanela = null, janelaVigiada = false;
  // N13 (S196, issue 169): janela com algo digitado não fecha por engano. Clicar fora não fecha; o X (ou o Esc)
  // pede um 2º toque ("Descartar o que foi digitado?"). "Mexida" = a pessoa digitou ou trocou algum campo
  // da janela desde que ela abriu (o que o programa preenche sozinho não conta). Vale em toda página que usa
  // a janela do núcleo, inclusive as que têm o #modal delas (o fechar é delas; a trava é daqui).
  var janelaMexida = false, descarteArmado = 0;
  function cancelarJanela() { var f = aoFecharJanela; aoFecharJanela = null; if (f) { try { f(); } catch (e) {} } }
  function avisoDescartar(porFora) {
    var b = document.getElementById('mBody'); if (!b) return;
    var a = document.getElementById('tfnDescartar');
    if (!a) { a = document.createElement('div'); a.id = 'tfnDescartar'; a.className = 'tfn-descartar'; a.setAttribute('role', 'alert'); b.insertBefore(a, b.firstChild); }
    a.textContent = porFora
      ? 'Há coisa digitada nesta janela: clicar fora não fecha. Use os botões de baixo, ou o X para descartar.'
      : 'Descartar o que foi digitado? Toque no X de novo (ou aperte Esc) para descartar.';
    try { a.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  // devolve true quando a janela pode fechar agora (e já avisou quem perguntou: "Cancelar")
  function podeFecharPorFora(porFora) {
    var m = document.getElementById('modal');
    if (!m || m.hidden) return true;
    if (janelaMexida) {
      if (porFora) { avisoDescartar(true); return false; }
      if (Date.now() - descarteArmado > 6000) { descarteArmado = Date.now(); avisoDescartar(false); return false; }
    }
    cancelarJanela();
    return true;
  }
  function vigiarJanela() {
    if (janelaVigiada) return; janelaVigiada = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var noX = !!t.closest('#mX'), fora = t.id === 'mScrim';
      if (!noX && !fora) return;
      if (!podeFecharPorFora(fora)) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    document.addEventListener('keydown', function (e) {
      var m = document.getElementById('modal');
      if (e.key !== 'Escape' || !m || m.hidden || document.documentElement.hasAttribute('data-tf-trava')) return;
      e.stopPropagation(); e.preventDefault();
      if (podeFecharPorFora(false)) fecharJanela();           // N13: o Esc fecha a janela em todas as páginas (antes, nas que têm o #modal delas, só respondia "Cancelar")
    }, true);
    var mexeu = function (e) {
      var b = document.getElementById('mBody'), m = document.getElementById('modal');
      if (!b || !m || m.hidden || !e.target || !b.contains(e.target)) return;
      if (e.isTrusted === false) return;
      janelaMexida = true;
    };
    document.addEventListener('input', mexeu, true);
    document.addEventListener('change', mexeu, true);
  }
  function garantirJanela() {
    vigiarJanela();
    if (document.getElementById('modal')) return;
    var sc = document.createElement('div');
    sc.className = 'mScrim tfn-scrim'; sc.id = 'mScrim'; sc.hidden = true;
    var m = document.createElement('div');
    m.className = 'modal tfn-janela'; m.id = 'modal'; m.hidden = true;
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'mTit');
    m.innerHTML = '<div class="m-h"><h3 id="mTit"></h3><button class="x" id="mX" type="button" aria-label="Fechar">&times;</button></div>'
      + '<div class="m-b" id="mBody"></div><div class="m-f" id="mFoot"></div>';
    document.body.appendChild(sc); document.body.appendChild(m);
    sc.addEventListener('click', fecharJanela);
    document.getElementById('mX').addEventListener('click', fecharJanela);
  }
  function abrirJanela(titulo, corpoHtml, botoes, opcoes) {
    garantirJanela();
    cancelarJanela();                                   // a janela anterior que ainda esperava resposta: "Cancelar"
    aoFecharJanela = (opcoes && typeof opcoes.aoFechar === 'function') ? opcoes.aoFechar : null;
    janelaMexida = false; descarteArmado = 0;
    var mm = document.getElementById('modal');
    if (!mm || mm.hidden) focoAntes = document.activeElement;   // janela trocada por outra: o foco volta para quem abriu a 1ª
    document.getElementById('mTit').textContent = titulo;
    document.getElementById('mBody').innerHTML = corpoHtml;
    delete document.getElementById('mBody').dataset.ausOk;
    var f = document.getElementById('mFoot'); f.innerHTML = '';
    (botoes || []).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn' + (b.pri ? ' pri' : '') + (b.cls ? ' ' + b.cls : '');
      el.textContent = b.label;
      el.addEventListener('click', function () { semDuploEnvio(el, function () { return b.onClick(el); }); });
      f.appendChild(el);
    });
    document.getElementById('mScrim').hidden = false;
    document.getElementById('modal').hidden = false;
    requestAnimationFrame(function () {
      var alvo = document.querySelector('#mBody input,#mBody select,#mBody textarea') || document.querySelector('#mFoot .btn');
      if (alvo) alvo.focus();
    });
  }
  function fecharJanela() {
    aoFecharJanela = null;                              // fechou por um botão: quem perguntou já teve a resposta
    janelaMexida = false; descarteArmado = 0;
    var sc = document.getElementById('mScrim'), m = document.getElementById('modal');
    if (sc) sc.hidden = true;
    if (m) { m.hidden = true; m.classList.remove('largo'); }
    if (focoAntes && document.body.contains(focoAntes)) { try { focoAntes.focus(); } catch (e) {} }
    focoAntes = null;
  }
  // N13 (S196, issues 126, 144, 108, 122): a janela pode trazer um campo. confirmarJanela(t, html, sim, perigo, campo):
  //   campo = o id do campo (string) ou { campo: 'id', obrigatorio: 'mensagem se vazio', minimo: 5 (letras),
  //           igual: 'CONFIRMO' (tem de digitar isso; maiúscula/acento não importam), validar: function (texto) → mensagem ou '' }.
  //   Com campo, o "sim" devolve { texto } (o que foi digitado, sem espaços nas pontas); o resto devolve false.
  //   Falta ou erro: a janela NÃO fecha e mostra o motivo em vermelho dentro dela.
  function normTxt(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  function confirmarJanela(titulo, corpoHtml, rotuloSim, perigo, campo) {
    var op = typeof campo === 'string' ? { campo: campo } : (campo || null);
    return new Promise(function (ok) {
      abrirJanela(titulo, corpoHtml, [
        { label: 'Cancelar', onClick: function () { fecharJanela(); ok(false); } },
        { label: rotuloSim || 'Confirmar', pri: !perigo, cls: perigo ? 'perigo' : '', onClick: function () {
          if (!op) { fecharJanela(); ok(true); return; }
          var el = op.campo ? document.getElementById(op.campo) : null;
          var texto = el ? String(el.value || '').trim() : '';
          var erro = '';
          if (op.obrigatorio && !texto) erro = op.obrigatorio === true ? 'Preencha o campo para continuar.' : op.obrigatorio;
          else if (op.minimo && texto.replace(/\s/g, '').length < op.minimo) erro = 'Escreva pelo menos ' + op.minimo + ' letras.';
          else if (op.igual && normTxt(texto) !== normTxt(op.igual)) erro = 'Para continuar, digite ' + op.igual + '.';
          else if (typeof op.validar === 'function') erro = op.validar(texto) || '';
          if (erro) { erroNaJanela(erro, el); return; }
          fecharJanela(); ok({ texto: texto });
        } }
      ], { aoFechar: function () { ok(false); } });
    });
  }
  // N13: o motivo de não poder seguir, em vermelho, dentro da janela (sem fechar)
  function erroNaJanela(msg, campoEl) {
    var b = document.getElementById('mBody'); if (!b) return;
    var a = document.getElementById('tfnErroJanela');
    if (!a) { a = document.createElement('div'); a.id = 'tfnErroJanela'; a.className = 'tfn-erro-janela'; a.setAttribute('role', 'alert'); b.appendChild(a); }
    a.textContent = msg;
    try { (campoEl || a).focus(); a.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  /* ── conexão no jeito do Manager (req/get/rpc) ───────────────────────────
     Diferenças do `api` do N1, que continua igual: aqui o `body` já vai em
     texto (como no Manager), erro de regra do banco vem com `negocio:true`,
     leitura sem resposta tenta de novo (2 vezes) e ESCRITA NÃO SE REPETE
     SOZINHA, a não ser que leve `p_client_uid`/`p_uid` (idempotente). */
  function sinalDe(escrita) {
    try { if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(escrita ? 45000 : 30000); } catch (e) {}
    return undefined;
  }
  function ehTimeout(e) {
    return !!e && (e.name === 'TimeoutError' || e.name === 'AbortError' || /timed out|timeout|aborted/i.test(String(e.message || '')));
  }
  // N9 (issue 10): o armazenamento de fotos responde ao acesso vencido com HTTP 400 e
  // '"exp" claim timestamp check failed' (sem as palavras "jwt" ou "token"): também é acesso vencido.
  var RX_ACESSO_VENCIDO = /jwt|token.*expired|not authenticated|"?exp"? claim|claim timestamp/i;
  function tokenVencido(e) {
    return e && (e.status === 401 || RX_ACESSO_VENCIDO.test(e.message || ''));
  }
  /** N9 (issue 10): quanto falta para o acesso vencer (ms), lendo o "exp" do próprio token; null se não der para ler. */
  function restaDoToken(t) {
    try { var p = String(t || '').split('.')[1]; var exp = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).exp;
      return typeof exp === 'number' ? exp * 1000 - Date.now() : null; } catch (e) { return null; }
  }
  /** N9 (issue 10): antes de enviar a fila, renova o acesso que venceu ou vence nos próximos 2 minutos.
   *  Sem sinal ou sem como renovar, segue: o envio renova sozinho se o servidor recusar. */
  function garantirAcesso() {
    var s = sessao();
    if (!s.token || !s.refresh) return Promise.resolve(false);
    var resta = restaDoToken(s.token);
    if (resta === null || resta > 120000) return Promise.resolve(false);
    return renovar().catch(function () { return false; });
  }
  function sessaoExpirou() {
    if (typeof api_.aoExpirar === 'function') { try { api_.aoExpirar(); } catch (e) {} return; }
    limparSessao();
    if (NO_SERVIDOR) {
      ssSet('tf_recado', 'Sua sessão expirou. Entre de novo.');
      location.href = RAIZ + (conf.app ? '?para=' + encodeURIComponent(conf.app) : '');
    }
  }
  function autorFora(email) {
    var m = sessoesEmp()[String(email || '').toLowerCase()] || {};
    return Object.assign(new Error('Feito por ' + (m.nome || email) + ': espera essa pessoa entrar neste celular para enviar.'), { autorFora: true });
  }
  function req(caminho, opts, tentativas) {
    opts = opts || {}; if (tentativas == null) tentativas = 2;
    var escrita = (opts.method || 'GET').toUpperCase() !== 'GET';
    var jaRenovou = false, ultimo;
    var c = cfgDoBanco();
    var autor = opts.autor || null;                 // N7 · A7: envio de quem fez, no celular da empresa
    function uma(i) {
      var s = autor ? (sessaoDeEmp(autor) || {}) : sessao();
      return fetch(c.url + caminho, Object.assign({}, opts, {
        signal: sinalDe(escrita),
        headers: Object.assign({ apikey: c.anon, 'Content-Type': 'application/json' },
          s.token ? { Authorization: 'Bearer ' + s.token } : {}, opts.headers || {})
      })).then(function (r) {
        return r.text().then(function (txt) {
          if (txt.trim().charAt(0) === '<') { anotarErro('servidor devolveu HTML em ' + caminho); throw Object.assign(new Error('O servidor respondeu de um jeito inesperado. Tente de novo; se continuar, avise o administrador.'), { estranho: true }); }   // N13 (issue 155): o detalhe vai só para o relato
          var corpo = null;
          if (txt) { try { corpo = JSON.parse(txt); } catch (e) { anotarErro('resposta inválida: ' + txt.slice(0, 80)); throw Object.assign(new Error('O servidor respondeu de um jeito inesperado. Tente de novo; se continuar, avise o administrador.'), { estranho: true }); } }
          if (!r.ok) {
            var msg = (corpo && (corpo.message || corpo.error_description || corpo.error || corpo.hint)) || ('O servidor deu erro (código ' + r.status + '). Tente de novo.');
            if (/^permission denied/i.test(msg)) { anotarErro(msg); msg = 'Você não tem permissão para isso. Se precisar, avise o administrador.'; }   // N13 (issue 155)
            var err = new Error(msg); err.negocio = (r.status >= 400 && r.status < 500); err.status = r.status;
            if (tokenVencido(err) && autor && autor !== String(sessao().email || '').toLowerCase()) {
              // a sessão de quem fez venceu: renova a cópia dela; sem jeito, o envio espera a pessoa entrar
              if (!jaRenovou && s.refresh) { jaRenovou = true; return renovarEmpEstado(autor).then(function (e) {
                if (e === 'ok') return uma(i); if (e === 'sem_rede') { jaRenovou = false; throw erroSemSinal(); } throw autorFora(autor); }); }
              throw autorFora(autor);
            }
            if (tokenVencido(err)) {
              if (!jaRenovou && s.refresh) {
                jaRenovou = true;
                return renovarEstado().then(function (e) {
                  if (e === 'ok') return uma(i);
                  // N12 (issue 153): sem sinal na hora de renovar NÃO derruba o login: o envio espera o sinal
                  if (e === 'sem_rede') { jaRenovou = false; throw erroSemSinal(); }
                  sessaoExpirou();
                  throw Object.assign(new Error('Sua sessão expirou. Entre de novo — nada se perdeu.'), { negocio: true, sessaoMorta: true });
                });
              }
              sessaoExpirou();
              throw Object.assign(new Error('Sua sessão expirou. Entre de novo — nada se perdeu.'), { negocio: true, sessaoMorta: true });
            }
            throw err;
          }
          return corpo;
        });
      }).catch(function (e) {
        ultimo = e;
        if (ehTimeout(e)) {
          ultimo = new Error('O servidor não respondeu em ' + (escrita ? '45' : '30') + 's'
            + (escrita ? ' — a operação pode NÃO ter sido gravada.' : '.'));
          ultimo.rede = true;
        }
        var transitorio = ehTimeout(e) || !!e.semSinal || (!e.negocio && (
          /Failed to fetch|NetworkError|Load failed/i.test(e.message) ||
          !!e.estranho || /^O servidor deu erro \(código 5\d\d\)/.test(e.message)));
        if (transitorio) ultimo.rede = true;
        if (!transitorio || i === tentativas || (escrita && !opts.idempotente)) {
          if (transitorio && typeof api_.aoFalharRede === 'function') { try { api_.aoFalharRede(ultimo); } catch (x) {} }
          throw ultimo;
        }
        return new Promise(function (ok) { setTimeout(ok, 600 * (i + 1)); }).then(function () { return uma(i + 1); });
      });
    }
    return uma(0);
  }
  function getM(q) { return req('/rest/v1/' + q); }
  function rpcM(f, p) {
    return req('/rest/v1/rpc/' + f, { method: 'POST', body: JSON.stringify(p || {}),
      idempotente: !!(p && (p.p_client_uid || p.p_uid || p.p_id_celular)) });
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * N2 · FILA DE ENVIOS (desenho: processos/taphub-n1d-fila-desenho.md)
   * ----------------------------------------------------------------------------
   * MESMA chave do Field (`tff_fila`) e MESMO banco de fotos (`tapflow_field`,
   * store `fotos`): nada guardado no aparelho se perde na troca. O núcleo envia
   * só as entradas v2 (que se descrevem sozinhas: fotos + uma função); as
   * entradas antigas do Field (`levantamento`, `extras`, `execucao`, `anexo`)
   * continuam com o código do Field. Garantias:
   *  · a ordem é a de entrada, e SUBSTITUIR mantém a posição;
   *  · as fotos sobem antes da função; o 409 do Storage conta como enviado;
   *  · só sai da fila com a função respondida, ou por ação da pessoa (descartar);
   *  · recusa do servidor PARA a entrada (fica, com o motivo; as fotos não se
 *    perdem) e as seguintes do mesmo grupo, até `retomar` ou `descartar`;
   *  · sem rede, para na primeira falha (a ordem fica);
   *  · duas abas não enviam ao mesmo tempo (navigator.locks, quando existe).
   * ════════════════════════════════════════════════════════════════════════ */
  var K_FILA = 'tff_fila';
  function filaLer() { var f = jget(K_FILA); return Array.isArray(f) ? f : []; }
  /* N11 (S171, issue 35): gravar a fila pode falhar por falta de espaço no aparelho (o localStorage é de uns 5 MB,
   * dividido entre os módulos). Antes o erro era ignorado e o envio sumia calado. Agora: quem guarda dados no
   * aparelho (o TapDoc, por exemplo) registra em `fila.aoFaltarEspaco` como liberar espaço; a fila chama, tenta de
   * novo e devolve false se ainda não couber. O formato das entradas NÃO mudou (fila antiga continua sendo enviada). */
  var liberadores = [];
  function tentarGravar(k, txt) { try { localStorage.setItem(k, txt); return true; } catch (e) { return false; } }
  function filaGravar(f) {
    var txt = JSON.stringify(f);
    if (tentarGravar(K_FILA, txt)) return true;
    liberadores.slice().forEach(function (fn) { try { fn(); } catch (e) {} });
    return tentarGravar(K_FILA, txt);
  }
  var MSG_SEM_ESPACO = 'O aparelho está sem espaço para o app guardar o que foi gravado agora: NÃO foi guardado para envio. '
    + 'Nada do que já estava na fila se perdeu. Com sinal, envie o que está na fila (isso libera espaço) e grave de novo; se continuar, avise o escritório.';
  /** troca UMA entrada pela assinatura, sem mexer na posição das outras */
  function filaTrocar(assinatura, fn) {
    var f = filaLer(), i = -1;
    for (var k = 0; k < f.length; k++) if (f[k] && f[k].assinatura === assinatura) { i = k; break; }
    if (i < 0) return null;
    var novo = fn(f[i]);
    if (novo === null) f.splice(i, 1); else f[i] = novo;
    filaGravar(f);
    return novo;
  }

  // N5 (S131): o iPhone fecha a ligação com o IndexedDB quando o app vai para segundo plano (câmera do sistema,
  // tela bloqueada) e a próxima transação dava "The database connection is closing". Agora a ligação fechada é
  // esquecida (onclose/onversionchange) e, se a transação falhar mesmo assim, reabre e tenta uma vez de novo.
  var IDB = {
    _p: null,
    abrir: function () {
      if (this._p) return this._p;
      var self = this;
      this._p = new Promise(function (ok, err) {
        var r = indexedDB.open('tapflow_field', 1);
        r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('fotos')) r.result.createObjectStore('fotos'); };
        r.onsuccess = function () {
          var db = r.result;
          db.onclose = function () { if (self._db === db) { self._p = null; self._db = null; } };
          db.onversionchange = function () { try { db.close(); } catch (e) {} if (self._db === db) { self._p = null; self._db = null; } };
          self._db = db; ok(db);
        };
        r.onerror = function () { self._p = null; err(r.error || new Error('IndexedDB indisponível')); };
      });
      return this._p;
    },
    _uma: function (modo, fn) {
      return this.abrir().then(function (db) {
        return new Promise(function (ok, err) {
          var t = db.transaction('fotos', modo);
          var p = fn(t.objectStore('fotos'));
          t.oncomplete = function () { ok(p && p.result !== undefined ? p.result : undefined); };
          t.onerror = function () { err(t.error); };
          t.onabort = function () { err(t.error || new Error('IndexedDB: transação abortada')); };
        });
      });
    },
    _tx: function (modo, fn) {
      var self = this;
      return this._uma(modo, fn).catch(function (e) {
        // ligação fechada pelo sistema: esquece, reabre e tenta uma vez de novo
        if (e && (e.name === 'InvalidStateError' || /clos/i.test(String(e.message || '')))) {
          try { if (self._db) self._db.close(); } catch (x) {}
          self._p = null; self._db = null;
          return self._uma(modo, fn);
        }
        throw e;
      });
    },
    put: function (k, v) { return this._tx('readwrite', function (st) { return st.put(v, k); }); },
    get: function (k) { return this._tx('readonly', function (st) { return st.get(k); }); },
    del: function (k) { return this._tx('readwrite', function (st) { return st.delete(k); }); }
  };

  function uidNovo() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function paraBlob(v) {
    if (!v) return Promise.resolve(null);
    if (typeof Blob !== 'undefined' && v instanceof Blob) return Promise.resolve(v);
    if (typeof v === 'string') return fetch(v).then(function (r) { return r.blob(); });
    return Promise.resolve(null);
  }

  /** Reduz a foto no celular. Sem opções: 1600 px e JPEG 0,72 (o padrão do Field). */
  function reduzirFoto(arquivo, o) {
    o = o || {};
    var lado = o.lado || 1600, q = o.qualidade || 0.72;
    return new Promise(function (ok, err) {
      var fr = new FileReader();
      fr.onerror = function () { err(new Error('Não consegui ler a imagem.')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { err(new Error('Arquivo não parece ser uma imagem.')); };
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > lado || h > lado) { var r = Math.min(lado / w, lado / h); w = Math.round(w * r); h = Math.round(h * r); }
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          if (c.toBlob) c.toBlob(function (b) { b ? ok(b) : err(new Error('Não consegui reduzir a foto.')); }, 'image/jpeg', q);
          else paraBlob(c.toDataURL('image/jpeg', q)).then(ok, err);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(arquivo);
    });
  }

  /** Envio direto ao Storage. 409 / "already exists" = 'ja_existia' (é o reenvio). */
  function storageEnviar(bucket, caminho, blob, _jaRenovou, autor) {
    var c = cfgDoBanco(), s = autor ? (sessaoDeEmp(autor) || {}) : sessao();
    var url = c.url + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + String(caminho).split('/').map(encodeURIComponent).join('/');
    return fetch(url, { method: 'POST', body: blob, signal: sinalDe(true),
      headers: Object.assign({ apikey: c.anon, 'Content-Type': (blob && blob.type) || 'image/jpeg' },
        s.token ? { Authorization: 'Bearer ' + s.token } : {}) })
      .then(function (r) {
        if (r.ok) return 'ok';
        return r.json().catch(function () { return {}; }).then(function (j) {
          var m = String(j.message || j.error || j.statusCode || '');
          if (r.status === 409 || /exist|duplicate/i.test(m)) return 'ja_existia';
          var vencido = r.status === 401 || r.status === 403 || /token/i.test(m) || RX_ACESSO_VENCIDO.test(m);   // N9 (issue 10)
          if (vencido && autor) {
            if (_jaRenovou || !s.refresh) throw autorFora(autor);
            return renovarEmpEstado(autor).then(function (e) { if (e === 'ok') return storageEnviar(bucket, caminho, blob, true, autor); if (e === 'sem_rede') throw erroSemSinal(); throw autorFora(autor); });
          }
          if (vencido && !_jaRenovou && s.refresh) {
            return renovarEstado().then(function (e) {
              if (e === 'ok') return storageEnviar(bucket, caminho, blob, true);
              if (e === 'sem_rede') throw erroSemSinal();   // N12 (issue 153)
              throw Object.assign(new Error('Sua sessão expirou. Entre de novo — nada se perdeu.'), { sessaoMorta: true, status: 401 });
            });
          }
          if (vencido && RX_ACESSO_VENCIDO.test(m)) {
            // N9 (issue 10): o acesso continuou recusado mesmo renovado (ou não havia como renovar): mensagem simples
            throw Object.assign(new Error('O servidor recusou o acesso deste aparelho. Toque em "Tentar de novo"; se repetir, saia e entre de novo — nada se perdeu.'),
              { status: r.status, negocio: true });
          }
          throw Object.assign(new Error('O armazenamento recusou a foto (HTTP ' + r.status + ')' + (m ? ': ' + m : '') + '.'),
            { status: r.status, negocio: r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429, rede: r.status >= 500 });
        });
      }, function (e) {
        throw Object.assign(new Error(ehTimeout(e) ? 'O armazenamento não respondeu.' : 'Sem sinal.'), { rede: true });
      });
  }

  /** N12 (issue 142): abrir, baixar, enviar ou apagar um arquivo do armazenamento (Storage) com o acesso em dia.
   *  `url` é o endereço completo do objeto (…/storage/v1/object/…). O acesso vence a cada hora e o armazenamento
   *  responde ao vencido com HTTP 400 ('"exp" claim timestamp check failed'), não só 401/403: antes os módulos só
   *  renovavam no 401/403 e a página aberta há mais de 1 hora dizia "O arquivo não está no armazenamento (HTTP 400)".
   *  Agora: renova antes se o acesso vence em 2 minutos; se a resposta for de acesso vencido, renova e tenta UMA vez
   *  de novo. Devolve a resposta (Response) para quem chamou ler; se a sessão acabou de verdade, recusa com
   *  "Sua sessão venceu: recarregue a página." e, sem sinal, com "Sem sinal. Tente de novo com internet.". */
  var MSG_SESSAO_VENCEU = 'Sua sessão venceu: recarregue a página.';
  function storagePedir(url, opts, _jaRenovou) {
    opts = opts || {};
    var c = cfgDoBanco();
    var antes = _jaRenovou ? Promise.resolve() : garantirAcesso();
    return antes.then(function () {
      var s = sessao();
      return fetch(url, Object.assign({}, opts, {
        headers: Object.assign({ apikey: c.anon }, s.token ? { Authorization: 'Bearer ' + s.token } : {}, opts.headers || {})
      })).then(null, function (e) {
        throw Object.assign(new Error(ehTimeout(e) ? 'O armazenamento não respondeu. Tente de novo.' : MSG_SEM_SINAL), { rede: true, semSinal: true });
      });
    }).then(function (r) {
      if (r.ok || (r.status !== 400 && r.status !== 401 && r.status !== 403)) return r;
      return r.clone().text().catch(function () { return ''; }).then(function (txt) {
        var vencido = r.status === 401 || RX_ACESSO_VENCIDO.test(txt);
        var talvez = vencido || r.status === 403;          // o 403 sem texto de acesso vencido: renova e tenta uma vez (como antes)
        if (!talvez) return r;
        if (_jaRenovou) {
          if (vencido) throw Object.assign(new Error(MSG_SESSAO_VENCEU), { status: r.status, sessaoVencida: true });
          return r;
        }
        if (!sessao().refresh) {
          if (vencido) throw Object.assign(new Error(MSG_SESSAO_VENCEU), { status: r.status, sessaoVencida: true });
          return r;
        }
        return renovarEstado().then(function (e) {
          if (e === 'ok') return storagePedir(url, opts, true);
          if (e === 'sem_rede') throw erroSemSinal();
          if (vencido) throw Object.assign(new Error(MSG_SESSAO_VENCEU), { status: r.status, sessaoVencida: true });
          return r;
        });
      });
    });
  }

  var ouvintes = [];
  function avisar(ev) {
    ouvintes.slice().forEach(function (fn) { try { fn(ev); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('tf-fila', { detail: ev })); } catch (e) {}
  }

  function filaAdicionar(e) {
    if (!e || !e.tipo || !e.id) throw new Error('Entrada da fila sem tipo ou sem id.');
    if (!e.rpc && !(e.fotos && e.fotos.length) && !e.envio) throw new Error('Entrada da fila sem função e sem fotos.');
    var ent = {
      v: 2, assinatura: e.tipo + '|' + e.id, tipo: e.tipo, id: e.id, grupo: e.grupo || null,
      rotulo: e.rotulo || e.tipo, fotos: (e.fotos || []).map(function (x) {
        return { chave: x.chave, bucket: x.bucket, caminho: x.caminho, tipo: x.tipo || 'image/jpeg', enviada: false };
      }),
      rpc: e.rpc ? { funcao: e.rpc.funcao, payload: e.rpc.payload || {} } : null,
      // N14 (S202, issues 106, 107 e 177): `envio` = o nome do tratador que a PÁGINA registra (`fila.tratador`); ele
      // recebe a entrada (com `dados`) e faz o envio. Página sem o tratador pula a entrada (fica na fila, sem contar
      // tentativa). `guardados` = chaves do banco de fotos do aparelho que são desta entrada: saem com ela.
      envio: e.envio || null, dados: e.dados || null,
      guardados: (e.guardados || []).filter(Boolean).map(String),
      tentativas: 0, em: new Date().toISOString(), parado: false,
      por: String(sessao().email || '').toLowerCase() || null      // N7 · A7: quem fez (o envio sai com a sessão dela)
    };
    var f = filaLer(), achou = false;
    for (var k = 0; k < f.length; k++) {
      if (f[k] && f[k].assinatura === ent.assinatura) {
        // substitui NO MESMO LUGAR; fotos da versão anterior que saíram da lista são apagadas
        var velhas = (f[k].fotos || []).map(function (x) { return x.chave; }).concat(f[k].guardados || []);
        var novas = ent.fotos.map(function (x) { return x.chave; }).concat(ent.guardados);
        velhas.forEach(function (ch) { if (ch && novas.indexOf(ch) < 0) IDB.del(ch).catch(function () {}); });
        ent.parado = !!f[k].parado;
        f[k] = ent; achou = true; break;
      }
    }
    if (!achou) f.push(ent);
    if (!filaGravar(f)) {
      // N11 (issue 35): não coube — avisa na hora, em vermelho, e devolve null (quem chamou não mostra "salvo")
      avisar({ assinatura: ent.assinatura, tipo: ent.tipo, situacao: 'sem_espaco', erro: MSG_SEM_ESPACO });
      try { toast(MSG_SEM_ESPACO, 'err'); } catch (e) {}
      return null;
    }
    avisar({ assinatura: ent.assinatura, tipo: ent.tipo, situacao: 'na_fila' });
    setTimeout(function () { filaEnviar().catch(function () {}); }, 0);
    return ent.assinatura;
  }

  var tratadores = {};   // N14: nome → função(entrada, autor) que envia (registrada pela página)
  var enviando = false;
  var FILA_ERROS_SERVIDOR = 5;   // N12 (issue 154): erros internos seguidos do servidor até a entrada ficar "parada, com o motivo"
  function filaEnviar() {
    var trabalho = function () {
      if (enviando) return Promise.resolve();
      // N7: no celular da empresa a fila também anda na troca de pessoa (cada envio vai com a sessão de quem fez)
      if (conf.demo || (!sessao().token && !(empresa() && Object.keys(sessoesEmp()).length))) return Promise.resolve();
      if (navigator.onLine === false) return Promise.resolve();   // sem sinal: nem tenta (volta no evento 'online')
      enviando = true;
      var lista = filaLer().filter(function (x) { return x && x.v === 2; }).map(function (x) { return x.assinatura; });
      var bloqueados = {};
      var i = 0;
      function proxima() {
        if (i >= lista.length) return Promise.resolve();
        var assin = lista[i++];
        var e = filaLer().filter(function (x) { return x && x.assinatura === assin; })[0];
        if (!e) return proxima();
        if (e.grupo && bloqueados[e.grupo]) return proxima();
        if (e.parado) { if (e.grupo) bloqueados[e.grupo] = true; return proxima(); }
        return enviarUma(e).then(function (resp) {
          var fotos = (e.fotos || []).map(function (x) { return x.chave; }).concat(e.guardados || []);
          filaTrocar(assin, function () { return null; });
          fotos.forEach(function (ch) { if (ch) IDB.del(ch).catch(function () {}); });
          avisar({ assinatura: assin, tipo: e.tipo, situacao: 'enviado', resposta: resp });
          return proxima();
        }, function (err) {
          // N14: esta página não tem o tratador do envio (ex.: o envio do TapField com o TapRH aberto): pula, sem mexer
          if (err && err.semTratador) { if (e.grupo) bloqueados[e.grupo] = true; return proxima(); }
          if (err && err.autorFora) {
            // N7: a sessão de quem fez venceu (ou a pessoa saiu de vez): o envio espera, sem travar os dos outros
            if (e.grupo) bloqueados[e.grupo] = true;
            filaTrocar(assin, function (y) { y.motivo = err.message; return y; });
            avisar({ assinatura: assin, tipo: e.tipo, situacao: 'esperando', erro: err.message });
            return proxima();
          }
          if (err && err.sessaoMorta) throw err;
          if (err && err.negocio && !err.rede) {
            // o servidor RECUSOU: reenviar sozinho não resolve. A entrada NÃO é
            // apagada (as fotos dela podem ser a única cópia): fica parada,
            // marcada como recusada e com o motivo, até a pessoa corrigir e
            // retomar, ou descartar. As seguintes do mesmo grupo param também.
            filaTrocar(assin, function (y) { y.parado = true; y.recusado = true; y.motivo = 'Recusado pelo servidor: ' + err.message; return y; });
            avisar({ assinatura: assin, tipo: e.tipo, situacao: 'recusado', erro: err.message });
            if (e.grupo) {
              bloqueados[e.grupo] = true;
              filaLer().forEach(function (x) {
                if (x && x.v === 2 && x.grupo === e.grupo && !x.parado) {
                  filaTrocar(x.assinatura, function (y) { y.parado = true; y.motivo = 'Parado: ' + (e.rotulo || 'um envio anterior') + ' foi recusado (' + err.message + ').'; return y; });
                  avisar({ assinatura: x.assinatura, tipo: x.tipo, situacao: 'parado', erro: err.message });
                }
              });
            }
            return proxima();
          }
          if (err && err.status >= 500 && !err.semSinal) {
            // N12 (issue 154, item 1): o servidor respondeu com ERRO INTERNO (não é falta de sinal nem recusa de regra).
            // Antes isso parava a fila inteira e era tentado de novo para sempre, segurando os envios de todos os
            // assuntos. Agora só o grupo dele espera; depois de FILA_ERROS_SERVIDOR seguidas, ele fica "parado, com
            // o motivo" (como o recusado: nada se perde) e a fila segue com os outros.
            var n = 0;
            filaTrocar(assin, function (y) {
              y.tentativas = (y.tentativas || 0) + 1; y.errosServidor = (y.errosServidor || 0) + 1; n = y.errosServidor;
              if (n >= FILA_ERROS_SERVIDOR) {
                y.parado = true; y.erroServidor = true;
                y.motivo = 'Parado: o servidor deu erro ' + n + ' vezes seguidas (' + err.message + '). Toque em "Tentar de novo"; se repetir, avise o escritório.';
              }
              return y;
            });
            if (e.grupo) bloqueados[e.grupo] = true;
            avisar({ assinatura: assin, tipo: e.tipo, situacao: n >= FILA_ERROS_SERVIDOR ? 'parado' : 'erro_servidor', erro: err.message });
            return proxima();
          }
          filaTrocar(assin, function (y) { y.tentativas = (y.tentativas || 0) + 1; return y; });
          throw err;   // sem rede: para aqui, a ordem fica
        });
      }
      return garantirAcesso().then(proxima).catch(function () {}).then(function () { enviando = false; limparSoEnvio(); contarFila(); },   // N9 (issue 10): renova antes
                                                  function () { enviando = false; });
    };
    try {
      if (navigator.locks && navigator.locks.request) {
        return navigator.locks.request('tf-fila-envio', { ifAvailable: true }, function (lock) {
          return lock ? trabalho() : null;
        });
      }
    } catch (e) {}
    return trabalho();
  }
  /** N7 · A7: no celular da empresa, o envio de outra pessoa vai com a sessão guardada DELA. */
  function autorDoEnvio(e) {
    if (!empresa() || !e || !e.por) return null;
    var atual = String(sessao().email || '').toLowerCase();
    return e.por === atual ? null : e.por;
  }
  /** Quem saiu de vez com envio na fila: a sessão guardada só para enviar some quando a fila dela esvazia. */
  function limparSoEnvio() {
    if (!empresa()) return;
    var m = sessoesEmp(), mudou = false;
    Object.keys(m).forEach(function (k) { if (m[k] && m[k]._soEnvio && filaDe(k) === 0) { delete m[k]; mudou = true; } });
    if (mudou) gravarSessoesEmp(m);
  }
  function enviarUma(e) {
    var autor = autorDoEnvio(e);
    if (autor && !(sessaoDeEmp(autor) || {}).token) return Promise.reject(autorFora(autor));
    var p = Promise.resolve();
    (e.fotos || []).forEach(function (ft, idx) {
      p = p.then(function () {
        if (ft.enviada) return;
        return IDB.get(ft.chave).then(paraBlob).then(function (blob) {
          if (!blob) throw Object.assign(new Error('A foto não está mais no aparelho. Tire de novo.'), { negocio: true });
          return storageEnviar(ft.bucket, ft.caminho, blob, false, autor);
        }).then(function () {
          filaTrocar(e.assinatura, function (y) { if (y.fotos && y.fotos[idx]) y.fotos[idx].enviada = true; return y; });
        });
      });
    });
    return p.then(function () {
      if (e.envio) {
        var tr = tratadores[e.envio];
        if (!tr) throw { semTratador: true };
        return tr(JSON.parse(JSON.stringify(e)), autor);
      }
      if (!e.rpc) return null;
      if (!autor) return rpcM(e.rpc.funcao, e.rpc.payload);
      var pl = e.rpc.payload || {};
      return req('/rest/v1/rpc/' + e.rpc.funcao, { method: 'POST', body: JSON.stringify(pl), autor: autor,
        idempotente: !!(pl.p_client_uid || pl.p_uid || pl.p_id_celular) });
    });
  }

  // outra aba (ou outro módulo aberto) mexeu na fila: a tela daqui fica sabendo
  window.addEventListener('storage', function (ev) {
    if (ev.key === K_FILA) avisar({ situacao: 'mudou' });
  });

  // tentativas automáticas: sinal de volta e a cada 90 s com algo na fila
  if (NO_SERVIDOR) {
    window.addEventListener('online', function () { filaEnviar().catch(function () {}); });
    setInterval(function () {
      if (filaLer().some(function (x) { return x && x.v === 2 && !x.parado; })) filaEnviar().catch(function () {});
    }, 90000);
  }

  /* ── despacho por tipo de tarefa (item 6 do TapDoc) ──────────────────────
     O Field consulta isto ANTES do despacho dele. O endereço é relativo a
     `field/`. Fica no núcleo para o Field saber para onde mandar sem ter o
     código do módulo carregado. */
  var ABRE_COM = { 'auto:inspecao': 'doc/' };
  function destinoDaTarefa(tipo) {
    var t = String(tipo || '');
    if (ABRE_COM[t]) return ABRE_COM[t];
    for (var k in ABRE_COM) if (Object.prototype.hasOwnProperty.call(ABRE_COM, k) && t.indexOf(k + ':') === 0) return ABRE_COM[k];
    return null;
  }


  /* ── N6 · "Relatar problema ou sugerir" (209; item #1 da lista; desenho R1–R10) ──
     O botão mora aqui e aparece em todos os módulos (pelo menu "Trocar de módulo"
     do modulos.js e pela aba Eu do Field). Vai junto, sem a pessoa digitar: o
     módulo, a tela, a versão do app, o aparelho e os últimos erros (R4). Até 2
     prints da galeria (R5), no bucket privado `relatos`. Cada um vê só os seus,
     com a resposta (R6). */
  var ERROS = [];
  var K_RELATO = 'tf_relato_rascunho';   // N12 (issue 154): o rascunho do relato neste aparelho
  function anotarErro(m) {
    try {
      var t = String(m || '').replace(/\s+/g, ' ').slice(0, 300);
      if (!t) return;
      ERROS.push({ m: t, em: new Date().toISOString() });
      if (ERROS.length > 10) ERROS.shift();
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    anotarErro((e && e.message ? e.message : 'erro') + (e && e.filename ? ' @ ' + String(e.filename).split('/').pop() + ':' + (e.lineno || '') : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason; anotarErro('promise: ' + (r && (r.message || r.statusText) ? (r.message || r.statusText) : String(r || '')));
  });
  function subDoToken(t) {
    try { var p = String(t || '').split('.')[1]; return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch (e) { return ''; }
  }
  function aparelhoTexto() {
    var ua = navigator.userAgent || '', so = /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'computador';
    var nav = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
    var app = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? ' · app instalado' : '';
    var v = (ua.match(/Android ([0-9.]+)/) || ua.match(/OS ([0-9_]+) like Mac/) || [])[1];
    return so + (v ? ' ' + String(v).replace(/_/g, '.') : '') + ' · ' + nav + app + ' · ' + (innerWidth || 0) + 'px';
  }
  function contextoRelato(o) {
    o = o || {};
    var versao = o.versao; if (!versao) { try { versao = (typeof APP_VERSION !== 'undefined' && APP_VERSION) ? String(APP_VERSION) : ''; } catch (e) { versao = ''; } }
    var modulo = o.modulo || document.documentElement.getAttribute('data-modulo') || (location.pathname.match(/\/([a-z]+)\/(?:index\.html)?$/) || [])[1] || 'inicio';
    var tit = String(document.title || '').split('·')[0].trim();
    return { modulo: modulo, tela: o.tela || document.title || '', versao: (tit && versao && tit.indexOf(versao) < 0 ? tit + ' ' : '') + versao + ' · núcleo ' + VERSAO,
             aparelho: aparelhoTexto(), erros: ERROS.slice(-10) };
  }
  function relatar(o) {
    o = o || {};
    var s = sessao();
    if (!s.token) { toast('Entre no sistema para relatar.', 'err'); return; }
    if ((tela && tela.relato) || (telaGuardada && telaGuardada.relato)) return;   // já está aberto
    fecharTela();
    var el = document.createElement('div');
    el.id = 'tfPin'; el.className = 'tf-pin tf-meus tf-relato';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Relatar problema ou sugerir');
    el.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:#0E1621;color:#E8EEF5;overflow:auto';
    el.innerHTML = '<div class="tf-pin-in tf-meus-in"><div class="tf-meus-topo"><div class="tf-tit">Relatar problema ou sugerir</div>' +
      '<button type="button" class="tf-link" id="tfRelFechar">Fechar</button></div>' +
      '<div class="tf-msg" id="tfPinMsg" role="status" aria-live="polite"></div>' +
      '<section class="tf-meus-sec"><h3>O que você quer contar?</h3>' +
      '<div class="tf-rel-tipos"><label class="tf-rel-tipo"><input type="radio" name="tfRelTipo" value="problema" checked> Problema</label>' +
      '<label class="tf-rel-tipo"><input type="radio" name="tfRelTipo" value="sugestao"> Sugestão</label></div>' +
      '<label class="tf-rel-rot" for="tfRelTxt">O que aconteceu (ou o que você sugere)</label>' +
      '<textarea id="tfRelTxt" rows="5" maxlength="4000" placeholder="Ex.: toquei em Bater o ponto e a tela ficou branca."></textarea>' +
      '<label class="tf-rel-rot" for="tfRelImg">Print da tela (opcional, até 2 imagens: escolha o arquivo ou cole com Ctrl+V)</label>' +
      '<input type="file" id="tfRelImg" accept="image/*" multiple>' +
      '<div id="tfRelImgs" class="tf-rel-mini"></div>' +
      '<p>Vai junto, sem você digitar: o módulo e a tela em que você está, a versão do app e o tipo de aparelho. ' +
      'Só você e quem cuida dos relatos (a caixa "Recebe relatos" em Pessoas e acessos) veem o que você mandar.</p>' +
      '<button type="button" class="tf-bt pri" id="tfRelEnviar">Enviar</button></section>' +
      '<section class="tf-meus-sec"><h3>Seus relatos</h3><div id="tfRelLista">Carregando…</div></section></div>';
    if (!document.getElementById('tf-rel-css')) {
      var st = document.createElement('style'); st.id = 'tf-rel-css';
      st.textContent = '.tf-rel-tipos{display:flex;gap:10px;margin:4px 0 10px}.tf-rel-tipo{flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #263445;border-radius:10px;font-size:15px;cursor:pointer}' +
        '.tf-rel-tipo:has(input:checked){border-color:#5AA9E6;background:#172231}.tf-rel-rot{display:block;font-size:13px;color:#8796A8;margin:10px 0 4px}' +
        '.tf-relato textarea{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:10px;border-radius:10px;border:1px solid #263445;background:#0E1621;color:#E8EEF5;resize:vertical}' +
        '.tf-relato input[type=file]{width:100%;color:#C9D4E0;font-size:13px}.tf-rel-it{border-top:1px solid #263445;padding:10px 0}.tf-rel-it:first-child{border-top:0;padding-top:0}' +
        '.tf-rel-it b{display:block;font-size:14px}.tf-rel-it small{display:block;color:#8796A8;font-size:12px;margin-top:2px}.tf-rel-it .tf-rel-resp{margin:6px 0 0;padding:8px 10px;background:#172231;border-radius:8px;font-size:14px;color:#E8EEF5}' +
        '.tf-rel-mini{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.tf-rel-mini span{position:relative;display:inline-block}.tf-rel-mini img{width:96px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #263445;display:block}' +
        '.tf-rel-mini button{position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:0;background:#C0392B;color:#fff;font-size:14px;line-height:24px;padding:0;cursor:pointer}.tf-rel-mini small{display:block;width:100%;color:#8796A8;font-size:12px}' +
        '.tf-rel-sit{display:inline-block;font-size:11px;padding:2px 7px;border-radius:999px;background:#263445;color:#C9D4E0;margin-left:6px}.tf-rel-sit.novo{background:#3B4A1F;color:#D9F0A3}.tf-rel-sit.respondido{background:#1F3B5A;color:#BFE0FF}';
      document.head.appendChild(st);
    }
    document.body.appendChild(el);
    document.documentElement.setAttribute('data-tf-trava', '1');
    // N12 (issue 154, item 3): o texto é guardado no aparelho enquanto se digita (rascunho) e volta ao abrir de novo;
    // fechar (botão ou Esc) com texto ou print pede um 2º toque; a trava do PIN só esconde esta tela (fecharTela).
    var minha = { el: el, teclado: null, foco: document.activeElement, guardar: true, relato: true };
    var kRel = K_RELATO + ':' + String(s.email || '').toLowerCase();   // por pessoa (celular da empresa é de várias)
    function rascunho() { return jget(kRel) || {}; }
    function guardarRascunho() {
      var t = el.querySelector('#tfRelTxt').value, tp = (el.querySelector('input[name=tfRelTipo]:checked') || {}).value || 'problema';
      if (t.trim()) lsSet(kRel, JSON.stringify({ texto: t, tipo: tp, em: new Date().toISOString() })); else lsDel(kRel);
    }
    var querFechar = false;
    function fechar() {
      var temAlgo = el.querySelector('#tfRelTxt').value.trim();   // a pergunta é pelo TEXTO digitado (issue 154)
      if (temAlgo && !querFechar) {
        querFechar = true;
        el.querySelector('#tfRelFechar').textContent = 'Fechar mesmo assim';
        msg('Fechar sem enviar? O texto fica guardado neste aparelho para a próxima vez' + (imgs.length ? ' (os prints não)' : '') + '. Toque em "Fechar mesmo assim" para fechar.', true);
        return;
      }
      guardarRascunho();
      minha.fechando = true;
      if (tela === minha) fecharTela();
    }
    var teclado = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); } };
    minha.teclado = teclado;
    tela = minha;
    document.addEventListener('keydown', teclado, true);
    function msg(t, e) { var m = el.querySelector('#tfPinMsg'); m.textContent = t || ''; m.className = 'tf-msg' + (e ? ' erro' : ''); }
    el.querySelector('#tfRelFechar').addEventListener('click', function () { fechar(); });
    (function () {
      var r = rascunho();
      if (r.texto) {
        el.querySelector('#tfRelTxt').value = r.texto;
        var rb = el.querySelector('input[name=tfRelTipo][value="' + (r.tipo === 'sugestao' ? 'sugestao' : 'problema') + '"]'); if (rb) rb.checked = true;
        msg('Voltou o texto que você tinha começado.');
      }
    })();
    el.querySelector('#tfRelTxt').addEventListener('input', function () {
      guardarRascunho();
      if (querFechar) { querFechar = false; el.querySelector('#tfRelFechar').textContent = 'Fechar'; msg(''); }
    });
    el.addEventListener('change', function (e) { if (e.target && e.target.name === 'tfRelTipo') guardarRascunho(); });
    var SIT = { novo: 'enviado', respondido: 'respondido', melhoria: 'virou melhoria', descartado: 'encerrado' };
    function lista() {
      var cx = el.querySelector('#tfRelLista');
      rpcM('tf_relatos_meus', {}).then(function (L) {
        if (!(L || []).length) { cx.innerHTML = '<p>Você ainda não mandou nenhum relato.</p>'; return; }
        cx.innerHTML = L.map(function (r) {
          return '<div class="tf-rel-it"><b>' + (r.tipo === 'problema' ? 'Problema' : 'Sugestão') + '<span class="tf-rel-sit ' + esc(r.situacao) + '">' + esc(SIT[r.situacao] || r.situacao) + '</span></b>' +
            '<small>' + esc(quando(r.criado_em)) + (r.tela ? ' · ' + esc(r.tela) : '') + '</small>' +
            '<div>' + esc(r.texto) + '</div>' +
            (r.resposta ? '<div class="tf-rel-resp"><b>Resposta' + (r.respondido_por ? ' de ' + esc(r.respondido_por) : '') + (r.respondido_em ? ' em ' + esc(quando(r.respondido_em)) : '') + ':</b> ' + esc(r.resposta) + '</div>' : '') +
            (r.situacao === 'melhoria' ? '<small>Entrou na lista de melhorias' + (r.melhoria_num ? ' (item ' + esc(r.melhoria_num) + ')' : '') + '.</small>' : '') + '</div>';
        }).join('');
      }, function (e) { cx.innerHTML = '<p>Não deu para abrir a lista agora' + (e && e.rede ? ' (sem sinal)' : '') + '.</p>'; });
    }
    // os prints: do arquivo ou colados (Ctrl+V na janela); até 2, com miniatura e um X para tirar
    var imgs = [], urls = [];
    function miniaturas(aviso) {
      urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      urls = imgs.map(function (f) { return URL.createObjectURL(f); });
      el.querySelector('#tfRelImgs').innerHTML = urls.map(function (u, i) {
        return '<span><img src="' + u + '" alt="Print ' + (i + 1) + '"><button type="button" data-tirar="' + i + '" aria-label="Tirar o print ' + (i + 1) + '">×</button></span>';
      }).join('') + (aviso ? '<small>' + esc(aviso) + '</small>' : '');
    }
    function juntar(lista) {
      var novas = lista.filter(function (f) { return f && /^image\//.test(f.type); });
      if (!novas.length) return false;
      var cabe = 2 - imgs.length;
      imgs = imgs.concat(novas.slice(0, Math.max(cabe, 0)));
      miniaturas(novas.length > cabe ? 'Só cabem 2 prints: tire um para pôr outro.' : '');
      return true;
    }
    el.querySelector('#tfRelImg').addEventListener('change', function (e) {
      juntar(Array.prototype.slice.call(e.target.files || []));
      e.target.value = '';
    });
    el.querySelector('#tfRelImgs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tirar]'); if (!b) return;
      imgs.splice(+b.getAttribute('data-tirar'), 1); miniaturas('');
    });
    el.addEventListener('paste', function (e) {
      var it = (e.clipboardData && e.clipboardData.items) || [], fs = [];
      for (var i = 0; i < it.length; i++) if (it[i].kind === 'file' && /^image\//.test(it[i].type)) { var f = it[i].getAsFile(); if (f) fs.push(f); }
      if (fs.length && juntar(fs)) e.preventDefault();   // colou imagem: vira print (o texto colado segue normal)
    });
    el.querySelector('#tfRelEnviar').addEventListener('click', function () {
      var bt = this, tipo = (el.querySelector('input[name=tfRelTipo]:checked') || {}).value || 'problema';
      var txt = el.querySelector('#tfRelTxt').value.trim();
      if (txt.length < 10) { msg('Conte o que aconteceu com um pouco mais de detalhe.', true); el.querySelector('#tfRelTxt').focus(); return; }
      if (navigator.onLine === false) { msg('Sem sinal: o relato precisa de internet para ser enviado. Tente de novo com sinal.', true); return; }
      bt.disabled = true; msg('Enviando…');
      var id, caminhos = [], uid = subDoToken(s.token);   // o id da pessoa vem do próprio token (a sessão não o guarda)
      rpcM('tf_relato_criar', { p_tipo: tipo, p_texto: txt, p_contexto: contextoRelato(o) }).then(function (r) {
        id = r && r.id;
        if (!id || !imgs.length) return;
        return imgs.reduce(function (p, f, i) {
          return p.then(function () {
            return reduzirFoto(f, { lado: 1280, qualidade: 0.8 }).then(function (b) {
              var cam = uid + '/' + id + '/' + (i + 1) + '.jpg';
              return storageEnviar('relatos', cam, b).then(function () { caminhos.push(cam); });
            }).catch(function () { /* o print falhou: o relato vai sem ele */ });
          });
        }, Promise.resolve()).then(function () {
          if (caminhos.length) return rpcM('tf_relato_prints', { p_id: id, p_paths: caminhos });
        });
      }).then(function () {
        var tinha = imgs.length;
        el.querySelector('#tfRelTxt').value = ''; el.querySelector('#tfRelImg').value = ''; imgs = []; miniaturas('');
        lsDel(kRel); querFechar = false; el.querySelector('#tfRelFechar').textContent = 'Fechar';
        msg('Relato enviado. Obrigado! A resposta aparece aqui embaixo' + (tinha && !caminhos.length ? ' (o print não subiu)' : '') + '.');
        toast('Relato enviado.', 'ok');
        lista();
      }, function (e) {
        msg((e && e.message) || 'Não deu para enviar agora.', true);
      }).then(function () { bt.disabled = false; });
    });
    lista();
    el.querySelector('#tfRelTxt').focus();
  }

  api_.versao = VERSAO;
  api_.util = { esc: esc, toast: toast, BRL: BRL, dataBR: dataBR, isoHoje: isoHoje, copiar: copiar,
                arquivoParaBase64: arquivoParaBase64, semDuploEnvio: semDuploEnvio,
                lerValor: lerValor, lerValorDetalhe: lerValorDetalhe, valorEntendido: valorEntendido, mostrarValor: mostrarValor };   // N12 (167, 189)
  api_.planilha = { lerXLSX: lerXLSX, linhasDoXml: linhasDoXml };   // N12 (146)
  api.req = req; api.get = getM; api.rpc = rpcM;
  api_.janela = { abrir: abrirJanela, fechar: fecharJanela, confirmar: confirmarJanela, erro: erroNaJanela, mexida: function (v) { if (v !== undefined) { janelaMexida = !!v; descarteArmado = 0; } return janelaMexida; } };
  api_.fila = {
    guardarFoto: function (blob) {
      var chave = 'f2-' + uidNovo();
      return paraBlob(blob).then(function (b) { return IDB.put(chave, b); }).then(function () { return chave; });
    },
    adicionar: filaAdicionar,   // N11: devolve null quando não coube no aparelho (o aviso vermelho já foi mostrado)
    enviarAgora: filaEnviar,
    /** N11 (issue 35): fn() libera espaço no aparelho (apaga o que dá para baixar de novo); chamada quando a fila não cabe. */
    aoFaltarEspaco: function (fn) { if (typeof fn === 'function') liberadores.push(fn); },
    msgSemEspaco: MSG_SEM_ESPACO,
    listar: function (o) {
      o = o || {};
      return filaLer().filter(function (x) {
        return x && x.v === 2 && (!o.tipo || x.tipo === o.tipo) && (!o.grupo || x.grupo === o.grupo);
      }).map(function (x) { return JSON.parse(JSON.stringify(x)); });
    },
    contar: function () { return filaLer().length; },
    retomar: function (grupo) {
      filaLer().forEach(function (x) {
        if (x && x.v === 2 && x.grupo === grupo && x.parado) filaTrocar(x.assinatura, function (y) { y.parado = false; delete y.motivo; delete y.recusado; delete y.erroServidor; y.errosServidor = 0; return y; });
      });
      return filaEnviar();
    },
    /** N14 (S202): a página registra quem envia as entradas com `envio: nome` (ex.: o TapField, 'field'). */
    tratador: function (nome, fn) { if (nome && typeof fn === 'function') tratadores[String(nome)] = fn; },
    /** N14: o que a entrada guarda (para a página mostrar ou devolver ao rascunho). */
    ler: function (assinatura) {
      var x = filaLer().filter(function (y) { return y && y.v === 2 && y.assinatura === assinatura; })[0];
      return x ? JSON.parse(JSON.stringify(x)) : null;
    },
    descartar: function (assinatura) {
      var fotos = [];
      filaTrocar(assinatura, function (y) { fotos = (y.fotos || []).map(function (x) { return x.chave; }).concat(y.guardados || []); return null; });
      fotos.forEach(function (ch) { if (ch) IDB.del(ch).catch(function () {}); });
      avisar({ assinatura: assinatura, situacao: 'descartado' });
    },
    aoMudar: function (fn) { if (typeof fn === 'function') ouvintes.push(fn); }
  };
  api_.foto = { reduzir: reduzirFoto };
  api_.storage = { enviar: storageEnviar, pedir: storagePedir, msgSessaoVenceu: MSG_SESSAO_VENCEU };   // N12 (issue 142): pedir
  api_.tarefas = {
    abrirCom: function (tipo, endereco) { ABRE_COM[String(tipo)] = String(endereco); },
    destino: destinoDaTarefa
  };

  window.Nucleo = api_;
})();
