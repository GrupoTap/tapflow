/* ============================================================================
 * TAPFIELD — SERVICE WORKER (o celular: /tapflow/field/ e o TapDoc do celular, field/doc/)
 * ----------------------------------------------------------------------------
 * O que ele faz, em uma frase: garante que o app ABRA dentro da planta, com o
 * celular sem sinal.
 *
 * O que ele NÃO faz, de propósito:
 *   · não guarda resposta de API. Os dados vêm do Supabase e o app já tem a
 *     própria fila offline para o que é enviado. Cachear API aqui criaria uma
 *     segunda verdade — o inspetor veria uma OS que já andou de coluna.
 *   · não intercepta o Apps Script do Drive nem o Supabase: qualquer coisa que
 *     não seja deste mesmo endereço passa direto.
 *
 * A ESTRATÉGIA (S215, issue 231):
 *   · Abrir o app (o TapField ou o TapDoc do celular): INTERNET PRIMEIRO, com
 *     1,5 s de prazo. Com a cópia guardada, a pergunta é "mudou?" (If-None-Match):
 *     se não mudou, a resposta é curta e abre a cópia. Passado o prazo, abre a
 *     cópia e a resposta da internet fica guardada para a próxima vez.
 *   · Arquivo com a versão no endereço (?v=…) e as bibliotecas do PDF
 *     (doc/vendor/): a cópia primeiro — a mesma versão é sempre o mesmo arquivo.
 *   · Ícones, manifesto e o resto: a cópia primeiro, atualizando por baixo.
 *   · Versão nova (a linha VERSAO): o cache é um só e fica; o celular pergunta
 *     só o que mudou (as duas páginas e os arquivos sem versão) e baixa só os
 *     arquivos ?v= novos. As duas páginas ficam sempre guardadas: o campo
 *     precisa delas sem sinal.
 *
 * ⚠ AO PUBLICAR UMA VERSÃO NOVA DO index.html (ou do doc/), TROQUE A LINHA `VERSAO`.
 *   Trocou o ?v= nas páginas? Troque aqui também. O histórico está nos Pull requests.
 * ========================================================================== */

const VERSAO = 'S75-T66';
const CACHE  = 'tapflow-field';        // um cache só, que passa de uma versão para a outra
const PRAZO  = 1500;

// As duas páginas (sempre guardadas e conferidas a cada versão nova).
const PAGINAS = ['./index.html', './doc/'];
// Sempre guardados. O endereço tem que ser IDÊNTICO ao do <script> (o cache compara a consulta inteira).
const FIXOS = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  '../nucleo/nucleo.js?v=N18',
  '../nucleo/nucleo.css?v=N18',
  '../nucleo/config.js?v=N18',
  '../nucleo/modulos.js?v=M4',
  './doc/motor-calculo-nr13.js?v=R00.7',   // a prévia do cálculo sem sinal
  './doc/recomendacoes.js?v=RC1',
  // a medição gera o PDF no campo, sem sinal: o pdfmake do TapDoc (mesmo endereço do <script> que a tela carrega)
  '../doc/vendor/pdfmake.min.js',
  '../doc/vendor/vfs_fonts.js'
];

const abs = u => new URL(u, self.location).href;
const temVersao = u => /[?&]v=/.test(new URL(u, self.location).search);
const ehVendor = u => new URL(u, self.location).pathname.indexOf('/doc/vendor/') !== -1;

/** Os arquivos ?v= que a página pede no <script src> e no <link href>. */
function arquivosDe(html, base) {
  const out = new Set();
  const re = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"'#]+\?v=[^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try { const u = new URL(m[1], base); if (u.origin === self.location.origin) out.add(u.href); } catch (e) {}
  }
  return [...out];
}

async function guardarSeFalta(c, u) {
  const url = abs(u);
  if (await c.match(url)) return;
  try { const r = await fetch(url, { credentials: 'same-origin' }); if (r && r.ok && r.type === 'basic') await c.put(url, r); } catch (e) {}
}

/** Pede à internet só se mudou (If-None-Match / If-Modified-Since). 304 = fica a cópia. */
function pedirSeMudou(url, guardado) {
  const h = {};
  if (guardado) {
    const et = guardado.headers.get('ETag'), lm = guardado.headers.get('Last-Modified');
    if (et) h['If-None-Match'] = et; else if (lm) h['If-Modified-Since'] = lm;
  }
  return fetch(url, { headers: h, cache: 'no-store', credentials: 'same-origin' });
}

async function guardarPagina(c, chave, r) {
  const texto = await r.clone().text();
  await c.put(chave, r);
  await Promise.all(arquivosDe(texto, abs(chave)).map(u => guardarSeFalta(c, u)));
}

/** Confere um arquivo guardado (página ou sem versão): baixa só se mudou. */
async function conferir(c, u, pagina) {
  const url = abs(u), guardado = await c.match(url);
  try {
    const r = await pedirSeMudou(url, guardado);
    if (r.status === 304) return;
    if (r.ok && r.type === 'basic' && !r.redirected) await (pagina ? guardarPagina(c, u, r) : c.put(url, r));
  } catch (e) {}
}

/** A 1ª vez com este service worker: aproveita o cache da versão antiga (tapflow-field-S…), sem baixar de novo. */
async function herdar(c) {
  if ((await c.keys()).length) return;
  const nomes = (await caches.keys()).filter(n => n.startsWith('tapflow-field-'));
  for (const n of nomes) {
    const v = await caches.open(n);
    for (const req of await v.keys()) {
      if (await c.match(req)) continue;
      const r = await v.match(req);
      if (r) await c.put(req, r).catch(() => {});
    }
  }
}

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await herdar(c);
    // um a um: o que faltar só falta (não derruba a instalação)
    await Promise.all(FIXOS.map(u => temVersao(u) ? guardarSeFalta(c, u) : conferir(c, u, false)));
    await Promise.all(PAGINAS.map(p => conferir(c, p, true)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.map(n => (n.startsWith('tapflow-field-') && n !== CACHE) ? caches.delete(n) : null));
    await limparVersoesVelhas();
    await self.clients.claim();
  })());
});

/** Tira os arquivos ?v= de versão velha: só quando a versão nova do mesmo arquivo é a que as páginas pedem. */
async function limparVersoesVelhas() {
  try {
    const c = await caches.open(CACHE);
    const pedidos = new Set(FIXOS.map(abs));
    for (const p of PAGINAS) { const r = await c.match(p); if (r) arquivosDe(await r.text(), abs(p)).forEach(x => pedidos.add(x)); }
    const caminhoPedido = new Set([...pedidos].map(x => new URL(x).pathname));
    for (const req of await c.keys()) {
      const u = new URL(req.url);
      if (!/[?&]v=/.test(u.search) || pedidos.has(req.url)) continue;
      if (caminhoPedido.has(u.pathname)) await c.delete(req);
    }
  } catch (e) {}
}

/** A resposta da internet, se chegar dentro do prazo; senão null (a internet continua por baixo). */
function corrida(p, ms) {
  return new Promise((ok, err) => {
    const t = setTimeout(() => ok(null), ms);
    p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); err(e); });
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
  // API NUNCA, mesmo no mesmo endereço (no teste local a API vem do mesmo endereço do app)
  if (url.pathname.indexOf('/rest/v1/') !== -1 || url.pathname.indexOf('/auth/v1/') !== -1 || url.pathname.indexOf('/storage/v1/') !== -1 || url.pathname.indexOf('/functions/v1/') !== -1) return;

  // ── abrir o app ──
  // Cada página com a sua chave: o TapDoc do celular (doc/) e o TapField (index.html).
  if (req.mode === 'navigate') {
    const base = new URL('./', self.location).pathname;          // /tapflow/field/
    const resto = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : '';
    const ehDoc = /^doc(\/|$)/.test(resto);
    const chave = ehDoc ? './doc/' : './index.html';
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = (await c.match(chave)) || (ehDoc ? null : (await c.match('./')));
      const nova = r => r && r.ok && r.type === 'basic' && !r.redirected;
      if (!guardado) {
        try {
          const r = await fetch(req);
          if (nova(r)) ev.waitUntil(c.put(chave, r.clone()).catch(() => {}));
          return r;
        } catch (e) {
          return new Response('<h1>Sem sinal</h1><p>Abra de novo quando tiver conexão.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
        }
      }
      const daRede = pedirSeMudou(req.url, guardado);
      let r = null;
      try { r = await corrida(daRede, PRAZO); } catch (e) { return guardado; }
      if (!r) {   // passou o prazo: abre a cópia; a resposta da internet fica guardada para a próxima vez
        ev.waitUntil(daRede.then(x => nova(x) ? guardarPagina(c, chave, x) : null).catch(() => {}));
        return guardado;
      }
      if (r.status === 304) return guardado;
      if (nova(r)) { ev.waitUntil(c.put(chave, r.clone()).catch(() => {})); return r; }
      if (r.redirected) return fetch(req).catch(() => guardado);
      return r.ok ? r : guardado;
    })());
    return;
  }

  // ── arquivo com a versão no endereço e as bibliotecas do PDF: a cópia primeiro ──
  if (/[?&]v=/.test(url.search) || ehVendor(req.url)) {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = await c.match(req);
      if (guardado) return guardado;
      try {
        const r = await fetch(req);
        if (r && r.ok && r.type === 'basic') ev.waitUntil(c.put(req, r.clone()).catch(() => {}));
        return r;
      } catch (e) { return new Response('', { status: 504 }); }
    })());
    return;
  }

  // ── ícones, manifesto e o resto ──
  ev.respondWith((async () => {
    const c = await caches.open(CACHE);
    const guardado = await c.match(req);
    const daRede = fetch(req).then(r => {
      if (r && r.ok) c.put(req, r.clone()).catch(() => {});
      return r;
    }).catch(() => null);
    if (guardado) { ev.waitUntil(daRede); return guardado; }
    return (await daRede) || new Response('', { status: 504 });
  })());
});


/* ── S45 · Ponto 2E: os avisos com o app fechado ─────────────────────────────
 * O servidor (Edge Function `avisar`) manda a mensagem cifrada; o navegador decifra e entrega aqui.
 * O toque abre o TapField no Eu (#ponto), reaproveitando uma janela já aberta. */
self.addEventListener('push', ev => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { corpo: ev.data ? ev.data.text() : '' }; }
  ev.waitUntil(self.registration.showNotification(d.titulo || 'TapField', {
    body: d.corpo || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png',
    data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const alvo = new URL((ev.notification.data && ev.notification.data.url) || './', self.registration.scope).href;
  ev.waitUntil((async () => {
    const L = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of L) if (c.url.startsWith(self.registration.scope)) { try { await c.navigate(alvo); } catch (e) {} return c.focus(); }
    return self.clients.openWindow(alvo);
  })());
});
