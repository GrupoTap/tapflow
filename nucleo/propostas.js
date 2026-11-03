/* ============================================================================
 * nucleo/propostas.js — PR1 · as PROPOSTAS, comuns ao Manager (aba Proposta da OS)
 * e ao TapCRM (crm/, ficha do negócio)
 * ----------------------------------------------------------------------------
 * Decisão do Bruno (C2, 03/11/2026): as propostas ficam num arquivo só, para
 * mudar num lugar só. Saiu do Manager S118 por modulos/tapcrm/ferr/gerar_crm.js:
 * o motor .docx (modelos, planos, logo do cliente, anexo dos vasos), a proposta
 * como o cliente vê (S103), Registrar envio e Resposta do cliente (com o
 * "+ Cadastrar outra pessoa…"), e o desconto geral.
 *
 * É um <script> comum (sem módulo): as funções ficam globais, como eram no
 * Manager. A página que carrega este arquivo TEM DE ter (o contrato):
 *   BRL, DEMO, PAPEIS_CONTATO, SUPABASE_ANON_KEY, SUPABASE_URL, _semDuploEnvio_, abrirModal, dataBR, esc, fecharModal, get, isoHoje, norm, podeEscritorio, renovarToken, rpc, sessao, toast
 *   e propostaGravada(qual, ctx) — chamada depois de registrar o envio
 *   (qual = 'envio') ou a resposta do cliente ('resposta'): quem repinta é a
 *   página (o Manager repinta a OS; o crm/ repinta o negócio).
 * A página NÃO pode declarar de novo nenhum nome daqui (daria erro de carga).
 * Carregar ANTES do <script> da página, com ?v= igual ao do sw.js da raiz.
 * ========================================================================== */
'use strict';

let _jszip = null;

function carregarJSZip(){
  if (_jszip) return _jszip;
  _jszip = new Promise((ok, err) => {
    if (window.JSZip) return ok(window.JSZip);
    const s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s2.onload  = () => window.JSZip ? ok(window.JSZip)
      : err(new Error('A biblioteca de .docx carregou, mas não inicializou.'));
    s2.onerror = () => err(new Error('Não consegui baixar a biblioteca de .docx. Sem internet?'));
    document.head.appendChild(s2);
  });
  return _jszip;
}

// ── o modelo vem do Storage, e fica na memória ──────────────────────────────
// 450 KB por modelo. Baixar de novo a cada geração seria desperdício óbvio
// para quem emite três propostas seguidas do mesmo tipo.
const _modelosCache = {};

/** Quantos cabeçalhos deste modelo trazem logomarca de cliente. */
async function logoDeClienteNoModelo(bytes){
  const JSZipLib = await carregarJSZip();
  const zip = await JSZipLib.loadAsync(bytes);
  let n = 0;
  for (const nome of Object.keys(zip.files)){
    if (!/^word\/header\d*\.xml$/.test(nome)) continue;
    const t = await zip.file(nome).async('string');
    if ((t.match(/r:embed="/g) || []).length >= 2) n++;
  }
  return n;
}

async function baixarModelo(path){
  if (_modelosCache[path]) return _modelosCache[path];
  const url = SUPABASE_URL + '/storage/v1/object/modelos/' + encodeURIComponent(path);
  const pega = async () => fetch(url, { headers: Object.assign(
    { apikey: SUPABASE_ANON_KEY },
    sessao.token ? { Authorization: 'Bearer ' + sessao.token } : {}) });
  let r = await pega();
  if (r.status === 401 && sessao.refresh && await renovarToken()) r = await pega();
  if (r.status === 400 || r.status === 404)
    throw new Error('O modelo "' + path + '" não está no bucket `modelos`. '
      + 'Suba o arquivo pelo painel do Supabase (Storage → modelos).');
  if (r.status === 403)
    throw new Error('Sem permissão para ler o bucket `modelos`. '
      + 'Falta a política de leitura — veja o fim do 23_gerador_modelos.sql.');
  if (!r.ok) throw new Error('Não consegui baixar o modelo (HTTP ' + r.status + ').');
  const b = await r.arrayBuffer();
  _modelosCache[path] = b;
  return b;
}

// ── utilidades do XML do Word ───────────────────────────────────────────────
const _xmlEsc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const _semAcento = s => String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();

function _tags(xml, tag){
  return xml.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>[\\s\\S]*?<\\/' + tag + '>','g')) || [];
}

function _textoCelula(tc){
  return [...tc.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
}

/** Escreve no PRIMEIRO <w:t> da célula e esvazia os outros — assim o texto
 *  novo herda a formatação do primeiro trecho e não sobra resto do antigo. */
function _escreveCelula(tc, txt){
  let n = 0;
  const nova = tc.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (m,a,b,c) => {
    n++; return n === 1 ? a + _xmlEsc(txt) + c : a + c;
  });
  // célula sem nenhum <w:t> (parágrafo vazio): não dá para escrever, devolve como está
  return n ? nova : tc;
}

/**
 * Acha a tabela de itens: 5 colunas, com "Valor Unit..." e "Valor Total" no
 * cabeçalho. É o mesmo reconhecimento do gerador antigo — os modelos 24, 29 e
 * 30 têm; os outros não, e isso está registrado em `modelos_proposta.tem_tabela`.
 */
function acharTabelaItens(xml){
  for (const tbl of _tags(xml,'w:tbl')){
    const linhas = _tags(tbl,'w:tr');
    if (linhas.length < 2) continue;
    const cabec = _tags(linhas[0],'w:tc').map(_textoCelula);
    const n = cabec.map(_semAcento);
    if (cabec.length === 5
        && n.some(h => h.includes('valor unit'))
        && n.some(h => h.includes('valor') && h.includes('total'))){
      const dados = linhas.slice(1);
      let linhaTotal = null, linhasItem = dados;
      if (dados.length && _tags(dados[dados.length-1],'w:tc').length < 5){
        linhaTotal = dados[dados.length-1];
        linhasItem = dados.slice(0,-1);
        // S103: o pé pode ter Subtotal e Desconto antes do Total (tabela já escrita)
        while (linhasItem.length && _tags(linhasItem[linhasItem.length-1],'w:tc').length < 5)
          linhasItem = linhasItem.slice(0,-1);
      }
      if (!linhasItem.length) continue;
      return {
        tabela: tbl,
        antes: tbl.slice(0, tbl.indexOf(linhas[0])),
        cabecalho: linhas[0],
        molde: linhasItem[0],          // a fôrma para as linhas novas
        linhasItem, linhaTotal,
        itens: linhasItem.map(tr => {
          const cs = _tags(tr,'w:tc');
          return { seq:_textoCelula(cs[0]), descricao:_textoCelula(cs[1]),
                   qtd:_textoCelula(cs[2]), unitario:_textoCelula(cs[3]),
                   total:_textoCelula(cs[4]) };
        })
      };
    }
  }
  return null;
}

// ── ITEM 3 (S29): OS TRÊS PLANOS ────────────────────────────────────────────
// O modelo 24 tem três tabelas iguais (7.1 Básico, 7.2 Padrão, 7.3 Premium) e
// `acharTabelaItens` parava na PRIMEIRA — o app preenchia justo o Básico, o
// plano que a Engetap não quer vender. Agora o motor acha TODAS e diz qual é
// qual. Híbrido, na ordem: o título logo acima da tabela ("Plano Básico"), o
// rodapé da própria tabela ("Total Geral · Plano Básico"), e só então a ordem
// no documento (1ª/2ª/3ª) quando são exatamente três. Casar pelo texto
// sobrevive a alguém reordenar as seções; a ordem sobrevive a alguém reescrever
// o título. Só há "modo planos" quando os TRÊS são reconhecidos; com uma tabela
// só (o modelo 30, o 29) o comportamento é o de sempre.
const _PLANOS_ID = ['basico','padrao','premium'];

function _planoDoTexto(t){
  const n = _semAcento(t);
  if (/plano\s*basico/.test(n)) return 'basico';
  if (/plano\s*padrao/.test(n)) return 'padrao';
  if (/plano\s*premium/.test(n)) return 'premium';
  return null;
}

function acharTabelasItens(xml){
  const out = [];
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  let m;
  while ((m = re.exec(xml)) !== null){
    const t = acharTabelaItens(m[0]);
    if (!t) continue;
    // o último parágrafo com texto antes da tabela (até 6 mil caracteres atrás)
    const antes = xml.slice(Math.max(0, m.index - 6000), m.index);
    const ps = antes.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    let titulo = '';
    for (let k = ps.length - 1; k >= 0; k--){
      const tx = [...ps[k].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('').trim();
      if (tx){ titulo = tx; break; }
    }
    const rod = t.linhaTotal ? [...t.linhaTotal.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('') : '';
    t.inicio = m.index; t.fim = m.index + m[0].length;
    t.titulo = titulo;
    t.plano = _planoDoTexto(titulo) || _planoDoTexto(rod);
    out.push(t);
  }
  const ids = out.map(t => t.plano);
  if (out.length === 3 && !_PLANOS_ID.every(p => ids.includes(p)))
    out.forEach((t, k) => { t.plano = _PLANOS_ID[k]; t.pelaOrdem = true; });
  return out;
}

/** O modelo tem os três planos? (é o que decide mostrar a prévia) */
function modeloTemPlanos(tabelas){
  const ids = (tabelas || []).map(t => t.plano);
  return _PLANOS_ID.every(p => ids.filter(x => x === p).length === 1);
}

const _modelosPlanos = {};

async function planosNoModelo(path, bytes){
  if (path in _modelosPlanos) return _modelosPlanos[path];
  const JSZipLib = await carregarJSZip();
  const zip = await JSZipLib.loadAsync(bytes);
  const f = zip.file('word/document.xml');
  const xml = f ? await f.async('string') : '';
  return (_modelosPlanos[path] = modeloTemPlanos(acharTabelasItens(xml)));
}

/** A célula da linha do plano: o texto do plano (azul, no modelo), a faixa de
 *  itens (vermelha) e o trecho comum (preto, na linha de baixo). As cores são
 *  do MODELO: cada pedaço herda a formatação do trecho do Word que já tinha
 *  aquela cor. Se a célula não tiver algum dos três, usa a do Padrão. */
function _runsDaCelula(tc){
  return (tc.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []).filter(r => /<w:t[ >]/.test(r)).map(r => ({
    rPr: (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0],
    cor: ((r.match(/<w:color w:val="([^"]+)"/) || [])[1] || '').toUpperCase(),
    txt: [...r.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('')
  }));
}

function _estiloPlano(tc){
  const rs = _runsDaCelula(tc);
  if (!rs.length) return null;
  const faixa = rs.find(r => /itens?\s*3\./i.test(r.txt)) || rs.find(r => r.cor === 'FF0000');
  const texto = rs.find(r => r !== faixa && r.cor && r.cor !== 'FF0000' && r.txt.trim()) || rs[0];
  const trecho = rs.find(r => /vasos/i.test(r.txt)) || null;
  const ps = tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  const pPr = ps.length ? ((ps[0].match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0]) : '';
  const tcPr = (tc.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [''])[0];
  return { texto: texto && texto.rPr, faixa: faixa && faixa.rPr, trecho: trecho && trecho.rPr, pPr, tcPr };
}

function _escreveCelulaPlano(tc, pecas, moldePadrao){
  const e = _estiloPlano(tc) || {};
  const m = moldePadrao || {};
  const rPrTexto  = e.texto  || m.texto  || '';
  const rPrFaixa  = e.faixa  || m.faixa  || rPrTexto;
  const rPrTrecho = e.trecho || m.trecho || rPrTexto.replace(/<w:color [^>]*\/>/, '');
  const pPr = e.pPr || m.pPr || '';
  const run = (rPr, t) => '<w:r>' + rPr + '<w:t xml:space="preserve">' + _xmlEsc(t) + '</w:t></w:r>';
  let corpo = '<w:p>' + pPr + run(rPrTexto, pecas.texto) + (pecas.faixa ? run(rPrFaixa, ' ' + pecas.faixa) : '') + '</w:p>';
  if (pecas.trecho) corpo += '<w:p>' + pPr + run(rPrTrecho, pecas.trecho) + '</w:p>';
  const tcPr = e.tcPr || '';
  return '<w:tc>' + tcPr + corpo + '</w:tc>';
}

/** Espelho de `tf__preco_plano` (51_): percentual sobre o unitário do Padrão,
 *  arredondado ao múltiplo de `arred` (meio sobe). A conta passa por centavos
 *  inteiros — 1000 × 1,085 em ponto flutuante dá 1084,9999… e arredondaria
 *  para baixo, discordando do banco. */
function precoPlano(unit, pct, arred){
  const cent = Math.round(Math.round(Number(unit) * 100) * (100 + Number(pct)) / 100);
  const a = Math.round(Number(arred || 0) * 100);
  return a > 0 ? Math.round(cent / a) * a / 100 : cent / 100;
}

const _brlDoc = v => BRL(v).replace(/ /g, ' ');

let PLANOS = null;

const PLANOS_DEMO = {
  basico_texto:'Todos os requisitos da NR-13 + acesso ao TapWeb + Documentação TapWeb', basico_faixa:'Itens 3.3 ao 3.10',
  padrao_texto:'Todos os requisitos da NR-13 + acesso ao TapWeb + Documentação TapWeb + Agenda + Acompanhamento', padrao_faixa:'Itens 3.3 ao 3.12',
  premium_texto:'Tudo do Plano Padrão + Localização + Treinamento NR-13 e TapWeb + Check-list de Compressores –', premium_faixa:'Itens 3.3 ao 3.16',
  trecho_comum:'(Vasos Cat. III, IV e V)', basico_pct:-9, premium_pct:34, arredondar:10 };

async function carregarPlanos(forcar){
  if (PLANOS && !forcar) return PLANOS;
  if (DEMO) return (PLANOS = Object.assign({}, PLANOS_DEMO));
  try{
    const r = await get('parametros_planos?select=*&id=eq.GLOBAL');
    PLANOS = (r && r[0]) || null;
  }catch(e){ PLANOS = null; }
  return PLANOS;
}

// ════════════════════════════════════════════════════════════════════════════
// S103 · A PROPOSTA COMO O CLIENTE VÊ (decisões do Bruno, 27/10 — 1b, 2a, 3a)
// ----------------------------------------------------------------------------
// O card continua POR VASO (é o que a OS leva ao campo). O documento, e a vista
// "Como o cliente vê" do card, juntam as linhas: mesmo serviço (o texto antes de
// " — <TAG>") com o mesmo preço unitário vira uma linha, com a quantidade somada
// e o nome no plural. Preço diferente fica separado. Linha digitada (sem vaso)
// fica como está. Deslocamento sai 1 × o valor total, sem km. As linhas levam o
// preço CHEIO; o desconto vira uma linha no fim (Subtotal · Desconto X% · Total
// Geral). O total é a soma dos totais das linhas do card — bate ao centavo.
// Uma função só, para o papel e a tela não discordarem.
const _r2 = v => Math.round((Number(v) || 0) * 100) / 100;

const _PLURAL_SERV = {
  'inspecao interna': 'Inspeções Internas', 'inspecao externa': 'Inspeções Externas',
  'inspecao interna e externa': 'Inspeções Internas e Externas', 'inspecao nr-13': 'Inspeções NR-13',
  'calibracao de manometro': 'Calibração de Manômetros', 'calibracao de valvula': 'Calibração de Válvulas' };

/** O plural do nome do serviço: os conhecidos pela tabela; o resto, pela última palavra. */
function pluralServico(serv){
  const t = String(serv || '').trim();
  const k = norm(t).replace(/\s+/g, ' ');
  if (_PLURAL_SERV[k]) return _PLURAL_SERV[k];
  return t.replace(/(\S+)$/, w => /ão$/.test(w) ? w.slice(0, -2) + 'ões'
    : /[aeiouáéíóúâêô]$/i.test(w) ? w + 's' : /[rz]$/i.test(w) ? w + 'es' : w);
}

const ehDeslocamento = d => /^(mobilizacao\s*(\/|e)\s*)?desloca/.test(norm(String(d || '')).trim());

/** "Deslocamento (214 km × R$ 2,50/km)" → "Deslocamento": o papel não fala de km. */
function limparKm(d){
  return String(d || '')
    .replace(/\s*\([^)]*\bkm\b[^)]*\)/gi, '')
    .replace(/\s*[—–-]\s*[\d.,]+\s*km\b.*$/i, '')
    .replace(/\s*[\d.,]+\s*km\b(\s*[x×]\s*R?\$?\s*[\d.,]+(\s*\/\s*km)?)?/gi, '')
    .replace(/\s*R\$\s*\/\s*km\b/gi, '')
    .replace(/[\s,;:·—–-]+$/, '').trim();
}

const _qtdTxt = q => Number.isInteger(Number(q)) ? String(Number(q))
  : Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

const pctTxt = p => String(Math.round(Number(p) * 100) / 100).replace('.', ',') + '%';

/**
 * Entra: as linhas por vaso [{descricao, qtd, preco, desc, total, equip}] (total =
 * o da linha, já com o desconto dela; sem ele, a tela calcula como o banco).
 * Sai: { linhas: [{descricao, qtd, unit, cheio, venda, origens, grupo, tags}],
 *        subtotal, desconto, pct, total }.
 */
function agruparParaCliente(entrada){
  const out = [], idx = {};
  (entrada || []).forEach((l, i) => {
    const qtd = Number(l.qtd) || 0, preco = Number(l.preco) || 0;
    const cheio = _r2(qtd * preco);
    const venda = l.total != null && l.total !== '' ? Number(l.total)
      : _r2(cheio * (1 - (Number(l.desc) || 0) / 100));
    const d = String(l.descricao || '');
    const k = d.indexOf(' — ');
    if (l.equip && k > 0){
      const serv = d.slice(0, k).trim();
      const ch = 's|' + norm(serv) + '|' + Math.round(preco * 100);
      if (idx[ch] == null){ idx[ch] = out.length;
        out.push({ grupo: 'vaso', servico: serv, qtd: 0, unit: preco, cheio: 0, venda: 0, origens: [], tags: [] }); }
      const g = out[idx[ch]];
      g.qtd += qtd; g.cheio += cheio; g.venda += venda; g.origens.push(i); g.tags.push(d.slice(k + 3).trim());
    } else if (ehDeslocamento(d)){
      const nome = limparKm(d) || 'Deslocamento';
      const ch = 'd|' + norm(nome);
      if (idx[ch] == null){ idx[ch] = out.length;
        out.push({ grupo: 'deslocamento', descricao: nome, qtd: 1, cheio: 0, venda: 0, origens: [] }); }
      const g = out[idx[ch]];
      g.cheio += cheio; g.venda += venda; g.origens.push(i);
    } else {
      out.push({ grupo: null, descricao: d, qtd, unit: preco, cheio, venda, origens: [i] });
    }
  });
  out.forEach(g => {
    g.cheio = _r2(g.cheio); g.venda = _r2(g.venda);
    if (g.grupo === 'vaso') g.descricao = g.qtd > 1 ? pluralServico(g.servico) : g.servico;
    if (g.grupo === 'deslocamento') g.unit = g.cheio;
  });
  const subtotal = _r2(out.reduce((a, g) => a + g.cheio, 0));
  const total = _r2(out.reduce((a, g) => a + g.venda, 0));
  const desconto = _r2(subtotal - total);
  return { linhas: out, subtotal, total, desconto, pct: subtotal > 0 ? desconto / subtotal * 100 : 0 };
}

/** As linhas no formato que a tabela do .docx (e o registro do documento) usa. */
function linhasDoc(ag){
  return ag.linhas.map(g => ({ descricao: g.descricao, qtd: _qtdTxt(g.qtd), unitario: _brlDoc(g.unit),
    total: _brlDoc(g.cheio), qtd_num: g.qtd, unitario_num: g.unit, valor_total_num: g.cheio,
    venda_num: g.venda, desconto_pct: g.cheio > 0 ? _r2((1 - g.venda / g.cheio) * 100) : 0 }));
}

/** O resumo do pé da tabela (o que reescreverTabela escreve). */
const resumoDoc = ag => ({ subtotal: ag.subtotal, desconto: ag.desconto, pct: ag.pct, total: ag.total });

/** …e de uma proposta registrada (as que o tf_itens_proposta_doc lê, sem juntar). */
async function linhasPorVasoProposta(propId){
  const base = 'proposta_itens?select=descricao,quantidade,preco_unitario,desconto_pct,total,equipamento_id,ordem,os_item_id';
  const fim = '&proposta_id=eq.' + propId + '&order=ordem.nullslast,id';
  // a linha que veio da OS (fornecimento) leva a descrição e o vaso de lá; se o
  // embed não responder, vale o que a própria linha da proposta tem
  let r;
  try{ r = await get(base + ',os_itens(descricao,equipamento_id,aprovado)' + fim); }
  catch(e){ r = await get(base + fim); }
  return (r || []).filter(i => !(i.os_itens && i.os_itens.aprovado === false)).map(i => ({
    descricao: i.descricao || (i.os_itens && i.os_itens.descricao), qtd: i.quantidade, preco: i.preco_unitario,
    desc: i.desconto_pct, total: i.total, equip: i.equipamento_id || (i.os_itens && i.os_itens.equipamento_id) }));
}

/** A prévia da tabela do papel (gerador da OS e do negócio, e a vista do card). */
function htmlTabelaCliente(ag, o){
  o = o || {};
  const edita = o.editavel ? g => g.grupo === 'vaso' : () => false;
  return '<div style="overflow-x:auto;margin:0 0 ' + (o.margem == null ? 14 : o.margem) + 'px"><table class="tbl agTbl"><thead><tr>'
    + '<th>#</th><th>Item</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th>'
    + '</tr></thead><tbody>'
    + ag.linhas.map((g, k) => '<tr><td class="mono">' + (k + 1) + '</td><td>' + esc(g.descricao)
        + (o.tags && g.grupo === 'vaso' && g.tags.length ? '<span class="agTags">' + esc(g.tags.join(' · ')) + '</span>' : '')
        + '</td><td class="num">' + esc(_qtdTxt(g.qtd)) + '</td>'
        + '<td class="num">' + (edita(g)
            ? '<input class="mini" style="width:96px;text-align:right" type="number" step="0.01" min="0" '
              + 'inputmode="decimal" data-gpreco="' + k + '" value="' + (g.unit || '') + '" '
              + 'title="Preço de cada um: vale para as ' + g.origens.length + ' linhas do grupo">'
            : esc(BRL(g.unit))) + '</td>'
        + '<td class="num">' + esc(BRL(g.cheio)) + '</td></tr>').join('')
    + '</tbody><tfoot>'
    + (ag.desconto > 0
        ? '<tr class="agSub"><td colspan="4" class="num">Subtotal</td><td class="num">' + esc(BRL(ag.subtotal)) + '</td></tr>'
          + '<tr class="agDesc"><td colspan="4" class="num">Desconto ' + esc(pctTxt(ag.pct)) + '</td>'
          + '<td class="num">−' + esc(BRL(ag.desconto)) + '</td></tr>' : '')
    + '<tr class="agTot"><td colspan="4" class="num">Total Geral</td><td class="num" data-agtot>'
    + esc(BRL(ag.total)) + '</td></tr></tfoot></table></div>';
}

/** A tabela de vasos (mesmas colunas e amarelo do papel), para as prévias. */
function htmlVasosCliente(a){
  const ls = (a && a.linhas) || [];
  if (!ls.length) return '';
  return '<div class="agVasosT">' + esc(tituloVasos(a)) + '</div>'
    + '<div class="anexoPrev"><div style="overflow-x:auto"><table class="tbl"><thead><tr>'
    + ANEXO_COLS.map(c => '<th>' + esc(c[1]) + '</th>').join('') + '</tr></thead><tbody>'
    + ls.map(l => '<tr>' + ANEXO_COLS.map(([k]) => '<td' + (l.venc && l.venc[k] ? ' class="venc"' : '') + '>'
        + esc(l[k] || '') + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div></div>';
}

const tituloVasos = a => 'Situação dos vasos (TapWeb' + (a && a.tapweb_em ? ', atualizado em ' + a.tapweb_em : '') + ')';

/** A mesma conta do `tf_anexo_vasos`, para a proposta que ainda está sendo
 *  montada (sem registro, não há o que perguntar ao banco). */
function anexoDosEquip(equip, ids){
  const hoje = isoHoje(), br = d => d ? dataBR(String(d).slice(0, 10)) : '';
  const set = new Set((ids || []).filter(Boolean));
  const es = (equip || []).filter(e => set.has(e.equipamento_id));
  const tem = e => !!(e.tapweb_em || e.tapweb_desativado_em || e.venc_insp_externa || e.venc_insp_interna
                      || e.venc_calib_manometro || e.venc_calib_valvula);
  if (!es.some(tem)) return { linhas: [] };
  const vence = (e, c) => !e.tapweb_desativado_em && !!e[c] && String(e[c]).slice(0, 10) <= hoje;
  let ult = null;
  es.forEach(e => { if (e.tapweb_em && (!ult || String(e.tapweb_em) > ult)) ult = String(e.tapweb_em); });
  const linhas = es.slice().sort((a, b) => String(a.tag || '').toUpperCase().localeCompare(String(b.tag || '').toUpperCase()))
    .map(e => { const v = { externa: vence(e, 'venc_insp_externa'), interna: vence(e, 'venc_insp_interna'),
                            manometro: vence(e, 'venc_calib_manometro'), valvula: vence(e, 'venc_calib_valvula') };
      return { tag: e.tag, status: !tem(e) ? 'Sem dados do TapWeb' : e.tapweb_desativado_em ? 'Desativado'
               : (v.externa || v.interna || v.manometro || v.valvula) ? 'Vencido' : 'Em dia',
               desativado: br(e.tapweb_desativado_em), externa: br(e.venc_insp_externa), interna: br(e.venc_insp_interna),
               manometro: br(e.venc_calib_manometro), valvula: br(e.venc_calib_valvula), venc: v }; });
  return { linhas, tapweb_em: ult ? br(ult) : null, hoje: dataBR(hoje) };
}

/** A descrição da linha do plano como ela vai para o banco (a do Padrão). */
const descricaoLinhaPlano = pl => [pl.padrao_texto, pl.padrao_faixa, pl.trecho_comum]
  .map(x => String(x || '').trim()).filter(Boolean).join(' ');

/** Qual linha é a do plano: a que começa com o texto do Padrão; senão, a 1ª. */
function linhaDoPlano(itens, pl){
  if (!pl || !itens || !itens.length) return 0;
  const alvo = norm(pl.padrao_texto).trim();
  const k = alvo ? itens.findIndex(i => norm(i.descricao).trim().startsWith(alvo)) : -1;
  return k >= 0 ? k : 0;
}

/** As três tabelas a partir dos itens do Padrão. Devolve null se faltar número. */
function montarPlanos(itens, idx, pl){
  if (!pl || !itens || !itens.length) return null;
  const base = itens[idx];
  if (!base || base.unitario_num == null || base.qtd_num == null) return null;
  const qtd = Number(base.qtd_num), unit = Number(base.unitario_num);
  // S103: as linhas levam o preço CHEIO (`valor_total_num`) e o que se cobra
  // (`venda_num`); o desconto da linha do plano vale igual nos três planos
  const fracVenda = Number(base.valor_total_num) > 0 && base.venda_num != null
    ? Number(base.venda_num) / Number(base.valor_total_num) : 1;
  const venda = l => l.venda_num != null ? Number(l.venda_num) : Number(l.valor_total_num) || 0;
  const out = {};
  _PLANOS_ID.forEach(pid => {
    const pct = pid === 'basico' ? Number(pl.basico_pct) : pid === 'premium' ? Number(pl.premium_pct) : 0;
    const u = pid === 'padrao' ? unit : precoPlano(unit, pct, pl.arredondar);
    const tot1 = pid === 'padrao' ? Number(base.valor_total_num) : Math.round(u * qtd * 100) / 100;
    const ven1 = pid === 'padrao' ? venda(base) : _r2(tot1 * fracVenda);
    const linhas = itens.map((it, k) => k !== idx ? it : Object.assign({}, it, {
      descricao: [pl[pid + '_texto'], pl[pid + '_faixa'], pl.trecho_comum].filter(Boolean).join(' '),
      pecas: { texto: String(pl[pid + '_texto'] || ''), faixa: String(pl[pid + '_faixa'] || ''),
               trecho: String(pl.trecho_comum || '') },
      unitario: _brlDoc(u), total: _brlDoc(tot1), valor_total_num: tot1, unitario_num: u, venda_num: ven1 }));
    const subtotal = _r2(linhas.reduce((s, l) => s + (Number(l.valor_total_num) || 0), 0));
    const total = _r2(linhas.reduce((s, l) => s + venda(l), 0));
    const desconto = _r2(subtotal - total);
    out[pid] = { linhas, total, unit: u, pct, subtotal, desconto,
                 resumo: { subtotal, desconto, total, pct: subtotal > 0 ? desconto / subtotal * 100 : 0 } };
  });
  return out;
}

/**
 * Reescreve a tabela com as linhas dadas — quantas forem. O gerador antigo só
 * conseguia editar as linhas que já existiam no modelo; aqui a primeira linha
 * vira fôrma e a tabela cresce ou encolhe conforme a OS.
 */
function reescreverTabela(t, linhas, totalTexto){
  // S103: com o resumo (objeto), o pé ganha "Subtotal" e "Desconto X%" antes
  // do Total Geral, numa cópia da própria linha do total do modelo
  const resumo = (totalTexto && typeof totalTexto === 'object') ? totalTexto : null;
  if (resumo) totalTexto = _brlDoc(resumo.total);
  const novas = linhas.map((it, i) => {
    // a linha do plano usa como fôrma a PRÓPRIA linha 1 do modelo (é ela que
    // tem as três cores); as outras, a fôrma de sempre
    let tr = it.pecas ? t.linhasItem[0] : t.molde;
    const cs = _tags(tr,'w:tc');
    const vals = [String(i+1), it.descricao, it.qtd, it.unitario, it.total];
    cs.forEach((c, idx) => {
      tr = tr.replace(c, idx === 1 && it.pecas
        ? _escreveCelulaPlano(c, it.pecas, t.moldePlano)
        : _escreveCelula(c, vals[idx]));
    });
    return tr;
  });
  let rodape = t.linhaTotal;
  let extras = '';
  if (rodape){
    const cs = _tags(rodape,'w:tc');
    const ult = cs[cs.length-1];
    if (resumo && resumo.desconto > 0){
      const linhaPe = (rot, val) => {
        if (cs.length < 2) return rodape.replace(ult, _escreveCelula(ult, rot + ': ' + val));
        return rodape.replace(cs[0], _escreveCelula(cs[0], rot)).replace(ult, _escreveCelula(ult, val));
      };
      extras = linhaPe('Subtotal', _brlDoc(resumo.subtotal))
             + linhaPe('Desconto ' + pctTxt(resumo.pct), '−' + _brlDoc(resumo.desconto));
    }
    rodape = rodape.replace(ult, _escreveCelula(ult, totalTexto));
  }
  return t.antes + t.cabecalho + novas.join('') + extras + (rodape || '') + '</w:tbl>';
}

function contarImagensCabecalho(nome, xml){
  return (nome.startsWith('word/header') ? (xml.match(/r:embed="/g) || []).length : 0);
}

/** Tira a última imagem do cabeçalho, apagando o <w:r> inteiro que a contém. */
function removerLogoCliente(xml){
  const ult = xml.lastIndexOf('r:embed="');
  if (ult < 0) return xml;
  const ini = xml.lastIndexOf('<w:r ', ult) >= 0
    ? Math.max(xml.lastIndexOf('<w:r ', ult), xml.lastIndexOf('<w:r>', ult))
    : xml.lastIndexOf('<w:r>', ult);
  if (ini < 0) return xml;
  const fim = xml.indexOf('</w:r>', ult);
  if (fim < 0) return xml;
  return xml.slice(0, ini) + xml.slice(fim + 6);
}

/** Busca a logo do cliente e devolve PNG já recortado: {bytes, largura, altura}
 *  — ou null se o cliente não tem logo (ou se ela não abre). */
async function prepararLogoCliente(clienteId){
  if (!clienteId || DEMO) return null;
  let url = null;
  try{
    const r = await get('clientes_logo?select=original,thumb&cliente_id=eq.' + clienteId);
    url = r && r[0] ? (r[0].original || r[0].thumb) : null;
  }catch(e){ return null; }
  if (!url) return null;
  const img = await new Promise(ok => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url;
  });
  if (!img) return null;
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data;
  // "vazio" = transparente, ou branco quase puro (a miniatura antiga é JPEG com fundo branco)
  const vazio = k => px[k+3] < 12 || (px[k] > 247 && px[k+1] > 247 && px[k+2] > 247);
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++){
    for (let x = 0; x < cv.width; x++){
      if (!vazio((y * cv.width + x) * 4)){
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;                               // imagem toda vazia
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
  const blob = await new Promise(ok => out.toBlob(ok, 'image/png'));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), largura: w, altura: h,
           dataUrl: out.toDataURL('image/png') };
}

/** Troca a ÚLTIMA imagem do cabeçalho pela logo. Mexe em três lugares: a
 *  relação da imagem (para onde ela aponta), o arquivo de mídia, e o tamanho
 *  do desenho dentro daquele <w:r>. Devolve o XML novo, ou null se não achou
 *  como trocar (aí quem chamou cai no "tirar", que é o comportamento antigo). */
async function trocarLogoCliente(zip, nomeHeader, xml, logo){
  const ult = xml.lastIndexOf('r:embed="');
  if (ult < 0) return null;
  const rid = xml.slice(ult + 9, xml.indexOf('"', ult + 9));
  const relNome = nomeHeader.replace(/^word\//, 'word/_rels/') + '.rels';
  const relF = zip.file(relNome);
  if (!relF) return null;
  let rels = await relF.async('string');
  const reRel = new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*/>');
  const m = rels.match(reRel);
  if (!m) return null;
  const alvoMidia = 'media/tf_logo_cliente_' + nomeHeader.replace(/\D/g,'') + '.png';
  rels = rels.replace(m[0], m[0].replace(/Target="[^"]*"/, 'Target="' + alvoMidia + '"'));
  zip.file(relNome, rels);
  zip.file('word/' + alvoMidia, logo.bytes);

  // o <w:r> que contém a imagem — os mesmos limites do "tirar"
  const ini = Math.max(xml.lastIndexOf('<w:r ', ult), xml.lastIndexOf('<w:r>', ult));
  const fim = xml.indexOf('</w:r>', ult);
  if (ini < 0 || fim < 0) return xml;
  let run = xml.slice(ini, fim);
  const ext = run.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
  if (ext){
    const W = Number(ext[1]), H = Number(ext[2]);
    const prop = logo.largura / logo.altura;
    let cx = W, cy = Math.round(W / prop);
    if (cy > H){ cy = H; cx = Math.round(H * prop); }
    run = run.replace(/<wp:extent cx="\d+" cy="\d+"\/>/, '<wp:extent cx="' + cx + '" cy="' + cy + '"/>')
             .replace(/<a:ext cx="\d+" cy="\d+"\/>/, '<a:ext cx="' + cx + '" cy="' + cy + '"/>');
    // imagem ancorada: centraliza na caixa original deslocando a posição
    const dx = Math.round((W - cx) / 2), dy = Math.round((H - cy) / 2);
    run = run.replace(/(<wp:positionH\b[^>]*>\s*<wp:posOffset>)(-?\d+)(<\/wp:posOffset>)/,
                      (t, a, v, b) => a + (Number(v) + dx) + b)
             .replace(/(<wp:positionV\b[^>]*>\s*<wp:posOffset>)(-?\d+)(<\/wp:posOffset>)/,
                      (t, a, v, b) => a + (Number(v) + dy) + b);
  }
  return xml.slice(0, ini) + run + xml.slice(fim);
}

// ── mala direta do Word ─────────────────────────────────────────────────────
// Os modelos vieram de mala direta. Se os campos MERGEFIELD ficarem, o Word
// abre o arquivo tentando reconectar a fonte de dados e pede a planilha antiga.
function _achatarMailMerge(xml){
  const re = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  let out = [], estado = 'normal', ultimo = 0, m;
  while ((m = re.exec(xml)) !== null){
    out.push(xml.slice(ultimo, m.index)); ultimo = re.lastIndex;
    const run = m[0];
    if (run.indexOf('fldCharType="begin"') !== -1){ estado = 'codigo'; continue; }
    if (run.indexOf('fldCharType="separate"') !== -1){ estado = 'valor'; continue; }
    if (run.indexOf('fldCharType="end"') !== -1){ estado = 'normal'; continue; }
    if (estado === 'codigo') continue;
    out.push(run);
  }
  out.push(xml.slice(ultimo));
  return out.join('').replace(
    /<w:fldSimple\s+w:instr="[^"]*MERGEFIELD[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/g, '$1');
}

/** O Word quebra «Chave» em vários trechos (corretor, revisões). Junta antes de trocar. */
function _juntarPlaceholders(xml){
  return xml.replace(/«([\s\S]{0,600}?)»/g, (todo, dentro) => {
    if (dentro.indexOf('<') === -1) return todo;
    if (dentro.indexOf('</w:p>') !== -1) return todo;
    if (dentro.indexOf('«') !== -1) return todo;
    return '«' + dentro.replace(/<[^>]+>/g,'') + '»';
  });
}

/** Monta o .docx final. Devolve { blob, faltaram } — `faltaram` são as chaves
 *  que ficaram no papel sem valor, para a tela poder avisar em vez de entregar
 *  uma proposta com «Cliente» impresso no meio do texto. */
/* ── ITEM 2 (S38): O ANEXO POR VASO ─────────────────────────────────────────
   Uma página no fim do documento com os vasos DAQUELA proposta e as colunas
   A–G da planilha do TapWeb (Tag, Status, Data Desativação, Inspeção
   Externa, Inspeção Interna, Calibração Manômetro, Calibração Válvula). As
   linhas vêm prontas de `tf_anexo_vasos` (58_): o banco decide o que está
   vencido, a tela só desenha. A célula vencida é amarela UMA POR UMA — no
   VP-13 do exemplo, a Externa vencida acende e a Interna em dia não.

   O XML é escrito com formatação própria (fonte 8,5 pt, bordas cinza) em vez
   de copiar um estilo do modelo: os 8 modelos têm estilos diferentes, e a
   tabela de itens de cada um tem 5 colunas, não 7. */
const ANEXO_COLS = [
  ['tag',        'Tag',                  1300],
  ['status',     'Status',               1250],
  ['desativado', 'Data Desativação',     1350],
  ['externa',    'Inspeção Externa',     1350],
  ['interna',    'Inspeção Interna',     1350],
  ['manometro',  'Calibração Manômetro', 1450],
  ['valvula',    'Calibração Válvula',   1450]
];

function _anexoVasosXml(a){
  const run = (t, b, sz) => '<w:r><w:rPr>' + (b ? '<w:b/><w:bCs/>' : '')
    + '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr>'
    + '<w:t xml:space="preserve">' + _xmlEsc(t) + '</w:t></w:r>';
  const par = (t, o) => { o = o || {};
    return '<w:p><w:pPr><w:spacing w:before="' + (o.antes || 0) + '" w:after="' + (o.depois || 0) + '"/>'
      + (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + '</w:pPr>' + run(t, o.b, o.sz || 20) + '</w:p>'; };
  const cel = (t, w, o) => { o = o || {};
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>'
      + (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '')
      + '<w:vAlign w:val="center"/></w:tcPr>' + par(t, { b: o.b, sz: 17, jc: 'center' }) + '</w:tc>'; };
  const borda = ['top','left','bottom','right','insideH','insideV']
    .map(k => '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="808080"/>').join('');
  const cab = '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>'
    + ANEXO_COLS.map(c => cel(c[1], c[2], { b: true, fill: 'D9E2EC' })).join('') + '</w:tr>';
  const linhas = (a.linhas || []).map(l => '<w:tr><w:trPr><w:cantSplit/></w:trPr>'
    + ANEXO_COLS.map(([k, , w]) => cel(l[k] || '', w,
        { b: k === 'tag', fill: (l.venc && l.venc[k]) ? 'FFFF00' : null })).join('') + '</w:tr>').join('');
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    + par('ANEXO — SITUAÇÃO DOS VASOS DE PRESSÃO', { b: true, sz: 24, depois: 80 })
    + par('Vencimentos conforme o TapWeb' + (a.tapweb_em ? ' (atualizado em ' + a.tapweb_em + ')' : '')
          + '. Em amarelo, os serviços vencidos em ' + a.hoje + '.', { sz: 18, depois: 160 })
    + '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/>'
    + '<w:tblBorders>' + borda + '</w:tblBorders><w:tblLayout w:type="fixed"/>'
    + '<w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar>'
    + '</w:tblPr><w:tblGrid>' + ANEXO_COLS.map(c => '<w:gridCol w:w="' + c[2] + '"/>').join('')
    + '</w:tblGrid>' + cab + linhas + '</w:tbl><w:p/>';
}

/** S103 (decisão 3a do Bruno): a tabela de vasos sai LOGO ABAIXO DOS PREÇOS,
 *  sem quebra de página, com o título "Situação dos vasos (TapWeb, …)". As
 *  colunas e o amarelo são os do anexo (`_anexoVasosXml`), que deixa de sair. */
function _vasosAbaixoXml(a){
  const xml = _anexoVasosXml(a);
  const ini = xml.indexOf('<w:tbl>');
  const run = (t, b, sz) => '<w:r><w:rPr>' + (b ? '<w:b/><w:bCs/>' : '')
    + '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr>'
    + '<w:t xml:space="preserve">' + _xmlEsc(t) + '</w:t></w:r>';
  const par = (t, b, sz, antes, depois) => '<w:p><w:pPr><w:keepNext/><w:spacing w:before="' + antes
    + '" w:after="' + depois + '"/></w:pPr>' + run(t, b, sz) + '</w:p>';
  return par(tituloVasos(a), true, 20, 200, 40)
    + par('Em amarelo, os serviços vencidos em ' + a.hoje + '.', false, 17, 0, 80)
    + xml.slice(ini);
}

/** Depois da tabela de preços: com os três planos, depois da última delas. */
function inserirVasosAbaixo(xml, a, depoisDe){
  if (!a || !(a.linhas || []).length || depoisDe == null || depoisDe < 0) return xml;
  return xml.slice(0, depoisDe) + _vasosAbaixoXml(a) + xml.slice(depoisDe);
}

/** A prévia e a escolha, comum aos dois geradores (OS e negócio). */
async function carregarAnexoVasos(args){
  if (DEMO) return null;
  try{ return await rpc('tf_anexo_vasos', args); }
  catch(e){ return { erro: e.message }; }
}

function htmlAnexoGerador(est, idChk){
  const m = est.modelo;
  if (!m || !m.tem_tabela) return '';
  const a = est.anexo;
  if (a === undefined) return '<p class="dica" style="margin:0 0 14px">Conferindo os vasos da proposta…</p>';
  if (!a) return '';
  if (a.erro) return '<div class="aviso" style="margin:0 0 14px">A tabela de vasos não pôde ser montada: '
    + esc(a.erro) + (/tf_anexo_vasos/.test(a.erro) ? ' — falta rodar o <b>58_ajustes_s38.sql</b> no Supabase.' : '')
    + ' O documento sai sem ele.</div>';
  const ls = a.linhas || [];
  if (!ls.length) return '<p class="dica" style="margin:0 0 14px">Sem a tabela de vasos: nenhum vaso desta '
    + 'proposta tem dados do TapWeb.</p>';
  return '<div class="anexoPrev"><label class="check" style="margin:0 0 6px"><input type="checkbox" id="' + idChk + '"'
    + (est.porAnexo !== false ? ' checked' : '') + '><span>Pôr <b>logo abaixo dos preços</b> a situação dos vasos — '
    + ls.length + ' vaso(s)' + (Number(a.vencidos) ? ', ' + a.vencidos + ' serviço(s) vencido(s) em amarelo' : '')
    + '</span></label>'
    + '<div style="overflow-x:auto"><table class="tbl"><thead><tr>'
    + ANEXO_COLS.map(c => '<th>' + esc(c[1]) + '</th>').join('') + '</tr></thead><tbody>'
    + ls.map(l => '<tr>' + ANEXO_COLS.map(([k]) => '<td' + (l.venc && l.venc[k] ? ' class="venc"' : '') + '>'
        + esc(l[k] || '') + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div></div>';
}

/** O que vai para o `docxGerar`: só com modelo de proposta, com linha, e marcado. */
const anexoParaGerar = est => (est.modelo && est.modelo.tem_tabela && est.porAnexo !== false
  && est.anexo && !est.anexo.erro && (est.anexo.linhas || []).length) ? est.anexo : null;

async function docxGerar({ bytes, valores, tabela, totalTexto, tirarLogoCliente, logoCliente, planos, anexo }){
  const JSZipLib = await carregarJSZip();
  const zip = await JSZipLib.loadAsync(bytes);
  const alvos = Object.keys(zip.files).filter(n => /^word\/.*\.xml$/.test(n) && !zip.files[n].dir);
  const faltaram = new Set();
  let logosTiradas = 0, logosPostas = 0, planosEscritos = 0, anexoVasos = 0;

  for (const nome of alvos){
    let t = await zip.file(nome).async('string');
    let mexeu = false;

    // ITEM 5 (S28): com a logo do cliente em mãos, TROCA; sem ela, tira a antiga
    if ((logoCliente || tirarLogoCliente) && contarImagensCabecalho(nome, t) >= 2){
      const trocado = logoCliente ? await trocarLogoCliente(zip, nome, t, logoCliente) : null;
      if (trocado){ t = trocado; logosPostas++; }
      else { t = removerLogoCliente(t); logosTiradas++; }
      mexeu = true;
    }

    if (t.indexOf('«') !== -1){
      const j = _juntarPlaceholders(t);
      if (j !== t){ t = j; mexeu = true; }
      for (const k in valores){
        const tag = '«' + k + '»';
        if (t.indexOf(tag) !== -1){ t = t.split(tag).join(_xmlEsc(valores[k] ?? '')); mexeu = true; }
      }
      // o que sobrou com « » é chave que ninguém preencheu
      for (const m of t.matchAll(/«([^«»]{1,60})»/g)) faltaram.add(m[1].trim());
    }
    if (t.indexOf('MERGEFIELD') !== -1){ t = _achatarMailMerge(t); mexeu = true; }
    if (nome === 'word/settings.xml' && t.indexOf('mailMerge') !== -1){
      t = t.replace(/<w:mailMerge>[\s\S]*?<\/w:mailMerge>/g,''); mexeu = true;
    }
    if (nome === 'word/document.xml' && tabela && tabela.length){
      const tabs = acharTabelasItens(t);
      if (planos && modeloTemPlanos(tabs)){
        // ITEM 3 (S29): as três, de trás para frente (os índices não andam)
        const pad = tabs.find(x => x.plano === 'padrao');
        const moldePlano = _estiloPlano(_tags(pad.linhasItem[0], 'w:tc')[1] || '');
        tabs.slice().sort((a, b) => b.inicio - a.inicio).forEach(tb => {
          tb.moldePlano = moldePlano;
          const pl = planos[tb.plano];
          t = t.slice(0, tb.inicio) + reescreverTabela(tb, pl.linhas, pl.resumo || _brlDoc(pl.total)) + t.slice(tb.fim);
        });
        planosEscritos = 3;
        mexeu = true;
      } else if (tabs.length){
        const achada = tabs[0];
        t = t.slice(0, achada.inicio) + reescreverTabela(achada, tabela, totalTexto) + t.slice(achada.fim);
        mexeu = true;
      }
    }
    // S103 · a situação dos vasos logo abaixo dos preços (a página de anexo no
    // fim deixou de sair — decisão 3a do Bruno)
    if (nome === 'word/document.xml' && anexo && (anexo.linhas || []).length){
      const tabs = acharTabelasItens(t);
      const pos = !tabs.length ? -1
        : (planosEscritos ? Math.max(...tabs.map(x => x.fim)) : tabs[0].fim);
      const antes = t.length;
      t = inserirVasosAbaixo(t, anexo, pos);
      if (t.length !== antes){ anexoVasos = anexo.linhas.length; mexeu = true; }
    }
    if (mexeu) zip.file(nome, t);
  }

  const blob = await zip.generateAsync({ type:'blob',
    mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { blob, faltaram: [...faltaram], logosTiradas, logosPostas, planosEscritos, anexoVasos };
}

/** Espelho de `tf__proposta_rotulo`: v1 é o número puro; v2 é "Rev. 01". */
const rotuloProposta = (num, v) => (Number(v) > 1 ? num + ' Rev. ' + String(Number(v) - 1).padStart(2,'0') : String(num));

const nomeSeguro = s => String(s||'').replace(/[/\\:*?"<>|]/g,'').replace(/\s+/g,' ').trim();

/* S41 · item 4: o nome do .docx segue o padrão que a Engetap já usa à mão
   nas pastas do Drive — «Proposta 26263 Rev. 01 - Cliente - Natureza.docx».
   Um lugar só, para os DOIS geradores (o da OS e o do negócio) não voltarem
   a divergir: até o S40 o da OS nem punha o "Rev.", só o número.
   A minuta de contrato (modelo marcado `e_contrato`) sai com "Contrato" —
   decisão minha: "Proposta" no nome de um contrato é o arquivo errado sendo
   anexado ao e-mail. Reverter é tirar a condição. */
const nomeArquivoProposta = (rotulo, cliente, natureza, modelo) =>
  nomeSeguro((modelo && modelo.e_contrato ? 'Contrato ' : 'Proposta ') + rotulo
    + ' - ' + (cliente || 'Cliente') + ' - ' + (natureza || (modelo && modelo.titulo) || '')) + '.docx';

function baixarBlob(blob, nome){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

let _modelos = null;

async function listarModelos(){
  if (_modelos) return _modelos;
  _modelos = DEMO
    ? [{id:'24',titulo:'Inspeção NR-13 (Vasos de Pressão)',tem_tabela:true,e_contrato:false,storage_path:'24.docx'},
       {id:'26',titulo:'Minuta de contrato de inspeção',tem_tabela:false,e_contrato:true,storage_path:'26.docx'}]
    : await get('modelos_proposta?select=id,titulo,descricao,tem_tabela,e_contrato,storage_path'
                + '&ativo=eq.true&order=ordem');
  return _modelos;
}

// as chaves que, vazias, estragam a proposta na frente do cliente
const CHAVES_CRITICAS = ['Cliente','Endereço_Cliente','Cidade','Contato'];

const ROTULO_CHAVE = {
  'Cliente':'Cliente', 'CNPJ_Cliente':'CNPJ', 'Endereço_Cliente':'Endereço',
  'Nº_Cliente':'Número', 'Bairro_Cliente':'Bairro', 'Cidade':'Cidade', 'UF_Cliente':'UF',
  'CEP_Cliente':'CEP', 'Contato':'Contato', 'Telefone_do_Contato':'Telefone',
  'Autor':'Autor (quem assina)', 'TítuloNatureza':'Natureza do serviço'
};

const CHAVES_NA_TELA = ['Cliente','CNPJ_Cliente','Endereço_Cliente','Nº_Cliente',
  'Bairro_Cliente','Cidade','UF_Cliente','CEP_Cliente','Contato','Telefone_do_Contato','Autor'];

// ── ITEM 5 (S28): a logomarca do cliente no cabeçalho ───────────────────────
// Desenho comum aos dois geradores (OS e negócio). `est.logos` diz se o modelo
// tem a célula (cabeçalho de duas imagens); `est.logoCli` é a logo do cliente,
// já recortada, ou null. A logo do cliente ANTERIOR nunca fica: ou é trocada,
// ou sai.
function htmlLogoGerador(est, idChk){
  if (!est.logos) return '';
  if (est.logoCli === undefined)
    return '<p class="dica" style="margin:0 0 14px">Conferindo a logomarca do cliente…</p>';
  if (!est.logoCli)
    return '<div class="aviso" style="margin:0 0 14px">Este cliente <b>não tem logomarca '
      + 'cadastrada</b>. O espaço dela no cabeçalho sai em branco (a logo do cliente anterior, '
      + 'que vem no modelo, é tirada). Cadastrar em Cadastros → Clientes resolve para as próximas.</div>';
  return '<div class="logoGer"><img alt="" src="' + est.logoCli.dataUrl + '">'
    + '<label class="check" style="margin:0"><input type="checkbox" id="' + idChk + '"'
    + (est.porLogo !== false ? ' checked' : '') + '>'
    + '<span>Pôr a logomarca do cliente no cabeçalho, ao lado da Engetap</span></label></div>';
}

// ── ITEM 3 (S29): a prévia dos três planos, comum aos dois geradores ───────
// Aparece só quando o modelo tem as três tabelas. Mostra, ANTES de gerar, a
// linha do plano e o total de cada tabela — e deixa escolher qual linha é a do
// plano (o padrão é a que começa com o texto do Padrão; senão, a primeira).
function pintarPlanosGerador(el, est, idSel, desligado){
  if (!el) return;
  if (!est.temPlanos || desligado){ el.innerHTML = ''; return; }
  const pl = est.planosPar;
  if (!pl){
    el.innerHTML = '<div class="aviso" style="margin:0 0 14px">Este modelo tem os <b>três planos</b>, mas os '
      + 'parâmetros não vieram (Configurações › Planos). Falta rodar o <b>51_ajustes_s29.sql</b>? '
      + 'Sem eles, o documento sai só com a primeira tabela preenchida.</div>';
    return;
  }
  if (!est.itens.length){ el.innerHTML = ''; return; }
  const P = montarPlanos(est.itens, est.idxPlano, pl);
  if (!P){
    el.innerHTML = '<div class="aviso" style="margin:0 0 14px">Os itens vieram sem os números que a conta '
      + 'dos planos precisa. Falta rodar o <b>51_ajustes_s29.sql</b>.</div>';
    return;
  }
  const qtd = est.itens[est.idxPlano].qtd;
  const rot = { basico:'Básico', padrao:'Padrão', premium:'Premium' };
  const pctTxt = v => (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(v)).replace('.', ',') + '%';
  el.innerHTML = '<div class="planosGer">'
    + '<div class="planosGerT">Os três planos da proposta</div>'
    + '<div class="campo" style="margin:0 0 8px"><label for="' + idSel + '">Linha do plano</label>'
    + '<select id="' + idSel + '">' + est.itens.map((it, k) => '<option value="' + k + '"'
        + (k === est.idxPlano ? ' selected' : '') + '>' + (k + 1) + ' — ' + esc(String(it.descricao || '').slice(0, 70))
        + '</option>').join('') + '</select>'
    + '<small>É a linha que muda de plano para plano. As outras saem iguais nas três tabelas.</small></div>'
    + '<table class="tbl planosTbl"><thead><tr><th>Plano</th><th>Linha do plano</th><th class="num">Unitário</th>'
    + '<th class="num">Total geral</th></tr></thead><tbody>'
    + _PLANOS_ID.map(pid => '<tr class="' + pid + '"><td><b>' + rot[pid] + '</b>'
        + (pid === 'padrao' ? ' <span class="selo aprov">o que vale</span>'
                            : ' <span class="nota">' + pctTxt(P[pid].pct) + '</span>') + '</td>'
        + '<td class="pd"></td><td class="num">' + esc(qtd) + ' × ' + esc(BRL(P[pid].unit)) + '</td>'
        + '<td class="num"><b>' + esc(BRL(P[pid].total)) + '</b></td></tr>').join('')
    + '</tbody></table>'
    + '<p class="nota" style="margin:6px 0 0">O valor da proposta (no card, no quadro e no «Valor_Total» do '
    + 'papel) é o do <b>Padrão</b>. Básico e Premium existem só no documento. Textos, percentuais e '
    + 'arredondamento: Configurações › Planos.</p></div>';
  el.querySelectorAll('.planosTbl tbody tr').forEach(tr => {
    const pid = tr.className;
    tr.querySelector('.pd').textContent = [pl[pid + '_texto'], pl[pid + '_faixa'], pl.trecho_comum].filter(Boolean).join(' ');
  });
  const sel = document.getElementById(idSel);
  if (sel) sel.addEventListener('change', () => { est.idxPlano = Number(sel.value) || 0; pintarPlanosGerador(el, est, idSel); });
}

/** O que o docxGerar recebe no modo planos (ou null). */
function planosParaGerar(est){
  if (!est.temPlanos || !est.planosPar || !est.itens.length) return null;
  return montarPlanos(est.itens, est.idxPlano, est.planosPar);
}

// ── ITENS 6 e 7 (S29) ───────────────────────────────────────────────────────
// A resposta é tudo ou nada: o que o cliente cortou vira uma revisão da
// proposta, aprovada por inteiro. Sobram duas respostas, escritas como estado
// ("Aprovado" / "Não aprovado") e com fundo esmaecido nas cores que o app já
// usa — azul da Engetap e vermelho de alerta. O botão da tarefa "Cliente
// aprovou?" (que vem do template) fica neutro: ali é escolha, não resposta.
// `aprovado_parcial` continua no mapa só para mostrar o HISTÓRICO.
const APROV_ROT = { aprovado_total:'Aprovado', reprovado:'Não aprovado',
                    aprovado_parcial:'Aprovado em parte (antigo)' };

function seloAprov(tipo){
  const cls = tipo === 'reprovado' ? 'naoaprov' : 'aprov';
  return '<span class="selo ' + cls + '">' + esc(APROV_ROT[tipo] || tipo || '') + '</span>';
}

/** S45 · item 4: a resposta do cliente só vale com o envio registrado. O
 *  botão aparece esmaecido e, ao passar o mouse ou tocar, diz o porquê — o
 *  banco recusa do mesmo jeito (gatilho em `aprovacoes`). */
const MSG_ENVIO_PRIMEIRO = 'Registre o envio primeiro';

function esmaecer(b){
  b.classList.remove('pri');
  b.classList.add('esmaecido');
  b.setAttribute('aria-disabled', 'true');
  b.title = MSG_ENVIO_PRIMEIRO + ' — a resposta do cliente só vale depois do envio registrado.';
  b.addEventListener('click', ev => {
    ev.preventDefault(); ev.stopImmediatePropagation();
    toast(MSG_ENVIO_PRIMEIRO + ': use "Registrar envio" na proposta.', 'err');
  }, true);
  return b;
}

/** A proposta desta OS que está esperando resposta. */
function propostaEmJogo(props){
  const vivas = (props||[]).filter(p => p.status === 'emitida' || p.status === 'enviada');
  if (!vivas.length) return null;
  // a de maior versão; empate resolve pela mais recente
  return vivas.sort((a,b) => (b.versao||0) - (a.versao||0))[0];
}

// ── S106 · CADASTRAR CONTATO SEM SAIR DA TELA ──────────────────────────────
// Recado do central (28/10), decisões do Bruno. Nos três lugares em que se
// escolhe contato numa lista — "Quem respondeu" (Resposta do cliente), "Para
// quem" (Registrar envio) e "Quem se procura para agendar" (aba Cliente da OS) —
// a última opção é "+ Cadastrar outra pessoa…". O contato e a outra coisa vão
// ao banco numa função só (303: tudo ou nada). Duplicado (e-mail, telefone ou
// nome iguais aos de um contato ativo do cliente) → "Já existe: X. Usar esse
// contato?"; com o nome igual dá para cadastrar assim mesmo (homônimo). O banco
// confere de novo. Quem não grava contato (campo) não vê a opção.
const CT_NOVO = '__ct_novo__';

const podeContatoNovo = () => !DEMO && podeEscritorio();

const podeContatoNovoProposta = () => podeContatoNovo() && podeEditarPropostaNeg();

const optContatoNovo = () => '<option value="' + CT_NOVO + '">+ Cadastrar outra pessoa…</option>';

const _ctFone = t => { let d = String(t || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2); return d.replace(/^0+/, ''); };

const _ctNome = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, '');

/** Os campos do contato novo, escondidos até escolherem "+ Cadastrar outra pessoa…".
 *  `papel` vem marcado; `travado` = não dá para desmarcar (o "Agendar com"). */
function htmlContatoNovo(pre, papel, travado){
  const campo = (id, rot, tipo, ph) => '<div class="campo"><label for="' + pre + id + '">' + rot + '</label>'
    + '<input id="' + pre + id + '" type="' + tipo + '" maxlength="160" autocomplete="off" name="'
    + pre.toLowerCase() + id.toLowerCase() + '_nofill"' + (ph ? ' placeholder="' + ph + '"' : '') + '></div>';
  return '<div class="ctNovo" id="' + pre + 'Novo" hidden>'
    + '<div class="secTit" style="margin-top:0">Contato novo deste cliente</div>'
    + campo('NN', 'Nome', 'text', '') + campo('NC', 'Cargo (opcional)', 'text', '')
    + '<div class="dupla">' + campo('NE', 'E-mail', 'email', '') + campo('NT', 'Telefone', 'tel', '(37) 99999-0000') + '</div>'
    + '<p class="nota" style="margin:-4px 0 10px">Pelo menos o e-mail ou o telefone.</p>'
    + '<div class="papeisGrade">' + PAPEIS_CONTATO.map(([k, rot]) =>
        '<label class="chk"><input type="checkbox" data-ctnovo="' + k + '"'
        + (k === papel ? ' checked' : '') + (k === papel && travado ? ' disabled' : '') + '> '
        + esc(rot) + '</label>').join('') + '</div>'
    + (travado ? '<p class="nota">Escolhido aqui, ele passa a ser o responsável pelo agendamento deste '
               + 'cliente (quem era perde o papel).</p>' : '')
    + '<div class="ctDup" id="' + pre + 'Dup"></div>'
    + '</div>';
}

function ligarContatoNovo(sel, pre){
  const box = document.getElementById(pre + 'Novo');
  if (!sel || !box) return;
  const mostrar = () => {
    box.hidden = sel.value !== CT_NOVO;
    const d = document.getElementById(pre + 'Dup'); if (d) d.innerHTML = '';
    if (!box.hidden){ const n = document.getElementById(pre + 'NN'); if (n) n.focus(); }
  };
  sel.addEventListener('change', mostrar);
  // o aviso de duplicado vale para o que estava escrito: mexeu, ele sai
  box.addEventListener('input', () => { const d = document.getElementById(pre + 'Dup'); if (d) d.innerHTML = ''; });
  mostrar();
}

function lerContatoNovo(pre){
  const v = id => ((document.getElementById(pre + id) || {}).value || '').trim();
  return { nome: v('NN'), cargo: v('NC') || null, email: v('NE') || null, telefone: v('NT') || null,
    papeis: [...document.querySelectorAll('#' + pre + 'Novo [data-ctnovo]:checked')].map(x => x.dataset.ctnovo) };
}

function conferirContatoNovo(c){
  if (!c.nome) return 'Escreva o nome do contato novo.';
  if (!c.email && !c.telefone) return 'Informe o e-mail ou o telefone do contato novo (pelo menos um dos dois).';
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return 'E-mail inválido: confira a digitação.';
  if (c.telefone && _ctFone(c.telefone).length < 8) return 'Telefone incompleto: confira os números (com o DDD).';
  return null;
}

/** Já existe? O mesmo critério da 303, sobre a lista da tela (que só traz os ativos). */
function contatoIgual(lista, c){
  const e = (c.email || '').toLowerCase(), f = _ctFone(c.telefone), n = _ctNome(c.nome);
  const peso = { email:1, telefone:2, nome:3 };
  let achou = null;
  (lista || []).forEach(x => {
    const por = e && String(x.email || '').trim().toLowerCase() === e ? 'email'
      : f.length >= 8 && _ctFone(x.telefone) === f ? 'telefone'
      : n && _ctNome(x.nome) === n ? 'nome' : null;
    if (por && (!achou || peso[por] < peso[achou.por])) achou = { id: x.id, nome: x.nome, por };
  });
  return achou;
}

/** Grava com o contato escolhido na lista ou com o novo.
 *  `chamar(ctId, novo)` faz a chamada ao banco; `depois(r)` é o "deu certo" da tela.
 *  Duplicado: o aviso aparece dentro do próprio formulário, com "Usar X". */
async function gravarComContato(pre, lista, sel, chamar, depois){
  const ir = async (ctId, novo) => {
    let r;
    try{ r = await chamar(ctId, novo); }catch(e){ toast(e.message, 'err'); return; }
    if (r && r.ok === false && r.duplicado){ avisar(r.duplicado); return; }
    try{ await depois(r); }catch(e){ toast(e.message, 'err'); }
  };
  const avisar = d => {
    const alvo = document.getElementById(pre + 'Dup');
    if (!alvo){ toast('Já existe: ' + d.nome + '. Escolha esse contato na lista.', 'err'); return; }
    const pq = { email:'o mesmo e-mail', telefone:'o mesmo telefone', nome:'o mesmo nome' }[d.por] || 'os mesmos dados';
    alvo.innerHTML = '<div class="aviso"><b>Já existe: ' + esc(d.nome) + '</b> (' + pq + '). Usar esse contato?'
      + '<div class="ctDupBotoes"><button type="button" class="btn mini pri" data-ctdup="usar">Usar '
      + esc(d.nome) + '</button>'
      + (d.por === 'nome' ? '<button type="button" class="btn mini" data-ctdup="novo">Cadastrar assim mesmo (é outra pessoa)</button>' : '')
      + '</div></div>';
    alvo.querySelector('[data-ctdup="usar"]').addEventListener('click', function(){
      _semDuploEnvio_(this, () => ir(d.id, null)); });
    const bn = alvo.querySelector('[data-ctdup="novo"]');
    if (bn) bn.addEventListener('click', function(){
      _semDuploEnvio_(this, () => ir(null, Object.assign(lerContatoNovo(pre), { mesmo_nome_ok: true }))); });
    alvo.scrollIntoView({ block:'nearest' });
  };
  if (!sel || sel.value !== CT_NOVO) return ir(sel ? sel.value : null, null);
  const novo = lerContatoNovo(pre);
  const erro = conferirContatoNovo(novo);
  if (erro){ toast(erro, 'err'); return; }
  const d = contatoIgual(lista, novo);
  if (d){ avisar(d); return; }
  return ir(null, novo);
}

async function modalAprovacao(ctx, tipoInicial, prForcada){
  if (DEMO){
    abrirModal('Registrar resposta do cliente',
      '<div class="aviso">No modo demonstração esta tela não grava — ela depende de '
      + 'proposta emitida e de contato cadastrado no banco real.</div>'
      + '<p class="nota">O que ela pede: a resposta (aprovado ou não aprovado), quem respondeu, '
      + 'por qual canal e em que dia.</p>',
      [{ label:'Fechar', onClick: fecharModal }]);
    return;
  }

  let props = [], contatos = [], motivos = [];
  try{
    [props, contatos, motivos] = await Promise.all([
      // a proposta do negócio já vem escolhida pela lista; a da OS é procurada
      prForcada ? Promise.resolve([prForcada])
                : get('v_propostas?select=*&os_id=eq.' + ctx.os_id + '&order=versao.desc'),
      get('contatos?select=id,nome,telefone,email,papeis&cliente_id=eq.' + ctx.cliente_id
          + '&ativo=eq.true&order=nome'),
      get('motivos_perda?select=id,nome&ativo=is.true&order=nome')
    ]);
  }catch(e){ toast(e.message,'err'); return; }

  const pr = prForcada || propostaEmJogo(props);
  if (!pr){
    // Recusar explicando o que falta vale mais que um formulário que não grava.
    abrirModal('Ainda não há proposta para responder',
      '<p class="nota">A resposta do cliente é a resposta a uma PROPOSTA — e este negócio ainda '
      + 'não tem nenhuma emitida' + (props.length ? ' e não respondida' : '') + '.</p>'
      + '<p class="nota">Registre a proposta na aba <b>Proposta</b> primeiro. É ela que '
      + 'congela o que foi ofertado, e é sobre esse escopo que a aprovação se aplica, '
      + 'item a item.</p>',
      [{ label:'Entendi', onClick: fecharModal }]);
    return;
  }

  // S45 · item 4: sem envio registrado não há resposta. Chegar aqui assim é
  // chegar por uma tela velha ou pela tarefa "Cliente aprovou?" concluída à
  // mão depois de "Enviar ao cliente" — o formulário explica e leva ao envio.
  if (!pr.enviada_em){
    abrirModal(MSG_ENVIO_PRIMEIRO,
      '<p>A proposta <b>' + esc(rotuloProposta(pr.numero, pr.versao)) + '</b> ainda não tem o envio '
      + 'registrado no TapFlow.</p><p class="nota">A resposta do cliente só é registrada depois do envio: '
      + 'quem mandou a proposta (por e-mail, WhatsApp…) registra o envio assim que manda.</p>',
      [{ label:'Fechar', onClick: fecharModal },
       { label:'Registrar o envio agora', pri:true, onClick: () => { fecharModal(); modalEnvioProposta(ctx, pr); } }]);
    return;
  }
  const envDia = isoHoje(new Date(pr.enviada_em));

  let dados = null;
  try{ dados = await rpc('tf_proposta_para_decidir', { p_proposta_id: pr.id }); }
  catch(e){ toast(e.message,'err'); return; }

  // já respondida: mostra o que foi, não oferece formulário
  if (dados && dados.ja_decidida){
    const d = dados.decisao || {};
    abrirModal('A proposta ' + rotuloProposta(pr.numero, pr.versao) + ' já foi respondida',
      '<div class="aviso">' + seloAprov(d.tipo) + ' em '
      + esc(dataBR(d.quando)) + (d.contato ? ', por ' + esc(d.contato) : '')
      + (d.canal ? ' (' + esc(d.canal) + ')' : '') + '.</div>'
      + '<p class="nota">Registrado por ' + esc(d.quem || '—') + '.'
      + (d.observacao ? '<br>' + esc(d.observacao) : '') + '</p>'
      + '<p class="nota">Se o cliente mudou de ideia — ou quer só uma parte —, emita uma <b>revisão</b> da proposta e '
      + 'registre a resposta nela: os itens são corrigidos e as duas respostas ficam no '
      + 'histórico. O card <b>não</b> volta nem anda de novo — ele já passou por esta etapa, '
      + 'e quadro que desanda deixa de ser confiável.</p>',
      [{ label:'Fechar', onClick: fecharModal }]);
    return;
  }

  // quem aprova a proposta é papel de contato: esse vem primeiro na lista
  const ordenados = contatos.slice().sort((a,b) =>
    ((b.papeis||[]).includes('aprova') ? 1 : 0) - ((a.papeis||[]).includes('aprova') ? 1 : 0));

  const corpo =
      '<p class="nota">Proposta <b>' + esc(rotuloProposta(pr.numero, pr.versao)) + '</b>'
    + ' · ' + BRL(pr.valor_total) + (pr.enviada_em ? ' · enviada ' + esc(dataBR(pr.enviada_em)) : '')
    + '</p>'
    + '<div class="secTit" style="margin-top:0">O que o cliente respondeu</div>'
    + '<div class="grelha apTipos">'
    + ['aprovado_total','reprovado'].map(v =>
        '<label class="chk"><input type="radio" name="apTipo" value="' + v + '"'
        + (v === tipoInicial ? ' checked' : '') + '> ' + seloAprov(v) + '</label>').join('')
    + '</div>'
    + '<p class="nota" style="margin:-2px 0 14px">Aprovou só uma parte? Registre a revisão da proposta '
    + 'com o que ficou e responda <b>Aprovado</b> nela.</p>'
    + (ordenados.length || podeContatoNovoProposta()
        ? '<div class="campo"><label for="apCt">Quem respondeu</label><select id="apCt">'
          + ordenados.map(x => '<option value="' + esc(x.id) + '">' + esc(x.nome)
              + ((x.papeis||[]).includes('aprova') ? ' · aprova propostas' : '')
              + '</option>').join('')
          + (podeContatoNovoProposta() ? optContatoNovo() : '')   // S106
          + '</select></div>'
          + (podeContatoNovoProposta() ? htmlContatoNovo('apCt', 'aprova', false) : '')
        : '<div class="aviso"><b>Este cliente não tem contato cadastrado.</b> A resposta '
          + 'precisa ter um nome — cadastre o contato em Cadastros → Clientes antes.</div>')
    + '<div class="dupla">'
    +  '<div class="campo"><label for="apCanal">Por onde</label><select id="apCanal">'
    +   ['email','whatsapp','telefone','presencial','outro'].map(k =>
         '<option value="' + k + '">' + ({email:'E-mail',whatsapp:'WhatsApp',
           telefone:'Telefone',presencial:'Presencial',outro:'Outro'})[k] + '</option>').join('')
    +  '</select></div>'
    +  '<div class="campo"><label for="apData">Quando</label><input id="apData" type="date" value="'
    +   (isoHoje() < envDia ? envDia : isoHoje()) + '" min="' + envDia + '"></div></div>'
    + '<div id="apParcial"></div>'
    + '<div class="campo"><label for="apEv">Link da evidência (opcional)</label>'
    + '<input id="apEv" type="text" placeholder="E-mail, pedido de compra, print no Drive…"'
    + ' autocomplete="off" name="apev_nofill"></div>'
    + '<div class="campo"><label for="apObs">Observação (opcional)</label>'
    + '<input id="apObs" type="text" autocomplete="off" name="apobs_nofill"></div>'
    + '<p class="nota">Contato, canal e data são obrigatórios de propósito. É o que '
    + 'transforma “o cliente aprovou” em algo que se confere daqui a seis meses.</p>';

  abrirModal('Resposta do cliente · ' + (ctx.numero || ''), corpo,
    [{ label:'Cancelar', onClick: fecharModal },
     { label:'Registrar resposta', pri:true, onClick: async () => {
        const tipo = (document.querySelector('input[name="apTipo"]:checked')||{}).value;
        if (!tipo){ toast('Marque o que o cliente respondeu.','err'); return; }
        const ct = (document.getElementById('apCt')||{}).value;
        if (!ct){ toast('A resposta precisa ter um contato. Cadastre um antes.','err'); return; }
        const data = (document.getElementById('apData')||{}).value;
        if (!data){ toast('Informe a data da resposta.','err'); return; }
        // S45 · item 4: a resposta não é de antes do envio (o banco recusa igual)
        if (data < envDia){ toast('A resposta não pode ser anterior ao envio (' + dataBR(envDia) + ').','err'); return; }

        let motivo = null;
        if (tipo === 'reprovado'){
          motivo = (document.getElementById('apMot')||{}).value;
          if (!motivo){ toast('Escolha o motivo da perda.','err'); return; }
        }
        // S106 · com o contato da lista, a de sempre; com o novo, a 303 grava os dois juntos
        const base = { p_proposta_id: pr.id, p_tipo: tipo,
            p_canal: document.getElementById('apCanal').value,
            p_decidido_em: data, p_motivo_perda: motivo,
            p_evidencia_url: (document.getElementById('apEv')||{}).value.trim() || null,
            p_observacao: (document.getElementById('apObs')||{}).value.trim() || null };
        await gravarComContato('apCt', ordenados, document.getElementById('apCt'),
          (ctId, novo) => novo
            ? rpc('tf_aprovar_proposta_contato_novo', Object.assign({}, base, { p_contato: novo }))
            : rpc('tf_aprovar_proposta', Object.assign({}, base, { p_contato_id: ctId, p_itens_aprovados: null })),
          async r => {
          fecharModal();
          // "o card andou" só é verdade quando andou. A função devolve o que
          // aconteceu com o pipeline; sem OS ainda, nada andou — a OS nasce
          // depois, a partir da proposta aprovada.
          toast(r && r.pipeline === 'movido'
            ? 'Resposta registrada. O card andou.'
            : 'Resposta registrada.', 'ok');
          // Mesmo motivo do registro de envio: vindo da gaveta do NEGÓCIO,
          // `carregar()` recarrega os cards de OS e o quadro comercial fica
          // como estava — parado na coluna anterior à resposta que acabou de
          // ser registrada.
          // CRM1 · quem repinta é a página que abriu (o Manager para a OS, o crm/ para o negócio)
          await propostaGravada('resposta', ctx);
          });
     }}]);
  ligarContatoNovo(document.getElementById('apCt'), 'apCt');   // S106

  // ── o motivo só aparece para "Não aprovado" ──
  // S29: a escolha item a item ("o que o cliente aprovou") saiu junto com a
  // opção "em parte". "Aprovado" aprova todos os itens da proposta; "Não
  // aprovado" marca todos como perdidos, com este motivo.
  const pintarMotivo = () => {
    const tipo = (document.querySelector('input[name="apTipo"]:checked')||{}).value;
    const alvo = document.getElementById('apParcial');
    if (!alvo) return;
    if (tipo !== 'reprovado'){ alvo.innerHTML = ''; return; }
    alvo.innerHTML =
        '<div class="campo"><label for="apMot">Motivo da perda</label>'
      + '<select id="apMot"><option value="">— escolha —</option>' + motivos.map(m =>
          '<option value="' + esc(m.id) + '">' + esc(m.nome) + '</option>').join('')
      + '</select></div>';
  };
  document.querySelectorAll('input[name="apTipo"]').forEach(r =>
    r.addEventListener('change', pintarMotivo));
  pintarMotivo();
}

// ── REGISTRAR O ENVIO DA PROPOSTA ───────────────────────────────────────────
// É o passo que faltava para o quadro comercial andar. Exige contato e canal
// de propósito: "enviada" sem dizer para quem e por onde é o mesmo buraco do
// TapControl, onde o responsável era a string 'ADM' e não havia evidência de
// nada. Daqui também sai o relógio do follow-up ("11 dias sem resposta").
// `ctx` em vez do card da OS: desde o S20 a proposta pode viver só no negócio,
// e o formulário é o mesmo. O que ele precisa saber é de qual CLIENTE são os
// contatos — não de qual OS.
function modalEnvioProposta(ctx, pr){
  let ctsEnvio = [];   // S106 · a lista, para o aviso de duplicado
  abrirModal('Registrar envio de ' + rotuloProposta(pr.numero, pr.versao),
      '<p class="nota">Isto não envia nada — registra que VOCÊ enviou, para o '
    + 'quadro comercial andar e o follow-up começar a contar.</p>'
    + '<div class="campo"><label for="epC">Para quem</label>'
    + '<select id="epC"><option value="">carregando…</option></select></div>'
    + (podeContatoNovoProposta() ? htmlContatoNovo('epC', 'aprova', false) : '')   // S106
    + '<div class="campo"><label for="epK">Por onde</label><select id="epK">'
    +   ['email','whatsapp','telefone','presencial','outro'].map(k =>
        '<option value="' + k + '">' + ({email:'E-mail',whatsapp:'WhatsApp',
          telefone:'Telefone',presencial:'Presencial',outro:'Outro'})[k] + '</option>').join('')
    + '</select></div>'
    + '<div class="campo"><label for="epD">Quando</label><input id="epD" type="date" value="'
    +   isoHoje() + '"></div>',
    [{ label:'Cancelar', onClick: fecharModal },
     { label:'Registrar envio', pri:true, onClick: async () => {
        const selC = document.getElementById('epC');
        const ct = selC.value;
        if (!ct){ toast('Escolha para quem a proposta foi.','err'); return; }
        // S106 · com o contato da lista, a de sempre; com o novo, a 303 grava os dois juntos
        const base = { p_proposta_id: pr.id, p_canal: document.getElementById('epK').value,
            p_quando: document.getElementById('epD').value || null };
        await gravarComContato('epC', ctsEnvio, selC,
          (ctId, novo) => novo
            ? rpc('tf_registrar_envio_contato_novo', Object.assign({}, base, { p_contato: novo }))
            : rpc('tf_registrar_envio_proposta', Object.assign({}, base, { p_contato_id: ctId })),
          async () => {
          fecharModal(); toast('Envio registrado.','ok');
          // ⚠ Este modal é chamado de DOIS lugares: da aba Proposta da OS e da
          //   gaveta do NEGÓCIO. Até o S22 ele repintava sempre a aba da OS e
          //   recarregava só os cards de OS — então, vindo do negócio, a pessoa
          //   registrava o envio, lia "Envio registrado" e via o card parado em
          //   "Em conferência" até apertar Atualizar. O quadro mentia justo no
          //   passo em que ele deveria andar.
          // CRM1 · quem repinta é a página que abriu (o Manager para a OS, o crm/ para o negócio)
          await propostaGravada('envio', ctx);
          });
     }}]);

  // os contatos chegam depois; o modal já está na tela
  get('contatos?select=id,nome,email,telefone&cliente_id=eq.' + ctx.cliente_id
      + '&ativo=eq.true&order=nome').then(cts => {
    const sel = document.getElementById('epC');
    if (!sel) return;
    ctsEnvio = cts || [];
    const novo = podeContatoNovoProposta() ? optContatoNovo() : '';   // S106
    if (!cts || !cts.length){
      sel.innerHTML = novo || '<option value="">— este cliente não tem contato cadastrado —</option>';
      ligarContatoNovo(sel, 'epC');
      return;
    }
    sel.innerHTML = cts.map(x => '<option value="' + esc(x.id) + '">' + esc(x.nome)
      + (x.email || x.telefone ? ' · ' + esc(x.email || x.telefone) : '') + '</option>').join('') + novo;
    ligarContatoNovo(sel, 'epC');
  }).catch(e => {
    const sel = document.getElementById('epC');
    if (sel) sel.innerHTML = '<option value="">não deu para carregar os contatos</option>';
  });
}

/** Quem monta proposta: o mesmo corte de `tf_criar_proposta_negocio`
 *  (`tf_tem_perfil(comercial, compras, tecnico_adm)` ou admin). */
const podeEditarPropostaNeg = () => DEMO || !!sessao.admin || ['comercial','compras','tecnico_adm'].includes(sessao.perfil);

// ════════════════════════════════════════════════════════════════════════════
// DESCONTO GERAL — %, R$ OU VALOR FINAL
// Item 3 do S28; itens 6 e 7 do S31 (17/09) refizeram a conta por dentro.
// ----------------------------------------------------------------------------
// O cliente negocia em reais ("fecha por R$ 500?", "me dá R$ 50?"), e o campo
// só aceitava percentual. São três caminhos para o MESMO número: o percentual
// por item (`desconto_pct`) continua sendo a fonte única.
//
// ── O QUE MUDOU NO S31, E POR QUÊ ──────────────────────────────────────────
//
// ITEM 7 · A BASE ERA O PREÇO CHEIO. A caixa dizia "Total atual: R$ 600,00"
// numa proposta cuja linha já tinha 25% e valia R$ 450,00 — o total real,
// aliás impresso duas linhas acima, na própria tela. Pior que o rótulo: o
// desconto de R$ 50,00 era calculado sobre os 600 e SUBSTITUÍA o desconto da
// linha, devolvendo ≈ R$ 550,00 onde o Bruno esperava R$ 400,00.
//   Agora a base é o total ATUAL (já com o desconto de cada linha), e o
//   desconto geral ACUMULA sobre ele: R$ 450,00 − R$ 50,00 = R$ 400,00. Cada
//   linha encolhe na mesma proporção, então quem tinha desconto próprio
//   continua com mais desconto que os vizinhos — o que não acontecia quando
//   todas eram igualadas no mesmo percentual.
//
// ITEM 6 · O CENTAVO. "Desconto em R$: 50" sobre R$ 600,00 devolvia R$ 49,98.
// O documento atribuiu isso a arredondamento em cascata na tela; não era. A
// tela já calculava com o valor exato e já AVISAVA na prévia ("com o
// percentual em duas casas, o desconto fica R$ 49,98"). O arredondamento
// estava na COLUNA: `desconto_pct numeric(5,2)` não guarda 8,3333…%, e sobre
// uma linha de R$ 600,00 o passo do percentual vale 6 centavos — R$ 550,00
// era inalcançável. O `52_ajustes_s31.sql` levou a coluna para quatro casas;
// esta tela passou a distribuir o valor exato entre as linhas e a devolver o
// centavo que sobra para a maior delas.
//
// O resto do desenho continua: os três em caixas separadas, com a palavra que
// os distingue em destaque (SAI / FECHAR); a prévia mostra os três números
// ANTES de aplicar; aplicar é um clique à parte; acima de 30% pergunta de novo.
const DESC_ALERTA_PCT = 30;

function _numBR(v){
  let s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

const _c2 = n => Math.round(n * 100) / 100;

const _pctBR = p => (Math.round(p * 100) / 100).toLocaleString('pt-BR',
  { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%';

/** O percentual como ele vai para o campo da linha: até 4 casas, sem zero à
 *  toa. 8,3333 aparece inteiro; 25 aparece como 25. */
const _descCurto = p => {
  const n = Math.round(Number(p) * 10000) / 10000;
  return String(n);
};

/** cfg: { id, linhas: () => [{preco, qtd, desc}], aplicar: async pcts => {} }
 *  `aplicar` recebe um ARRAY alinhado com `linhas()`: o percentual novo de
 *  cada linha, ou null nas que ficam de fora (sem preço ou sem quantidade).
 *  Até o S30 recebia um percentual só, igual para todas — o que era a própria
 *  causa do item 7. Devolve { atualizar } para a tela chamar quando as linhas
 *  mudarem. */
function montarDescontoGeral(alvo, cfg){
  const P = cfg.id;
  alvo.innerHTML =
      '<div class="descG">'
    + '<div class="descGTit">Desconto geral <span>— preencha <b>um</b> dos três; os outros dois se calculam</span></div>'
    + '<div class="descGGrade">'
    +   '<div class="descGCx pct"><label for="' + P + 'Pct">Desconto em percentual</label>'
    +     '<small>sobre o total <b>atual</b> da proposta</small>'
    +     '<div class="descGInp"><input id="' + P + 'Pct" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: 3"><span>%</span></div></div>'
    +   '<div class="descGCx sai"><label for="' + P + 'Rs">Desconto em R$</label>'
    +     '<small>quanto <b>SAI</b> do total atual</small>'
    +     '<div class="descGInp"><span>− R$</span><input id="' + P + 'Rs" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: 50,00"></div></div>'
    +   '<div class="descGCx fica"><label for="' + P + 'Fim">Valor final da proposta</label>'
    +     '<small>quanto a proposta deve <b>FECHAR</b></small>'
    +     '<div class="descGInp"><span>= R$</span><input id="' + P + 'Fim" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: 500,00"></div></div>'
    + '</div>'
    + '<div class="descGPrev" id="' + P + 'Prev" aria-live="polite"></div>'
    + '<button class="btn" type="button" id="' + P + 'Ok" disabled>Aplicar em todas as linhas</button>'
    + '<button class="btn mini" type="button" id="' + P + 'Zero" hidden '
    +   'style="margin-left:0;margin-top:8px">Tirar todos os descontos</button>'
    + '</div>';

  const $ = s => document.getElementById(P + s);
  const campos = { Pct: $('Pct'), Rs: $('Rs'), Fim: $('Fim') };
  let alvoTotal = null;   // quanto a proposta deve fechar (o número exato pedido)
  let origem = null;      // qual dos três campos foi preenchido

  /** As linhas que entram na conta, com o total de cada uma como o banco o
   *  calcula (`round(preco*qtd*(1-desc/100), 2)`). Se as duas contas
   *  divergirem, a tela mente sobre o que vai ser gravado. */
  const conta = () => {
    const todas = cfg.linhas();
    const ls = [];
    todas.forEach((l, i) => {
      const preco = Number(l.preco) || 0, qtd = Number(l.qtd) || 0;
      if (preco > 0 && qtd > 0)
        ls.push({ i, bruto: _c2(preco * qtd),
                  total: _c2(preco * qtd * (1 - (Number(l.desc) || 0) / 100)),
                  desc: Number(l.desc) || 0 });
    });
    return { n: todas.length, ls,
             bruto: _c2(ls.reduce((s, l) => s + l.bruto, 0)),
             atual: _c2(ls.reduce((s, l) => s + l.total, 0)),
             semPreco: todas.length - ls.length,
             comDesconto: ls.filter(l => l.desc > 0).length };
  };

  /** Distribui o total pedido entre as linhas, proporcionalmente ao que cada
   *  uma vale HOJE, e devolve o percentual de cada uma com quatro casas.
   *  O centavo que sobra da divisão vai para a maior linha — em algum lugar
   *  ele tem que cair, e na maior é onde menos distorce. */
  const distribuir = (c, N) => {
    const f = c.atual > 0 ? N / c.atual : 0;
    const alvos = c.ls.map(l => _c2(l.total * f));
    let sobra = _c2(N - alvos.reduce((s, v) => s + v, 0));
    if (Math.abs(sobra) >= 0.005 && alvos.length){
      let maior = 0;
      c.ls.forEach((l, k) => { if (l.total > c.ls[maior].total) maior = k; });
      alvos[maior] = _c2(Math.min(c.ls[maior].bruto, Math.max(0, alvos[maior] + sobra)));
    }
    // O percentual de uma linha, dado o total que ela deve ter. Duas coisas
    // acontecem aqui, e as duas por causa do item 6:
    //   · o percentual tem quatro casas (é o que a coluna guarda desde o S31),
    //     e entre o "para baixo" e o "para cima" ganha o que chega mais perto
    //     do centavo pedido — arredondar sempre para o mais próximo erra por
    //     um centavo em linha grande;
    //   · entre dois percentuais que dão O MESMO centavo, ganha o mais
    //     simples. "3%" sobre R$ 1.234,56 dá exatamente o mesmo total que
    //     3,0003%, e ninguém que digitou 3 quer ver 3,0003 gravado na linha.
    const pctPara = (bruto, alvo) => {
      if (!(bruto > 0)) return 0;
      const ex = (1 - alvo / bruto) * 100;
      // `Number(q.toFixed(4))` não é estética: a coluna tem QUATRO casas e
      // arredonda o que passar disso. Mandar 33.333299999999994 faria o banco
      // gravar outro número do que esta tela mostrou.
      const cand = [Math.floor(ex * 10000) / 10000, Math.ceil(ex * 10000) / 10000,
                    Math.round(ex), Math.round(ex * 10) / 10, Math.round(ex * 100) / 100]
        .map(q => Number(q.toFixed(4)))
        .filter(q => q >= 0 && q <= 100);
      let melhor = 0, erro = Infinity;
      cand.forEach(q => {
        const e = Math.abs(_c2(bruto * (1 - q / 100)) - alvo);
        // empate: fica com o percentual de menos casas (o texto mais curto)
        if (e < erro - 1e-9 || (Math.abs(e - erro) < 1e-9 && String(q).length < String(melhor).length)){
          erro = e; melhor = q;
        }
      });
      return melhor;
    };

    const pcts = new Array(c.n).fill(null);
    let reais = c.ls.map((l, k) => {
      const p = pctPara(l.bruto, alvos[k]);
      pcts[l.i] = p;
      return _c2(l.bruto * (1 - p / 100));    // o que o banco vai gravar
    });
    // Sobrou centavo depois de tudo? Ele cabe numa linha só — e a linha certa
    // é a MENOR, não a maior. Com quatro casas, dois percentuais vizinhos
    // mudam o total de uma linha em 0,000001 do valor dela: numa linha de
    // R$ 15.000 isso já é um centavo e meio, e nenhum percentual acerta o
    // centavo pedido. Numa linha de R$ 2.000 o passo vale 0,2 centavo e
    // sempre acerta. Por isso a correção desce da menor para a maior e para
    // na primeira que fecha.
    let real = _c2(reais.reduce((s, v) => s + v, 0));
    if (Math.abs(real - N) >= 0.005 && c.ls.length){
      const ordem = c.ls.map((l, k) => k).sort((a, b) => c.ls[a].bruto - c.ls[b].bruto);
      for (const k of ordem){
        const alvo2 = _c2(Math.min(c.ls[k].bruto, Math.max(0, reais[k] + (N - real))));
        const p2 = pctPara(c.ls[k].bruto, alvo2);
        const novo = _c2(c.ls[k].bruto * (1 - p2 / 100));
        const depois = _c2(real - reais[k] + novo);
        if (Math.abs(depois - N) < Math.abs(real - N)){
          pcts[c.ls[k].i] = p2; reais[k] = novo; real = depois;
        }
        if (Math.abs(real - N) < 0.005) break;
      }
    }
    return { pcts, real };
  };

  const prever = () => {
    const pv = $('Prev'), ok = $('Ok'), zero = $('Zero');
    const c = conta();
    ok.disabled = true; ok.classList.remove('pri');
    zero.hidden = !c.comDesconto;

    if (!c.ls.length){
      pv.className = 'descGPrev'; pv.textContent = 'Ponha preço nas linhas para calcular o desconto.';
      return;
    }
    if (alvoTotal === null){
      pv.className = 'descGPrev';
      pv.textContent = (c.comDesconto
          ? 'Total atual: ' + BRL(c.atual) + ' (sem desconto seriam ' + BRL(c.bruto) + '). '
          : 'Total atual: ' + BRL(c.atual) + '. ')
        + 'O desconto geral sai daqui. Nada muda até você clicar em "Aplicar".';
      return;
    }
    if (isNaN(alvoTotal) || alvoTotal < 0 || alvoTotal > c.atual){
      pv.className = 'descGPrev erro';
      pv.textContent = origem === 'Fim' && alvoTotal > c.atual
        ? 'O valor final (' + BRL(alvoTotal) + ') é MAIOR que o total atual ('
          + BRL(c.atual) + ') — isso não é desconto.'
        : 'Esse desconto não cabe: ele precisa ficar entre zero e o total atual da proposta ('
          + BRL(c.atual) + ').';
      return;
    }

    const d = distribuir(c, alvoTotal);
    const sai  = _c2(c.atual - d.real);
    const pctG = c.atual > 0 ? (sai / c.atual) * 100 : 0;
    const alto = pctG > DESC_ALERTA_PCT;
    pv.className = 'descGPrev' + (alto ? ' alto' : ' pronto');
    pv.innerHTML = '<span>Total atual: <b></b></span><span class="seta">→</span>'
      + '<span>Desconto: <b class="s"></b></span><span class="seta">→</span>'
      + '<span>Novo total: <b class="n"></b></span>'
      + '<div class="descGNotas"></div>';
    pv.querySelector('b').textContent = BRL(c.atual);
    pv.querySelector('b.s').textContent = '− ' + BRL(sai) + ' (' + _pctBR(pctG) + ')';
    pv.querySelector('b.n').textContent = BRL(d.real);

    const notas = [];
    if (c.comDesconto)
      notas.push('A base é o total atual, ' + BRL(c.atual) + ' — o preço cheio soma '
        + BRL(c.bruto) + ', e o desconto que já existe nas linhas continua valendo.');
    if (Math.abs(d.real - alvoTotal) >= 0.005)
      notas.push('O total possível mais próximo é ' + BRL(d.real) + ', '
        + BRL(Math.abs(d.real - alvoTotal)) + (d.real > alvoTotal ? ' acima' : ' abaixo')
        + ' do que você pediu.');
    if (c.semPreco) notas.push(c.semPreco + ' linha(s) sem preço ficam fora da conta.');
    if (alto) notas.push('Desconto acima de ' + DESC_ALERTA_PCT + '%. Confira se o valor foi digitado no campo certo.');
    pv.querySelector('.descGNotas').textContent = notas.join(' ');
    ok.disabled = false; ok.classList.add('pri');
    ok.textContent = 'Aplicar − ' + BRL(sai) + ' nas ' + c.ls.length + ' linha(s)';
  };

  /** Digitou num campo: o valor DELE é o exato; os outros dois viram leitura.
   *  Era aqui que o documento achava que morava o defeito — e é aqui que a
   *  regra fica explícita: o número que manda é o que a pessoa digitou. */
  const ao = (k) => () => {
    const c = conta();
    const v = _numBR(campos[k].value);
    origem = k;
    Object.keys(campos).forEach(o => campos[o].classList.toggle('calc', o !== k && v !== null));
    if (v === null){
      alvoTotal = null;
      Object.keys(campos).forEach(o => { if (o !== k) campos[o].value = ''; campos[o].classList.remove('calc'); });
      return prever();
    }
    if (isNaN(v) || c.atual <= 0){ alvoTotal = NaN; return prever(); }
    if (k === 'Pct') alvoTotal = _c2(c.atual * (1 - v / 100));
    if (k === 'Rs')  alvoTotal = _c2(c.atual - v);
    if (k === 'Fim') alvoTotal = _c2(v);

    if (alvoTotal >= 0 && alvoTotal <= c.atual){
      // os campos calculados mostram o que vai SAIR, já com a conta do banco
      const d = distribuir(c, alvoTotal);
      const fmt = x => x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const pctG = c.atual > 0 ? (c.atual - d.real) / c.atual * 100 : 0;
      if (k !== 'Pct') campos.Pct.value = String(Math.round(pctG * 100) / 100).replace('.', ',');
      if (k !== 'Rs')  campos.Rs.value  = fmt(_c2(c.atual - d.real));
      if (k !== 'Fim') campos.Fim.value = fmt(d.real);
    }
    prever();
  };
  Object.keys(campos).forEach(k => campos[k].addEventListener('input', ao(k)));

  const limpar = () => {
    Object.values(campos).forEach(c => { c.value = ''; c.classList.remove('calc'); });
    alvoTotal = null; origem = null;
    prever();
  };

  $('Ok').addEventListener('click', function(){
    if (alvoTotal === null || isNaN(alvoTotal)) return;
    const c = conta();
    const d = distribuir(c, alvoTotal);
    const sai = _c2(c.atual - d.real);
    const pctG = c.atual > 0 ? (sai / c.atual) * 100 : 0;
    const vai = async () => { await cfg.aplicar(d.pcts); limpar(); };
    if (pctG > DESC_ALERTA_PCT){
      abrirModal('Desconto de ' + _pctBR(pctG) + '?',
          '<div class="aviso">É um desconto alto. O erro mais comum aqui é digitar o '
        + '<b>valor final</b> no campo do <b>desconto em R$</b> (ou o contrário).</div>'
        + '<p>Total atual <b>' + esc(BRL(c.atual)) + '</b> → desconto <b>' + esc(BRL(sai))
        + '</b> → novo total <b>' + esc(BRL(d.real)) + '</b>.</p>',
        [{ label:'Voltar e conferir', onClick: () => fecharModal() },
         { label:'Sim, aplicar', pri:true, onClick: async () => { fecharModal(); await vai(); } }]);
      return;
    }
    _semDuploEnvio_(this, vai);
  });

  // Zerar deixou de ser "aplicar 0%": com a base no total atual, 0% quer dizer
  // "não tire mais nada", e não "apague o desconto que já existe". Quem apaga
  // é este botão, que só aparece quando há o que apagar.
  $('Zero').addEventListener('click', function(){
    const c = conta();
    _semDuploEnvio_(this, async () => {
      await cfg.aplicar(new Array(c.n).fill(null).map((_, i) =>
        c.ls.some(l => l.i === i) ? 0 : null));
      limpar();
    });
  });

  prever();
  return { atualizar: prever };
}
