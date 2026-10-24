/* ============================================================================
 * TAPFLOW — SERVICE WORKER DO HUB E DO MANAGER (S45 · item 1, PWA)
 * ----------------------------------------------------------------------------
 * Mora na RAIZ do TapFlow (/tapflow/sw.js) e cuida de duas páginas: a porta
 * (/tapflow/) e o Manager (/tapflow/manager/). O Field NÃO é dele: o Field
 * tem o próprio service worker (field/sw.js, com a fila offline), de escopo
 * mais longo, e o navegador entrega cada página ao escopo mais longo que a
 * cobre. Por garantia, este aqui nem olha para /field/ — se o Field ainda não
 * registrou o dele, a página vai direto para a rede, como antes.
 *
 * O que ele faz, em uma frase: deixa o TapFlow ser INSTALADO (ícone na tela
 * inicial, abre em tela cheia) e abrir o "esqueleto" sem sinal.
 *
 * O que ele NÃO faz, de propósito (a mesma regra do Field):
 *   · não guarda resposta de API (/rest/v1, /auth/v1, /storage/v1) nem nada de
 *     outro endereço (o Supabase, o Google). Os dados continuam vindo da
 *     internet — cachear API criaria uma segunda verdade: um card que já
 *     andou continuaria parado na tela.
 *
 * A ESTRATÉGIA, e por quê:
 *   · Abrir uma página: REDE PRIMEIRO, com 4 s de paciência, e o cache como
 *     rede de segurança. Quem está online sempre pega a versão nova — é isso
 *     que impede o app instalado de ficar preso numa versão velha (S45, S46…)
 *     sem ninguém precisar "limpar o cache". Sem sinal, abre a última que
 *     funcionou, e o próprio Manager diz que não conseguiu carregar os dados.
 *   · Ícones e manifesto: cache primeiro, atualizando por baixo.
 *
 * ⚠ AO PUBLICAR UMA VERSÃO NOVA DO HUB OU DO MANAGER, TROQUE A LINHA `VERSAO`.
 *   É ela que apaga o cache velho no aparelho de todo mundo.
 * ========================================================================== */

const VERSAO = 'H10-S87';   // S87 · Manager com o menu por módulo (TapFlow) e o modulos.js com os cards do TapFlow e da Gestão
const CACHE  = 'tapflow-hub-' + VERSAO;

const ESSENCIAIS = [
  './',
  './manifest.webmanifest',
  './manager/',
  './field/icons/icon-192.png',
  './field/icons/icon-512.png',
  './field/icons/icon-maskable-512.png',
  './field/icons/apple-touch-icon.png',
  // O núcleo comum. O endereço tem que ser IDÊNTICO ao do <script>, com o ?v=
  // (o cache compara a consulta inteira). Trocou o ?v= nas páginas? Troque aqui também.
  // S76: hub, Manager, Field e fin/ pedem todos ?v=N2 — saíram as linhas ?v=N1.
  './nucleo/nucleo.js?v=N2',
  './nucleo/nucleo.css?v=N2',
  './nucleo/config.js?v=N2',
  // H10 · S81: a tabela dos módulos e o menu "Trocar de módulo" (mesmo ?v= das páginas)
  './nucleo/modulos.js?v=M1',
  // S74 · TapFin: a página (S76 · TapFin 2: o plano B fin/util.js saiu)
  './fin/',
  // S77 · TapDoc do escritório (R02b1) e o motor de cálculo que ele usa
  './doc/',
  './doc/motor-calculo-nr13.js?v=R00.3'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // um a um: um arquivo que falte não pode derrubar a instalação inteira
    await Promise.all(ESSENCIAIS.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.map(n => (n.startsWith('tapflow-hub-') && n !== CACHE)
      ? caches.delete(n) : null));
    await self.clients.claim();
  })());
});

/** Rede com prazo — sinal ruim não pode segurar a tela para sempre. */
function comPrazo(req, ms) {
  return new Promise((ok, err) => {
    const t = setTimeout(() => err(new Error('prazo')), ms);
    fetch(req).then(r => { clearTimeout(t); ok(r); },
                    e => { clearTimeout(t); err(e); });
  });
}

/** A chave da página no cache: o caminho sem busca e sem "index.html"
 *  (/tapflow/?para=manager e /tapflow/index.html são a mesma porta). */
function chave(url) {
  const u = new URL(url);
  return u.origin + u.pathname.replace(/index\.html$/, '');
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;              // Supabase, Google: direto
  const base = new URL('./', self.location).pathname;           // /tapflow/
  if (!url.pathname.startsWith(base)) return;
  const resto = url.pathname.slice(base.length);
  if (resto.startsWith('field/') && !resto.startsWith('field/icons/')) return;   // é do Field
  if (/\/(rest|auth|storage)\/v1\//.test(url.pathname)) return;                 // API: nunca

  // ── abrir uma página ──
  if (req.mode === 'navigate') {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await comPrazo(req, 4000);
        if (r && r.ok && r.type === 'basic') c.put(chave(req.url), r.clone()).catch(() => {});
        return r;
      } catch (e) {
        return (await c.match(chave(req.url))) || (await c.match(req, { ignoreSearch: true })) ||
          new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<body style="font:15px system-ui;padding:24px;color:#14181B"><h1 style="font-size:20px">Sem sinal</h1>'
            + '<p>O TapFlow ainda não tinha sido aberto neste aparelho com internet. Abra de novo quando tiver conexão.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
      }
    })());
    return;
  }

  // ── o núcleo (N1a) ──
  // Rede primeiro com 4 s e o cache como reserva: sem isto o Manager (que era um arquivo
  // só e abria sem sinal) abriria SEM o núcleo e quebraria — o .js/.css não era guardado.
  // S74: o mesmo vale para os .js/.css dos módulos que moram em pasta própria (fin/)
  if (resto.startsWith('nucleo/') || /^(fin|doc)\/.*\.(js|css)$/.test(resto)) {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await comPrazo(req, 4000);
        if (r && r.ok && r.type === 'basic') c.put(req, r.clone()).catch(() => {});
        return r;
      } catch (e) {
        return (await c.match(req)) || new Response('', { status: 504 });
      }
    })());
    return;
  }

  // ── ícones e manifesto ──
  if (/\.(png|webmanifest|svg|ico)$/.test(url.pathname)) {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = await c.match(req);
      const daRede = fetch(req).then(r => {
        if (r && r.ok) c.put(req, r.clone()).catch(() => {});
        return r;
      }).catch(() => null);
      return guardado || (await daRede) || new Response('', { status: 504 });
    })());
  }
  // o resto (bibliotecas, modelos .docx…) vai direto para a rede, como antes
});
