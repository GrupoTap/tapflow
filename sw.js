/* ============================================================================
 * TAPHUB — SERVICE WORKER DO INÍCIO E DOS MÓDULOS DO ESCRITÓRIO
 * ----------------------------------------------------------------------------
 * Mora na RAIZ (/tapflow/sw.js) e cuida do início e das páginas dos módulos
 * (manager/, fin/, doc/, rh/, seg/, crm/, gestao/, cadastros/, acessos/).
 * O TapField NÃO é dele: o TapField tem o próprio service worker (field/sw.js),
 * de escopo mais longo, e o navegador entrega cada página ao escopo mais longo
 * que a cobre. Por garantia, este aqui nem olha para /field/.
 *
 * O que ele faz: deixa o TapHub ser INSTALADO (ícone na tela inicial) e abrir
 * sem sinal a última versão que funcionou.
 *
 * O que ele NÃO faz, de propósito:
 *   · não guarda resposta de API (/rest/v1, /auth/v1, /storage/v1) nem nada de
 *     outro endereço (o Supabase, o Google): os dados vêm sempre da internet.
 *
 * A ESTRATÉGIA (S215, issue 231):
 *   · Abrir uma página: INTERNET PRIMEIRO, com 1,5 s de prazo. Com a cópia
 *     guardada, a pergunta à internet é "mudou?" (If-None-Match): se não mudou,
 *     a resposta é curta (304) e a página sai da cópia. Passado o prazo, abre a
 *     cópia e a resposta da internet, quando chegar, fica guardada para a
 *     próxima vez (sem aviso e sem recarregar sozinho). Sem cópia, espera a
 *     internet.
 *   · Arquivo com a versão no endereço (?v=…): a cópia guardada primeiro — a
 *     mesma versão é sempre o mesmo arquivo. Sem ?v=: internet primeiro, 1,5 s.
 *   · Ícones e manifesto: a cópia primeiro, atualizando por baixo.
 *   · Versão nova (a linha VERSAO): o cache é um só e fica. O aparelho pergunta
 *     só pelas páginas que ele já abriu (e pelo início), baixa só as que
 *     mudaram e os arquivos ?v= novos delas; as páginas que ele nunca abriu
 *     não são baixadas.
 *
 * ⚠ AO PUBLICAR UMA VERSÃO NOVA DE QUALQUER PÁGINA, TROQUE A LINHA `VERSAO`.
 *   É ela que faz o aparelho perguntar pelas páginas novas. Trocou o ?v= de um
 *   arquivo do núcleo nas páginas? Troque aqui também (FIXOS ou JUNTO).
 *   O histórico das versões está nos Pull requests.
 * ========================================================================== */

const VERSAO = 'H21-S238';
const CACHE  = 'tapflow-hub';          // um cache só, que passa de uma versão para a outra
const PRAZO  = 1500;                   // ms de paciência com a internet antes de abrir a cópia

// Sempre guardados (o início e o que toda página pede). O endereço tem que ser
// IDÊNTICO ao da página, com o ?v= (o cache compara a consulta inteira).
const FIXOS = [
  './',
  './manifest.webmanifest',
  './field/icons/icon-192.png',
  './field/icons/icon-512.png',
  './field/icons/icon-maskable-512.png',
  './field/icons/apple-touch-icon.png',
  './nucleo/nucleo.js?v=N18',
  './nucleo/nucleo.css?v=N18',
  './nucleo/config.js?v=N18',
  './nucleo/modulos.js?v=M4'
];
// As páginas dos módulos: só as que o aparelho já abriu são conferidas a cada versão nova.
const PAGINAS = ['./manager/', './fin/', './doc/', './acessos/', './seg/', './rh/', './crm/', './gestao/', './cadastros/'];
// Arquivos que a página carrega depois de abrir (não estão no <script>/<link> dela) e que precisam funcionar sem sinal.
const JUNTO = {
  './doc/': ['./doc/documentos-pdf.js?v=D11']   // a revisão do TapDoc sem sinal: o Resumo, o Registro e os nomes dos arquivos
};

const abs = u => new URL(u, self.location).href;
const temVersao = u => /[?&]v=/.test(new URL(u, self.location).search);

/** A chave da página no cache: o caminho sem busca e sem "index.html"
 *  (/tapflow/?para=manager e /tapflow/index.html são a mesma porta). */
function chave(url) {
  const u = new URL(url);
  return u.origin + u.pathname.replace(/index\.html$/, '');
}

/** Os arquivos ?v= que a página pede no <script src> e no <link href> (os mesmos endereços que ela vai pedir). */
function arquivosDe(html, base) {
  const out = new Set();
  const re = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"'#]+\?v=[^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === self.location.origin && u.pathname.startsWith(new URL('./', self.location).pathname)) out.add(u.href);
    } catch (e) {}
  }
  return [...out];
}

/** Guarda o arquivo ?v= se ainda não está guardado (a mesma versão nunca muda). */
async function guardarSeFalta(c, u) {
  const url = abs(u);
  if (await c.match(url)) return;
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (r && r.ok && r.type === 'basic') await c.put(url, r);
  } catch (e) {}
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

/** Página nova guardada: guarda junto os arquivos ?v= dela (para abrir sem sinal). */
async function guardarPagina(c, url, r, comArquivos = true) {
  const k = chave(url);
  const junto = (JUNTO['./' + k.slice(abs('./').length)] || []).map(abs);
  if (!comArquivos) {   // a página aberta agora pede os arquivos do <script>/<link> dela sozinha; os do JUNTO, não
    await c.put(k, r);
    return Promise.all(junto.map(u => guardarSeFalta(c, u)));
  }
  const texto = await r.clone().text();
  await c.put(k, r);
  const pede = arquivosDe(texto, k).concat(junto);
  await Promise.all(pede.map(u => guardarSeFalta(c, u)));
}

/** Quais páginas este aparelho abre (fica num cache à parte, que a versão nova não apaga). */
const USO = 'tapflow-uso-hub';
async function lerUso() {
  try { const r = await (await caches.open(USO)).match('uso'); return r ? await r.json() : null; } catch (e) { return null; }
}
async function marcarUso(url) {
  const k = './' + chave(url).slice(abs('./').length);
  if (!PAGINAS.includes(k)) return;
  const u = (await lerUso()) || {};
  if (u[k] && Date.now() - u[k] < 3600e3) return;   // uma marca por hora basta
  u[k] = Date.now();
  await (await caches.open(USO)).put('uso', new Response(JSON.stringify(u), { headers: { 'Content-Type': 'application/json' } }));
}

/** Confere uma página guardada (versão nova): baixa só se mudou. */
async function conferirPagina(c, u) {
  const url = abs(u), guardado = await c.match(url);
  try {
    const r = await pedirSeMudou(url, guardado);
    if (r.status === 304) return;
    if (r.ok && r.type === 'basic' && !r.redirected) await guardarPagina(c, url, r);
  } catch (e) {}
}

/** A 1ª vez com este service worker: aproveita o cache da versão antiga (tapflow-hub-H…), sem baixar de novo. */
async function herdar(c) {
  if ((await c.keys()).length) return;
  const nomes = (await caches.keys()).filter(n => n.startsWith('tapflow-hub-'));
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
    // os fixos: o ?v= que já está guardado não se baixa de novo; o resto (início, ícones, manifesto) pergunta se mudou
    await Promise.all(FIXOS.map(u => temVersao(u) ? guardarSeFalta(c, u) : conferirFixo(c, u)));
    // as páginas que este aparelho abriu nos últimos 60 dias (e as que estão abertas agora); as outras não se baixam
    // (a 1ª vez, sem a anotação ainda, confere as que estão guardadas: o service worker antigo guardava todas)
    const uso = await lerUso();
    const abertas = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).map(w => './' + chave(w.url).slice(abs('./').length));
    const guardadas = [];
    if (!uso) for (const p of PAGINAS) if (await c.match(abs(p))) guardadas.push(p);
    const usadas = PAGINAS.filter(p => (uso ? (uso[p] && Date.now() - uso[p] < 60 * 864e5) : guardadas.includes(p)) || abertas.includes(p));
    await Promise.all(usadas.map(p => conferirPagina(c, p)));
    self.skipWaiting();
  })());
});

async function conferirFixo(c, u) {
  if (u === './') return conferirPagina(c, u);
  const url = abs(u), guardado = await c.match(url);
  try {
    const r = await pedirSeMudou(url, guardado);
    if (r.status === 304) return;
    if (r.ok && r.type === 'basic') await c.put(url, r);
  } catch (e) {}
}

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.map(n => (n.startsWith('tapflow-hub-') && n !== CACHE) ? caches.delete(n) : null));
    await limparVersoesVelhas();
    await self.clients.claim();
  })());
});

/** Tira os arquivos ?v= de versão velha: só quando a versão nova do mesmo arquivo é a que as páginas guardadas pedem. */
async function limparVersoesVelhas() {
  try {
    const c = await caches.open(CACHE);
    const chaves = await c.keys();
    const pedidos = new Set(FIXOS.map(abs));
    for (const req of chaves) {
      const u = new URL(req.url);
      if (u.search) continue;
      const r = await c.match(req);
      const tipo = (r && r.headers.get('Content-Type')) || '';
      if (!/html/.test(tipo)) continue;
      arquivosDe(await r.text(), req.url).forEach(x => pedidos.add(x));
      ((JUNTO['./' + req.url.slice(abs('./').length)]) || []).forEach(x => pedidos.add(abs(x)));
    }
    const caminhoPedido = new Set([...pedidos].map(x => new URL(x).pathname));
    for (const req of chaves) {
      const u = new URL(req.url);
      if (!/[?&]v=/.test(u.search) || pedidos.has(req.url)) continue;
      if (caminhoPedido.has(u.pathname)) await c.delete(req);
    }
  } catch (e) {}
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
  if (resto.startsWith('field/') && !resto.startsWith('field/icons/')) return;   // é do TapField
  if (/\/(rest|auth|storage|functions)\/v1\//.test(url.pathname)) return;      // API: nunca

  // ── abrir uma página ──
  if (req.mode === 'navigate') {
    ev.respondWith(abrirPagina(ev, req));
    return;
  }

  // ── arquivo com a versão no endereço: a cópia primeiro ──
  if (/[?&]v=/.test(url.search)) {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = await c.match(req);
      if (guardado) return guardado;
      const r = await fetch(req);
      if (r && r.ok && r.type === 'basic') ev.waitUntil(c.put(req, r.clone()).catch(() => {}));
      return r;
    })());
    return;
  }

  // ── o núcleo e os .js/.css sem versão: internet primeiro, 1,5 s ──
  if (resto.startsWith('nucleo/') || /\.(js|css)$/.test(resto)) {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const daRede = fetch(req).then(r => {
        if (r && r.ok && r.type === 'basic') ev.waitUntil(c.put(req, r.clone()).catch(() => {}));
        return r;
      });
      const guardado = await c.match(req);
      if (!guardado) return daRede;
      ev.waitUntil(daRede.catch(() => {}));
      return corrida(daRede, PRAZO).then(r => r || guardado, () => guardado);
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
      if (guardado) { ev.waitUntil(daRede); return guardado; }
      return (await daRede) || new Response('', { status: 504 });
    })());
  }
  // o resto (bibliotecas sem versão, modelos .docx…) vai direto para a internet
});

/** A resposta da internet, se chegar dentro do prazo; senão null (a internet continua por baixo). */
function corrida(p, ms) {
  return new Promise((ok, err) => {
    const t = setTimeout(() => ok(null), ms);
    p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); err(e); });
  });
}

async function abrirPagina(ev, req) {
  const c = await caches.open(CACHE);
  const k = chave(req.url);
  const guardado = (await c.match(k)) || (await c.match(req, { ignoreSearch: true }));
  ev.waitUntil(marcarUso(req.url).catch(() => {}));
  const nova = r => r && r.ok && r.type === 'basic' && !r.redirected;
  if (!guardado) {
    // sem cópia: espera a internet (sem prazo: não há o que mostrar no lugar)
    try {
      const r = await fetch(req);
      if (nova(r)) ev.waitUntil(guardarPagina(c, req.url, r.clone(), false).catch(() => {}));
      return r;
    } catch (e) { return semSinal(); }
  }
  // com cópia: "mudou?" com 1,5 s de prazo
  const daRede = pedirSeMudou(req.url, guardado);
  let r = null;
  try { r = await corrida(daRede, PRAZO); } catch (e) { return guardado; }
  if (!r) {
    // passou o prazo: abre a cópia; a resposta da internet fica guardada para a próxima vez
    ev.waitUntil(daRede.then(x => nova(x) ? guardarPagina(c, req.url, x) : null).catch(() => {}));
    return guardado;
  }
  if (r.status === 304) return guardado;
  if (nova(r)) { ev.waitUntil(guardarPagina(c, req.url, r.clone(), false).catch(() => {})); return r; }
  if (r.redirected) return fetch(req).catch(() => guardado);
  return r.ok ? r : guardado;
}

function semSinal() {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<body style="font:15px system-ui;padding:24px;color:#14181B"><h1 style="font-size:20px">Sem sinal</h1>'
    + '<p>O TapHub ainda não tinha sido aberto neste aparelho com internet. Abra de novo quando tiver conexão.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
}
