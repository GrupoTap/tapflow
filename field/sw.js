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

const VERSAO = 'S8';
const CACHE  = 'tapflow-field-' + VERSAO;

const ESSENCIAIS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
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
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // Supabase, Drive: passa direto

  // ── abrir o app ──
  if (req.mode === 'navigate') {
    ev.respondWith((async () => {
      try {
        const r = await comPrazo(req, 4000);
        const c = await caches.open(CACHE);
        c.put('./index.html', r.clone()).catch(() => {});
        return r;
      } catch (e) {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || (await c.match('./')) ||
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
