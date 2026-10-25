/* ============================================================================
 * TAPFLOW FIELD — SERVICE WORKER
 * ----------------------------------------------------------------------------
 * O que ele faz, em uma frase: garante que o app ABRA dentro da planta, com o
 * celular sem sinal. Só isso.
 *
 * O que ele NÃO faz, de propósito:
 *   · não guarda resposta de API. Os dados vêm do Supabase e o app já tem a
 *     própria fila offline para o que é enviado. Cachear API aqui criaria uma
 *     segunda verdade — o inspetor veria uma OS que já andou de coluna.
 *   · não intercepta o Apps Script do Drive nem o Supabase: qualquer coisa que
 *     não seja deste mesmo endereço passa direto.
 *
 * A ESTRATÉGIA, e por quê:
 *   · Navegação (abrir o app): REDE PRIMEIRO, com 4 s de paciência e o cache
 *     como rede de segurança. Assim quem está online sempre pega a versão nova
 *     — nunca preciso pedir para nove pessoas "limparem o cache" — e quem está
 *     sem sinal abre a última que funcionou.
 *   · Ícones e manifesto: CACHE PRIMEIRO, atualizando por baixo. São arquivos
 *     que quase não mudam e não vale gastar sinal com eles.
 *
 * ⚠ AO PUBLICAR UMA VERSÃO NOVA DO index.html, TROQUE A LINHA `VERSAO` ABAIXO.
 *   É ela que apaga o cache velho. Sem isso, quem estiver offline continuaria
 *   abrindo a versão antiga por tempo indeterminado.
 * ========================================================================== */

const VERSAO = 'S38-T9';   // S94: TapDoc 9 (R06a: o ambiente na Localização) · S86: TapDoc 8 (R04a: aferição em campo) e o motor R00.3
const CACHE  = 'tapflow-field-' + VERSAO;

const ESSENCIAIS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  // N1a (S33): o núcleo comum, que mora FORA desta pasta (../nucleo/). O endereço tem que ser
  // IDÊNTICO ao do <script> do index.html, com o ?v= (c.match compara a consulta inteira).
  // Sem isto o Field sem sinal abriria sem o núcleo. Trocou o ?v= no index.html? Troque aqui também.
  // S34: N2 (fila de envios e utilitários)
  '../nucleo/nucleo.js?v=N2',
  '../nucleo/nucleo.css?v=N2',
  '../nucleo/config.js?v=N2',
  // H10 · S81: a tabela dos módulos e o menu "Trocar de módulo"
  '../nucleo/modulos.js?v=M1',
  // S35 · TapDoc 1: a coleta da inspeção (página própria, abre sem sinal)
  './doc/',
  // S80 · TapDoc 4: o motor de cálculo para a prévia sem sinal. Mesmo ?v= do <script> de doc/index.html.
  './doc/motor-calculo-nr13.js?v=R00.3'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // addAll é tudo-ou-nada: um ícone que falte derrubaria a instalação inteira
    // e o app ficaria sem service worker nenhum. Um a um, o que faltar só falta.
    await Promise.all(ESSENCIAIS.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.map(n => (n.startsWith('tapflow-field-') && n !== CACHE)
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

self.addEventListener('fetch', ev => {
  const req = ev.request;
  // S60 · "Compartilhar → TapFlow" a partir da câmera ou da galeria (o
  // `share_target` do manifesto; só Android). A foto fica num cache próprio,
  // que a página lê e apaga ao abrir ?canhoto=compartilhado.
  if (req.method === 'POST') {
    let u; try { u = new URL(req.url); } catch (e) { return; }
    if (u.origin === self.location.origin && /\/compartilhar$/.test(u.pathname)) {
      ev.respondWith((async () => {
        try {
          const fd = await req.formData();
          const f = fd.get('foto');
          if (f && f.size) {
            const c = await caches.open('tapflow-compartilhado');
            await c.put('foto', new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
          }
        } catch (e) {}
        return Response.redirect('./?canhoto=compartilhado', 303);
      })());
    }
    return;
  }
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // Supabase, Drive: passa direto
  // S39 · e API NUNCA, mesmo no mesmo endereço. Em produção o Supabase é outro
  // endereço e já passava direto; no teste local (e em qualquer proxy que sirva
  // a API junto do app) o ramo "ícones" abaixo guardava a PRIMEIRA resposta de
  // /rest/v1 e a devolvia para sempre — a lista de extras ficava vazia depois
  // do envio. É exatamente a "segunda verdade" que o cabeçalho deste arquivo proíbe.
  if (url.pathname.indexOf('/rest/v1/') !== -1 || url.pathname.indexOf('/auth/v1/') !== -1 || url.pathname.indexOf('/storage/v1/') !== -1) return;

  // ── abrir o app ──
  // S35: cada página com a sua chave. Até o S34 TODA página aberta aqui era
  // guardada como "./index.html": abrir o TapDoc (doc/) com sinal e depois
  // abrir o Field sem sinal mostraria o TapDoc no lugar do Field.
  if (req.mode === 'navigate') {
    const base = new URL('./', self.location).pathname;          // /tapflow/field/
    const resto = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : '';
    const ehDoc = /^doc(\/|$)/.test(resto);
    const chave = ehDoc ? './doc/' : './index.html';
    ev.respondWith((async () => {
      try {
        const r = await comPrazo(req, 4000);
        const c = await caches.open(CACHE);
        if (r && r.ok && r.type === 'basic') c.put(chave, r.clone()).catch(() => {});
        return r;
      } catch (e) {
        const c = await caches.open(CACHE);
        return (await c.match(chave)) || (ehDoc ? null : (await c.match('./'))) ||
          new Response('<h1>Sem sinal</h1><p>Abra de novo quando tiver conexão.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
      }
    })());
    return;
  }

  // ── ícones, manifesto ──
  ev.respondWith((async () => {
    const c = await caches.open(CACHE);
    const guardado = await c.match(req);
    const daRede = fetch(req).then(r => {
      if (r && r.ok) c.put(req, r.clone()).catch(() => {});
      return r;
    }).catch(() => null);
    return guardado || (await daRede) || new Response('', { status: 504 });
  })());
});
