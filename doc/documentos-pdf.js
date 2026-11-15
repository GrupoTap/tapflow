/*
 * TapDoc · os documentos da inspeção além do relatório (S164 · issue 30, Parte 1 · 13/11/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Desenho: processos/documentos-inspecao-desenho.md (DP1, DP5, DP7).
 * Puro, como o laudo-pdf.js: recebe a FOTOGRAFIA do laudo emitido (tf_laudo_ver → dados) e devolve a definição do
 * pdfmake. Não busca nem grava nada: quem gera o PDF, assina com o carimbo e grava é a página (doc/index.html).
 *   · DocumentosPDF.resumo(d, opc)  — o "Relatório Resumo da Inspeção" (1 página, DP7);
 *   · DocumentosPDF.nome(tipo, ctx) — o nome padrão do arquivo (DP5);
 *   · DocumentosPDF.ROTULO          — o nome de cada documento nas telas.
 * Partes 2 a 4 (Registro de Segurança, Prontuário, fichário e lombadas) entram aqui depois.
 */
(function (raiz) {
'use strict';
const VERSAO = 'D1-S164-2026-11-13';
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

const DocumentosPDF = { resumo, nome, limpo, tagNome, osRot, ROTULO, versao: VERSAO };
if (typeof module !== 'undefined' && module.exports) module.exports = DocumentosPDF; else raiz.DocumentosPDF = DocumentosPDF;
})(typeof window !== 'undefined' ? window : globalThis);
