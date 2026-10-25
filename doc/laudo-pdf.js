/*
 * TapDoc · gerador do laudo em PDF (R06a, S94 · 25/10/2026)
 * ─────────────────────────────────────────────────────────
 * Puro: recebe os dados (tf_laudo_dados, ou a "fotografia" do laudo emitido) e
 * as imagens já baixadas, e devolve a definição do documento do pdfmake. Não
 * busca nada, não grava nada: quem baixa as fotos, gera o PDF, junta os anexos
 * (pdf-lib) e grava é a página (app/doc/index.html).
 *
 * Os textos fixos vêm do MODELO (doc_modelos, versão no laudo); aqui só está a
 * lógica de qual texto entra. Desenho: inspecao-nr13/rodadas/R06-laudo-desenho.md.
 * A conta da espessura mínima e da PMTA é a do motor (motor-calculo-nr13.js);
 * aqui ela só é ESCRITA com os números (a memória de cálculo do laudo).
 */
(function (raiz) {
'use strict';
const LOGO_ENGETAP = 'data:image/png;base64,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';
const COR = '#1B6FA9', CINZA = '#515252', CLARO = '#78838A';

// ── formatação (pt-BR: vírgula decimal, decisão do desenho, pergunta 7) ─────
function fmt(v, c) {
  if (v == null || v === '' || !isFinite(Number(v))) return '—';
  const n = Number(v).toFixed(c == null ? 2 : c);
  const [i, d] = n.split('.');
  const neg = i[0] === '-', ii = neg ? i.slice(1) : i;
  return (neg ? '−' : '') + ii.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '');
}
const bar = (mpa, c) => mpa == null ? '—' : fmt(Number(mpa) * 10, c == null ? 2 : c) + ' bar';
const mpaTxt = (mpa, c) => mpa == null ? '—' : fmt(mpa, c == null ? 3 : c) + ' MPa';
function dataBR(x) {
  if (!x) return '—';
  const s = String(x);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch (e) { return s; }
}
const dataSP = x => x ? new Date(x).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : null;
function txt(t, v) { return String(t == null ? '' : t).replace(/\{\{(\w+)\}\}/g, (m, k) => v && v[k] != null ? String(v[k]) : ''); }
const maiusc1 = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;

const TIPOS_COMP = { costado: 'Costado', eliptico: 'Tampo elíptico 2:1', torisferico: 'Tampo torisférico', hemisferico: 'Tampo hemisférico',
  conico: 'Cone', plano: 'Tampo plano', janela: 'Janela de visita' };
const TIPOS_ACESS = { valvula_seguranca: 'Válvula de segurança', valvula_alivio: 'Válvula de alívio', quebra_vacuo: 'Quebra-vácuo',
  manometro: 'Manômetro', manovacuometro: 'Manovacuômetro', termometro: 'Termômetro', pressostato: 'Pressostato', dreno: 'Dreno', ihm: 'IHM', outro: 'Outro' };
const TIPOS_TESTE = { hidrostatico: 'hidrostático', pneumatico: 'pneumático', hidropneumatico: 'hidropneumático' };
const POSICAO = { horizontal: 'Horizontal', vertical: 'Vertical' };
const LEG_FOTO = { plaqueta: 'Placa de identificação do vaso', acessorios: 'Acessório do vaso', localizacao: 'Local de instalação do vaso',
  visual: 'Exame visual', boroscopia: 'Boroscopia', componentes: 'Medição de espessura', teste: 'Teste de pressão', geral: 'Estado geral do vaso',
  operacao: 'Vaso em operação', capa: 'Vaso de pressão' };

// ── geometria: a MESMA regra do escritório e do celular (geoPadrao, pendência 2) ──
const GEO_CAMPOS = { costado: ['R'], eliptico: ['R'], conico: ['R', 'alfaGraus'], torisferico: ['L'], hemisferico: ['L'], plano: ['d', 'C'], janela: ['d', 'C'] };
const GEO_COL = { R: 'r_mm', L: 'l_mm', d: 'd_mm', C: 'fator_c', alfaGraus: 'alfa_graus', E: 'eficiencia_junta' };
function geoDe(vaso, c) {
  const rx = vaso.circunferencia_mm > 0 ? vaso.circunferencia_mm / (2 * Math.PI) : null;
  const p = { E: (c.tipo === 'costado' || c.tipo === 'conico') ? 0.7 : 1 };
  if (rx) {
    if (['costado', 'eliptico', 'conico'].indexOf(c.tipo) >= 0) p.R = rx;
    if (c.tipo === 'torisferico') p.L = 2 * rx;
    if (c.tipo === 'hemisferico') p.L = rx;
    if (c.tipo === 'plano') p.d = 2 * rx;
  }
  if (c.tipo === 'plano' || c.tipo === 'janela') p.C = 0.33;
  const g = { tipo: c.tipo, padrao: [] };
  (GEO_CAMPOS[c.tipo] || []).concat(['E']).forEach(k => {
    const x = c[GEO_COL[k]];
    if (x != null && x !== '') g[k] = Number(x); else if (p[k] != null) { g[k] = p[k]; g.padrao.push(k); }
  });
  return g;
}
// a memória de cálculo escrita: fórmula, substituição e resultado (as contas do motor R00)
function memoria(g, P, S, t) {
  const E = g.E, f = (x, c) => fmt(x, c == null ? 3 : c), cos = g.alfaGraus != null ? Math.cos(g.alfaGraus * Math.PI / 180) : null;
  switch (g.tipo) {
    case 'costado': return { fe: 'e = P·R / (S·E − 0,6·P)', se: `e = ${f(P)} · ${f(g.R, 2)} / (${f(S, 1)} · ${f(E, 2)} − 0,6 · ${f(P)})`, e: P * g.R / (S * E - 0.6 * P),
      fp: 'PMTA = S·E·t / (R + 0,6·t)', sp: t == null ? null : `PMTA = ${f(S, 1)} · ${f(E, 2)} · ${f(t, 2)} / (${f(g.R, 2)} + 0,6 · ${f(t, 2)})`, p: t == null ? null : S * E * t / (g.R + 0.6 * t), ref: 'UG-27(c)(1)' };
    case 'eliptico': return { fe: 'e = P·R / (S·E − 0,1·P)', se: `e = ${f(P)} · ${f(g.R, 2)} / (${f(S, 1)} · ${f(E, 2)} − 0,1 · ${f(P)})`, e: P * g.R / (S * E - 0.1 * P),
      fp: 'PMTA = S·E·t / (R + 0,1·t)', sp: t == null ? null : `PMTA = ${f(S, 1)} · ${f(E, 2)} · ${f(t, 2)} / (${f(g.R, 2)} + 0,1 · ${f(t, 2)})`, p: t == null ? null : S * E * t / (g.R + 0.1 * t), ref: 'UG-32(d), com D = 2R' };
    case 'torisferico': return { fe: 'e = 0,885·P·L / (S·E − 0,1·P)', se: `e = 0,885 · ${f(P)} · ${f(g.L, 2)} / (${f(S, 1)} · ${f(E, 2)} − 0,1 · ${f(P)})`, e: 0.885 * P * g.L / (S * E - 0.1 * P),
      fp: 'PMTA = S·E·t / (0,885·L + 0,1·t)', sp: t == null ? null : `PMTA = ${f(S, 1)} · ${f(E, 2)} · ${f(t, 2)} / (0,885 · ${f(g.L, 2)} + 0,1 · ${f(t, 2)})`, p: t == null ? null : S * E * t / (0.885 * g.L + 0.1 * t), ref: 'UG-32(e)' };
    case 'hemisferico': return { fe: 'e = P·L / (2·S·E − 0,2·P)', se: `e = ${f(P)} · ${f(g.L, 2)} / (2 · ${f(S, 1)} · ${f(E, 2)} − 0,2 · ${f(P)})`, e: P * g.L / (2 * S * E - 0.2 * P),
      fp: 'PMTA = 2·S·E·t / (L + 0,2·t)', sp: t == null ? null : `PMTA = 2 · ${f(S, 1)} · ${f(E, 2)} · ${f(t, 2)} / (${f(g.L, 2)} + 0,2 · ${f(t, 2)})`, p: t == null ? null : 2 * S * E * t / (g.L + 0.2 * t), ref: 'UG-32(f)' };
    case 'conico': return { fe: 'e = P·R / (cos α·(S·E − 0,6·P))', se: `e = ${f(P)} · ${f(g.R, 2)} / (${f(cos, 4)} · (${f(S, 1)} · ${f(E, 2)} − 0,6 · ${f(P)}))`, e: P * g.R / (cos * (S * E - 0.6 * P)),
      fp: 'PMTA = S·E·t·cos α / (R + 0,6·t·cos α)', sp: t == null ? null : `PMTA = ${f(S, 1)} · ${f(E, 2)} · ${f(t, 2)} · ${f(cos, 4)} / (${f(g.R, 2)} + 0,6 · ${f(t, 2)} · ${f(cos, 4)})`,
      p: t == null ? null : S * E * t * cos / (g.R + 0.6 * t * cos), ref: 'UG-32(g), α = ' + fmt(g.alfaGraus, 1) + '°' };
    default: return { fe: 'e = d·√(C·P / (S·E))', se: `e = ${f(g.d, 2)} · √(${f(g.C, 2)} · ${f(P)} / (${f(S, 1)} · ${f(E, 2)}))`, e: g.d * Math.sqrt(g.C * P / (S * E)),
      fp: 'PMTA = S·E·t² / (C·d²)', sp: t == null ? null : `PMTA = ${f(S, 1)} · ${f(E, 2)} · ${f(t, 2)}² / (${f(g.C, 2)} · ${f(g.d, 2)}²)`, p: t == null ? null : S * E * t * t / (g.C * g.d * g.d), ref: 'UG-34' };
  }
}

/** As fotos que o laudo usa, na ordem (a página baixa e devolve em `imagens`). */
function fotosDoLaudo(d) {
  const ordem = ['capa', 'localizacao', 'plaqueta', 'acessorios', 'visual', 'boroscopia', 'componentes', 'teste', 'geral'];
  return (d.fotos || []).filter(f => ordem.indexOf(f.secao) >= 0)
    .sort((a, b) => ordem.indexOf(a.secao) - ordem.indexOf(b.secao)).map(f => f.path);
}

/** A comparação das espessuras com a inspeção anterior (a mesma regra da revisão, 20/10). */
function espessuras(d) {
  const ants = d.espessuras_anteriores || [], base = dataSP(d.inspecao.termino || d.inspecao.inicio), resol = 0.01;
  return (d.resultado_componentes || []).map(rc => {
    const a = ants.find(y => y.componente_id === rc.componente_id);
    const o = { id: rc.componente_id, nome: rc.nome, atual: rc.t_min_mm, req: rc.e_min_mm, ant: a ? Number(a.t_ant) : null, dataAnt: a ? a.data_ant : null,
      fonte: a ? a.fonte : null, taxa: null, semPerda: false, abaixo: rc.abaixo_minima };
    if (o.ant != null && o.atual != null && o.dataAnt && base) {
      const anos = (new Date(base) - new Date(o.dataAnt)) / (365.25 * 864e5);
      if (anos > 0) { const perda = o.ant - o.atual; if (perda < resol) o.semPerda = true; else o.taxa = perda / anos; }
    }
    return o;
  });
}

function montar(d, opc) {
  opc = opc || {};
  const M = (d.modelo && d.modelo.blocos) || {}, T = M.titulos || {};
  const I = d.inspecao || {}, V = d.vaso || {}, R = d.resultado || {}, emp = d.empresa || {};
  const img = opc.imagens || {};
  const numero = opc.numero ? opc.numero + (opc.revisao ? ' Rev. ' + opc.revisao : '') : (opc.marca || 'RASCUNHO');
  const ini = dataSP(I.inicio), fim = dataSP(I.termino || I.inicio);
  const dataTopo = dataBR(fim);
  const cams = (V.camaras || []), rcams = d.resultado_camaras || [], rcomps = d.resultado_componentes || [];
  const pmtaVaso = rcams.length ? Math.min(...rcams.map(k => Number(k.pmta_adotada_mpa))) : (R.pmta_adotada_mpa != null ? Number(R.pmta_adotada_mpa) : null);
  let fig = 0, quadro = 0;
  const C = [];   // o conteúdo
  const sec = (n, t) => C.push({ text: n + '  ' + t, style: 'h1', tocItem: true, tocMargin: [0, 0, 0, 0], headlineLevel: 1 });
  const sub = (n, t) => C.push({ text: n + '  ' + t, style: 'h2', tocItem: true, tocMargin: [14, 0, 0, 0], headlineLevel: 2 });
  const par = (t, extra) => { if (t) C.push(Object.assign({ text: t, style: 'par' }, extra || {})); };
  const lista = (itens, ol) => { const xs = (itens || []).filter(Boolean); if (xs.length) C.push(Object.assign({ style: 'lista', margin: [14, 2, 0, 8] }, ol ? { ol: xs } : { ul: xs })); };
  const tabela = (cab, linhas, larg, titulo) => {
    // quadro pequeno não se parte entre páginas (título, cabeçalho e linhas juntos); o grande repete o cabeçalho
    const alvo = linhas.length <= 14 ? [] : C;
    if (titulo) alvo.push({ text: 'Quadro ' + (++quadro) + ' – ' + titulo, style: 'legenda', margin: [0, 6, 0, 3] });
    alvo.push({ table: { headerRows: cab ? 1 : 0, dontBreakRows: true, widths: larg || Array((cab || linhas[0]).length).fill('*'),
      body: (cab ? [cab.map(x => ({ text: x, style: 'th' }))] : []).concat(linhas.map(l => l.map(x => typeof x === 'object' && x !== null ? x : { text: x == null ? '—' : String(x), style: 'td' }))) },
      layout: { hLineColor: '#C9D2D8', vLineColor: '#C9D2D8', fillColor: (i) => cab && i === 0 ? '#E3EEF7' : null, paddingTop: () => 3, paddingBottom: () => 3 }, margin: [0, 0, 0, 10] });
    if (alvo !== C) C.push({ stack: alvo, unbreakable: true });
  };
  const fotos = (secao, legPad, filtro) => {
    const fs = (d.fotos || []).filter(f => f.secao === secao && img[f.path] && (!filtro || filtro(f)));
    for (let k = 0; k < fs.length; k += 2) {
      const par2 = fs.slice(k, k + 2).map(f => ({ stack: [{ image: img[f.path], fit: [235, 175], alignment: 'center' },
        { text: 'Figura ' + (++fig) + ' – ' + (f.legenda || (f.item ? f.item + (f.anomalia ? ': ' + f.anomalia : '') : legPad || LEG_FOTO[secao] || 'Foto')) + '.', style: 'legenda' }] }));
      if (par2.length === 1) par2.push({ text: '' });
      C.push({ columns: par2, columnGap: 12, margin: [0, 4, 0, 10], unbreakable: true });
    }
    return fs.length;
  };

  // ── capa ────────────────────────────────────────────────────────────────
  const capaFoto = (d.fotos || []).find(f => f.secao === 'capa' && img[f.path]);
  const exames = I.exame_externo && I.exame_interno ? 'ambos' : I.exame_interno ? 'interno' : 'externo';
  const capa = [
    { image: LOGO_ENGETAP, width: 200, alignment: 'center', margin: [0, 10, 0, 30] },
    { text: emp.razao_social || '', style: 'capaEmp' },
    { text: emp.cnpj ? 'CNPJ: ' + emp.cnpj : '', style: 'capaCnpj' },
    { text: (M.capa_tipo || {})[I.tipo] || 'INSPEÇÃO', style: 'capaTipo' },
    { text: (M.capa_exames || {})[exames] || '', style: 'capaSub' },
    capaFoto ? { image: img[capaFoto.path], fit: [380, 260], alignment: 'center', margin: [0, 18, 0, 18] } : { text: '', margin: [0, 120, 0, 0] },
    { text: V.tag || '', style: 'capaTag' },
    { text: 'OS ' + ((d.os || {}).numero || '—') + (opc.numero ? ' · Relatório nº ' + numero : ''), style: 'capaSub' },
    { text: [emp.cidade, emp.uf].filter(Boolean).join(' – '), style: 'capaRodape', margin: [0, 40, 0, 0] },
    { text: txt(ini === fim ? M.capa_data_um_dia : M.capa_data_periodo, { inicio: dataBR(ini), termino: dataBR(fim) }), style: 'capaRodape', pageBreak: 'after' }
  ];
  C.push(...capa);
  C.push({ toc: { title: { text: 'SUMÁRIO', style: 'sumario' }, numberStyle: { fontSize: 9 } }, pageBreak: 'after' });

  // ── 1 a 3 ───────────────────────────────────────────────────────────────
  sec('1', T.objetivo || 'OBJETIVO'); par(M.objetivo);
  sec('2', T.referencias || 'REFERÊNCIAS'); lista(M.referencias);
  sec('3', T.abreviacoes || 'LISTA DE ABREVIAÇÕES'); lista(M.abreviacoes);
  // ── 4 · a empresa ───────────────────────────────────────────────────────
  sec('4', T.empresa || 'IDENTIFICAÇÃO DA EMPRESA');
  const end = [emp.endereco, emp.numero, emp.complemento, emp.bairro].filter(Boolean).join(', ');
  const resp = emp.responsavel || null;
  tabela(null, [
    [{ text: 'Razão social', style: 'thl' }, emp.razao_social],
    [{ text: 'CNPJ', style: 'thl' }, emp.cnpj],
    [{ text: 'Atividade (CNAE)', style: 'thl' }, [emp.cnae, emp.cnae_descricao].filter(Boolean).join(' – ') || null],
    [{ text: 'Endereço', style: 'thl' }, end || null],
    [{ text: 'Cidade', style: 'thl' }, [emp.cidade, emp.uf].filter(Boolean).join(' – ') + (emp.cep ? ' · CEP ' + emp.cep : '') || null],
    [{ text: 'Responsável', style: 'thl' }, resp ? [resp.nome, resp.cargo].filter(Boolean).join(', ') + (resp.telefone ? ' · ' + resp.telefone : '') : null]
  ], [120, '*']);
  // ── 5 · localização ─────────────────────────────────────────────────────
  sec('5', T.localizacao || 'LOCALIZAÇÃO DO EQUIPAMENTO');
  par(txt(M.localizacao, { local: V.localizacao ? ', em ' + String(V.localizacao).replace(/[.\s]+$/, '') : '',
    coordenadas: V.latitude != null ? ', nas coordenadas ' + fmt(V.latitude, 6) + ', ' + fmt(V.longitude, 6) : '',
    ambiente: (M.ambiente || {})[I.ambiente] || 'de ambiente não informado' }));
  fotos('localizacao');

  // ── 6 · o equipamento ───────────────────────────────────────────────────
  sec('6', T.equipamento || 'IDENTIFICAÇÃO DO EQUIPAMENTO');
  sub('6.1', T.vaso || 'Identificação do vaso de pressão');
  par(txt(M.vaso_intro, { serie: V.numero_serie || 'não informado', fabricante: V.fabricante || 'fabricante não identificado', funcao: V.funcao ? String(V.funcao).toLowerCase().replace(/^(um|uma) /, '') : 'vaso de pressão' }));
  const volume = cams.reduce((a, k) => a + (Number(k.volume_m3) || 0), 0) || (R.volume_m3 != null ? Number(R.volume_m3) : null);
  const compsTxt = (V.componentes || []).filter(c => c.ativo !== false).map(c => c.nome + (c.tipo !== 'costado' && TIPOS_COMP[c.tipo] ? ' (' + TIPOS_COMP[c.tipo].toLowerCase() + ')' : '')).join('; ');
  const codigo = V.sem_codigo_construcao ? 'Sem código de construção' : V.codigo_construcao ? V.codigo_construcao + (V.codigo_edicao ? '/' + V.codigo_edicao : '') : 'ASME Seção VIII, Divisão 1 (adotado)';
  const linhas1 = [['Fabricante', V.fabricante], ['TAG', V.tag], ['Nº de série', V.numero_serie], ['Modelo', V.modelo], ['Ano de fabricação', V.ano_fabricacao],
    ['Código de construção', codigo], ['Posição', POSICAO[V.posicao] || V.posicao], ['Componentes', compsTxt || null],
    ['Volume', volume ? fmt(volume, 3) + ' m³ (' + fmt(volume * 1000, 0) + ' litros)' : null]];
  if (cams.length <= 1) {
    const k = cams[0] || {};
    linhas1.push(['Fluido', k.fluido], ['Classe do fluido', k.classe_fluido], ['Pressão máxima de operação', bar(k.p_operacao_max_mpa)],
      ['PMTA de plaqueta', bar(k.pmta_plaqueta_mpa != null ? k.pmta_plaqueta_mpa : V.pmta_plaqueta_mpa)], ['PTH de plaqueta', bar(k.pth_mpa != null ? k.pth_mpa : V.pth_mpa)]);
  }
  linhas1.push(['PMTA adotada nesta inspeção', bar(pmtaVaso)], ['Grupo de potencial de risco', R.grupo != null ? String(R.grupo) : null], ['Categoria (NR-13)', R.categoria]);
  tabela(null, linhas1.map(([a, b]) => [{ text: a, style: 'thl' }, b == null || b === '' ? '—' : String(b)]), [170, '*'], 'Descrição do equipamento');
  if (cams.length > 1) tabela(['Câmara', 'Fluido', 'Classe', 'Operação', 'Volume', 'PMTA de plaqueta', 'PTH'],
    cams.map(k => [k.nome, k.fluido, k.classe_fluido, bar(k.p_operacao_max_mpa), k.volume_m3 != null ? fmt(k.volume_m3, 3) + ' m³' : '—', bar(k.pmta_plaqueta_mpa), bar(k.pth_mpa)]), null, 'Câmaras do vaso');
  par(M.vaso_fonte);
  fotos('plaqueta');
  sub('6.2', T.acessorios || 'Identificação dos acessórios do vaso de pressão');
  const acs = d.acessorios || [];
  if (!acs.length) par(M.acessorios_nenhum);
  else {
    par(M.acessorios_intro);
    lista(acs.map(a => {
      const p = [TIPOS_ACESS[a.tipo] || a.tipo, a.tag ? a.tag : null].filter(Boolean).join(' ');
      const det = [a.marca ? 'marca ' + a.marca : null, a.modelo ? 'modelo ' + a.modelo : null, a.escala ? 'escala ' + a.escala : null,
        a.pressao_ajuste_mpa != null ? 'ajuste ' + bar(a.pressao_ajuste_mpa) : null, a.conexao ? 'conexão ' + a.conexao : null, a.lacre_num ? 'lacre nº ' + a.lacre_num : null].filter(Boolean).join(', ');
      const sit = { ok: '', substituir: ' — a substituir', ausente: ' — ausente', inoperante: ' — inoperante', retirado: ' — retirado nesta inspeção' }[a.situacao] || '';
      return p + (det ? ': ' + det : '') + sit + ';';
    }), true);
  }
  fotos('acessorios');

  // ── 7 · o escopo e os exames ────────────────────────────────────────────
  sec('7', T.escopo || 'ESCOPO DA INSPEÇÃO');
  par(txt(M.escopo, { periodo: ini === fim ? 'em ' + dataBR(ini) : 'de ' + dataBR(ini) + ' a ' + dataBR(fim) }));
  const B = d.boroscopia || {}, TE = d.teste || {};
  lista(['7.1 ' + (T.visual || 'Exame visual externo') + ';', '7.2 ' + (T.boroscopia || 'Inspeção interna por boroscopia') + (B.realizada ? ';' : ' (não realizada);'),
    '7.3 ' + (T.ultrassom || 'Medição de espessura por ultrassom') + ';', '7.4 ' + (T.teste || 'Teste de pressão') + (TE.realizado ? ';' : ' (não realizado);'),
    '7.5 ' + (T.manometro || 'Aferição do manômetro') + ';', '7.6 ' + (T.valvula || 'Teste da válvula de segurança') + '.']);
  // 7.1 visual
  sub('7.1', T.visual || 'Exame visual externo');
  const vis = d.visual || [], nc = vis.filter(x => x.conforme === false);
  par(M.visual_intro);
  lista(vis.map(x => x.conforme === false ? txt(M.visual_nc, { item: x.item, anomalia: x.anomalia || 'anomalia registrada' })
    : x.conforme === true ? ((M.visual_ok || {})[x.item] || txt(M.visual_ok_outro, { item: x.item })) : x.item + ': não avaliado;'));
  par(txt(M.visual_conclusao, { resultado: nc.length ? 'NÃO CONFORME' : 'CONFORME' }), { bold: true });
  fotos('visual');
  fotos('geral');
  // 7.2 boroscopia
  sub('7.2', T.boroscopia || 'Inspeção interna por boroscopia');
  const boroSubst = m => /fluido|conex|opera|substitu/i.test(m || '');
  if (B.realizada) par(B.resultado === 'com_anomalia' ? txt(M.boro_anomalia, { anomalia: B.anomalia || 'anomalia registrada' }) : M.boro_ok);
  else { par(txt(M.boro_nao, { motivo: B.motivo_nao || 'não informado' })); if (boroSubst(B.motivo_nao)) par(M.boro_substituida); }
  fotos('boroscopia');
  // 7.3 ultrassom
  sub('7.3', T.ultrassom || 'Medição de espessura por ultrassom');
  const med = d.medidor || {};
  par(txt(M.ultrassom_intro, { medidor: [med.marca, med.modelo].filter(Boolean).join(' ') || med.descricao || '—', serie: med.numero_serie || '—',
    certificado: med.certificado_num || '—', laboratorio: med.laboratorio ? ', ' + med.laboratorio : '', validade: dataBR(med.validade) }));
  const leit = d.leituras || [], comps = (V.componentes || []).filter(c => c.ativo !== false);
  const linhasUS = [];
  comps.forEach(c => {
    const ls = leit.filter(l => l.componente_id === c.id);
    const pontos = [...new Set(ls.map(l => l.ponto))].sort((a, b) => a - b);
    pontos.forEach((p, k) => {
      const vs = ls.filter(l => l.ponto === p).sort((a, b) => a.leitura - b.leitura).map(l => Number(l.valor_mm));
      linhasUS.push([k === 0 ? { text: c.nome, style: 'td', rowSpan: pontos.length } : {}, String(p)].concat([0, 1, 2, 3].map(i => vs[i] != null ? fmt(vs[i], 2) : ''))
        .concat([{ text: fmt(Math.min(...vs), 2), style: 'td', bold: true }]));
    });
  });
  if (linhasUS.length) tabela(['Componente', 'Ponto', 'Leitura 1', 'Leitura 2', 'Leitura 3', 'Leitura 4', 'Mínima'], linhasUS, ['*', 34, 48, 48, 48, 48, 48], 'Medição de espessura (mm)');
  const semL = I.ultrassom_sem_leitura || {};
  comps.filter(c => (semL[c.id] || '').trim()).forEach(c => par(txt(M.ultrassom_nao_medido, { componente: c.nome, motivo: semL[c.id] })));
  const ES = espessuras(d);
  if (ES.length) {
    tabela(['Componente', 'Mínima medida', 'Mínima requerida', 'Anterior', 'Taxa de perda'],
      ES.map(x => [x.nome, fmt(x.atual, 2) + ' mm', fmt(x.req, 2) + ' mm', x.ant != null ? fmt(x.ant, 2) + ' mm (' + dataBR(x.dataAnt) + ')' : '—',
        x.taxa != null ? fmt(x.taxa, 3) + ' mm/ano' : x.semPerda ? 'sem perda mensurável' : '—']), ['*', 70, 75, 105, 85], 'Espessuras: medida, requerida e anterior');
    const comAnt = ES.filter(x => x.ant != null), fonte = comAnt.length ? comAnt[0].fonte + (comAnt[0].dataAnt ? ' de ' + dataBR(comAnt[0].dataAnt) : '') : null;
    if (!comAnt.length) par(M.ultrassom_sem_anterior);
    else {
      const maior = comAnt.filter(x => x.taxa != null).sort((a, b) => b.taxa - a.taxa)[0];
      par(maior ? txt(M.ultrassom_perda, { fonte: 'a ' + fonte, taxa: fmt(maior.taxa, 3), componente: maior.nome }) : txt(M.ultrassom_sem_perda, { fonte: 'a ' + fonte }));
    }
    const abaixo = ES.filter(x => x.abaixo).map(x => x.nome);
    if (abaixo.length) par(txt(M.ultrassom_abaixo, { componentes: abaixo.join(', ') }), { bold: true });
  }
  fotos('componentes');
  // 7.4 teste
  sub('7.4', T.teste || 'Teste de pressão');
  if (TE.realizado) par(txt(TE.resultado === 'reprovado' ? M.teste_reprovado : M.teste_ok, { tipo: TIPOS_TESTE[TE.tipo] || TE.tipo || 'de pressão', pressao: bar(TE.pressao_mpa),
    duracao: TE.duracao_min ? ', durante ' + fmt(TE.duracao_min, 0) + ' minutos' : '', anomalia: TE.anomalia || 'anomalia registrada' }));
  else par(txt(M.teste_nao, { motivo: TE.motivo_nao || 'não informado' }));
  if (TE.th_fabricacao_comprovado) par(txt(M.th_comprovado, { comprovacao: TE.th_comprovacao || 'documento do fabricante' }));
  else if (!(TE.realizado && TE.tipo === 'hidrostatico' && TE.resultado !== 'reprovado')) {
    const ano = Number(V.ano_fabricacao) || null;
    par(!ano ? M.th_ano_desconhecido : ano < 2014 ? M.th_antes_2014 : M.th_depois_2014);
  }
  fotos('teste');
  // 7.5 e 7.6 aferições
  const presentes = a => ['ausente', 'retirado'].indexOf(a.situacao) < 0;
  const unidadeTxt = (v, un) => v == null ? '—' : fmt(v, 2) + ' ' + String(un || 'bar').replace('kgf/cm2', 'kgf/cm²');
  const conc = { man: [], valv: [] };
  sub('7.5', T.manometro || 'Aferição do manômetro');
  const mans = acs.filter(a => (a.tipo === 'manometro' || a.tipo === 'manovacuometro') && presentes(a));
  if (!mans.length) { par(M.manometro_nenhum); conc.man.push(M.conc && M.conc.man_nenhum); }
  mans.forEach(a => {
    const f = a.afericao, nome = (TIPOS_ACESS[a.tipo] === 'Manovacuômetro' ? 'manovacuômetro ' : '') + (a.tag || a.marca || '');
    if (f && (f.resultado === 'aprovado' || f.resultado === 'reprovado')) {
      const pz = f.padrao || {}, bz = f.bancada || {};
      par(txt(M.manometro_feito, { acessorio: nome || '', bancada: bz.descricao ? ' (' + [bz.descricao, bz.marca, bz.modelo].filter(Boolean).join(', ') + ')' : '',
        padrao: [pz.descricao, pz.marca, pz.modelo].filter(Boolean).join(', ') || '—', certificado: pz.certificado_num || '—', laboratorio: pz.laboratorio ? ', ' + pz.laboratorio : '',
        resultado: f.resultado === 'aprovado' ? 'APROVADO' : 'REPROVADO', codigo: f.codigo || 'a numerar' }));
      conc.man.push(M.conc && (f.resultado === 'aprovado' ? M.conc.man_ok : M.conc.man_nc));
    } else { par(txt(M.manometro_nao, { acessorio: nome, motivo: a.afericao_motivo || 'não informado' })); conc.man.push(txt(M.conc && M.conc.man_nao, { motivo: a.afericao_motivo || 'motivo não informado' })); }
  });
  sub('7.6', T.valvula || 'Teste da válvula de segurança');
  const valvs = acs.filter(a => ['valvula_seguranca', 'valvula_alivio', 'quebra_vacuo'].indexOf(a.tipo) >= 0 && presentes(a));
  if (!valvs.length) { par(M.valvula_nenhuma); conc.valv.push(M.conc && M.conc.valv_nenhuma); }
  valvs.forEach(a => {
    const f = a.afericao, nome = (a.tipo !== 'valvula_seguranca' ? (TIPOS_ACESS[a.tipo] || '').toLowerCase() + ' ' : '') + (a.tag || a.marca || '');
    const kc = rcams.find(k => k.camara_id === a.camara_id) || rcams[0] || {};
    if (f && (f.resultado === 'aprovado' || f.resultado === 'reprovado')) {
      const pz = f.padrao || {}, bz = f.bancada || {}, ab = ((f.leituras || {}).aberturas || []).map(Number).filter(x => isFinite(x));
      par(txt(M.valvula_feita, { acessorio: nome, bancada: bz.descricao ? ' (' + [bz.descricao, bz.marca, bz.modelo].filter(Boolean).join(', ') + ')' : '',
        padrao: [pz.descricao, pz.marca, pz.modelo].filter(Boolean).join(', ') || '—', certificado: pz.certificado_num || '—',
        ajuste: unidadeTxt(f.ajuste, f.unidade), abertura: ab.length ? unidadeTxt(ab.reduce((x, y) => x + y, 0) / ab.length, f.unidade) : '—',
        assentamento: unidadeTxt((f.leituras || {}).assentamento, f.unidade), pmta: bar(kc.pmta_adotada_mpa),
        resultado: f.resultado === 'aprovado' ? 'APROVADA' : 'REPROVADA', lacre: f.lacre_colocado || a.lacre_num || '—', codigo: f.codigo || 'a numerar' }));
      conc.valv.push(M.conc && (f.resultado === 'aprovado' ? M.conc.valv_ok : M.conc.valv_nc));
    } else { par(txt(M.valvula_nao, { acessorio: nome, motivo: a.afericao_motivo || 'não informado' })); conc.valv.push(txt(M.conc && M.conc.valv_nao, { motivo: a.afericao_motivo || 'motivo não informado' })); }
  });

  // ── 8 · espessura mínima requerida ──────────────────────────────────────
  sec('8', T.calculo || 'ESPESSURA MÍNIMA REQUERIDA');
  par(V.sem_codigo_construcao ? M.codigo_sem : V.codigo_construcao ? txt(M.codigo_conhecido, { codigo: codigo }) : M.codigo_estimado);
  const mat = V.material || {}, S = R.s_mpa != null ? Number(R.s_mpa) : Number(mat.s_mpa), cor = Number(R.corrosao_mm) || 0;
  par(txt(M.material, { material: [mat.especificacao, mat.forma].filter(Boolean).join(', ') || '—', s: fmt(S, 1), fonte: mat.fonte || 'ASME Seção II, Parte D' }));
  par(M.calculo_intro);
  lista(M.calculo_legenda);
  par(txt(M.calculo_minimo, { corrosao: fmt(cor, 2) }));
  const MEM = {};
  rcomps.forEach(rc => {
    const c = (V.componentes || []).find(x => x.id === rc.componente_id) || { tipo: rc.tipo, nome: rc.nome };
    const k = rcams.find(x => x.camara_id === rc.camara_id) || rcams[0] || {};
    const P = Math.abs(Number(k.p_operacao_mpa != null ? k.p_operacao_mpa : R.p_operacao_mpa));
    const g = geoDe(V, c), tU = rc.t_min_mm != null ? Number(rc.t_min_mm) - cor : null;
    try { MEM[rc.componente_id] = Object.assign(memoria(g, P, S, tU), { g, P, tU }); } catch (e) { MEM[rc.componente_id] = null; }
  });
  rcomps.forEach((rc, k) => {
    const m = MEM[rc.componente_id]; if (!m) return;
    sub('8.' + (k + 1), rc.nome + ' (' + (TIPOS_COMP[rc.tipo] || rc.tipo).toLowerCase() + ', ' + m.ref + ')');
    C.push({ stack: [{ text: m.fe, style: 'formula' }, { text: m.se + ' = ' + fmt(m.e, 3) + ' mm', style: 'formula' },
      { text: 'Espessura mínima requerida: ' + fmt(Number(rc.e_min_mm), 3) + ' mm' + (m.e < 1.5 ? ' (mínimo de 1,5 mm)' : '') + (cor ? ', com ' + fmt(cor, 2) + ' mm de corrosão' : '') + '.', style: 'par' },
      m.g.padrao.length ? { text: 'Geometria padrão (pendência 2): ' + m.g.padrao.join(', ') + '.', style: 'nota' } : { text: '' }], unbreakable: true });
  });

  // ── 9 · PMTA ────────────────────────────────────────────────────────────
  sec('9', T.pmta || 'PRESSÃO MÁXIMA DE TRABALHO ADMISSÍVEL (PMTA)');
  rcomps.forEach((rc, k) => {
    const m = MEM[rc.componente_id]; if (!m || !m.sp) return;
    const gov = rcams.some(x => x.governante_id === rc.componente_id);
    sub('9.' + (k + 1), rc.nome + (gov ? ' — governante' : ''));
    C.push({ stack: [{ text: m.fp, style: 'formula' }, { text: m.sp + ' = ' + fmt(m.p, 3) + ' MPa (' + bar(m.p) + ')', style: 'formula' }], unbreakable: true, margin: [0, 0, 0, 6] });
  });
  tabela(['Componente', 't medida', 't útil', 'E', 'PMTA'], rcomps.map(rc => {
    const m = MEM[rc.componente_id] || {}, gov = rcams.some(x => x.governante_id === rc.componente_id);
    return [{ text: rc.nome + (gov ? ' (governante)' : ''), style: 'td', bold: gov }, fmt(rc.t_min_mm, 2) + ' mm', m.tU != null ? fmt(m.tU, 2) + ' mm' : '—',
      m.g ? fmt(m.g.E, 2) : '—', rc.pmta_mpa != null ? fmt(rc.pmta_mpa, 3) + ' MPa' : '—'];
  }), ['*', 65, 65, 40, 75], 'PMTA por componente');
  rcams.forEach(k => {
    const nm = rcams.length > 1 ? k.nome + ': ' : '';
    if (k.regra_pmta === 'calculada') par(nm + txt(M.pmta_calculada, { governante: (rcomps.find(c => c.componente_id === k.governante_id) || {}).nome || '—', pmta: bar(k.pmta_adotada_mpa) }));
    else if (k.regra_pmta === 'mantida_anterior') par(nm + txt(M.pmta_mantida, { calculada: bar(k.pmta_calculada_mpa), pmta: bar(k.pmta_adotada_mpa) }));
    else par(nm + txt(M.pmta_plh, { pmta: bar(k.pmta_adotada_mpa), justificativa: k.justificativa_pmta || '' }));
    if (k.pmta_externa_mpa != null) par(nm + txt(M.pmta_externa, { pmta: bar(k.pmta_externa_mpa), justificativa: k.justificativa_externa || '' }));
  });
  C.push({ text: txt(M.pmta_final, { pmta: bar(pmtaVaso) }), style: 'destaque' });

  // ── 10 · categoria ──────────────────────────────────────────────────────
  sec('10', T.categoria || 'CATEGORIA DO VASO');
  par(M.categoria_intro);
  tabela(['Classe do fluido', 'P (MPa)', 'V (m³)', 'P·V', 'Grupo', 'Categoria'],
    [[R.classe_fluido, fmt(Math.abs(R.p_operacao_mpa), 3), fmt(R.volume_m3, 3), fmt(R.pv, 3), R.grupo != null ? String(R.grupo) : '—', { text: R.categoria || '—', style: 'td', bold: true }]], null);

  // ── 11 · recomendações ──────────────────────────────────────────────────
  sec('11', T.recomendacoes || 'RECOMENDAÇÕES');
  par(M.recomendacoes_intro);
  const recs = d.recomendacoes || [];
  const comPrazo = r => r.texto.replace(/[;.\s]*$/, '') + ';' + (r.prazo ? ' ' + txt(M.rec_prazo, { prazo: dataBR(r.prazo) }) : '');
  sub('11.1', T.rec_seguranca || 'Recomendações de segurança');
  lista([].concat(recs.filter(r => r.tipo === 'seguranca').map(comPrazo), recs.filter(r => r.tipo === 'geral').map(comPrazo), M.rec_seguranca_gerais || [],
    [I.ambiente && (M.rec_instalacao || {})[I.ambiente]], ['I', 'II'].indexOf(R.categoria) >= 0 ? [txt(M.rec_manual_cat12, { categoria: R.categoria })] : []), true);
  sub('11.2', T.rec_conservacao || 'Recomendações de conservação');
  lista([].concat(recs.filter(r => r.tipo === 'conservacao').map(comPrazo), M.rec_conservacao_gerais || []), true);

  // ── 12 · conclusão e parecer ────────────────────────────────────────────
  sec('12', T.conclusao || 'CONCLUSÃO E PARECER');
  par(M.conclusao_intro);
  const K = M.conc || {};
  const abaixoAlgum = ES.some(x => x.abaixo);
  lista([nc.length ? K.visual_nc : K.visual_ok,
    B.realizada ? (B.resultado === 'com_anomalia' ? K.boro_anomalia : K.boro_ok) : txt(K.boro_nao, { motivo: String(B.motivo_nao || 'motivo não informado').replace(/[.\s]+$/, '').toLowerCase() }),
    abaixoAlgum ? K.us_abaixo : K.us_ok,
    TE.realizado ? (TE.resultado === 'reprovado' ? K.teste_reprovado : K.teste_ok) : txt(K.teste_nao, { motivo: String(TE.motivo_nao || 'motivo não informado').replace(/[.\s]+$/, '').toLowerCase() })]
    .concat(conc.man).concat(conc.valv));
  const inapto = TE.realizado && TE.resultado === 'reprovado';
  C.push({ text: txt(inapto ? M.parecer_inapto : M.parecer_apto, { pmta: bar(pmtaVaso) }), style: 'destaque' });

  // ── 13 · próximas inspeções ─────────────────────────────────────────────
  sec('13', T.proximas || 'PRÓXIMAS INSPEÇÕES');
  if (R.datas_pelo_plh && R.justificativa_datas) par(txt(M.proximas_plh, { justificativa: R.justificativa_datas }));
  else if (V.sem_codigo_construcao) par(M.proximas_sem_codigo);
  else if (V.abaixo_zero_sem_deterioracao) par(M.proximas_abaixo_zero);
  else par(txt(M.proximas_tabela, { categoria: R.categoria || '—' }));
  const prazoTxt = (n, plh) => plh ? 'definido pelo PLH' : n == null ? 'a critério do PLH' : n + (n === 1 ? ' ano' : ' anos');
  tabela(['Exame', 'Prazo', 'Data limite'], [
    ['Externo', prazoTxt(R.prazo_externo_anos, R.datas_pelo_plh), { text: dataBR(R.proxima_externa), style: 'td', bold: true }],
    ['Interno', prazoTxt(R.prazo_interno_anos, R.datas_pelo_plh), { text: R.proxima_interna ? dataBR(R.proxima_interna) : '—', style: 'td', bold: true }]], [120, '*', 120]);

  // ── 14 · responsáveis ───────────────────────────────────────────────────
  sec('14', T.responsaveis || 'RESPONSÁVEIS PELA INSPEÇÃO');
  par(M.responsaveis_intro);
  const plh = opc.plh || d.plh || null;
  tabela(['Função', 'Nome', 'Registro'], [[{ text: 'PLH (responsável técnico)', style: 'thl' }, plh ? plh.nome + (plh.titulo ? ' — ' + plh.titulo : '') : 'assina quem emitir', plh ? plh.registro : '—']]
    .concat((d.equipe || []).map(q => [{ text: maiusc1(q.papel || 'equipe'), style: 'thl' }, q.nome + (q.perfil ? ' — ' + q.perfil : ''), '—'])), [130, '*', 110]);
  par(M.responsaveis_assinatura, { italics: true, color: CLARO });
  if (opc.numero) par('Relatório nº ' + numero + ', emitido em ' + dataBR(opc.emitidoEm) + (opc.revisao ? '. Revisão ' + opc.revisao + (opc.motivoRev ? ': ' + opc.motivoRev : '') : '') + '.', { color: CLARO });

  // ── 15 · anexos ─────────────────────────────────────────────────────────
  sec('15', T.anexos || 'ANEXOS');
  lista(M.anexos);

  // ── a página ────────────────────────────────────────────────────────────
  const logoCli = emp.logo && /^data:image\/(png|jpe?g);base64,/i.test(emp.logo) ? emp.logo : null;
  const empresaM = M.empresa_emissora || {};
  return {
    pageSize: 'A4', pageMargins: [50, 92, 45, 62],
    info: { title: 'Relatório de inspeção ' + numero + ' · ' + (V.tag || ''), author: empresaM.nome || 'Engetap', creator: 'TapFlow · TapDoc', producer: 'TapFlow · TapDoc (pdfmake)',
      subject: 'NR-13 · ' + (V.tag || '') + ' · modelo ' + ((d.modelo || {}).versao || '—') },
    watermark: opc.marca ? { text: opc.marca, color: '#B42318', opacity: 0.12, bold: true, fontSize: opc.marca.length > 12 ? 38 : 70 } : undefined,
    header: (pag, total) => pag === 1 ? null : {
      margin: [50, 22, 45, 0],
      table: { widths: [95, '*', 150], body: [[
        logoCli ? { image: logoCli, fit: [85, 36], alignment: 'center', margin: [0, 3, 0, 0] } : { text: emp.nome_fantasia || emp.razao_social || '', style: 'cabTxt', margin: [0, 10, 0, 0] },
        { stack: [{ text: 'Relatório nº ' + numero, style: 'cabNum' }, { text: 'ART: ' + ((d.art || {}).numero || '—'), style: 'cabTxt' }], alignment: 'center', margin: [0, 6, 0, 0] },
        { table: { widths: [52, '*'], body: [[{ text: 'OS', style: 'cabMin' }, { text: (d.os || {}).numero || '—', style: 'cabMin' }],
          [{ text: 'TAG', style: 'cabMin' }, { text: V.tag || '—', style: 'cabMin' }],
          [{ text: dataTopo, style: 'cabMin' }, { text: 'Página ' + pag + ' de ' + total, style: 'cabMin' }]] }, layout: { hLineColor: '#C9D2D8', vLineColor: '#C9D2D8' } }]] },
      layout: { hLineColor: '#C9D2D8', vLineColor: '#C9D2D8' }
    },
    footer: () => ({ margin: [50, 14, 45, 0], columns: [
      { image: LOGO_ENGETAP, width: 70 },
      { stack: [{ text: empresaM.nome || '', style: 'rodBold' }, { text: empresaM.contato || '', style: 'rod' }, { text: empresaM.site || '', style: 'rod' }], alignment: 'center' },
      { text: plh ? plh.nome + '\n' + (plh.registro || '') : '', style: 'rod', alignment: 'right', width: 110 }] }),
    content: C,
    // título não fica sozinho no pé da página
    pageBreakBefore: (no, seguintes) => !!no.headlineLevel && seguintes.length === 0,
    styles: {
      h1: { fontSize: 11.5, bold: true, color: COR, margin: [0, 14, 0, 6] },
      h2: { fontSize: 10.5, bold: true, color: CINZA, margin: [0, 10, 0, 4] },
      par: { fontSize: 10, lineHeight: 1.25, alignment: 'justify', margin: [0, 0, 0, 6] },
      lista: { fontSize: 10, lineHeight: 1.2 },
      th: { fontSize: 8.5, bold: true, color: '#164C77', alignment: 'center' },
      thl: { fontSize: 8.5, bold: true, color: '#164C77' },
      td: { fontSize: 8.5 },
      legenda: { fontSize: 8.5, italics: true, alignment: 'center', color: CINZA, margin: [0, 3, 0, 0] },
      formula: { fontSize: 9.5, margin: [14, 1, 0, 1] },
      nota: { fontSize: 8, italics: true, color: CLARO },
      destaque: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 10] },
      sumario: { fontSize: 14, bold: true, color: COR, alignment: 'center', margin: [0, 0, 0, 14] },
      capaEmp: { fontSize: 15, bold: true, alignment: 'center' }, capaCnpj: { fontSize: 11, alignment: 'center', margin: [0, 2, 0, 18] },
      capaTipo: { fontSize: 17, bold: true, alignment: 'center', color: COR }, capaSub: { fontSize: 11, alignment: 'center', color: CINZA, margin: [0, 2, 0, 0] },
      capaTag: { fontSize: 22, bold: true, alignment: 'center' }, capaRodape: { fontSize: 10, alignment: 'right', color: CINZA },
      cabNum: { fontSize: 9.5, bold: true }, cabTxt: { fontSize: 8, color: CINZA }, cabMin: { fontSize: 7.5 },
      rod: { fontSize: 7, color: CINZA }, rodBold: { fontSize: 7.5, bold: true, color: CINZA }
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#14181B' }
  };
}

const LaudoPDF = { montar, fotosDoLaudo, espessuras, memoria, geoDe, fmt, versao: 'R06a-2026-10-25' };
if (typeof module !== 'undefined' && module.exports) module.exports = LaudoPDF; else raiz.LaudoPDF = LaudoPDF;
})(typeof window !== 'undefined' ? window : globalThis);
