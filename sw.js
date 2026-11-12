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

const VERSAO = 'H16-S155';   // S155: issue 8 — TapDoc E28 (a arte da placa de identificação para a gráfica: doc/placa-pdf.js P1, doc/vendor/placa-letras.js e doc/vendor/qrcode.js) (431)
// const VERSAO = 'H16-S154';   // S154: issue 9 — TapDoc E27 (laudo-pdf.js S154: a foto da medição de espessura no 7.3) e celular 24 (a foto no Ultrassom) (430)
// const VERSAO = 'H16-S153';   // S153: issue 6 — TapDoc E26 (a aparência do laudo: laudo-pdf.js S153)
// const VERSAO = 'H16-S152';   // S152: issue 7, Parte 2 — TapDoc E25 (modelo de vaso, outras medidas, o desenho na ficha do vaso; mapa-3d.js M2) e celular 23 (a seção "Medidas do vaso") (429)
// const VERSAO = 'H16-S151';   // S151: issue 7 — TapDoc E24 (o mapa dos pontos de medição em 3D na revisão: doc/mapa-3d.js e doc/vendor/three.min.js; laudo-pdf.js S151) (428)
// const VERSAO = 'H16-S150';   // S150: item 81 — TapDoc E23 (os documentos de aferição no pacote do laudo; laudo-pdf.js S150), celular 22 e o motor R00.6 (427)
// const VERSAO = 'H16-S149';   // S149: itens 82, 83, 84, 88 e 92 — TapDoc E22 (revisão; laudo-pdf.js S149) e celular 21 (426)
// const VERSAO = 'H16-S148';   // S148: itens 80, 85, 89, 90, 91 e 93 — TapDoc E21 (revisão e laudo-pdf.js S148; celular: a ordem do medidor; 425)
// const VERSAO = 'H16-S147';   // S147: item 86 — TapDoc E20 (laudo assinado e arquivos da inspeção até 50 MB; 423)
// const VERSAO = 'H16-S146';   // S146: item 79 — TapDoc E19 (os textos prontos do laudo: revisão e a aba Textos do laudo; laudo-pdf.js S146; 422)
// const VERSAO = 'H16-S145';   // S145: rodada E — TapDoc E18 (a assinatura do laudo: desenho do PLH, aprovar com a digital, carimbo, pacote para o token e a conferência; laudo-pdf.js e assinatura-pdf.js S145; 421)
// const VERSAO = 'H16-S144';   // S144: rodada D2 — TapDoc E17 (laudo-pdf.js S144), Pessoas e acessos A9, TapHub Cadastros CAD4 (itens 63, 69 a 72, 74, 75, 77 e 78; 211 e 420)
// const VERSAO = 'H16-S143';   // S143: TapDoc E16 (rodada D1: texto e cara do laudo, itens 62 a 69, 73 a 76 e 78; laudo-pdf.js S143; 419)
// const VERSAO = 'H16-S142';   // S142: núcleo N8 (item 37), Pessoas e acessos A8 (itens 36 e 39), TapRH RH13 (item 38; 616)
// const VERSAO = 'H16-S141';   // S141: TapDoc E15 (rodada B da lista; 417) e o motor R00.5
// const VERSAO = 'H16-S140';   // S140: TapDoc E14 (doc/: itens 44, 49, 50, 51, 53 e 56 da lista; laudo-pdf.js S140; 416)
// const VERSAO = 'H16-S139';   // S139: Manager S139 (item 28 da lista: nomes de empresas fictícios no modo demonstração)
// const VERSAO = 'H16-S136';   // S136: o celular da empresa (210): hub H16, núcleo N7, modulos M4, Pessoas e acessos A7, Field S53
// const VERSAO = 'H15-S135';   // S135: item 27 da lista: nomes e e-mails do modo demonstração trocados por fictícios
// const VERSAO = 'H14-S134';   // S134 · TapHub Cadastros 1 (cadastros/: Clientes, Catálogo, Duplicados e as Configurações do TapHub), Manager S134 (sem CADASTROS, Configurações só do TapFlow, sem o comercial parado), TapCRM 3 (Configurações do comercial), TapFin 17, TapRH 10, TapSeg 5 e o card Cadastros (modulos M3)
// const VERSAO = 'H13-S132';   // S132 · lista de melhorias: TapHub nas telas (#10), Relatar problema ou sugerir (#1: hub H13, núcleo N6, modulos M2, acessos A6, 209), TapRH 9 (615: banco dia a dia, EzPoint até a data-base, ASO, documentos por vínculo), TapSeg 4 (626: uniforme), TapFin 16, TapCRM 2, TapGestão 3, TapDoc E12/13 (só o nome)
// const VERSAO = 'H12-S131';   // S131 · Manager: dispensa de parte do dia em Feriados; TapRH 8, TapSeg 3 · S130 · Contratos, a mobilização do mês (308): visita sem vaso, tipo do dia de campo, aba Vasos na OS do contrato (vaso novo a conferir), fiscal e gestor do fornecedor no boletim, "entra sozinho na medição" (Manager S130) · S129 · os documentos do gov.br pelo TapField (612): TapRH 7 e Field S47 · S128 · o termo de ciência e a advertência do ponto em texto formal (611): TapRH 6 e Field S46 · S127 · Ponto Etapa 2: TapRH 5 (parâmetros, banco por lote, espelho com o cálculo) e o Manager S127 (tipo de cada data em Feriados) · S126 · TapRH 4: o espelho em PDF com a logo, quadros, uma coluna por batida, ajustes e assinaturas e o nome no padrão do escritório; Field S44 (o mesmo nome em "Meus espelhos"); no banco 604 (escala automática) e 605 (folga e atestado de parte do dia) · S125 · Ponto próprio, Etapa 1: TapRH 3 (aba Ponto: Hoje, Pedidos, Espelhos com aprovação e PDF, Escalas e regras, Importar EzPoint) e Field S43 (o ponto no alto do Eu: botão único, foto, local, PIN/digital, sem internet, comprovante, lembretes, pedidos de ajuste); no banco 600, 601 e 602 · S124 · Recuperar senha e PIN: "Esqueci minha senha" na entrada, a troca obrigatória da senha provisória, a letra clara nos campos e a faixa dos pedidos (hub H12); "Pedir PIN novo" e a troca do PIN provisório na trava (núcleo N4); os pedidos e "Gerar senha/PIN provisório" em Pessoas e acessos (A5); Field S42 só com o núcleo novo; no banco a 207 · S123 · Passkey 1: a digital (ou o rosto) destrava a trava do PIN em todos os módulos (núcleo N3), "Meus aparelhos e digital" pelo nome no topo do hub, a liberação de aparelho novo e o indicador em Pessoas e acessos (A4); Field S41 só com o núcleo novo; no banco a 206 e a Edge Function confirmar-pessoa · S122 · TapGestão 2 (GE2): mês em andamento sem cor, "como é calculado", módulo com erro avisado no card, Enter grava a meta; no banco 151 (e a 521 + as notas de 2026) · S121 · TapGestão 1 (GE1): os indicadores em gestao/ (painel do mês, ano, metas e fechamento) e o card TapGestão; no banco 520, 700, 307, 415 e 150 · S120 · TapFin F15: o tipo de custo de cada subcategoria (variável, fixo ou fora dos custos) em Categorias e Orçamento, para a margem do TapGestão; no banco a 519 · S119 · TapCRM 1 (CRM1): a Equipe Comercial em crm/, fora do Manager; as propostas no nucleo/propostas.js (PR1), comuns ao Manager e ao crm/; Manager S119 (sem o comercial e sem o código parado do RH); o card TapCRM abre o crm/ · S118 · TapRH 1 (RH1): as 6 telas do RH em rh/, fora do Manager; Manager S118 (sem o menu do RH e sem o código parado da Segurança); TapSeg G2 ("Ficha do RH →" abre o rh/); o card TapRH abre o rh/ · S117 · Manager S117: saiu o código parado do Financeiro (o TapFin é a fonte; Fornecedores ficou em CADASTROS) · S116 · TapSeg 1 (G1): a Segurança do Trabalho em seg/, fora do Manager; Manager S116 (a ficha do RH sem as abas de segurança, com "Segurança desta pessoa →"); o card TapSeg abre o seg/; junto vai o Field S40 (boletim com as logos e "Enviar pelo WhatsApp") · S114 · a medição da OS comum: Manager S114 (aba Medição na OS, "Ver a medição" na T06B, anexar o assinado, reabrir; a linha da tarefa na largura toda) e TapFin F14 (avisos das medições no Painel; "Medição fechada" no painel da OS); junto com o Field S39 e, no banco, 306 → 518 → dados das 4 OS · S113 · TapDoc E11 e 12: tirar vaso da OS, reabrir para o campo, boroscopia no escritório, válvula com 3 ciclos (414) · S111 · C1-Drive: os documentos dos contratos (pastas dos dias, RDOs, medições) gravados nas pastas do cliente no Drive pelos 3 links do contrato; o cliente com a cidade na escolha do contrato; no banco a 304; o script do Drive v2 · S110 · Contratos (C1): o Manager S110 com a tela Contratos, visitas, dias de campo, RDO, medição e boletim pelo modelo do cliente; a busca do Manager sem letras embaralhadas; no banco 301 → 510 → 509 · S109 · TapFin F13: as OS de contrato no financeiro (a faixa "Medições fechadas sem título", a nota com "Pedido/Contrato" e os itens juntos por código; aparecem quando a 301, a 510 e a 509 estiverem no banco) e a busca sem letras embaralhadas; o gerador de documentos no núcleo (nucleo/documentos.js, carregado sob demanda) · S108 · o modo treino no protótipo dos contratos (P2: exercícios guiados e perguntas, só no navegador) · S107 · TapDoc E10 e 10: o CSV do medidor anexado no escritório, na revisão; o celular não exige as leituras para enviar (412); o protótipo dos contratos em prototipo/contratos/ (sem banco) · S106 · Manager S106: cadastrar o contato na própria janela (Resposta do cliente, Agendar com, Para quem) e as tarefas seguintes voltam a esperar ao reabrir (303); TapFin F12: o comprovante do cancelamento da nota (517) · S105 · a T16 conclui sozinha quando a OS está faturada no TapFin e reabre se a nota for cancelada (302 + 516); Manager S105 mostra "concluída pelo TapFin · NF …" · S104 · Manager S104: o endereço completo do cliente no card e na gaveta da OS (com o mapa pelo endereço) e a montagem da proposta escondida de quem não monta · S103 · Manager S103: a proposta agrupada como o cliente vê (documento e card), com o desconto no pé e a situação dos vasos logo abaixo dos preços; Fornecedores para todos (515) · S102 · Faturar a partir da OS: o botão "Faturar no TapFin" na T16 (Manager S102) e o painel da OS no TapFin F11 (515); Fornecedores com cidade, UF e contato · S101 · Manager S101: o grupo CADASTROS em todos os módulos (com a cor de onde se veio, ?area=) e os Duplicados com pendentes no topo e "Já revisados" recolhido · S99 · TapFin F10: duas linhas fixas no boleto e "Ver no portal nacional" (513) · S98 · token do Inter no banco (514, só função) · S97 · TapFin F9: boleto com Pix pelo Inter (508, 508b, fin-boleto) e as correções da 512 · S96 · TapFin F8: descrição da nota editável e os ajustes do teste de 26/10 (511) · S95 · TapFin 7: contas que já têm nota (507, fin F7) · S94 · R06a: o laudo em PDF no TapDoc do escritório (410, TapDoc E9) · S93 · R05a: a revisão (409, E8)
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
  // S76: hub, Manager, Field e fin/ pedem todos ?v=N2 — saíram as linhas ?v=N1. S123: todos pedem ?v=N3 (Passkey 1). S124: ?v=N4. S131: ?v=N5 (IndexedDB do iPhone).
  './nucleo/nucleo.js?v=N8',
  './nucleo/nucleo.css?v=N8',
  './nucleo/config.js?v=N8',
  // H10 · S81: a tabela dos módulos e o menu "Trocar de módulo" (mesmo ?v= das páginas)
  './nucleo/modulos.js?v=M4',
  // S110 · o gerador de documentos (o Manager o pede com ?v=D1; o jszip e o pdfmake vêm sob demanda)
  './nucleo/documentos.js?v=D1',
  // S74 · TapFin: a página (S76 · TapFin 2: o plano B fin/util.js saiu)
  './fin/',
  // S77 · TapDoc do escritório (R02b1) e o motor de cálculo que ele usa
  './doc/',
  './doc/motor-calculo-nr13.js?v=R00.6',
  // S88 · Acessos P1: a tela do admin
  './acessos/',
  // S116 · TapSeg 1: a Segurança do Trabalho
  './seg/',
  // S118 · TapRH 1: os Recursos Humanos
  './rh/',
  // S119 · TapCRM 1: o comercial, e as propostas comuns ao Manager e ao crm/ (mesmo ?v= das páginas)
  './crm/',
  './nucleo/propostas.js?v=PR1',
  // S121 · TapGestão 1: os indicadores
  './gestao/',
  // S134 · TapHub Cadastros 1: Clientes, Catálogo, Duplicados e as Configurações do TapHub
  './cadastros/'
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
  // S94 (R06a): as bibliotecas do PDF do laudo (doc/vendor/, ~2,8 MB, sempre com ?v=)
  // vão do cache primeiro: com o prazo de 4 s do núcleo, num sinal fraco, o download
  // grande cairia no "sem resposta" e o laudo não sairia.
  if (resto.startsWith('doc/vendor/')) {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = await c.match(req);
      if (guardado) return guardado;
      const r = await fetch(req);
      if (r && r.ok && r.type === 'basic') c.put(req, r.clone()).catch(() => {});
      return r;
    })());
    return;
  }
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
