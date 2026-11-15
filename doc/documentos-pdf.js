/*
 * TapDoc · os documentos da inspeção além do relatório (S164 · issue 30, Parte 1 · 13/11/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Desenho: processos/documentos-inspecao-desenho.md (DP1, DP5, DP7).
 * Puro, como o laudo-pdf.js: recebe a FOTOGRAFIA do laudo emitido (tf_laudo_ver → dados) e devolve a definição do
 * pdfmake. Não busca nem grava nada: quem gera o PDF, assina com o carimbo e grava é a página (doc/index.html).
 *   · DocumentosPDF.resumo(d, opc)  — o "Relatório Resumo da Inspeção" (1 página, DP7);
 *   · DocumentosPDF.registro(d, opc) — o Registro de Segurança (D2 · S165 · issue 30, Parte 2: DP8 e DP9), "livro" ou "anotacao";
 *   · DocumentosPDF.nome(tipo, ctx) — o nome padrão do arquivo (DP5);
 *   · DocumentosPDF.ROTULO          — o nome de cada documento nas telas.
 * Partes 3 e 4 (Prontuário, fichário e lombadas) entram aqui depois.
 */
(function (raiz) {
'use strict';
const VERSAO = 'D2-S165-2026-11-14';
const AZUL = '#1B6FA9', CINZA = '#515252', FAIXA = '#5B6770', VERDE = '#1E6B3A', VERM = '#A62D18';

// ── o nome dos arquivos (DP5) ────────────────────────────────────────────────
const ROTULO = { relatorio: 'Relatório de Inspeção', resumo: 'Resumo', registro: 'Registro de Segurança', cert_manometro: 'Certificado de Manômetro',
  cert_valvula: 'Certificado de Válvula', prontuario: 'Prontuário (Reconstituído)', fichario: 'Fichário' };
const INSTRUMENTO = { medidor_espessura: 'Certificado do Medidor de Espessura', manometro_padrao: 'Certificado do Manômetro Padrão', bancada: 'Certificado da Bancada', outro: 'Certificado do Instrumento' };
/** As letras que o Windows não aceita viram "-"; sem espaço duplo nem ponto no fim. */
function limpo(s) {
  return String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
}
/** A TAG como sai no nome: com o Nº TAP quando a OS tem duas TAG iguais ("VP-01 (120-01)"). */
/** "OS 2026-0451" (o número que já vem com "OS" na frente não ganha outro). */
function osRot(n) { const x = limpo(n || ''); return /^OS\b/i.test(x) ? x : 'OS ' + x; }
function tagNome(tag, tap, duplicada) { return limpo(tag || 'sem TAG') + (duplicada && tap ? ' (' + limpo(tap) + ')' : ''); }
/**
 * ctx: { tag, tap, duplicada, cliente, ordem, total, revisao, paraAssinar, os, instrumento }
 *  · documento do vaso: "<Documento>[ N] - <TAG> - <Cliente>[ (Rev N)][ (para assinar)].pdf"
 *  · art / lombadas: "<ART|Lombadas> - <Cliente> - OS <número>.pdf"
 *  · instrumento: "<Certificado do …> - <identificação>.pdf"
 */
function nome(tipo, ctx) {
  ctx = ctx || {};
  const cli = limpo(ctx.cliente || 'Cliente');
  const fim = (ctx.revisao ? ' (Rev ' + ctx.revisao + ')' : '') + (ctx.paraAssinar ? ' (para assinar)' : '') + '.pdf';
  if (tipo === 'art') return 'ART - ' + cli + ' - ' + osRot(ctx.os) + '.pdf';
  if (tipo === 'lombadas') return 'Lombadas - ' + cli + ' - ' + osRot(ctx.os) + '.pdf';
  if (tipo === 'instrumento') { const z = ctx.instrumento || {};
    return (INSTRUMENTO[z.tipo] || INSTRUMENTO.outro) + ' - ' + limpo(z.descricao || z.numero_serie || z.certificado_num || 'sem identificação') + '.pdf'; }
  const rot = ROTULO[tipo] || limpo(tipo);
  return rot + (ctx.total > 1 ? ' ' + (ctx.ordem || 1) : '') + ' - ' + tagNome(ctx.tag, ctx.tap, ctx.duplicada) + ' - ' + cli + fim;
}

// ── formatação ───────────────────────────────────────────────────────────────
function fmt(v, c) {
  if (v == null || v === '' || !isFinite(Number(v))) return '—';
  const n = Number(v).toFixed(c == null ? 2 : c), [i, dd] = n.split('.'), neg = i[0] === '-', ii = neg ? i.slice(1) : i;
  return (neg ? '−' : '') + ii.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dd ? ',' + dd : '');
}
const barMPa = mpa => mpa == null || !isFinite(Number(mpa)) ? null : fmt(Number(mpa) * 10, 2) + ' bar';   // DP7: duas casas e vírgula
const EM_BAR = { bar: 1, 'kgf/cm2': 0.980665, 'kgf/cm²': 0.980665, psi: 0.0689476, mpa: 10, kpa: 0.01 };
const emBar = (v, un) => v == null || v === '' || !isFinite(Number(v)) ? null : Number(v) * (EM_BAR[String(un || 'bar').toLowerCase()] || 1);
function dataBR(x) {
  if (!x) return null;
  const s = String(x);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch (e) { return s; }
}
const vazio = x => x == null || /^\s*(—|-+|n[ãa]o h[áa]|n\/a)?\s*$/i.test(String(x));
const UF = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
const EXTENSO = { 1: 'Um', 2: 'Dois', 3: 'Três', 4: 'Quatro', 5: 'Cinco', I: 'Um', II: 'Dois', III: 'Três', IV: 'Quatro', V: 'Cinco' };
const comExtenso = x => x == null || x === '' ? null : String(x) + (EXTENSO[String(x)] ? ' (' + EXTENSO[String(x)] + ')' : '');
const TIPO_INSP = { inicial: 'Inicial', periodica: 'Periódica', extraordinaria: 'Extraordinária' };
const POSICAO = { horizontal: 'Horizontal', vertical: 'Vertical' };
const RESULTADO = { aprovado: ['Conforme', VERDE], reprovado: ['Não conforme', VERM] };
const TITULO_AC = { valvula_seguranca: 'DADOS DA VÁLVULA DE SEGURANÇA', valvula_alivio: 'DADOS DA VÁLVULA DE ALÍVIO', manometro: 'DADOS DO MANÔMETRO', manovacuometro: 'DADOS DO MANOVACUÔMETRO' };
const ehValvula = t => t === 'valvula_seguranca' || t === 'valvula_alivio';

/** O texto da cidade e do estado ("Divinópolis · Minas Gerais"). */
function cidadeUf(emp) {
  const c = emp.cidade ? String(emp.cidade).trim() : '';
  const cid = raiz.LaudoPDF && raiz.LaudoPDF.cidadeLaudo ? raiz.LaudoPDF.cidadeLaudo(c) : /[a-zà-ÿ]/.test(c) ? c : c.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/ (De|Da|Do|Das|Dos) /g, m => m.toLowerCase());
  return { cidade: cid || null, estado: emp.uf ? (UF[String(emp.uf).toUpperCase()] || emp.uf) : null };
}

/**
 * O Resumo (DP7): cliente, endereço e cidade; título e Nº TAP; as faixas Dados do vaso, Dados da inspeção, e uma para
 * cada válvula e cada manômetro (com o resultado da aferição). opc: { numero, revisao, carimbo, plh, marca, logoEngetap }.
 * O carimbo (desenho + "Aprovado eletronicamente por …") vai no rodapé, como no relatório (DP4); sem número, o nome do PLH.
 */
function resumo(d, opc) {
  opc = opc || {};
  const emp = d.empresa || {}, V = d.vaso || {}, I = d.inspecao || {}, R = d.resultado || {}, M = (d.modelo && d.modelo.blocos) || {};
  const cams = V.camaras || [], rcams = d.resultado_camaras || [];
  const plh = opc.plh || d.plh || null;
  const CAR = opc.numero && opc.carimbo && /^data:image\/(png|jpe?g);base64,/i.test(opc.carimbo.imagem || '') && opc.carimbo.texto ? opc.carimbo : null;
  const logoEng = opc.logoEngetap || (raiz.LaudoPDF && raiz.LaudoPDF.logoEngetap) || null;
  const logoCli = emp.logo && /^data:image\/(png|jpe?g);base64,/i.test(emp.logo) ? emp.logo : null;
  const empresaM = M.empresa_emissora || {};
  const numero = opc.numero ? opc.numero + (opc.revisao ? ' Rev. ' + opc.revisao : '') : null;
  // as pressões: a maior de operação entre as câmaras, a menor PMTA adotada (a do vaso), o PTH da câmara (ou do vaso)
  const oper = cams.map(k => k.p_operacao_max_mpa).filter(x => x != null).map(Number);
  const pOper = oper.length ? Math.max(...oper.map(Math.abs)) : (R.p_operacao_mpa != null ? Math.abs(Number(R.p_operacao_mpa)) : null);
  const pmta = rcams.length ? Math.min(...rcams.map(k => Number(k.pmta_adotada_mpa))) : (R.pmta_adotada_mpa != null ? Number(R.pmta_adotada_mpa) : null);
  const pth = (cams[0] && cams[0].pth_mpa != null) ? cams[0].pth_mpa : V.pth_mpa;
  const volume = cams.reduce((a, k) => a + (Number(k.volume_m3) || 0), 0) || (R.volume_m3 != null ? Number(R.volume_m3) : null);
  const fluido = [...new Set(cams.map(k => k.fluido).filter(Boolean))].join(' / ') || null;
  const exames = [I.exame_interno ? 'interna' : null, I.exame_externo ? 'externa' : null].filter(Boolean);
  const tipo = [TIPO_INSP[I.tipo] || I.tipo, exames.length ? exames.join(' e ') : null].filter(Boolean).join(', ');
  const dataInsp = dataBR(I.termino || I.inicio);
  const { cidade, estado } = cidadeUf(emp);

  const C = [];
  // o topo: o cliente à esquerda, o logo dele à direita
  const rv = (r, v) => ({ text: [{ text: r + ': ', bold: true }, { text: vazio(v) ? '—' : String(v) }] });
  C.push({ columns: [
    { width: '*', stack: [rv('CLIENTE', emp.razao_social || emp.nome_fantasia),
      rv('ENDEREÇO', [emp.endereco, emp.numero, emp.complemento, emp.bairro].filter(x => !vazio(x)).join(', ') || null),
      { text: [{ text: 'CIDADE: ', bold: true }, { text: cidade || '—' }, { text: '   ESTADO: ', bold: true }, { text: estado || '—' }] }], style: 'topo' },
    logoCli ? { width: 160, image: logoCli, fit: [150, 46], alignment: 'right' } : { width: 160, text: '' }] });
  C.push({ text: 'RELATÓRIO RESUMO DA INSPEÇÃO', style: 'titulo', margin: [0, 18, 0, 2] });
  if (V.numero_tap) C.push({ text: 'Nº TAP: ' + V.numero_tap, style: 'subtitulo' });
  // uma faixa cinza e os campos em 3 colunas; campo vazio sai com o traço
  const faixa = t => C.push({ table: { widths: ['*'], body: [[{ text: t, style: 'faixa' }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => FAIXA,
    paddingLeft: () => 8, paddingTop: () => 4, paddingBottom: () => 4 }, margin: [0, 12, 0, 6] });
  const grade = campos => {
    const cel = campos.map(([r, v, larg, extra]) => ({ c: { text: [{ text: r + ': ', bold: true }, Object.assign({ text: vazio(v) ? '—' : String(v) }, extra || {})], style: 'campo' }, larg: larg || 1 }));
    const linhas = []; let atual = [], usadas = 0;
    cel.forEach(x => { if (usadas + x.larg > 3) { linhas.push(atual); atual = []; usadas = 0; }
      atual.push(Object.assign(x.c, x.larg > 1 ? { colSpan: x.larg } : {})); for (let k = 1; k < x.larg; k++) atual.push({ text: '' }); usadas += x.larg; });
    if (atual.length) { while (usadas < 3) { atual.push({ text: '' }); usadas++; } linhas.push(atual); }
    C.push({ table: { widths: ['*', '*', '*'], body: linhas }, layout: 'noBorders', margin: [8, 0, 0, 0] });
  };
  faixa('DADOS DO VASO');
  grade([['TAG', V.tag], ['FABRICANTE', vazio(V.fabricante) ? 'Não identificado' : V.fabricante], ['ANO DE FABRICAÇÃO', V.ano_fabricacao],
    ['MODELO', V.modelo], ['Nº DE SÉRIE', V.numero_serie], ['POSIÇÃO', POSICAO[V.posicao] || V.posicao],
    ['VOLUME', volume != null ? fmt(volume * 1000, volume * 1000 < 10 ? 1 : 0) + ' L' : null], ['FLUIDO', fluido], ['CATEGORIA', comExtenso(R.categoria)],
    ['GRUPO DE RISCO', comExtenso(R.grupo)], ['FUNÇÃO', V.funcao], ['LOCAL', V.localizacao]]);
  faixa('DADOS DA INSPEÇÃO');
  grade([['NÚMERO TAP', V.numero_tap], ['RELATÓRIO', numero || 'a numerar'], ['DATA DA INSPEÇÃO', dataInsp],
    ['PRESSÃO DE OPERAÇÃO', barMPa(pOper)], ['PMTA', barMPa(pmta)], ['PTH', barMPa(pth)],
    ['TIPO', tipo || null], ['ART', (d.art || {}).numero, 2],
    ['PRÓXIMA INSPEÇÃO EXTERNA', dataBR(R.proxima_externa), 2], ['PRÓXIMA INTERNA', dataBR(R.proxima_interna)]]);
  // uma faixa por válvula e por manômetro (dois do mesmo tipo: "1", "2")
  const acs = (d.acessorios || []).filter(a => TITULO_AC[a.tipo]);
  const nTipo = {}; acs.forEach(a => { nTipo[a.tipo] = (nTipo[a.tipo] || 0) + 1; });
  const visto = {};
  acs.forEach(a => {
    visto[a.tipo] = (visto[a.tipo] || 0) + 1;
    faixa(TITULO_AC[a.tipo] + (nTipo[a.tipo] > 1 ? ' ' + visto[a.tipo] : ''));
    const f = a.afericao && (a.afericao.resultado === 'aprovado' || a.afericao.resultado === 'reprovado') ? a.afericao : null;
    const L = (f && f.leituras) || {}, un = f ? f.unidade : 'bar';
    const res = f ? RESULTADO[f.resultado] : null;
    const resultado = ['RESULTADO', res ? res[0] : 'Não aferido', 0, res ? { color: res[1], bold: true } : {}];
    const fab = vazio(a.marca) ? 'Não identificado' : a.marca, lacre = (f && f.lacre_colocado) || a.lacre_num;
    if (ehValvula(a.tipo)) {
      const ab = (L.aberturas || []).filter(x => x != null && x !== '').map(x => emBar(x, un));
      const as = (L.assentamentos || []).filter(x => x != null && x !== '').map(x => emBar(x, un));
      const ajuste = a.pressao_ajuste_mpa != null ? Number(a.pressao_ajuste_mpa) * 10 : null;
      grade([['FABRICANTE', fab], ['CONEXÃO', a.conexao], ['PRESSÃO DE ABERTURA', ab.length ? fmt(Math.max(...ab), 2) + ' bar' : (ajuste != null ? fmt(ajuste, 2) + ' bar' : null)],
        ['ASSENTAMENTO', as.length ? fmt(Math.min(...as), 2) + ' bar' : null], ['DATA DO TESTE', f ? dataBR(f.realizada_em || I.termino || I.inicio) : null], ['CERTIFICADO', f ? f.codigo : null],
        ['LACRE', lacre], resultado.slice(0, 2).concat([2, resultado[3]])]);
    } else {
      const ini = f ? emBar(f.faixa_ini || 0, un) : null, fimE = f ? emBar(f.faixa_fim, un) : null;
      const esc = fimE != null ? fmt(ini, 0) + ' – ' + fmt(fimE, fimE % 1 ? 1 : 0) + ' bar' : (a.escala || null);
      const psi = fimE != null ? fmt(ini / 0.0689476, 0) + ' – ' + fmt(fimE / 0.0689476, 0) + ' psi' : null;
      grade([['FABRICANTE', fab], ['ESCALA', esc], ['ESCALA EM PSI', psi], ['CONEXÃO', a.conexao], ['LACRE', lacre], ['CERTIFICADO', f ? f.codigo : null],
        resultado.slice(0, 2).concat([3, resultado[3]])]);
    }
  });
  const titulo = 'Resumo da inspeção ' + (numero || '') + ' · ' + (V.tag || '');
  return {
    pageSize: 'A4', pageMargins: [50, 46, 45, 100],
    info: { title: titulo, author: empresaM.nome || 'Engetap', creator: 'TapFlow · TapDoc', producer: 'TapFlow · TapDoc (pdfmake)', subject: 'NR-13 · Resumo · ' + (V.tag || '') },
    watermark: opc.marca ? { text: opc.marca, color: '#B42318', opacity: 0.12, bold: true, fontSize: opc.marca.length > 12 ? 38 : 70 } : undefined,
    // o rodapé do relatório (S161): linha fina, o logo, os dados da Engetap e o carimbo (ou o nome do PLH)
    footer: () => {
      const linha = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595.28 - 95, y2: 0, lineWidth: 0.5, lineColor: '#9AA5AE' }], margin: [0, 0, 0, 6] };
      const texto = { stack: [{ text: empresaM.nome || '', style: 'rodBold' }, { text: empresaM.contato || '', style: 'rod' }, { text: empresaM.site || '', style: 'rod' }], alignment: 'center', margin: [0, 4, 0, 0] };
      return { margin: [50, 8, 45, 0], stack: [linha, { columns: [
        logoEng ? { image: logoEng, width: 105 } : { width: 105, text: 'ENGETAP®', bold: true, color: AZUL },
        texto,
        CAR ? { width: 120, image: CAR.imagem, fit: [114, 46], alignment: 'right' }
            : { text: plh ? plh.nome + '\n' + (plh.registro || '') : '', style: 'rodCar', alignment: 'right', width: 150, margin: [0, 8, 0, 0] }] }]
        .concat(CAR ? [{ text: CAR.texto, style: 'rodCar', alignment: 'right', margin: [0, 3, 0, 0] }] : []) };
    },
    content: C,
    styles: {
      topo: { fontSize: 10, lineHeight: 1.3 }, titulo: { fontSize: 16, bold: true, color: AZUL, alignment: 'center' },
      subtitulo: { fontSize: 13, bold: true, color: AZUL, alignment: 'center' }, faixa: { fontSize: 10, bold: true, color: '#FFFFFF' },
      campo: { fontSize: 9.5, margin: [0, 1, 0, 1] },
      rod: { fontSize: 8, color: CINZA }, rodCar: { fontSize: 8, color: CINZA }, rodBold: { fontSize: 8.5, bold: true, color: CINZA }
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#000000' }
  };
}

// ── o Registro de Segurança (D2 · S165 · issue 30, Parte 2: DP8 e DP9) ─────────
// NR-13 (Portaria MTP nº 4.219/2022), item 13.5.1.7: livro de páginas numeradas, pastas ou sistema informatizado, com as
// ocorrências das inspeções, a condição operacional do vaso e o nome legível e a assinatura do PLH.
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dataExtenso(x) {
  if (!x) return null;
  let s = String(x);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { try { s = new Date(s).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch (e) { return null; } }
  const [a, m, dd] = s.slice(0, 10).split('-').map(Number);
  return dd + ' de ' + MESES[m - 1] + ' de ' + a;
}
const txt = (t, v) => String(t == null ? '' : t).replace(/\{\{(\w+)\}\}/g, (m, k) => v && v[k] != null ? String(v[k]) : '');
const eLista = xs => { xs = xs.filter(Boolean); return xs.length < 2 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]; };
const TIPO_MIN = { inicial: 'inicial', periodica: 'periódica', extraordinaria: 'extraordinária' };
const TESTE_TIPO = { hidrostatico: 'hidrostático', pneumatico: 'pneumático', hidropneumatico: 'hidropneumático' };
const maiusPal = s => String(s || '').replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/ (E|De|Da|Do|Das|Dos) /g, m => m.toLowerCase());

/**
 * Os fatos da inspeção que escolhem as frases da anotação (DP9), todos da fotografia do laudo:
 * o tipo e os exames, as aferições terminadas (com os números M/V), o teste (feito, desaconselhado ou não feito),
 * a conservação (exame visual), o prazo reduzido e a condição operacional.
 */
function fatosRegistro(d) {
  const I = d.inspecao || {}, R = d.resultado || {}, M = (d.modelo && d.modelo.blocos) || {}, TE = d.teste || {};
  const vis = d.visual || [];
  const nc = vis.filter(x => x.conforme === false && !/aterramento/i.test(x.item || ''));   // como o laudo (S143 · item 66)
  const visOk = !nc.length && vis.some(x => x.conforme === true);
  let abaixo = false;
  try { abaixo = raiz.LaudoPDF && raiz.LaudoPDF.espessuras ? raiz.LaudoPDF.espessuras(d).some(x => x.abaixo) : false; } catch (e) { abaixo = false; }
  const afs = (d.acessorios || []).filter(a => a.afericao && (a.afericao.resultado === 'aprovado' || a.afericao.resultado === 'reprovado'));
  let teste;
  if (TE.realizado) teste = { caso: 'feito', tipo: TESTE_TIPO[TE.tipo] || TE.tipo || 'de pressão', pressao: barMPa(TE.pressao_mpa), reprovado: TE.resultado === 'reprovado' };
  else if (M.teste_nao_cond && visOk && !abaixo) teste = { caso: TE.th_fabricacao_comprovado ? 'desaconselhado_th' : 'desaconselhado' };
  else teste = { caso: 'nao', motivo: TE.motivo_nao || 'motivo não informado' };
  const RED = I.prazo_red && R.datas_pelo_plh && R.justificativa_datas === I.prazo_red.just ? I.prazo_red : null;
  // condição operacional: o teste reprovado deixa o vaso inapto (o parecer do laudo); recomendação além das fixas do modelo = "com recomendações"
  let comRec = false;
  if (raiz.RecsNR13 && I.rec_ajustes !== undefined) {
    try {
      comRec = raiz.RecsNR13.montar({ B: M, ambiente: I.ambiente, categoria: R.categoria, placa: (d.vaso || {}).placa_situacao, rec_casos: I.rec_casos, ajustes: I.rec_ajustes || {},
        linhas: d.recomendacoes || [], acessorios: (d.acessorios || []).map(a => ({ id: a.id, tipo: a.tipo, situacao: a.situacao, resultado: a.afericao && a.afericao.resultado,
          grave: a.afericao && a.afericao.grave, caso_campos: a.caso_campos })) }).some(x => x.marcada && !x.fixa);
    } catch (e) { comRec = true; }
  } else comRec = (d.recomendacoes || []).length > 0 || (I.rec_casos || []).length > 0 || nc.length > 0 || afs.some(a => a.afericao.resultado === 'reprovado');
  const condicao = TE.realizado && TE.resultado === 'reprovado' ? 'nao_liberado' : comRec ? 'recomendacoes' : 'liberado';
  return { nc, visOk, abaixo, afs, teste, RED, condicao };
}

/**
 * O Registro de Segurança (DP8): opc.variante = 'livro' (termo de abertura, fabricante e caracterização técnica, e a
 * anotação: 3 folhas) ou 'anotacao' (só a folha da anotação, para o livro que já está no cliente).
 * O texto vem de blocos.registro do modelo da fotografia (textos prontos aprovados pelo PLH, DP9); opc.textos troca o bloco
 * (a minuta com a proposta ainda não aprovada). Sem os textos, devolve null (o Registro não sai).
 * O "Esta anotação ocupa a página ___" fica em branco (o livro é do cliente) e a assinatura à mão continua na via impressa.
 * opc: { variante, numero, revisao, carimbo, plh, marca, logoEngetap, emitidoEm, textos }.
 */
function registro(d, opc) {
  opc = opc || {};
  const M = (d.modelo && d.modelo.blocos) || {}, X = opc.textos || M.registro;
  if (!X || typeof X !== 'object') return null;
  const livro = opc.variante !== 'anotacao';
  const emp = d.empresa || {}, V = d.vaso || {}, I = d.inspecao || {}, R = d.resultado || {};
  const cams = V.camaras || [], rcams = d.resultado_camaras || [];
  const plh = opc.plh || d.plh || null;
  const CAR = opc.numero && opc.carimbo && /^data:image\/(png|jpe?g);base64,/i.test(opc.carimbo.imagem || '') && opc.carimbo.texto ? opc.carimbo : null;
  const logoEng = opc.logoEngetap || (raiz.LaudoPDF && raiz.LaudoPDF.logoEngetap) || null;
  const numero = opc.numero ? opc.numero + (opc.revisao ? ' Rev. ' + opc.revisao : '') : null;
  const F = fatosRegistro(d);
  const { cidade, estado } = cidadeUf(emp);
  const plhTxt = plh ? [plh.nome, plh.registro].filter(x => !vazio(x)).join(' – ') : 'o PLH que emitir o laudo';
  const rodTxt = [V.tag, V.numero_tap ? 'Nº TAP ' + V.numero_tap : null, 'Registro de Segurança'].filter(Boolean).join(' · ');
  const C = [];
  const quebra = () => { if (C.length) C[C.length - 1].pageBreak = 'after'; };
  const par = (t, extra) => { if (!vazio(t)) C.push(Object.assign({ text: t, style: 'par' }, extra || {})); };

  if (livro) {
    // folha 1 · o termo de abertura
    const end = [emp.endereco, emp.numero, emp.complemento, emp.bairro].filter(x => !vazio(x)).join(', ');
    C.push({ stack: [
      { text: txt(X.termo, { tag: V.tag || '—', tap: V.numero_tap ? ', Número TAP ' + V.numero_tap : '', empresa: emp.razao_social || emp.nome_fantasia || '—',
          endereco: end || '—', cidade: cidade || '—', estado: estado || '—', cnpj: emp.cnpj || '—' }), style: 'termo' },
      { text: [cidade, dataExtenso(opc.emitidoEm || d.emitido_em || I.termino || I.inicio)].filter(Boolean).join(', '), style: 'termo', alignment: 'right', margin: [0, 28, 0, 0] }],
      margin: [0, 170, 0, 0] });
    quebra();
    // folha 2 · o fabricante e a caracterização técnica (os números do relatório: a mesma fotografia)
    const linha = (r, v) => ({ text: [{ text: r + ': ', bold: true }, { text: vazio(v) ? '—' : String(v) }], style: 'carac' });
    C.push({ text: 'Fabricante do Vaso de Pressão', style: 'tituloReg', margin: [0, 0, 0, 10] });
    C.push(linha('Empresa', vazio(V.fabricante) ? 'Não identificado' : V.fabricante));
    const comp = V.componentes || [], costados = comp.filter(k => k.tipo === 'costado' || k.tipo === 'conico'), tampos = comp.filter(k => k.tipo !== 'costado' && k.tipo !== 'conico' && k.tipo !== 'janela');
    const matVaso = V.material && V.material.especificacao ? V.material.especificacao : null;
    const matDe = ks => ks.some(k => k.material_id && V.material && k.material_id !== V.material.id) ? 'conforme o relatório' : matVaso;
    const efDe = (ks, padrao) => { const e = [...new Set(ks.map(k => k.eficiencia_junta != null ? Number(k.eficiencia_junta) : padrao))]; return e.length ? e.map(x => fmt(x, 2)).join(' / ') : fmt(padrao, 2); };
    const pmta = rcams.length ? Math.min(...rcams.map(k => Number(k.pmta_adotada_mpa))) : (R.pmta_adotada_mpa != null ? Number(R.pmta_adotada_mpa) : null);
    const pth = (cams[0] && cams[0].pth_mpa != null) ? cams[0].pth_mpa : V.pth_mpa;
    const ambos = mpa => mpa == null || !isFinite(Number(mpa)) ? null : barMPa(mpa) + ' (' + fmt(mpa, 2) + ' MPa)';
    const volume = cams.reduce((a, k) => a + (Number(k.volume_m3) || 0), 0) || (R.volume_m3 != null ? Number(R.volume_m3) : null);
    const fluido = [...new Set(cams.map(k => k.fluido).filter(Boolean))].join(' / ') || null;
    const classe = [...new Set(cams.map(k => k.classe_fluido).filter(Boolean))].join(' / ') || R.classe || null;
    const codigo = V.sem_codigo_construcao ? 'Sem código de construção' : [V.codigo_construcao, V.codigo_edicao].filter(x => !vazio(x)).join(' – ') || null;
    C.push({ text: 'Caracterização Técnica do Vaso', style: 'tituloReg', margin: [0, 26, 0, 10] });
    [['Nº DE SÉRIE', V.numero_serie], ['ANO DE FABRICAÇÃO', V.ano_fabricacao], ['CÓDIGO DE CONSTRUÇÃO', codigo], ['PMTA', ambos(pmta)], ['PTH', ambos(pth)],
      ['MATERIAL DO COSTADO', matDe(costados)], ['MATERIAL DOS TAMPOS', matDe(tampos)],
      ['EFICIÊNCIA DE SOLDA', 'costado ' + efDe(costados, 0.70) + (tampos.length ? ' · tampos ' + efDe(tampos, 1.0) : '')],
      ['FLUIDO', [fluido, classe ? 'classe ' + classe : null].filter(Boolean).join(' · ') || null],
      ['GRUPO DE RISCO', comExtenso(R.grupo)], ['CATEGORIA', comExtenso(R.categoria)],
      ['VOLUME', volume != null ? fmt(volume * 1000, volume * 1000 < 10 ? 1 : 0) + ' litros' : null]].forEach(([r, v]) => C.push(linha(r, v)));
    quebra();
  }
  // a anotação (DP9: cada frase de um texto pronto, escolhido pelos dados)
  const exames = [I.exame_interno ? 'interna' : null, I.exame_externo ? 'externa' : null].filter(Boolean).join(' e ');
  const tipoMin = TIPO_INSP[I.tipo] ? TIPO_MIN[I.tipo] : (I.tipo || '');
  C.push({ text: maiusPal(txt(X.titulo, { tipo: tipoMin, exames })).replace(/\s+/g, ' ').trim(), style: 'tituloReg', margin: [0, 0, 0, 14] });
  const frag = F.afs.map(a => {
    const f = a.afericao, val = f.tipo === 'valvula' || ehValvula(a.tipo);
    let t = txt(val ? X.afer_valvula : X.afer_manometro, { numero: f.codigo || 'a numerar', resultado: f.resultado === 'reprovado' ? (X.afer_nc || '') : '' });
    if (a.tipo === 'manovacuometro') t = t.replace(/manômetro/g, 'manovacuômetro');
    if (a.tipo === 'valvula_alivio') t = t.replace(/válvula de segurança/g, 'válvula de alívio');
    return t;
  }).filter(x => !vazio(x));
  par(txt(X.abertura, { data: dataBR(I.termino || I.inicio) || '—', tipo: tipoMin, exames, afericoes: frag.length ? ', com ' + eLista(frag) : '',
    relatorio: numero || 'a numerar', plh: plhTxt }).replace(/\s+,/g, ','));
  const T = F.teste;
  if (T.caso === 'feito') par(txt(X.teste_feito, { tipo: T.tipo, pressao: T.pressao || '—', resultado: T.reprovado ? 'não conforme' : 'conforme' }));
  else if (T.caso === 'desaconselhado_th') par(X.teste_desaconselhado_th || X.teste_desaconselhado);
  else if (T.caso === 'desaconselhado') par(X.teste_desaconselhado);
  else par(txt(X.teste_nao, { motivo: String(T.motivo).replace(/[.\s]+$/, '').replace(/^./, c => c.toLowerCase()) }));
  par(F.nc.length ? txt(X.nao_conservado, { itens: eLista(F.nc.map(x => String(x.item || '').toLowerCase())) }) : X.conservado);
  if (F.RED) {
    const anos = n => n + (Number(n) === 1 ? ' ano' : ' anos');
    par(txt(X.prazo_reduzido, { prazos: eLista([F.RED.externo != null ? anos(F.RED.externo) + ' (exame externo)' : null, F.RED.interno != null ? anos(F.RED.interno) + ' (exame interno)' : null]) }));
  }
  const COND = { liberado: X.condicao_liberado, recomendacoes: X.condicao_recomendacoes, nao_liberado: X.condicao_nao_liberado };
  if (!vazio(COND[F.condicao])) C.push({ text: [{ text: 'Condição operacional: ', bold: true }, { text: COND[F.condicao] }], style: 'par' });
  if (R.proxima_externa || R.proxima_interna) C.push({ text: [{ text: 'Próximas inspeções: ', bold: true },
    { text: txt(X.proximas, { externa: dataBR(R.proxima_externa) || '—', interna: R.proxima_interna ? ' · interna até ' + dataBR(R.proxima_interna) : '' }) }], style: 'par' });
  par(X.pagina);
  const art = d.art || {}, os = (d.os || {}).numero;
  C.push({ text: [{ text: 'ART: ', bold: true }, { text: (art.numero || '—') + (os ? ' (' + osRot(os) + ')' : '') }], style: 'par' });
  // a assinatura à mão na via impressa (o oficial é o PDF assinado com o token)
  C.push({ stack: [{ text: ' ', margin: [0, 44, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 0.6, lineColor: '#1F2A33' }], alignment: 'center' },
    { text: plh ? plh.nome : 'Profissional Legalmente Habilitado', style: 'assin' }, { text: plh && plh.registro ? plh.registro : '', style: 'assinReg' }],
    alignment: 'center', margin: [0, 10, 0, 0], unbreakable: true });

  const W = 595.28, H = 841.89, B = 42;
  const titulo = 'Registro de Segurança ' + (numero || '') + ' · ' + (V.tag || '');
  return {
    pageSize: 'A4', pageMargins: [B + 36, B + 36, B + 36, 122],
    info: { title: titulo, author: (M.empresa_emissora || {}).nome || 'Engetap', creator: 'TapFlow · TapDoc', producer: 'TapFlow · TapDoc (pdfmake)', subject: 'NR-13 · Registro de Segurança · ' + (V.tag || '') },
    watermark: opc.marca ? { text: opc.marca, color: '#B42318', opacity: 0.12, bold: true, fontSize: opc.marca.length > 12 ? 38 : 70 } : undefined,
    background: () => ({ canvas: [{ type: 'rect', x: B, y: B, w: W - 2 * B, h: H - 2 * B, lineWidth: 1.1, lineColor: '#1F2A33' }] }),
    // o rodapé dentro da moldura: o logo, a identificação do vaso, o carimbo (ou o nome do PLH) e a folha (só no livro)
    footer: (pag) => ({ margin: [B + 36, 6, B + 36, 0], stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W - 2 * (B + 36), y2: 0, lineWidth: 0.5, lineColor: '#9AA5AE' }], margin: [0, 0, 0, 5] },
      { columns: [
        logoEng ? { image: logoEng, width: 78 } : { width: 78, text: 'ENGETAP®', bold: true, color: AZUL },
        { text: rodTxt + (livro ? '\nFolha ' + pag : ''), style: 'rod', margin: [8, 4, 0, 0] },
        CAR ? { width: 120, stack: [{ image: CAR.imagem, fit: [110, 30], alignment: 'right' }, { text: CAR.texto, style: 'rodCar', alignment: 'right', margin: [0, 2, 0, 0] }] }
            : { width: 140, text: plh ? plh.nome + '\n' + (plh.registro || '') : '', style: 'rodCar', alignment: 'right', margin: [0, 4, 0, 0] }] }] }),
    content: C,
    styles: {
      termo: { fontSize: 13, lineHeight: 1.6, alignment: 'justify' }, tituloReg: { fontSize: 13, bold: true, alignment: 'center' },
      carac: { fontSize: 10.5, margin: [0, 2, 0, 2] }, par: { fontSize: 10.5, lineHeight: 1.35, alignment: 'justify', margin: [0, 0, 0, 9] },
      assin: { fontSize: 10, alignment: 'center', margin: [0, 3, 0, 0] }, assinReg: { fontSize: 9, alignment: 'center', color: CINZA },
      rod: { fontSize: 8, color: CINZA }, rodCar: { fontSize: 7, color: CINZA }
    },
    defaultStyle: { font: 'Roboto', fontSize: 10.5, color: '#000000' }
  };
}
/** A proposta de textos ainda não aprovada vira o bloco do Registro (para a minuta): [{ chave:'registro.x', depois }] → { x: … }. */
function textosDaProposta(mudancas) {
  const out = {};
  (mudancas || []).forEach(m => { const k = String(m.chave || ''); if (/^registro\.\w+$/.test(k) && typeof m.depois === 'string') out[k.slice(9)] = m.depois; });
  return Object.keys(out).length ? out : null;
}

const DocumentosPDF = { resumo, registro, fatosRegistro, textosDaProposta, dataExtenso, nome, limpo, tagNome, osRot, ROTULO, versao: VERSAO };
if (typeof module !== 'undefined' && module.exports) module.exports = DocumentosPDF; else raiz.DocumentosPDF = DocumentosPDF;
})(typeof window !== 'undefined' ? window : globalThis);
