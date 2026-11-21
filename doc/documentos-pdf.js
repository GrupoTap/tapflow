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
 *   · DocumentosPDF.textosDaProposta(mudancas, bloco) — a proposta que espera o PLH vira o bloco de textos da minuta ("registro" ou "prontuario").
 * D3 · S166 · issue 30, Parte 3: o Prontuário (Reconstituído) usa as seções do próprio laudo-pdf.js (LaudoPDF.montar com opc.prontuario; DP1, DP11);
 *   aqui ficam o nome do arquivo dele (ROTULO.prontuario) e os textos da proposta para a minuta.
 * D4 · S167 · issue 30, Parte 4 (DP12, DP13): o fichário e as lombadas, gerados na hora (não são guardados nem assinados):
 *   · DocumentosPDF.kit(imprime, jaTemPasta) — 'completo', 'insercao' (D9: só a capa; antes, nenhuma folha nova) ou 'nao_imprime';
 *   · DocumentosPDF.fichario(d, opc) — a capa, a folha de rosto e as divisórias que existem, num PDF só por vaso;
 *   · DocumentosPDF.lombadas(itens, opc) — 2 lombadas por folha A4, de 40 ou 60 mm (itens de DocumentosPDF.lombadaDe).
 */
(function (raiz) {
'use strict';
const VERSAO = 'D10-S210-2026-11-21';   // D10 (S210 · issues 215, 216 e 227, Rodada R19): a boroscopia feita conta como exame interno ("Inspeção … Interna e Externa"); a frase do teste hidrostático desaconselhado sem a "evidência de teste anterior"; a ART sem a OS; "executou-se" sem quebrar no hífen; o nº de série da válvula no Resumo; a lombada com o QR code da imagem do TapWeb
// const VERSAO = 'D9-S208-2026-11-21';   // D9 (S208 · issue 218): a capa da pasta sai em toda inspeção — com a caixa "O cliente já tem o Registro de Segurança (livro)" marcada, o fichário é só a capa (fichario(d, { soCapa: true })); desmarcada, o kit completo
// const VERSAO = 'D8-S186-2026-11-17';   // D8 (S186 · issue 74): o volume do Resumo e do Registro é o da categoria; o Resumo sem o quadro do acessório ausente ou retirado (sem aferição) e mais compacto com 3 ou mais acessórios; a data do teste é a de quando a aferição terminou
// const VERSAO = 'D7-S183-2026-11-17';   // D7 (S183 · issue 69): a válvula aprovada em campo que abre acima da PMTA adotada conta como recomendação (rec_regra.valvula_pmta) e sai "não conforme" no Registro (a fotografia já a traz "reprovado")
// const VERSAO = 'D6-S178-2026-11-16';   // D6 (S178 · issue 60): a condição operacional "não liberado para operar nessa pressão" no Registro (PMTA adotada abaixo da pressão de operação; LaudoPDF.pressaoAbaixo)
// const VERSAO = 'D5-S173-2026-11-16';   // D5 (S173 · issue 57): o prazo reduzido do Registro pelas datas aprovadas (LaudoPDF.prazoReduzido)
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
const aferido = a => !!(a.afericao && (a.afericao.resultado === 'aprovado' || a.afericao.resultado === 'reprovado'));
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
  const volume = (R.volume_m3 != null ? Number(R.volume_m3) : cams.reduce((a, k) => a + (Number(k.volume_m3) || 0), 0) || null);
  const fluido = [...new Set(cams.map(k => k.fluido).filter(Boolean))].join(' / ') || null;
  const exames = examesDe(d);   // D10 · issue 227: a boroscopia feita conta como exame interno
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
  // D8 · issue 74, item 3: o acessório ausente ou retirado, sem aferição, não ganha quadro ("Não aferido" não diz nada dele);
  // com 3 ou mais quadros de acessório, as faixas ficam mais juntas, para o Resumo caber numa página (conferido com 4)
  const acs = (d.acessorios || []).filter(a => TITULO_AC[a.tipo] && !((a.situacao === 'ausente' || a.situacao === 'retirado') && !aferido(a)));
  const junto = acs.length >= 3;
  const faixa = t => C.push({ table: { widths: ['*'], body: [[{ text: t, style: 'faixa' }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => FAIXA,
    paddingLeft: () => 8, paddingTop: () => junto ? 3 : 4, paddingBottom: () => junto ? 3 : 4 }, margin: junto ? [0, 7, 0, 3] : [0, 12, 0, 6] });
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
  const nTipo = {}; acs.forEach(a => { nTipo[a.tipo] = (nTipo[a.tipo] || 0) + 1; });
  const visto = {};
  acs.forEach(a => {
    visto[a.tipo] = (visto[a.tipo] || 0) + 1;
    faixa(TITULO_AC[a.tipo] + (nTipo[a.tipo] > 1 ? ' ' + visto[a.tipo] : ''));
    const f = aferido(a) ? a.afericao : null;
    const L = (f && f.leituras) || {}, un = f ? f.unidade : 'bar';
    const res = f ? RESULTADO[f.resultado] : null;
    const resultado = ['RESULTADO', res ? res[0] : 'Não aferido', 0, res ? { color: res[1], bold: true } : {}];
    const fab = vazio(a.marca) ? 'Não identificado' : a.marca, lacre = (f && f.lacre_colocado) || a.lacre_num;
    if (ehValvula(a.tipo)) {
      const ab = (L.aberturas || []).filter(x => x != null && x !== '').map(x => emBar(x, un));
      const as = (L.assentamentos || []).filter(x => x != null && x !== '').map(x => emBar(x, un));
      const ajuste = a.pressao_ajuste_mpa != null ? Number(a.pressao_ajuste_mpa) * 10 : null;
      const serie = vazio(a.numero_serie) ? null : a.numero_serie;   // D10 · issue 216
      grade([['FABRICANTE', fab]].concat(serie ? [['Nº DE SÉRIE', serie]] : []).concat([['CONEXÃO', a.conexao], ['PRESSÃO DE ABERTURA', ab.length ? fmt(Math.max(...ab), 2) + ' bar' : (ajuste != null ? fmt(ajuste, 2) + ' bar' : null)],
        ['ASSENTAMENTO', as.length ? fmt(Math.min(...as), 2) + ' bar' : null], ['DATA DO TESTE', f ? dataBR(raiz.LaudoPDF && raiz.LaudoPDF.dataAfericao ? raiz.LaudoPDF.dataAfericao(f, I) : f.updated_at || f.realizada_em || I.termino || I.inicio) : null], ['CERTIFICADO', f ? f.codigo : null],
        ['LACRE', lacre], resultado.slice(0, 2).concat([serie ? 1 : 2, resultado[3]])]));
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

/** D10 · issue 227 (Bruno, 19/11): os exames da inspeção — a boroscopia feita (a microcâmera dentro do vaso) conta como exame
 *  interno, mesmo com a caixa "exame interno" desmarcada; o externo, como a inspeção marcou. */
function examesDe(d) {
  const I = (d && d.inspecao) || {}, B = (d && d.boroscopia) || {};
  const interno = I.exame_interno === true || B.realizada === true, externo = I.exame_externo === true;
  return [interno ? 'interna' : null, externo ? 'externa' : null].filter(Boolean);
}
/** D10 · issue 227: o hífen e a barra presos à palavra (como no laudo): o justificado não parte "executou-se" em "executou- se". */
const presos = t => typeof t !== 'string' ? t : t.replace(/(\p{L})-(?=\p{L})/gu, '$1\u2011').replace(/(\p{L})\/(?=\p{L})/gu, '$1/\uFEFF');

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
  // D10 · issue 227 (Bruno, 19/11): a frase sem "Pela evidência de teste hidrostático anterior" (saía em vaso sem documento nenhum)
  else if (M.teste_nao_cond && visOk && !abaixo) teste = { caso: 'desaconselhado' };
  else teste = { caso: 'nao', motivo: TE.motivo_nao || 'motivo não informado' };
  // S173 · issue 57: a frase do prazo reduzido sai das DATAS aprovadas (a mesma conta do laudo: LaudoPDF.prazoReduzido); sem o
  // gerador do laudo carregado, não se afirma redução nenhuma (antes: os anos digitados, que podiam não bater com a data)
  const RED = raiz.LaudoPDF && raiz.LaudoPDF.prazoReduzido ? raiz.LaudoPDF.prazoReduzido(d) : null;
  // condição operacional: o teste reprovado deixa o vaso inapto (o parecer do laudo); recomendação além das fixas do modelo = "com recomendações"
  let comRec = false;
  if (raiz.RecsNR13 && I.rec_ajustes !== undefined) {
    try {
      comRec = raiz.RecsNR13.montar({ B: M, ambiente: I.ambiente, categoria: R.categoria, placa: (d.vaso || {}).placa_situacao, rec_casos: I.rec_casos, ajustes: I.rec_ajustes || {},
        // D7 · issue 69: a válvula que abre acima da PMTA adotada usa o texto pronto dela (rec_regra.valvula_pmta), como no laudo
        linhas: d.recomendacoes || [], acessorios: (d.acessorios || []).map(a => ({ id: a.id,
          tipo: a.afericao && a.afericao.acima_adotada && (M.rec_regra || {}).valvula_pmta ? 'valvula_pmta' : a.tipo, situacao: a.situacao, resultado: a.afericao && a.afericao.resultado,
          grave: a.afericao && a.afericao.grave, caso_campos: a.caso_campos })) }).some(x => x.marcada && !x.fixa);
    } catch (e) { comRec = true; }
  } else comRec = (d.recomendacoes || []).length > 0 || (I.rec_casos || []).length > 0 || nc.length > 0 || afs.some(a => a.afericao.resultado === 'reprovado');
  // D6 · S178 · issue 60: a PMTA adotada abaixo da pressão de operação (aprovada pelo PLH com justificativa) nunca sai "liberado":
  // a mesma conta do laudo (LaudoPDF.pressaoAbaixo); sem o gerador do laudo carregado, a conta é refeita aqui
  const PA = raiz.LaudoPDF && raiz.LaudoPDF.pressaoAbaixo ? raiz.LaudoPDF.pressaoAbaixo(d)
    : (d.resultado_camaras || []).filter(k => k.p_operacao_mpa != null && k.pmta_adotada_mpa != null && Math.abs(Number(k.p_operacao_mpa)) > Number(k.pmta_adotada_mpa) + 0.0005);
  const condicao = TE.realizado && TE.resultado === 'reprovado' ? 'nao_liberado' : PA.length ? 'pressao' : comRec ? 'recomendacoes' : 'liberado';
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
  const par = (t, extra) => { if (!vazio(t)) C.push(Object.assign({ text: presos(t), style: 'par' }, extra || {})); };   // D10 · issue 227

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
    const volume = (R.volume_m3 != null ? Number(R.volume_m3) : cams.reduce((a, k) => a + (Number(k.volume_m3) || 0), 0) || null);
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
  const exames = examesDe(d).join(' e ');   // D10 · issue 227: a boroscopia feita conta como exame interno
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
    const rot = raiz.LaudoPDF.prazoRotulo;   // S173 · issue 57: o prazo que a data aprovada dá ("2 anos", "18 meses" ou "até 10/05/2027")
    par(txt(X.prazo_reduzido, { prazos: eLista([F.RED.externo ? rot(F.RED.externo) + ' (exame externo)' : null, F.RED.interno ? rot(F.RED.interno) + ' (exame interno)' : null]) }));
  }
  // D6 · issue 60: o texto aprovado pelo PLH (blocos.registro_condicao_pressao; na minuta, o da proposta: opc.textosPressao); sem ele, "não liberado"
  const TPR = M.registro_condicao_pressao || (opc.textosPressao || {}).registro_condicao_pressao;
  const COND = { liberado: X.condicao_liberado, recomendacoes: X.condicao_recomendacoes, nao_liberado: X.condicao_nao_liberado,
    pressao: TPR && raiz.LaudoPDF && raiz.LaudoPDF.pressaoVars ? txt(TPR, raiz.LaudoPDF.pressaoVars(d)) : X.condicao_nao_liberado };
  if (!vazio(COND[F.condicao])) C.push({ text: [{ text: 'Condição operacional: ', bold: true }, { text: COND[F.condicao] }], style: 'par' });
  if (R.proxima_externa || R.proxima_interna) C.push({ text: [{ text: 'Próximas inspeções: ', bold: true },
    { text: txt(X.proximas, { externa: dataBR(R.proxima_externa) || '—', interna: R.proxima_interna ? ' · interna até ' + dataBR(R.proxima_interna) : '' }) }], style: 'par' });
  par(X.pagina);
  // D10 · issue 227: a linha da ART só com o número (a OS é só da Engetap)
  const art = d.art || {};
  C.push({ text: [{ text: 'ART: ', bold: true }, { text: art.numero || '—' }], style: 'par' });
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
/** A proposta de textos ainda não aprovada vira o bloco do Registro ou do Prontuário (para a minuta): [{ chave:'registro.x', depois }] → { x: … }. */
function textosDaProposta(mudancas, bloco) {
  const out = {}, pre = (bloco || 'registro') + '.';   // D3: também "prontuario"
  (mudancas || []).forEach(m => { const k = String(m.chave || ''); if (k.indexOf(pre) === 0 && /^\w+$/.test(k.slice(pre.length)) && typeof m.depois === 'string') out[k.slice(pre.length)] = m.depois; });
  return Object.keys(out).length ? out : null;
}

// ── o fichário e as lombadas (D4 · S167 · issue 30, Parte 4: DP12 e DP13) ───────
// Não são documentos técnicos: não levam carimbo, número nem assinatura, e não são guardados (a página gera na hora, da
// fotografia do laudo emitido, como a placa: DP3, DP4). Só para cliente com "Imprime a pasta" = sim (cadastro do cliente).
const MM = 72 / 25.4, A4W = 595.28, A4H = 841.89;
const xml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ehImg = x => typeof x === 'string' && /^data:image\/(png|jpe?g);base64,/i.test(x);
const n1 = v => (Math.round(v * 100) / 100).toString();
/** O que sai do fichário para o vaso (DP12): cliente que não imprime a pasta = nada; já tem o livro = kit de inserção
 *  (D9 · issue 218: só a capa, que sai em toda inspeção); não tem = kit completo (capa, folha de rosto e divisórias). Quem diz "já tem" é a caixa da regra 45. */
function kit(imprime, jaTemPasta) { return imprime === false ? 'nao_imprime' : jaTemPasta ? 'insercao' : 'completo'; }
/** O logo oficial da Engetap, com o ®, em vetor (os contornos de vendor/placa-letras.js, o mesmo da placa): o texto de um SVG.
 *  Sem os contornos, null (quem chama usa o logo em imagem, que não tem o ®). */
function logoSvg(letras) {
  const G = (letras || raiz.PlacaLetras || {}).logo;
  if (!G || !G.formas || !G.w || !G.h) return null;
  let defs = '', corpo = '';
  G.formas.forEach((f, i) => {
    if (f.g) {   // o degradê do símbolo (na placa, em CMYK; aqui, as cores do logo de tela)
      defs += '<linearGradient id="lg' + i + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0" gradientTransform="matrix(' + f.g.join(' ') + ')">'
        + '<stop offset="0" stop-color="#1A4E96"/><stop offset="1" stop-color="#0089D0"/></linearGradient>';
      corpo += '<path d="' + f.d + '" fill="url(#lg' + i + ')"/>';
    } else corpo += '<path d="' + f.d + '" fill="' + (f.c === 'nome' ? '#535454' : '#0089D0') + '"/>';
  });
  // os contornos estão com o y para cima (como no PDF da placa): o grupo vira
  return { w: G.w, h: G.h, corpo: (defs ? '<defs>' + defs + '</defs>' : '') + '<g transform="matrix(1 0 0 -1 0 ' + G.h + ')">' + corpo + '</g>' };
}
const svgDoLogo = g => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + g.w + ' ' + g.h + '" width="' + g.w + '" height="' + g.h + '">' + g.corpo + '</svg>';

// as divisórias, na ordem do fichário (DP12); "linhas" = como o título quebra na folha
const DIVISORIAS = [
  { k: 'prontuario', nome: 'PRONTUÁRIO', linhas: ['PRONTUÁRIO'] },
  { k: 'relatorio', nome: 'RELATÓRIO DE INSPEÇÃO', linhas: ['RELATÓRIO DE', 'INSPEÇÃO'] },
  { k: 'certificados', nome: 'CERTIFICADOS VÁLVULA E MANÔMETRO', linhas: ['CERTIFICADOS', 'VÁLVULA E', 'MANÔMETRO'] },
  { k: 'anexos', nome: 'ANEXOS', linhas: ['ANEXOS'] },
  { k: 'registro', nome: 'REGISTRO DE SEGURANÇA', linhas: ['REGISTRO DE', 'SEGURANÇA'] }];
/** As divisórias que existem neste vaso: sem certificado, sem a divisória deles; sem o Prontuário emitido, sem a dele (regra 46).
 *  opc.prontuario = o vaso tem o Prontuário (Reconstituído) emitido; opc.certificados = tem certificado M/V (sem dizer, olha as aferições da fotografia). */
function divisorias(d, opc) {
  opc = opc || {};
  const temCert = opc.certificados != null ? !!opc.certificados
    : ((d && d.acessorios) || []).some(a => a.afericao && (a.afericao.resultado === 'aprovado' || a.afericao.resultado === 'reprovado'));
  return DIVISORIAS.filter(x => x.k === 'prontuario' ? !!opc.prontuario : x.k === 'certificados' ? temCert : true);
}
const fotoCapa = (d, opc) => ehImg(opc.foto) ? opc.foto : (() => { const img = opc.imagens || {}, f = ((d && d.fotos) || []).find(x => x.secao === 'capa' && ehImg(img[x.path])); return f ? img[f.path] : null; })();

/**
 * O fichário do vaso, kit completo (DP12): a capa, a folha de rosto e as divisórias que existem, num PDF só.
 *  · capa: a capa do relatório sem o tipo da inspeção e sem a cidade e a data (serve para todas as inspeções do vaso);
 *  · folha de rosto: a função do vaso, a TAG, o Nº TAP e a lista das divisórias;
 *  · divisórias: Prontuário · Relatório de Inspeção · Certificados Válvula e Manômetro · Anexos · Registro de Segurança.
 * A folha de rosto e as divisórias deixam 30 mm na margem esquerda para os furos do fichário.
 * opc: { foto | imagens, prontuario, certificados, letras, logoEngetap, soCapa }. soCapa (D9): só a capa (o kit de inserção).
 */
function fichario(d, opc) {
  opc = opc || {};
  const emp = d.empresa || {}, V = d.vaso || {};
  const g = logoSvg(opc.letras), logoPng = opc.logoEngetap || (raiz.LaudoPDF && raiz.LaudoPDF.logoEngetap) || null;
  const logo = (larg, extra) => Object.assign(g ? { svg: svgDoLogo(g), width: larg } : logoPng ? { image: logoPng, width: larg } : { text: 'ENGETAP®', bold: true, color: AZUL, fontSize: larg / 6 }, extra || {});
  const FX = 30 * MM, FD = 13 * MM, FY = 13 * MM, PAD = 26;          // a moldura: 30 mm à esquerda (os furos), 13 mm nos outros lados
  const ML = FX + PAD, MR = FD + PAD, MT = FY + PAD, altura = A4H - 2 * MT;
  const divs = divisorias(d, opc), foto = fotoCapa(d, opc);
  const funcao = vazio(V.funcao) ? (vazio(V.nome) ? 'Vaso de pressão' : V.nome) : V.funcao;
  const C = [];
  // 1 · a capa (sem os furos: vai na frente do fichário), centrada na folha
  C.push({ margin: [-(ML - MR), 0, 0, 0], stack: [
    logo(280, { alignment: 'center', margin: [0, 0, 0, 26] }),
    { text: emp.razao_social || emp.nome_fantasia || '', style: 'capaEmp' },
    { text: emp.cnpj ? 'CNPJ: ' + emp.cnpj : '', style: 'capaCnpj' },
    foto ? { image: foto, fit: [440, 330], alignment: 'center', margin: [0, 26, 0, 22] } : { text: '', margin: [0, 190, 0, 0] },
    { text: V.tag || '', style: 'capaTag' },
    { text: [funcao, V.numero_tap ? 'Número TAP: ' + V.numero_tap : null].filter(Boolean).join(' · '), style: 'capaSub' }] });
  // 2 · a folha de rosto: a função, a TAG, o Nº TAP e a lista das divisórias (no pé da moldura). D9: no kit de inserção, só a capa.
  if (!opc.soCapa) {
  C.push(logo(150, { pageBreak: 'before' }));
  C.push({ stack: [{ text: String(funcao).toUpperCase(), style: 'rostoTit' }, { text: V.tag || '', style: 'rostoTit', margin: [0, 10, 0, 0] },
    V.numero_tap ? { text: 'Número TAP: ' + V.numero_tap, style: 'rostoSub', margin: [0, 14, 0, 0] } : { text: '' }], margin: [0, 170, 0, 0] });
  C.push({ absolutePosition: { x: ML + 24, y: A4H - MT - 34 - divs.length * 24 }, stack: divs.map((x, i) => ({ text: (i + 1) + '. ' + x.nome, style: 'rostoLista' })) });
  // 3 · uma folha por divisória, com o título no meio
  divs.forEach(x => {
    C.push(logo(150, { pageBreak: 'before' }));
    C.push({ text: x.linhas.join('\n'), style: 'divTit', margin: [0, Math.max(40, (altura - 60 - x.linhas.length * 48) / 2 - 30), 0, 0] });
  });
  }
  return {
    pageSize: 'A4', pageMargins: [ML, MT, MR, MT],
    info: { title: 'Fichário · ' + (V.tag || ''), author: 'Engetap', creator: 'TapFlow · TapDoc', producer: 'TapFlow · TapDoc (pdfmake)', subject: 'NR-13 · Fichário · ' + (V.tag || '') },
    background: (pag) => pag === 1 ? null : { canvas: [{ type: 'rect', x: FX, y: FY, w: A4W - FX - FD, h: A4H - 2 * FY, lineWidth: 1.1, lineColor: '#1F2A33' }] },
    content: C,
    styles: {
      capaEmp: { fontSize: 15, bold: true, alignment: 'center' }, capaCnpj: { fontSize: 11, alignment: 'center', margin: [0, 2, 0, 0] },
      capaTag: { fontSize: 22, bold: true, alignment: 'center' }, capaSub: { fontSize: 12, alignment: 'center', margin: [0, 4, 0, 0] },
      rostoTit: { fontSize: 28, alignment: 'center', lineHeight: 1.15 }, rostoSub: { fontSize: 15, alignment: 'center' },
      rostoLista: { fontSize: 12, margin: [0, 0, 0, 9] }, divTit: { fontSize: 36, alignment: 'center', lineHeight: 1.25 }
    },
    defaultStyle: { font: 'Roboto', fontSize: 11, color: '#1F2A33' }
  };
}

// ── as lombadas (DP13) ───────────────────────────────────────────────────────
const TIPO_EQUIP = { vaso: 'Vaso de Pressão', caldeira: 'Caldeira', tubulacao: 'Tubulação', tanque: 'Tanque' };
const LARGURAS = [40, 60], LOMB_ALT = 265;                            // mm: 40 (padrão) ou 60 (o fichário maior); a altura da tira
/** A lombada de um vaso, da fotografia do laudo: extra = { link (o do TapWeb, o mesmo da placa), foto | imagens, largura }. */
function lombadaDe(d, extra) {
  extra = extra || {};
  const emp = (d && d.empresa) || {}, V = (d && d.vaso) || {}, cams = V.camaras || [];
  return { tag: V.tag || '', tipo: TIPO_EQUIP[V.nr13_tipo] || TIPO_EQUIP.vaso, fluido: [...new Set(cams.map(k => k.fluido).filter(Boolean))].join(' / ') || V.fluido || null,
    local: vazio(V.localizacao) ? null : String(V.localizacao).trim(), link: vazio(extra.link) ? null : String(extra.link).trim(),
    qr: qrDeTexto(extra.qr),   // D10 · issue 215: os módulos lidos da imagem baixada do TapWeb (equipamentos.tapweb_qr)
    foto: fotoCapa(d, extra), logoCliente: ehImg(emp.logo) ? emp.logo : null, largura: LARGURAS.indexOf(Number(extra.largura)) >= 0 ? Number(extra.largura) : 40 };
}
/** O que a lombada não tem e sai sem (a tela avisa): o QR code sem o link do TapWeb, a foto, a logomarca do cliente. */
function avisosLombada(x) {
  const a = [];
  if (!x.link && !x.qr) a.push('sem o QR code do TapWeb (a imagem ou o link): sai sem o QR code');
  if (!x.foto) a.push('sem a foto do vaso');
  if (!x.logoCliente) a.push('sem a logomarca do cliente');
  return a;
}
/** D10 · issue 215: os módulos guardados ("0" e "1", linha a linha: n × n) → { n, linhas }; formato errado, null. */
function qrDeTexto(t) {
  t = typeof t === 'string' ? t.trim() : ''; const n = Math.round(Math.sqrt(t.length));
  if (!t || n * n !== t.length || n < 21 || (n - 21) % 4 || /[^01]/.test(t)) return null;
  const linhas = []; for (let r = 0; r < n; r++) linhas.push(t.slice(r * n, r * n + n).split('').map(c => c === '1'));
  return { n, linhas };
}
function qrModulos(qrcode, texto) {
  const q = qrcode(0, 'M'); q.addData(String(texto)); q.make();
  const n = q.getModuleCount(), linhas = [];
  for (let r = 0; r < n; r++) { const l = []; for (let c = 0; c < n; c++) l.push(q.isDark(r, c)); linhas.push(l); }
  return { n, linhas };
}
/**
 * As lombadas da OS (DP13): 2 por folha A4, cada uma com a largura escolhida para o vaso (40 ou 60 mm) e 265 mm de altura.
 * De cima para baixo: a logomarca do cliente; "TAG – Vaso de Pressão – Fluido" e "Local: …" em pé; o QR code do link do
 * TapWeb (o mesmo da placa); a foto do vaso; o logo da Engetap com o ®. Sem a logo antiga da Proper.
 * itens: os de lombadaDe(); opc: { qrcode (a biblioteca vendor/qrcode.js), letras, logoEngetap, os, cliente }. Sem itens, null.
 */
function lombadas(itens, opc) {
  opc = opc || {}; itens = (itens || []).filter(Boolean);
  if (!itens.length) return null;
  const Q = opc.qrcode || raiz.qrcode, g = logoSvg(opc.letras), logoPng = opc.logoEngetap || (raiz.LaudoPDF && raiz.LaudoPDF.logoEngetap) || null;
  const dims = raiz.LaudoPDF && raiz.LaudoPDF.dimsImg ? raiz.LaudoPDF.dimsImg : () => null;
  const y0 = (297 - LOMB_ALT) / 2 * MM, H = LOMB_ALT * MM, x0 = 15 * MM, VAO = 10 * MM, PAD = 3 * MM, ESP = 4 * MM;
  const C = [];
  /** a imagem centrada na caixa (com as medidas da imagem); sem as medidas, encaixada no canto */
  const imagem = (url, x, y, w, h) => { const z = dims(url), k = z && z.w && z.h ? Math.min(w / z.w, h / z.h) : null;
    return k ? { image: url, width: z.w * k, height: z.h * k, absolutePosition: { x: x + (w - z.w * k) / 2, y: y + (h - z.h * k) / 2 } } : { image: url, fit: [w, h], absolutePosition: { x, y } }; };
  for (let p = 0; p * 2 < itens.length; p++) {
    let svg = '', x = x0; const imgs = [];
    itens.slice(p * 2, p * 2 + 2).forEach(it => {
      const W = it.largura * MM, util = W - 2 * PAD, cx = x + W / 2;
      svg += '<rect x="' + n1(x) + '" y="' + n1(y0) + '" width="' + n1(W) + '" height="' + n1(H) + '" fill="none" stroke="#1F2A33" stroke-width="0.6"/>';
      svg += '<text x="' + n1(x) + '" y="' + n1(y0 - 5) + '" font-family="Roboto" font-size="7" fill="#5B6770">' + xml(String(it.tag || 'sem TAG').slice(0, it.largura >= 60 ? 22 : 12) + ' · ' + it.largura + ' mm') + '</text>';
      // em cima: a logomarca do cliente
      const hLogo = 0.42 * W, yLogo = y0 + ESP;
      if (it.logoCliente) imgs.push(imagem(it.logoCliente, x + PAD, yLogo, util, hLogo));
      // embaixo, de baixo para cima: o logo da Engetap, a foto do vaso e o QR code
      let yb = y0 + H - ESP;
      const hEng = g ? util * g.h / g.w : util * 0.34; yb -= hEng;
      if (g) svg += '<g transform="translate(' + n1(x + PAD) + ' ' + n1(yb) + ') scale(' + (util / g.w).toFixed(5) + ')">' + g.corpo + '</g>';
      else if (logoPng) imgs.push(imagem(logoPng, x + PAD, yb, util, hEng));
      else svg += '<text x="' + n1(cx) + '" y="' + n1(yb + hEng * 0.7) + '" text-anchor="middle" font-family="Roboto" font-weight="bold" font-size="' + n1(util / 6) + '" fill="' + AZUL + '">ENGETAP®</text>';
      if (it.foto) { const hF = 0.6 * W; yb -= ESP + hF; imgs.push(imagem(it.foto, x + PAD, yb, util, hF)); }
      if (it.qr || (it.link && typeof Q === 'function')) {
        const lado = 0.6 * W, qr = it.qr || qrModulos(Q, it.link), mod = lado / (qr.n + 4), qx = cx - lado / 2; yb -= ESP + lado;
        svg += '<rect x="' + n1(qx) + '" y="' + n1(yb) + '" width="' + n1(lado) + '" height="' + n1(lado) + '" fill="#FFFFFF"/>';
        let dd = '';
        qr.linhas.forEach((l, r) => { let c = 0; while (c < qr.n) { if (!l[c]) { c++; continue; } let f = c; while (f < qr.n && l[f]) f++;
          dd += 'M' + n1(qx + (c + 2) * mod) + ' ' + n1(yb + (r + 2) * mod) + 'h' + n1((f - c) * mod) + 'v' + n1(mod + 0.03) + 'h-' + n1((f - c) * mod) + 'z'; c = f; } });
        svg += '<path d="' + dd + '" fill="#000000"/>';
      }
      // no meio, em pé (lê-se de baixo para cima): "TAG – Vaso de Pressão – Fluido" e, na linha de baixo, "Local: …"
      const topo = yLogo + (it.logoCliente ? hLogo : 0) + ESP, cabe = yb - ESP - topo, cy = topo + cabe / 2;
      const l1 = [it.tag || 'sem TAG', it.tipo, it.fluido].filter(Boolean).join(' – '), l2 = it.local ? 'Local: ' + it.local : null;
      const tam = (t, base, fator) => Math.max(7, Math.min(base, cabe / (Math.max(1, t.length) * fator)));
      const f1 = tam(l1, it.largura >= 60 ? 22 : 17, 0.58), f2 = l2 ? tam(l2, it.largura >= 60 ? 16 : 12.5, 0.54) : 0;
      const aperta = (t, f, fator) => t.length * f * fator > cabe ? ' textLength="' + n1(cabe) + '" lengthAdjust="spacingAndGlyphs"' : '';
      const entre = l2 ? Math.max(5, f1 * 0.45) : 0, larg = 0.72 * f1 + (l2 ? entre + 0.72 * f2 : 0), yl1 = -larg / 2 + 0.72 * f1;
      svg += '<g transform="translate(' + n1(cx) + ' ' + n1(cy) + ') rotate(-90)">'
        + '<text x="0" y="' + n1(yl1) + '" text-anchor="middle" font-family="Roboto" font-weight="bold" font-size="' + n1(f1) + '" fill="#1F2A33"' + aperta(l1, f1, 0.58) + '>' + xml(l1) + '</text>'
        + (l2 ? '<text x="0" y="' + n1(yl1 + entre + 0.72 * f2) + '" text-anchor="middle" font-family="Roboto" font-size="' + n1(f2) + '" fill="#1F2A33"' + aperta(l2, f2, 0.54) + '>' + xml(l2) + '</text>' : '') + '</g>';
      x += W + VAO;
    });
    C.push(Object.assign({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + A4W + ' ' + A4H + '" width="' + A4W + '" height="' + A4H + '">' + svg + '</svg>',
      width: A4W, absolutePosition: { x: 0, y: 0 } }, p ? { pageBreak: 'before' } : {}));
    imgs.forEach(i => C.push(i));
  }
  const tit = 'Lombadas · ' + [opc.cliente, opc.os ? osRot(opc.os) : null].filter(Boolean).join(' · ');
  return { pageSize: 'A4', pageMargins: [0, 0, 0, 0],
    info: { title: tit, author: 'Engetap', creator: 'TapFlow · TapDoc', producer: 'TapFlow · TapDoc (pdfmake)', subject: 'NR-13 · Lombadas do fichário' },
    content: C, defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1F2A33' } };
}

const DocumentosPDF = { resumo, registro, fatosRegistro, textosDaProposta, dataExtenso, nome, limpo, tagNome, osRot, ROTULO,
  kit, divisorias, fichario, lombadaDe, lombadas, avisosLombada, logoSvg, DIVISORIAS, LARGURAS, examesDe, qrDeTexto, versao: VERSAO };
if (typeof module !== 'undefined' && module.exports) module.exports = DocumentosPDF; else raiz.DocumentosPDF = DocumentosPDF;
})(typeof window !== 'undefined' ? window : globalThis);
