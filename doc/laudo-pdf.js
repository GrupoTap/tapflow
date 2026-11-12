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
 *
 * S153 · issue 6 (11/11/2026): a APARÊNCIA do laudo conforme as escolhas do Bruno (texto 12 preto; cabeçalho e
 * quadros em letra 10; rodapé com o carimbo legível; capa com o logo e a foto grandes; legendas 10 sem itálico;
 * quadro de rótulo e valor curto centralizado e longo em dois pares; fórmulas em bloco; PMTA final em caixa).
 * O texto dos modelos e a conta não mudaram.
 */
(function (raiz) {
'use strict';
const LOGO_ENGETAP = 'data:image/png;base64,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';
const COR = '#1B6FA9', CINZA = '#515252', CLARO = '#78838A', PRETO = '#000000', FAIXA = '#F1F4F7';

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
// S143 · item 68: o texto justificado do pdfmake parte a palavra no hífen e na barra ("Conclui- se", "kgf/ cm²");
// o hífen que não quebra (U+2011, que a Roboto tem) e a barra presa à letra seguinte (U+FEFF) resolvem
const presos = s => typeof s !== 'string' ? s : s.replace(/(\p{L})-(?=\p{L})/gu, '$1‑').replace(/(\p{L})\/(?=\p{L})/gu, '$1/﻿');
// S143 · item 67: só a palavra do resultado se destaca (seminegrito), com o ponto: verde CONFORME, vermelho NÃO CONFORME
const VERDE = '#1E7B34', VERMELHO = '#B42318';
const RES = { ok: 'CONFORME', nc: 'NÃO CONFORME' };
function comResultado(t, v, res) {
  const s = presos(txt(t, Object.assign({}, v, { resultado: '\u0001' })));
  const i = s.indexOf('\u0001');
  if (i < 0 || !RES[res]) return s.replace('\u0001', '');
  const depois = s.slice(i + 1), ponto = depois.charAt(0) === '.' ? '.' : '';
  return [s.slice(0, i), { text: RES[res] + ponto, bold: true, color: res === 'ok' ? VERDE : VERMELHO }, depois.slice(ponto.length)].filter(x => x !== '');
}
// S143 · item 62: a cidade do cadastro vem de muitos jeitos ("DIVINOPOLIS", "Divinopolis", "Para De Minas"); no laudo
// sai com a grafia certa: maiúsculas de nome próprio, "de/da/do" minúsculos e o acento das cidades conhecidas
const CIDADES_ACENTO = ('Araújos|Araxá|Bambuí|Barão de Cocais|Belém|Brasília|Carmópolis de Minas|Cláudio|Conceição do Pará|Cuiabá|Divinópolis|' +
  'Florianópolis|Goiânia|Indianópolis|Itaúna|Itatiaiuçu|Jaboatão dos Guararapes|Japaraíba|João Monlevade|Maceió|Macapá|Niterói|Perdigão|' +
  'Petrópolis|Pará de Minas|Pompéu|Poços de Caldas|Ribeirão das Neves|Santa Bárbara|Santo Antônio do Monte|São Gonçalo do Pará|' +
  'São João de Meriti|São Joaquim de Bicas|São José da Lapa|São José dos Pinhais|São Luís|São Paulo|São Sebastião do Oeste|Teófilo Otoni|' +
  'Três Corações|Três Marias|Uberlândia|Unaí|Vitória').split('|');
const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MAPA_CIDADES = {}; CIDADES_ACENTO.forEach(c => { MAPA_CIDADES[semAcento(c)] = c; });
function cidadeLaudo(c) {
  if (!c) return c;
  const s = String(c).trim().replace(/\s+/g, ' ');
  if (MAPA_CIDADES[semAcento(s)]) return MAPA_CIDADES[semAcento(s)];
  if (/[a-zà-ÿ]/.test(s) && !/\b(De|Da|Do|Das|Dos)\b/.test(s)) return s;   // já digitada com cuidado
  return s.toLowerCase().split(' ').map((p, i) => i > 0 && /^(de|da|do|das|dos|e|del)$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
// lista "a, b e c"
const eLista = xs => xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1];
// litros (item 64): o volume mostrado é sempre em litros; o m³ fica só na conta da categoria
const litros = m3 => m3 == null || !isFinite(Number(m3)) ? null : fmt(Number(m3) * 1000, Number(m3) * 1000 < 10 ? 1 : 0) + ' litros';
// pressão de outra unidade em bar (para comparar a abertura da válvula com a PMTA)
const EM_BAR = { bar: 1, 'kgf/cm2': 0.980665, 'kgf/cm²': 0.980665, psi: 0.0689476, mpa: 10, kpa: 0.01 };
const emBar = (v, un) => v == null ? null : Number(v) * (EM_BAR[String(un || 'bar').toLowerCase()] || 1);

const TIPOS_COMP = { costado: 'Costado', eliptico: 'Tampo elíptico 2:1', torisferico: 'Tampo torisférico', hemisferico: 'Tampo hemisférico',
  conico: 'Cone', plano: 'Tampo plano', janela: 'Janela de visita' };
const TIPOS_ACESS = { valvula_seguranca: 'Válvula de segurança', valvula_alivio: 'Válvula de alívio', quebra_vacuo: 'Quebra-vácuo',
  manometro: 'Manômetro', manovacuometro: 'Manovacuômetro', disco_ruptura: 'Disco de ruptura', termometro: 'Termômetro', pressostato: 'Pressostato', dreno: 'Dreno', ihm: 'IHM', outro: 'Outro' };
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

// S140 · item 49 (416): os lugares das fotos (a lista vem dos dados do laudo; sem ela, a mesma regra do banco)
function lugaresDe(d) {
  if (((d.inspecao || {}).lugares || []).length) return d.inspecao.lugares;
  const vt = (d.vaso || {}).posicao === 'vertical';
  return [['placa_fabricacao', 'plaqueta', 'Placa de fabricação'], ['placa_tag', 'plaqueta', 'Placa de TAG'], ['placa_categoria', 'plaqueta', 'Placa de categoria'],   // S149 · item 82
    [vt ? 'tampo_superior' : 'tampo_direito', 'geral', vt ? 'Tampo superior' : 'Tampo direito'], [vt ? 'tampo_inferior' : 'tampo_esquerdo', 'geral', vt ? 'Tampo inferior' : 'Tampo esquerdo'],
    ['conexoes', 'geral', 'Conexões'], ['base', 'geral', 'Base de sustentação / aterramento']].map(([lugar, secao, rotulo]) => ({ lugar, secao, rotulo }));
}
// S140 · item 51: a sigla da região do costado (pela posição; sem ela, pelo nome)
const REG_SIGLA = { frontal: 'CF', traseiro: 'CT', superior: 'CS', inferior: 'CI', direito: 'CLD', esquerdo: 'CLE' };
// S143: o nome manda (no piloto o CS veio com a posição "inferior"); sem sigla no nome, a posição
function siglaReg(c) {
  const m = String(c.nome || '').match(/\b(CF|CT|CS|CI|CLD|CLE)\s*$/i);
  if (m) return m[1].toUpperCase();
  return REG_SIGLA[c.posicao] || null;
}
// S143 · item 78 (7.3): o nome inteiro com a sigla: "Costado superior (CS)", "Tampo direito (TD)"
const REG_NOME = { CF: 'Costado frontal', CT: 'Costado traseiro', CS: 'Costado superior', CI: 'Costado inferior', CLD: 'Costado lateral direito', CLE: 'Costado lateral esquerdo' };
const TAMPO_SIGLA = { direito: 'TD', esquerdo: 'TE', superior: 'TS', inferior: 'TI' };
function siglaComp(c) {
  if (!c) return null;
  if (c.tipo === 'costado') return siglaReg(c);
  if (c.tipo !== 'conico' && c.tipo !== 'janela' && TAMPO_SIGLA[c.posicao]) return TAMPO_SIGLA[c.posicao];
  const m = String(c.nome || '').match(/\b(direito|esquerdo|superior|inferior)\b/i);
  return c.tipo !== 'conico' && c.tipo !== 'janela' && m ? TAMPO_SIGLA[m[1].toLowerCase()] : null;
}
// S148 · item 85: a ordem do medidor (a mesma do celular e da revisão): CF, CT, CS/CLD, CI/CLE, tampo direito ou superior, tampo esquerdo ou inferior
const ORDEM_SIGLA = { CF: 0, CT: 1, CS: 2, CLD: 2, CI: 3, CLE: 3, TD: 4, TS: 4, TE: 5, TI: 5 };
function rankMedicao(c) {
  const sg = siglaComp(c);
  if (sg && sg in ORDEM_SIGLA) return ORDEM_SIGLA[sg];
  return c.tipo === 'costado' ? -1 : 6;
}
function ordemMedicao(V) {
  const camOrd = c => { const k = (V.camaras || []).find(x => x.id === c.camara_id); return k ? (k.ordem || 0) : 0; };
  return (a, b) => camOrd(a) - camOrd(b) || rankMedicao(a) - rankMedicao(b) || (a.ordem || 0) - (b.ordem || 0);
}
/** S148 · item 90: os anexos, na ordem em que o PDF os junta: medidor, cada manômetro padrão usado, ART.
 *  Laudo de antes (a fotografia sem "padroes"): null, e vale a lista do modelo. */
function anexosDoLaudo(d) {
  if (!Array.isArray(d.padroes)) return null;
  const xs = ['Certificado de calibração do medidor de espessura']
    .concat(d.padroes.map(p => 'Certificado de calibração do manômetro padrão' + (p.descricao ? ' ' + p.descricao : '') + (p.numero_serie ? ' (nº ' + p.numero_serie + ')' : '')))
    .concat(['ART – Anotação de Responsabilidade Técnica']);
  return xs.map((x, k) => 'Anexo ' + (k + 1) + ' – ' + x + (k === xs.length - 1 ? '.' : ';'));
}
const MESMA_FOTO = /^Mesma foto da placa de TAG/;   // S149 · item 82

/**
 * S150 · item 81 (desenho 09, 4ª e 5ª rodadas de 11/11): o documento de cada aferição, separado, no pacote do laudo.
 *  Manômetro: "Relatório de Aferição de Manômetro" — conforme; não conforme pelas leituras (o ponto fora destacado);
 *  não conforme na etapa 1 (sem leituras: "etapa 2 não aplicável"). Válvula: "Certificado de Inspeção e Teste de
 *  Válvula de Segurança", com a frase "adequada para vasos com PMTA ≥ X" (X = a maior das 3 aberturas, V5; a PMTA não vai
 *  no certificado, decisão 10). Sem "Rede Brasileira de Calibração", "17025", "IT.INM033" nem "mínimo 5 ciclos" (decisão 6).
 *  Devolve a lista de { codigo, resultado, def } (uma definição do pdfmake por documento), na ordem dos acessórios.
 */
function documentosAfericao(d, opc) {
  opc = opc || {};
  const AZ = '#1B6FA9', CZ = '#515252', VERM = '#A62D18', VERDE = '#1E6B3A';
  const vazio = x => x == null || /^\s*(—|-|não há|nao ha|n\/a)?\s*$/i.test(String(x));
  const emp = d.empresa || {}, V = d.vaso || {}, I = d.inspecao || {};
  const plh = opc.plh || d.plh || null, CAR = opc.carimbo && opc.carimbo.imagem ? opc.carimbo : null;
  const out = [];
  (d.acessorios || []).forEach(a => {
    const f = a.afericao;
    if (!f || (f.resultado !== 'aprovado' && f.resultado !== 'reprovado')) return;
    const L = f.leituras || {}, cal = f.calculo || {}, e1 = !!(L.etapa1 && L.etapa1.ok === false);
    const vv = f.tipo === 'valvula', un = String(f.unidade || 'bar').replace('kgf/cm2', 'kgf/cm²'), ok = f.resultado === 'aprovado';
    const pz = f.padrao || {};
    const titulo = vv ? 'Certificado de Inspeção e Teste de Válvula de Segurança' : 'Relatório de Aferição de Manômetro';
    const C = [];
    const linha = (r, v) => [{ text: r, style: 'thl' }, { text: v == null || v === '' ? '—' : String(v), style: 'td' }];
    C.push({ text: titulo, style: 'titulo' }, { text: 'Nº ' + (f.codigo || 'a numerar') + (ok ? '' : ' · NÃO CONFORME'), style: 'numero', color: ok ? CZ : VERM });
    C.push({ table: { widths: [150, '*'], body: [
      linha('Cliente', emp.razao_social || emp.nome_fantasia), linha('Vaso de pressão', [V.tag, V.numero_tap ? 'Número TAP ' + V.numero_tap : null].filter(Boolean).join(' · ')),
      linha(vv ? 'Válvula' : 'Manômetro', [TIPOS_ACESS[a.tipo] || a.tipo, a.tag, !vazio(a.marca) ? 'marca ' + a.marca : null, a.conexao ? 'conexão ' + a.conexao : null].filter(Boolean).join(' · ')),
      linha(vv ? 'Unidade' : 'Escala de indicação', vv ? un : (f.faixa_fim != null ? fmt(f.faixa_ini || 0, 1) + ' a ' + fmt(f.faixa_fim, 1) + ' ' + un + (f.resolucao ? ' · resolução ' + fmt(f.resolucao, 2) : '') : '—')),
      linha('Data', dataBR(f.realizada_em || I.termino || I.inicio)),
      linha('Procedimento', 'PR-ENG-001 (Engetap), aprovado pelo PLH: ' + (vv ? 'desmontada até onde a construção permite, inspecionada, limpa e testada (NR-13, item 13.5.4.9)'
        : 'etapa 1, inspeção visual e funcional; etapa 2, comparação com o padrão em 3 cargas e 3 descargas por ponto')),
    ].concat(e1 ? [] : [linha('Padrão', [pz.descricao, pz.numero_serie ? 'nº ' + pz.numero_serie : null, pz.certificado_num ? 'certificado ' + pz.certificado_num : null,
        pz.laboratorio ? pz.laboratorio : null, pz.validade ? 'válido até ' + dataBR(pz.validade) : null].filter(Boolean).join(' · '))])
      .concat(!vv && !e1 ? [linha('Critério', 'ASME B40.100, Grau D (±5% do fundo de escala, em qualquer ponto)')] : []) }, layout: 'lightHorizontalLines', margin: [0, 6, 0, 10] });
    // etapa 1
    C.push({ text: 'Etapa 1 · inspeção visual e funcional', style: 'h2' });
    if (e1) {
      C.push({ text: 'Reprovado: ' + [].concat(L.etapa1.defeitos || []).concat(L.etapa1.obs ? [L.etapa1.obs] : []).join('; ').toLowerCase() + '.', style: 'par' },
             { text: 'Etapa 2 (comparação com o padrão): não aplicável.', style: 'par', color: CZ });
    } else C.push({ text: vv ? 'Aprovada: sem dano aparente, desmontada, inspecionada e limpa.' : 'Aprovado: visor, ponteiro, retorno ao zero, escala legível, rosca e lacre em condições.', style: 'par' });
    // etapa 2
    if (!e1 && !vv) {
      C.push({ text: 'Etapa 2 · comparação com o padrão', style: 'h2' });
      const corpo = [['Ponto', 'Padrão (média)', 'Erro médio', 'Tolerância', 'Incerteza (U, k = 2)', 'Dentro da tolerância?'].map(t => ({ text: t, style: 'th' }))]
        .concat((cal.pontos || []).map(p => [fmt(p.nominal, 2), fmt(p.ref_padrao, 2), (p.erro_medio > 0 ? '+' : '') + fmt(p.erro_medio, 2), '±' + fmt(p.tol, 2), fmt(p.U, 2),
          { text: p.ok ? 'Sim' : 'NÃO', bold: !p.ok, color: p.ok ? VERDE : VERM }].map(x => typeof x === 'object' ? Object.assign({ style: 'td', alignment: 'center' }, x) : { text: x, style: 'td', alignment: 'center' })));
      C.push({ table: { headerRows: 1, widths: ['*', '*', '*', '*', '*', '*'], body: corpo }, layout: 'lightHorizontalLines', margin: [0, 2, 0, 4] },
             { text: 'Valores em ' + un + '. Incerteza pela EA-4/02: raiz da soma dos quadrados da repetição, da resolução e do padrão, vezes k = 2.', style: 'nota' });
    }
    if (!e1 && vv) {
      C.push({ text: 'Etapa 2 · teste na bancada (3 ciclos)', style: 'h2' });
      const ab = L.aberturas || [], as = L.assentamentos || [];
      C.push({ table: { headerRows: 1, widths: ['*', '*', '*'], body: [['Ciclo', 'Abertura (' + un + ')', 'Assentamento (' + un + ')'].map(t => ({ text: t, style: 'th' }))]
        .concat([0, 1, 2].map(k => [String(k + 1), fmt(ab[k], 2), fmt(as[k], 2)].map(t => ({ text: t, style: 'td', alignment: 'center' })))) }, layout: 'lightHorizontalLines', margin: [0, 2, 0, 4] });
      const enc = L.reajustada ? L.encontrada : ab[0];
      if (enc != null) C.push({ text: L.reajustada ? 'Encontrada abrindo a ' + fmt(enc, 2) + ' ' + un + '; foi reajustada.' : 'Encontrada abrindo a ' + fmt(enc, 2) + ' ' + un + ' (sem ajuste).', style: 'par' });
      const mx = ab.filter(x => x != null).length ? Math.max(...ab.filter(x => x != null).map(Number)) : null;
      if (ok && mx != null) C.push({ text: 'Adequada para instalação em vasos com PMTA igual ou maior que ' + fmt(mx, 2) + ' ' + un + ' (NR-13, item 13.5.1.2 "a").', style: 'destaque' });
      if (L.motivo_acima) C.push({ text: 'Sem ajuste possível: ' + L.motivo_acima, style: 'par' });
      if (L.motivo_abaixo) C.push({ text: 'Observação: ' + L.motivo_abaixo, style: 'par' });
    }
    if (f.lacre_colocado && !e1) C.push({ text: 'Lacre colocado nº ' + f.lacre_colocado + '. A violação do lacre implica a perda desta aferição.', style: 'par' });
    C.push({ text: [{ text: 'Resultado: ' }, { text: ok ? 'CONFORME' : 'NÃO CONFORME', bold: true, color: ok ? VERDE : VERM }, { text: e1 ? ' (reprovado na etapa 1).' : '.' }], style: 'destaque' });
    if (!ok) C.push({ text: 'Recomendação: substituir ' + (vv ? 'a válvula por outra em condições e testada' : 'o manômetro por outro em condições e aferido') + ' (NR-13, item 13.3.6).', style: 'par' });
    C.push({ text: 'Verificação por comparação com padrão rastreável; não é calibração acreditada. O padrão tem certificado de calibração de laboratório acreditado (RBC), citado acima.', style: 'nota', margin: [0, 8, 0, 0] });
    C.push({ margin: [0, 26, 0, 0], unbreakable: true, stack: (CAR ? [{ image: CAR.imagem, fit: [170, 60] }] : [{ text: ' ' }]).concat([
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5, lineColor: CZ }] },
      { text: plh ? plh.nome + (plh.registro ? ' · ' + plh.registro : '') : 'Profissional Legalmente Habilitado', style: 'td' },
      { text: CAR ? CAR.texto : 'Profissional Legalmente Habilitado (PLH)', style: 'nota' }]) });
    out.push({ codigo: f.codigo || null, resultado: f.resultado, etapa1: e1, tipo: f.tipo, def: {
      pageSize: 'A4', pageMargins: [50, 50, 45, 60], info: { title: titulo + ' ' + (f.codigo || ''), author: 'Engetap', creator: 'TapDoc' },
      footer: (pag, total) => ({ margin: [50, 20, 45, 0], columns: [{ text: (f.codigo || '') + ' · ' + titulo, style: 'nota' }, { text: 'Página ' + pag + ' de ' + total, style: 'nota', alignment: 'right' }] }),
      content: C, defaultStyle: { fontSize: 9.5 },
      styles: { titulo: { fontSize: 14, bold: true, color: AZ, alignment: 'center' }, numero: { fontSize: 11, bold: true, alignment: 'center', margin: [0, 2, 0, 6] },
        h2: { fontSize: 10.5, bold: true, color: CZ, margin: [0, 8, 0, 3] }, par: { fontSize: 9.5, lineHeight: 1.2, margin: [0, 0, 0, 4] },
        th: { fontSize: 8.5, bold: true, color: '#164C77', alignment: 'center' }, thl: { fontSize: 8.5, bold: true, color: '#164C77' }, td: { fontSize: 8.5 },
        nota: { fontSize: 7.5, italics: true, color: '#7A8796' }, destaque: { fontSize: 10, bold: true, margin: [0, 6, 0, 6] } } } });
  });
  return out;
}
function nomeComp(c) {
  if (!c) return '';
  const sg = siglaComp(c);
  if (c.tipo === 'costado' && sg) return REG_NOME[sg] + ' (' + sg + ')';
  return c.nome + (sg && String(c.nome).indexOf('(' + sg + ')') < 0 ? ' (' + sg + ')' : '');
}

/** S143 · item 78 (7.3): o mapa dos pontos de medição, desenhado (SVG) com as siglas que têm leitura. */
function mapaSvg(posicao, siglas) {
  const tem = s => siglas.indexOf(s) >= 0;
  const ponto = (x, y, rot, tx, ty, anc) => '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#B42318"/>'
    + '<text x="' + tx + '" y="' + ty + '" font-size="12" font-weight="bold" fill="#14181B" text-anchor="' + (anc || 'middle') + '">' + rot + '</text>';
  let s = '';
  if (posicao === 'vertical') {
    s += '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">'
      + '<path d="M95 70 L95 230 A55 28 0 0 0 205 230 L205 70 A55 28 0 0 0 95 70 Z" fill="#E3EEF7" stroke="#1B6FA9" stroke-width="2"/>'
      + '<ellipse cx="150" cy="70" rx="55" ry="28" fill="#D3E4F2" stroke="#1B6FA9" stroke-width="2"/>';
    if (tem('TS')) s += ponto(150, 62, 'TS', 150, 30);
    if (tem('TI')) s += ponto(150, 252, 'TI', 150, 284);
    if (tem('CF')) s += ponto(150, 150, 'CF', 150, 140);
    if (tem('CT')) s += ponto(150, 185, 'CT (atrás)', 150, 176);
    if (tem('CLD')) s += ponto(200, 150, 'CLD', 215, 154, 'start');
    if (tem('CLE')) s += ponto(100, 150, 'CLE', 85, 154, 'end');
  } else {
    s += '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="190" viewBox="0 0 420 190">'
      + '<path d="M110 45 L310 45 A45 50 0 0 1 310 145 L110 145 A45 50 0 0 1 110 45 Z" fill="#E3EEF7" stroke="#1B6FA9" stroke-width="2"/>';
    if (tem('CS')) s += ponto(210, 50, 'CS', 210, 32);
    if (tem('CI')) s += ponto(210, 140, 'CI', 210, 170);
    if (tem('CF')) s += ponto(170, 95, 'CF', 170, 85);
    if (tem('CT')) s += ponto(250, 95, 'CT (atrás)', 250, 85);
    if (tem('TD')) s += ponto(345, 95, 'TD', 372, 99, 'start');
    if (tem('TE')) s += ponto(75, 95, 'TE', 48, 99, 'end');
  }
  return s + '</svg>';
}

/** As fotos que o laudo usa, na ordem (a página baixa e devolve em `imagens`). */
function fotosDoLaudo(d) {
  const ordem = ['capa', 'localizacao', 'plaqueta', 'acessorios', 'visual', 'boroscopia', 'componentes', 'teste', 'geral'];
  const mp = (d.inspecao || {}).mapa;   // S151 · issue 7: a imagem do mapa dos pontos (o desenho 3D gravado na revisão, ou o desenho próprio)
  return (d.fotos || []).filter(f => ordem.indexOf(f.secao) >= 0)
    .sort((a, b) => ordem.indexOf(a.secao) - ordem.indexOf(b.secao)).map(f => f.path)
    .concat(mp && mp.modo !== '2d' && mp.path ? [mp.path] : []);
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
  // S146 · item 79: os textos prontos (o caso escolhido em campo ou na revisão), da versão do modelo do laudo
  const PR = M.prontos || {};
  const trocarPalavra = (tipo, k, t) => { t = String(t || '');
    if (tipo === 'manovacuometro') t = t.replace(/manômetro/g, 'manovacuômetro');
    if (tipo === 'valvula_alivio' && k !== 'V4' && k !== 'V5') t = t.replace(/válvula de segurança/g, 'válvula de alívio');
    return t; };
  const caso = (k, campos, tipo, extra) => { const c = k && PR[k]; if (!c) return null;
    const vs = Object.assign({}, campos || {}, extra || {});
    return { c, texto: trocarPalavra(tipo, k, txt(c.texto, Object.assign({}, vs, { resultado: '{{resultado}}' }))), conc: c.conc ? trocarPalavra(tipo, k, txt(c.conc, vs)) : null }; };
  const parCaso = x => par(x.c.res === 'ok' || x.c.res === 'nc' ? comResultado(x.texto, {}, x.c.res) : presos(x.texto.replace('{{resultado}}', '')));
  const I = d.inspecao || {}, V = d.vaso || {}, R = d.resultado || {}, emp = d.empresa || {};
  const img = opc.imagens || {};
  // S145 · A2: o carimbo (o desenho confirmado pelo PLH e o texto da aprovação com a digital); só no laudo com número
  const CAR = opc.numero && opc.carimbo && /^data:image\/(png|jpe?g);base64,/i.test(opc.carimbo.imagem || '') && opc.carimbo.texto ? opc.carimbo : null;
  const numero = opc.numero ? opc.numero + (opc.revisao ? ' Rev. ' + opc.revisao : '') : (opc.marca || 'RASCUNHO');
  const ini = dataSP(I.inicio), fim = dataSP(I.termino || I.inicio);
  const dataTopo = dataBR(fim);
  const cams = (V.camaras || []), rcams = d.resultado_camaras || [], rcomps = d.resultado_componentes || [];
  const pmtaVaso = rcams.length ? Math.min(...rcams.map(k => Number(k.pmta_adotada_mpa))) : (R.pmta_adotada_mpa != null ? Number(R.pmta_adotada_mpa) : null);
  const numeroTap = V.numero_tap || null;   // S143 · item 63: o campo nasce na D2; sem ele, a linha não sai
  let fig = 0, quadro = 0;
  const FOTO_SO = [420, 300];   // S153 · item 9: a foto sozinha
  const C = [];   // o conteúdo
  const sec = (n, t) => C.push({ text: n + '  ' + t, style: 'h1', tocItem: true, tocMargin: [0, 0, 0, 0], headlineLevel: 1 });
  const sub = (n, t) => C.push({ text: n + '  ' + t, style: 'h2', tocItem: true, tocMargin: [14, 0, 0, 0], headlineLevel: 2 });
  const par = (t, extra) => { if (t && (typeof t !== 'string' || t.trim())) C.push(Object.assign({ text: Array.isArray(t) ? t : presos(t), style: 'par' }, extra || {})); };
  const lista = (itens, ol) => { const xs = (itens || []).filter(Boolean).map(presos); if (xs.length) C.push(Object.assign({ style: 'lista', margin: [14, 2, 0, 8] }, ol ? { ol: xs } : { ul: xs })); };
  const vazio = x => x == null || x === '' || /^\s*(—|-+|n[ãa]o h[áa]|n\/a)\s*$/i.test(String(x));
  // S153: o bloco que não se parte (quadro pequeno, conta) leva junto o título que vem logo antes dele, para o título não ficar sozinho no pé da página
  const junto = no => { const u = C[C.length - 1];
    if (u && u.headlineLevel && no.unbreakable) { C.pop(); C.push({ stack: [Object.assign({}, u, { headlineLevel: undefined }), Object.assign({}, no, { unbreakable: false })], unbreakable: true }); } else C.push(no); };
  // (um bloco só, e o título de dentro sem a regra da quebra: uma quebra de página dentro do bloco que não se parte some com o conteúdo)
  // S153 · issue 6, itens 10 a 12: com cabeçalho, as colunas depois da primeira saem centralizadas (os números);
  // `centro` = quadro só da largura do conteúdo, no meio da página
  const tabela = (cab, linhas, larg, titulo, centro) => {
    // quadro pequeno não se parte entre páginas (título, cabeçalho e linhas juntos); o grande repete o cabeçalho
    const alvo = linhas.length <= 14 ? [] : C;
    if (titulo) alvo.push({ text: 'Quadro ' + (++quadro) + ' – ' + titulo, style: 'legenda', margin: [0, 6, 0, 3] });
    const tb = { table: { headerRows: cab ? 1 : 0, dontBreakRows: true, widths: larg || Array((cab || linhas[0]).length).fill('*'),
      body: (cab ? [cab.map(x => ({ text: x, style: 'th' }))] : []).concat(linhas.map(l => l.map((x, k) => {
        const cel = typeof x === 'object' && x !== null ? x : { text: x == null ? '—' : presos(String(x)), style: 'td' };
        if (cab && k > 0 && cel.text != null && cel.alignment == null) cel.alignment = 'center';
        return cel; }))) },
      layout: { hLineColor: '#C9D2D8', vLineColor: '#C9D2D8', fillColor: (i) => cab && i === 0 ? '#E3EEF7' : null, paddingTop: () => 3, paddingBottom: () => 3 } };
    alvo.push(centro ? { columns: [{ width: '*', text: '' }, Object.assign({ width: 'auto' }, tb), { width: '*', text: '' }], margin: [0, 0, 0, 10] } : Object.assign(tb, { margin: [0, 0, 0, 10] }));
    if (alvo !== C) junto({ stack: alvo, unbreakable: true });
  };
  // linhas "rótulo | valor" que somem quando o valor está vazio (S143 · regra geral do "bem bolado")
  const tabelaRV = (linhas, larg, titulo) => {
    // S153 · issue 6 (regra geral): quadro curto (até 10 linhas) só da largura do conteúdo e centralizado; o longo, com
    // dois pares de rótulo e valor por linha, na largura toda
    const ls = linhas.filter(([, b]) => !vazio(b));
    if (!ls.length) return;
    if (ls.length <= 10) { tabela(null, ls.map(([a, b]) => [{ text: a, style: 'thl' }, String(b)]), ['auto', 'auto'], titulo, true); return; }
    const corpo = [];
    for (let k = 0; k < ls.length; k += 2) { const a = ls[k], b = ls[k + 1];
      corpo.push([{ text: a[0], style: 'thl' }, String(a[1]), b ? { text: b[0], style: 'thl' } : { text: '' }, b ? String(b[1]) : { text: '' }]); }
    tabela(null, corpo, ['auto', '*', 'auto', '*'], titulo);
  };
  // S143 · item 65: as figuras numeradas na ordem em que aparecem; uma figura pode ter várias fotos lado a lado
  const figura = (imgs, legenda, alvo) => {
    const n = ++fig, fit = imgs.length >= 3 ? [160, 150] : imgs.length === 1 ? FOTO_SO : [235, 175];   // S153 · item 9
    const linhas = [];
    for (let k = 0; k < imgs.length; k += (imgs.length >= 3 ? 3 : 2)) linhas.push(imgs.slice(k, k + (imgs.length >= 3 ? 3 : 2)));
    const bloco = { stack: linhas.map(l => l.length === 1 ? { image: l[0], fit, alignment: 'center', margin: [0, 2, 0, 2] }
        : { columns: l.map(im => ({ image: im, fit, alignment: 'center' })), columnGap: 10, margin: [0, 2, 0, 2] })
      .concat([{ text: 'Figura ' + n + ' – ' + presos(legenda) + '.', style: 'legenda' }]), margin: [0, 4, 0, 10], unbreakable: true };
    (alvo || C).push(bloco);
    return n;
  };
  // duas figuras pequenas por linha (os detalhes do vaso: tampos, conexões, base)
  // S153 · item 9: a foto sozinha sai grande e no meio; a que sobra de uma grade ímpar, no meio, no tamanho da grade
  const pares = (cel) => {
    if (cel.length === 1) {
      const im = (cel[0].stack || [])[0]; if (im && im.image) im.fit = FOTO_SO;
      C.push(Object.assign({}, cel[0], { margin: [0, 4, 0, 10], unbreakable: true })); return;
    }
    for (let k = 0; k < cel.length; k += 2) {
      const par2 = cel.slice(k, k + 2);
      C.push(par2.length === 1 ? { columns: [{ width: '*', text: '' }, Object.assign({ width: 244 }, par2[0]), { width: '*', text: '' }], margin: [0, 4, 0, 10], unbreakable: true }
        : { columns: par2, columnGap: 12, margin: [0, 4, 0, 10], unbreakable: true });
    }
  };
  // S140 · item 49: as fotos de lugar, na ordem dos lugares; sem foto, o motivo no lugar dela (2 por linha: 4 detalhes = grade 2×2)
  const LUG = lugaresDe(d), SEMAC = I.fotos_sem_acesso || {};
  const deLugar = f => /^lugar:/.test(f.item || '');
  const fotoDoLugar = l => (d.fotos || []).find(x => x.item === 'lugar:' + l.lugar && img[x.path]);
  const fotosLugares = lista => {
    const cel = [];
    lista.forEach(l => {
      const f = fotoDoLugar(l), mot = String(SEMAC[l.lugar] || '').trim();
      if (f) cel.push({ stack: [{ image: img[f.path], fit: [235, 175], alignment: 'center' }, { text: 'Figura ' + (++fig) + ' – ' + presos(l.rotulo) + '.', style: 'legenda' }] });
      else if (mot) cel.push({ stack: [{ text: presos(l.rotulo) + ': sem foto', bold: true, alignment: 'center', margin: [0, 40, 0, 4] }, { text: presos(mot), style: 'legenda', margin: [0, 0, 0, 40] }] });
    });
    pares(cel);
  };
  const fotos = (secao, legPad, filtro) => {
    const fs = (d.fotos || []).filter(f => f.secao === secao && img[f.path] && (!filtro || filtro(f)));
    pares(fs.map(f => ({ stack: [{ image: img[f.path], fit: [235, 175], alignment: 'center' },
      { text: 'Figura ' + (++fig) + ' – ' + presos(f.legenda || (f.item ? f.item + (f.anomalia ? ': ' + f.anomalia : '') : legPad || LEG_FOTO[secao] || 'Foto')) + '.', style: 'legenda' }] })));
    return fs.length;
  };
  const compDe = id => (V.componentes || []).find(x => x.id === id);

  // ── capa ────────────────────────────────────────────────────────────────
  const capaFoto = (d.fotos || []).find(f => f.secao === 'capa' && img[f.path]);
  const exames = I.exame_externo && I.exame_interno ? 'ambos' : I.exame_interno ? 'interno' : 'externo';
  const capa = [
    { image: LOGO_ENGETAP, width: 280, alignment: 'center', margin: [0, -36, 0, 20] },   // S153 · item 6: a capa não tem cabeçalho; o logo sobe
    { text: emp.razao_social || '', style: 'capaEmp' },
    { text: emp.cnpj ? 'CNPJ: ' + emp.cnpj : '', style: 'capaCnpj' },
    { text: (M.capa_tipo || {})[I.tipo] || 'INSPEÇÃO', style: 'capaTipo' },
    { text: (M.capa_exames || {})[exames] || '', style: 'capaSub' },
    capaFoto ? { image: img[capaFoto.path], fit: [470, 320], alignment: 'center', margin: [0, 14, 0, 14] } : { text: '', margin: [0, 120, 0, 0] },
    { text: V.tag || '', style: 'capaTag' },
    // S143 · item 63: o Número TAP no lugar da OS (a OS não aparece no laudo)
    { text: [numeroTap ? 'Número TAP ' + numeroTap : null, opc.numero ? 'Relatório nº ' + numero : null].filter(Boolean).join(' · '), style: 'capaSub' },
    { text: [cidadeLaudo(emp.cidade), emp.uf].filter(Boolean).join(' – '), style: 'capaRodape', margin: [0, 24, 0, 0] },
    { text: txt(ini === fim ? M.capa_data_um_dia : M.capa_data_periodo, { inicio: dataBR(ini), termino: dataBR(fim) }), style: 'capaRodape', pageBreak: 'after' }
  ];
  C.push(...capa);
  C.push({ toc: { title: { text: 'SUMÁRIO', style: 'sumario' }, textStyle: { fontSize: 11 }, numberStyle: { fontSize: 11 } }, pageBreak: 'after' });

  // ── 1 a 3 ───────────────────────────────────────────────────────────────
  sec('1', T.objetivo || 'OBJETIVO'); par(M.objetivo);
  sec('2', T.referencias || 'REFERÊNCIAS'); lista(M.referencias);
  sec('3', T.abreviacoes || 'LISTA DE ABREVIAÇÕES'); lista(M.abreviacoes);
  // ── 4 · a empresa (S143 · item 78: ramo, CNAE e grau de risco do cadastro; linha vazia não sai) ──
  sec('4', T.empresa || 'IDENTIFICAÇÃO DA EMPRESA');
  const end = [emp.endereco, emp.numero, emp.complemento, emp.bairro].filter(x => !vazio(x)).join(', ');
  const resp = emp.responsavel || null;
  tabelaRV([
    ['Razão social', emp.razao_social],
    ['CNPJ', emp.cnpj],
    ['Ramo de atividade', emp.ramo_atividade || emp.cnae_descricao],
    ['CNAE', emp.cnae],
    ['Grau de risco', emp.grau_risco != null ? String(emp.grau_risco) : null],
    ['Endereço', end],
    ['Cidade', [cidadeLaudo(emp.cidade), emp.uf].filter(Boolean).join(' – ') + (emp.cep ? ' · CEP ' + emp.cep : '')],
    ['Responsável', resp ? [resp.nome, resp.cargo].filter(x => !vazio(x)).join(', ') : null],
    ['Telefone', resp ? resp.telefone : null]
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
  const funcao = V.funcao ? String(V.funcao).toLowerCase().replace(/^(um|uma) /, '') : null;
  const qVaso = quadro + 1;
  // S148 · item 91: a placa com três respostas (com placa indelével, ilegível ou não indelével, sem placa)
  const placa = V.placa_situacao || (V.sem_placa ? 'sem' : 'indelevel');
  const introIlegivel = M.vaso_intro_placa_ilegivel || (M.vaso_intro_sem_placa ? M.vaso_intro_sem_placa.replace('não possui placa de identificação, exigida pelo',
    'possui placa de identificação ilegível ou não indelével, em desacordo com o') : null);
  par(txt(placa === 'sem' && M.vaso_intro_sem_placa ? M.vaso_intro_sem_placa : placa === 'ilegivel' && introIlegivel ? introIlegivel : M.vaso_intro, { serie: V.numero_serie || 'não informado',
    fabricante: V.fabricante || 'fabricante não identificado', funcao: funcao ? ' e funciona como ' + funcao : '', quadro: qVaso }));
  const volume = cams.reduce((a, k) => a + (Number(k.volume_m3) || 0), 0) || (R.volume_m3 != null ? Number(R.volume_m3) : null);
  // S143 · item 78: "Tampos: 2, elípticos 2:1" e "Costado: cilíndrico" no lugar das siglas soltas
  const ativos = (V.componentes || []).filter(c => c.ativo !== false).sort(ordemMedicao(V));   // S148 · item 85
  const TAMPO_PL = { eliptico: ['elíptico 2:1', 'elípticos 2:1'], torisferico: ['torisférico', 'torisféricos'], hemisferico: ['hemisférico', 'hemisféricos'], plano: ['plano', 'planos'] };
  const tampos = ativos.filter(c => TAMPO_PL[c.tipo]);
  const porTipo = {}; tampos.forEach(c => { porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1; });
  const tamposTxt = tampos.length ? tampos.length + ', ' + Object.keys(porTipo).map(t => (Object.keys(porTipo).length > 1 ? porTipo[t] + ' ' : '') + TAMPO_PL[t][porTipo[t] > 1 ? 1 : 0]).join(' e ') : null;
  const costadoTxt = [ativos.some(c => c.tipo === 'costado') ? 'cilíndrico' : null, ativos.some(c => c.tipo === 'conico') ? 'cônico' : null].filter(Boolean).join(' e ') || null;
  const janelas = ativos.filter(c => c.tipo === 'janela').length;
  const codigo = V.sem_codigo_construcao ? 'Sem código de construção' : V.codigo_construcao ? V.codigo_construcao + (V.codigo_edicao ? ' / ' + V.codigo_edicao : '') : 'ASME VIII Div. 1 – adotado';
  const linhas1 = [['Fabricante', V.fabricante], ['TAG', V.tag], ['Número TAP', numeroTap], ['Função', V.funcao], ['Nº de série', V.numero_serie], ['Modelo', V.modelo], ['Ano de fabricação', V.ano_fabricacao],
    ['Código de construção', codigo], ['Posição', POSICAO[V.posicao] || V.posicao], ['Tampos', tamposTxt], ['Costado', costadoTxt], ['Janelas de visita', janelas || null],
    ['Volume', litros(volume)]];
  if (cams.length <= 1) {
    const k = cams[0] || {};
    linhas1.push(['Fluido', k.fluido], ['Classe do fluido', k.classe_fluido], ['Pressão máxima de operação', k.p_operacao_max_mpa != null ? bar(k.p_operacao_max_mpa) : null],
      ['PMTA de plaqueta', (k.pmta_plaqueta_mpa != null ? k.pmta_plaqueta_mpa : V.pmta_plaqueta_mpa) != null ? bar(k.pmta_plaqueta_mpa != null ? k.pmta_plaqueta_mpa : V.pmta_plaqueta_mpa) : null],
      ['PTH de plaqueta', (k.pth_mpa != null ? k.pth_mpa : V.pth_mpa) != null ? bar(k.pth_mpa != null ? k.pth_mpa : V.pth_mpa) : null]);
  }
  linhas1.push(['PMTA adotada nesta inspeção', pmtaVaso != null ? bar(pmtaVaso) : null], ['Grupo de potencial de risco', R.grupo != null ? String(R.grupo) : null], ['Categoria (NR-13)', R.categoria]);
  tabelaRV(linhas1, [170, '*'], 'Descrição do equipamento');
  if (cams.length > 1) tabela(['Câmara', 'Fluido', 'Classe', 'Operação', 'Volume', 'PMTA de plaqueta', 'PTH'],
    cams.map(k => [k.nome, k.fluido, k.classe_fluido, bar(k.p_operacao_max_mpa), litros(k.volume_m3) || '—', bar(k.pmta_plaqueta_mpa), bar(k.pth_mpa)]), null, 'Câmaras do vaso');
  // S143 · item 65: as placas numa figura só ("Detalhamento das plaquetas de identificação"), e o texto cita o número dela
  const placas = LUG.filter(l => l.secao === 'plaqueta').map(fotoDoLugar).filter(Boolean)
    .concat((d.fotos || []).filter(f => f.secao === 'plaqueta' && !deLugar(f) && img[f.path])).map(f => img[f.path]);
  const blocoPlacas = [];
  const nPlaca = placas.length ? figura(placas, T.fig_placas || 'Detalhamento das plaquetas de identificação', blocoPlacas) : null;
  par(txt(M.vaso_fonte, { figura: nPlaca ? ' (Figura ' + nPlaca + ')' : '', quadro: qVaso }));
  C.push(...blocoPlacas);
  LUG.filter(l => l.secao === 'plaqueta' && !fotoDoLugar(l) && String(SEMAC[l.lugar] || '').trim() && !MESMA_FOTO.test(SEMAC[l.lugar]))   // S149 · item 82: a mesma foto serve para as duas
    .forEach(l => par(presos(l.rotulo) + ': sem foto (' + String(SEMAC[l.lugar]).trim().replace(/[.\s]+$/, '') + ').', { style: 'legenda' }));
  sub('6.2', T.acessorios || 'Identificação dos acessórios do vaso de pressão');
  const acs = d.acessorios || [];
  if (!acs.length) par(M.acessorios_nenhum);
  else {
    par(M.acessorios_intro);
    lista(acs.map(a => {
      const p = [TIPOS_ACESS[a.tipo] || a.tipo, a.tag ? a.tag : null].filter(Boolean).join(' ');
      // S141 · itens 32 e 48: o lacre é o colocado na aferição; "Não há" não é marca nem modelo
      const nh = x => vazio(x) ? null : x, lacre = (a.afericao && a.afericao.lacre_colocado) || a.lacre_num;
      // S144 · item 72: o acessório não tem "modelo"; o manômetro sai com a escala (a da aferição; sem ela, a anotada em campo)
      const f = a.afericao || {}, ehMed = a.tipo === 'manometro' || a.tipo === 'manovacuometro';
      const escala = ehMed ? (f.faixa_fim != null ? 'escala de ' + fmt(f.faixa_ini || 0, 0) + ' a ' + fmt(f.faixa_fim, 0) + ' ' + String(f.unidade || 'bar').replace('kgf/cm2', 'kgf/cm²')
        : (nh(a.escala) ? 'escala ' + String(a.escala).replace(/^escala\s*/i, '') : null)) : null;
      const det = [nh(a.marca) ? 'marca ' + a.marca : null, escala,
        a.pressao_ajuste_mpa != null ? (a.tipo === 'disco_ruptura' ? 'ruptura ' : 'ajuste ') + bar(a.pressao_ajuste_mpa) : null, a.conexao ? 'conexão ' + a.conexao : null, lacre ? 'lacre nº ' + lacre : null].filter(Boolean).join(', ');
      const sit = { ok: '', substituir: ' — a substituir', ausente: ' — ausente', inoperante: ' — inoperante', retirado: ' — retirado nesta inspeção' }[a.situacao] || '';
      return p + (det ? ': ' + det : '') + sit + ';';
    }), true);
  }
  // S143 · item 78 (6.2): uma figura por acessório, com as fotos dele lado a lado e a legenda do que mostram
  const fotosAc = (d.fotos || []).filter(f => f.secao === 'acessorios' && img[f.path] && !/^afer:/.test(f.item || ''));   // S144 · item 69: a foto da aferição vai no 7.5/7.6
  const grupos = [];
  fotosAc.forEach(f => { const g = grupos.find(x => x.item === (f.item || f.id)); if (g) g.fs.push(f); else grupos.push({ item: f.item || f.id, fs: [f] }); });
  grupos.forEach(g => {
    const a = acs.find(x => x.id === g.item);
    const nome = a ? [TIPOS_ACESS[a.tipo] || a.tipo, a.tag].filter(Boolean).join(' ') : (g.fs[0].legenda || 'Acessório do vaso');
    figura(g.fs.map(f => img[f.path]), nome);
  });

  // ── 7 · o escopo e os exames ────────────────────────────────────────────
  sec('7', T.escopo || 'ESCOPO DA INSPEÇÃO');
  par(txt(M.escopo, { periodo: ini === fim ? 'em ' + dataBR(ini) : 'de ' + dataBR(ini) + ' a ' + dataBR(fim) }));
  const B = d.boroscopia || {}, TE = d.teste || {};
  // S141 · item 61 (decisão do Bruno, 10/11): feito, o título é o tipo do teste; não feito, "Teste Hidrostático", como no modelo
  const TIT_TESTE = { hidrostatico: 'Teste Hidrostático', pneumatico: 'Teste Pneumático', hidropneumatico: 'Teste Hidropneumático' };
  const tituloTeste = TE.realizado && TIT_TESTE[TE.tipo] ? TIT_TESTE[TE.tipo] : 'Teste Hidrostático';
  const tituloValv = T.valvula || 'Aferição da válvula de segurança';
  // S143 · item 73: a lista só com o número e o nome (o motivo de não fazer fica na própria seção)
  lista(['7.1 ' + (T.visual || 'Exame visual externo') + ';', '7.2 ' + (T.boroscopia || 'Inspeção interna por boroscopia') + ';',
    '7.3 ' + (T.ultrassom || 'Medição de espessura por ultrassom') + ';', '7.4 ' + tituloTeste + ';',
    '7.5 ' + (T.manometro || 'Aferição do manômetro') + ';', '7.6 ' + tituloValv + '.']);
  // 7.1 visual · S143 · item 66: o resultado sai só da integridade do vaso (costado, tampos, conexões, base); o aterramento não conta
  sub('7.1', T.visual || 'Exame visual externo');
  const vis = d.visual || [];
  const foraIntegridade = x => /aterramento/i.test(x.item || '');
  const nc = vis.filter(x => x.conforme === false && !foraIntegridade(x)), ncFora = vis.filter(x => x.conforme === false && foraIntegridade(x));
  par(M.visual_intro);
  lista(vis.map(x => x.conforme === false ? txt(M.visual_nc, { item: x.item, anomalia: String(x.anomalia || 'anomalia registrada').replace(/[;.\s]+$/, '') })
    : x.conforme === true ? ((M.visual_ok || {})[x.item] || txt(M.visual_ok_outro, { item: x.item })) : x.item + ': não avaliado;'));
  par(comResultado(M.visual_conclusao, {}, nc.length ? 'nc' : 'ok'));
  if (ncFora.length && M.visual_fora_integridade) par(txt(M.visual_fora_integridade, { itens: eLista(ncFora.map(x => String(x.item).toLowerCase())) }));
  fotosLugares(LUG.filter(l => l.secao !== 'plaqueta'));   // os detalhes do vaso (tampos, conexões, base), logo depois da lista
  fotos('visual');
  fotos('geral', null, f => !deLugar(f));
  // 7.2 boroscopia
  sub('7.2', T.boroscopia || 'Inspeção interna por boroscopia');
  const boroSubst = m => /fluido|conex|opera|substitu/i.test(m || '');
  if (B.realizada) par(comResultado(B.resultado === 'com_anomalia' ? M.boro_anomalia : M.boro_ok, { anomalia: B.anomalia || 'anomalia registrada' }, B.resultado === 'com_anomalia' ? 'nc' : 'ok'));
  else if (caso(B.caso, B.caso_campos)) parCaso(caso(B.caso, B.caso_campos));   // S146 · item 79 (B1–B6)
  else { par(txt(M.boro_nao, { motivo: B.motivo_nao || 'não informado' })); if (boroSubst(B.motivo_nao)) par(M.boro_substituida); }
  fotos('boroscopia');
  // 7.3 ultrassom
  sub('7.3', T.ultrassom || 'Medição de espessura por ultrassom');
  const med = d.medidor || {};
  const leit = d.leituras || [], comps = ativos;
  const comLeitura = comps.filter(c => leit.some(l => l.componente_id === c.id));
  const siglasMapa = comLeitura.map(siglaComp).filter(Boolean);
  // S151 · issue 7: com a imagem guardada (3D ou desenho próprio), é ela que sai; sem ela (laudo antigo, vaso fora do padrão, aparelho sem 3D), o desenho 2D
  const imgMapa = I.mapa && I.mapa.modo !== '2d' && I.mapa.path && img[I.mapa.path] ? img[I.mapa.path] : null;
  const qUS = quadro + 1, fMapa = siglasMapa.length || imgMapa ? fig + 1 : null;
  par(txt(M.ultrassom_intro, { medidor: [med.marca, med.modelo].filter(Boolean).join(' ') || med.descricao || '—', serie: med.numero_serie || '—',
    certificado: med.certificado_num || '—', laboratorio: med.laboratorio ? ', ' + med.laboratorio : '', validade: dataBR(med.validade), quadro: qUS }));
  if (fMapa && M.ultrassom_mapa) par(txt(M.ultrassom_mapa, { figura: fMapa }));
  const linhasUS = [];
  comLeitura.forEach(c => {
    const ls = leit.filter(l => l.componente_id === c.id);
    const pontos = [...new Set(ls.map(l => l.ponto))].sort((a, b) => a - b);
    pontos.forEach((p, k) => {
      const vs = ls.filter(l => l.ponto === p).sort((a, b) => a.leitura - b.leitura).map(l => Number(l.valor_mm));
      linhasUS.push([k === 0 ? { text: presos(nomeComp(c)), style: 'td', rowSpan: pontos.length } : {}, String(p)].concat([0, 1, 2, 3].map(i => vs[i] != null ? fmt(vs[i], 2) : ''))
        .concat([{ text: fmt(Math.min(...vs), 2), style: 'td', bold: true }]));
    });
  });
  if (linhasUS.length) tabela(['Componente', 'Ponto', 'Leitura 1', 'Leitura 2', 'Leitura 3', 'Leitura 4', 'Mínima'], linhasUS, ['*', 38, 54, 54, 54, 54, 52], 'Medição de espessura (mm)');
  if (fMapa) { fig++; C.push({ stack: [imgMapa ? { image: imgMapa, fit: [500, 392], alignment: 'center' } : { svg: mapaSvg(V.posicao, siglasMapa), alignment: 'center', width: V.posicao === 'vertical' ? 240 : 380 },
    { text: 'Figura ' + fMapa + ' – ' + presos(T.fig_mapa || 'Representação dos pontos no mapa de medição') + '.', style: 'legenda' }], margin: [0, 4, 0, 10], unbreakable: true }); }
  const semL = I.ultrassom_sem_leitura || {};
  comps.filter(c => (semL[c.id] || '').trim()).forEach(c => par(txt(M.ultrassom_nao_medido, { componente: nomeComp(c), motivo: semL[c.id] })));
  const ES = espessuras(d);
  ES.forEach(x => { x.nome = nomeComp(compDe(x.id)) || x.nome; });
  if (ES.length) {
    tabela(['Componente', 'Mínima medida', 'Mínima requerida', 'Anterior', 'Taxa de perda'],
      ES.map(x => [x.nome, fmt(x.atual, 2) + ' mm', fmt(x.req, 2) + ' mm', x.ant != null ? fmt(x.ant, 2) + ' mm (' + dataBR(x.dataAnt) + ')' : '—',
        x.taxa != null ? fmt(x.taxa, 3) + ' mm/ano' : x.semPerda ? 'sem perda mensurável' : '—']), ['*', 62, 66, 108, 88], 'Espessuras: medida, requerida e anterior');
    // S143 · item 78 (7.3): a frase final sai da perda (nunca fixa): perda que esgota a espessura antes do prazo do exame interno é "perda significativa"
    const comAnt = ES.filter(x => x.ant != null), fonte = comAnt.length ? comAnt[0].fonte + (comAnt[0].dataAnt ? ' de ' + dataBR(comAnt[0].dataAnt) : '') : null;
    const prazoRef = Number(R.prazo_interno_anos || R.prazo_externo_anos) || null;
    const signif = comAnt.filter(x => x.taxa != null && x.atual != null && x.req != null && (x.taxa > 0) && ((x.atual - x.req) / x.taxa < (prazoRef || 0)))
      .sort((a, b) => b.taxa - a.taxa);
    if (!comAnt.length) par(M.ultrassom_sem_anterior);
    else if (signif.length) par(txt(M.ultrassom_perda, { fonte, taxa: fmt(signif[0].taxa, 3), componente: signif[0].nome }));
    else par(txt(M.ultrassom_sem_perda, { fonte }));
    const abaixo = ES.filter(x => x.abaixo).map(x => x.nome);
    if (abaixo.length) par(txt(M.ultrassom_abaixo, { componentes: eLista(abaixo) }), { bold: true });
  }
  fotos('componentes', T.fig_medicao || 'Medição de espessura');
  // 7.4 teste
  sub('7.4', tituloTeste);
  const visOk = !nc.length && vis.some(x => x.conforme === true);
  const abaixoAlgum = ES.some(x => x.abaixo);
  if (TE.realizado) par(comResultado(TE.resultado === 'reprovado' ? M.teste_reprovado : M.teste_ok, { tipo: TIPOS_TESTE[TE.tipo] || TE.tipo || 'de pressão', pressao: bar(TE.pressao_mpa),
    duracao: TE.duracao_min ? ', durante ' + fmt(TE.duracao_min, 0) + ' minutos' : '', anomalia: TE.anomalia || 'anomalia registrada' }, TE.resultado === 'reprovado' ? 'nc' : 'ok'));
  else if (M.teste_nao_cond && visOk && !abaixoAlgum) {
    // S143 · item 78 (7.4): a justificativa no jeito do modelo, só com o que é verdade para este vaso
    const K4 = M.teste_cond || {};
    const temAnt = ES.some(x => x.ant != null);
    const conds = [K4.visual, temAnt ? K4.espessura_sem_perda : K4.espessura_acima, I.ambiente === 'fechado' ? K4.coberto : null,
      TE.th_fabricacao_comprovado ? txt(K4.th, { comprovacao: String(TE.th_comprovacao || 'documento do fabricante').toLowerCase() }) : null].filter(Boolean);
    par(txt(M.teste_nao_cond, { condicoes: eLista(conds) }));
  } else par(txt(M.teste_nao, { motivo: TE.motivo_nao || 'não informado' }));
  if (!TE.realizado && TE.th_fabricacao_comprovado && !(M.teste_nao_cond && visOk && !abaixoAlgum)) par(txt(M.th_comprovado, { comprovacao: TE.th_comprovacao || 'documento do fabricante' }));
  else if (TE.realizado && TE.th_fabricacao_comprovado) par(txt(M.th_comprovado, { comprovacao: TE.th_comprovacao || 'documento do fabricante' }));
  else if (!TE.th_fabricacao_comprovado && !(TE.realizado && TE.tipo === 'hidrostatico' && TE.resultado !== 'reprovado')) {
    const ano = Number(V.ano_fabricacao) || null;
    par(!ano ? M.th_ano_desconhecido : ano < 2014 ? M.th_antes_2014 : M.th_depois_2014);
  }
  fotos('teste');
  // 7.5 e 7.6 aferições (S143 · itens 69, 74 e 75: "aferição", nunca "calibração", para o que a Engetap faz)
  const presentes = a => ['ausente', 'retirado'].indexOf(a.situacao) < 0;
  const unidadeTxt = (v, un) => v == null ? '—' : fmt(v, 2) + ' ' + String(un || 'bar').replace('kgf/cm2', 'kgf/cm²');
  const numsTxt = (xs, un) => eLista(xs.map(x => fmt(x, 2))) + ' ' + String(un || 'bar').replace('kgf/cm2', 'kgf/cm²');
  // o padrão: marca (sem repetir a descrição), laboratório e certificado
  const padraoVars = pz => ({ padrao_marca: !vazio(pz.marca) ? ' da marca ' + pz.marca : '',
    laboratorio: pz.laboratorio ? (/^laborat/i.test(pz.laboratorio) ? ' pelo ' + pz.laboratorio.replace(/^Laborat/, 'laborat') : ' pelo laboratório ' + pz.laboratorio) + ',' : '',
    certificado: pz.certificado_num || '—' });
  const bancadaTxt = bz => { const m = [bz.marca, bz.modelo].filter(x => !vazio(x)).join(' '); return m ? ' (modelo ' + m + ')' : ''; };
  const conc = { man: [], valv: [] }, K = M.conc || {};
  // S144 · item 69: a foto da aferição (tirada no celular, no lugar próprio do acessório) entra como figura
  // S149 · item 83: as 3 fotos com nome — a bancada montada em cima, larga; o padrão e o instrumento em teste lado a lado embaixo
  const fotoAfer = (a, legenda) => {
    const doLugar = k => (d.fotos || []).find(f => f.secao === 'acessorios' && f.item === 'afer:' + a.id + ':' + k && img[f.path]);
    const ban = doLugar('bancada'), baixo = [doLugar('padrao'), doLugar('instrumento')].filter(Boolean);
    const soltas = (d.fotos || []).filter(f => f.secao === 'acessorios' && f.item === 'afer:' + a.id && img[f.path]);   // as de antes do S149
    if (!ban && !baixo.length) { if (soltas.length) figura(soltas.map(f => img[f.path]), legenda); return; }
    const n = ++fig, st = [];
    if (ban) st.push({ image: img[ban.path], fit: [480, 230], alignment: 'center', margin: [0, 2, 0, 4] });
    if (baixo.length) st.push({ columns: baixo.map(f => ({ image: img[f.path], fit: [235, 175], alignment: 'center' })), columnGap: 10, margin: [0, 2, 0, 2] });
    st.push({ text: 'Figura ' + n + ' – ' + presos(legenda) + '.', style: 'legenda' });
    C.push({ stack: st, margin: [0, 4, 0, 10], unbreakable: true });
  };
  sub('7.5', T.manometro || 'Aferição do manômetro');
  const mans = acs.filter(a => (a.tipo === 'manometro' || a.tipo === 'manovacuometro') && (presentes(a) || (a.situacao === 'ausente' && PR[a.afericao_caso])));   // S146: M3–M5
  if (!mans.length) { par(M.manometro_nenhum); conc.man.push(K.man_nenhum); }
  mans.forEach(a => {
    const f = a.afericao, tipoNome = a.tipo === 'manovacuometro' ? 'manovacuômetro' : 'manômetro';
    const e1m = f && f.leituras && f.leituras.etapa1 && f.leituras.etapa1.ok === false;   // S150 · item 81: reprovado na etapa 1
    if (e1m && f.resultado === 'reprovado') {
      par(comResultado('O ' + tipoNome + (!vazio(a.marca) ? ' da marca ' + a.marca : '') + ' foi reprovado na etapa 1 da aferição (inspeção visual e funcional): '
        + [].concat(f.leituras.etapa1.defeitos || []).concat(f.leituras.etapa1.obs ? [f.leituras.etapa1.obs] : []).join('; ').toLowerCase()
        + '. A comparação com o padrão (etapa 2) não se aplica. O instrumento deve ser substituído por outro em condições e aferido (NR-13, item 13.3.6). Classificado como: {{resultado}}. Relatório de aferição nº ' + (f.codigo || 'a numerar') + ', no pacote deste relatório.', {}, 'nc'));
      fotoAfer(a, 'Aferição do ' + tipoNome);
      conc.man.push(K.man_nc);
    } else if (f && (f.resultado === 'aprovado' || f.resultado === 'reprovado')) {
      const pz = f.padrao || {}, bz = f.bancada || {}, esc = (f.leituras || {}).escala || {};
      const escala = f.faixa_fim != null ? ', com escala de ' + fmt(f.faixa_ini || 0, 0) + ' a ' + fmt(f.faixa_fim, 0) + ' ' + String(f.unidade || 'bar').replace('kgf/cm2', 'kgf/cm²') : (a.escala ? ', com escala ' + a.escala : '');
      const pontos = Array.isArray((f.leituras || {}).pontos) ? f.leituras.pontos.length : (esc.graduacoes || null);
      const ident = [!vazio(a.marca) ? 'da marca ' + a.marca : null, escala ? escala.replace(/^, /, '') : null].filter(Boolean);
      par(comResultado(f.resultado === 'aprovado' ? M.manometro_feito : M.manometro_reprovado, Object.assign({ tipo: tipoNome, ident: ident.length ? ', ' + ident.join(', ') + ',' : '',
        bancada: bancadaTxt(bz), pontos: pontos ? ' em ' + pontos + ' pontos da escala,' : '', lacre: f.lacre_colocado ? txt(M.manometro_lacre, { lacre: f.lacre_colocado }) : '',
        codigo: f.codigo || 'a numerar' }, padraoVars(pz)), f.resultado === 'aprovado' ? 'ok' : 'nc'));
      fotoAfer(a, 'Aferição do ' + tipoNome);
      conc.man.push(f.resultado === 'aprovado' ? K.man_ok : K.man_nc);
    } else if (caso(a.afericao_caso, a.caso_campos, a.tipo)) { const x = caso(a.afericao_caso, a.caso_campos, a.tipo); parCaso(x); conc.man.push(x.conc); }   // S146 · item 79
    else { par(txt(M.manometro_nao, { acessorio: !vazio(a.marca) ? a.marca : '', motivo: a.afericao_motivo || 'não informado' })); conc.man.push(txt(K.man_nao, { motivo: a.afericao_motivo || 'motivo não informado' })); }
  });
  sub('7.6', tituloValv);
  const valvs = acs.filter(a => ['valvula_seguranca', 'valvula_alivio', 'quebra_vacuo', 'disco_ruptura'].indexOf(a.tipo) >= 0 && (presentes(a) || (a.situacao === 'ausente' && PR[a.afericao_caso])));   // S146: o disco, V4 e Q2
  if (!valvs.length) { par(M.valvula_nenhuma); conc.valv.push(K.valv_nenhuma); }
  valvs.forEach(a => {
    const f = a.afericao, tipoNome = (TIPOS_ACESS[a.tipo] || 'Válvula de segurança').toLowerCase();
    const kc = rcams.find(k => k.camara_id === a.camara_id) || rcams[0] || {};
    if (a.tipo === 'disco_ruptura') {   // S146 · item 79 (T4, D4): vale a pressão do certificado do fabricante
      const pr = a.pressao_ajuste_mpa != null ? Number(a.pressao_ajuste_mpa) : null, pm = kc.pmta_adotada_mpa != null ? Number(kc.pmta_adotada_mpa) : null;
      if (pr == null || pm == null) {   // sem as duas pressões não há comparação: nada de "conforme"
        par('O dispositivo de segurança do vaso é um disco de ruptura' + (pr != null ? ', com pressão de ruptura de ' + bar(pr) + ', segundo o fabricante' : ', sem a pressão de ruptura informada')
          + '; a comparação com a PMTA não foi feita.');
        conc.valv.push('Conforme a seção 7.6, o disco de ruptura não foi comparado com a PMTA;');
        return;
      }
      const x = caso(pr > pm + 1e-9 ? 'D2' : 'D1', null, a.tipo, { pressao: bar(pr), pmta: bar(pm) });
      if (x) { parCaso(x); conc.valv.push(x.conc); }
      else par('O dispositivo de segurança do vaso é um disco de ruptura, com pressão de ruptura de ' + bar(pr) + ', segundo o fabricante.');
      return;
    }
    const e1v = f && f.leituras && f.leituras.etapa1 && f.leituras.etapa1.ok === false;   // S150 · item 81: reprovada na etapa 1
    if (e1v && f.resultado === 'reprovado') {
      par(comResultado('A ' + tipoNome + (!vazio(a.marca) ? ' da marca ' + a.marca : '') + ' foi reprovada na etapa 1 do teste (inspeção visual e funcional): '
        + [].concat(f.leituras.etapa1.defeitos || []).concat(f.leituras.etapa1.obs ? [f.leituras.etapa1.obs] : []).join('; ').toLowerCase()
        + '. O teste em bancada (etapa 2) não se aplica. Deve passar por manutenção ou ser substituída e testada (NR-13, item 13.5.4.9). Classificada como: {{resultado}}. Certificado nº ' + (f.codigo || 'a numerar') + ', no pacote deste relatório.', {}, 'nc'));
      fotoAfer(a, 'Aferição da ' + tipoNome);
      conc.valv.push(K.valv_nc);
    } else if (f && (f.resultado === 'aprovado' || f.resultado === 'reprovado')) {
      const pz = f.padrao || {}, bz = f.bancada || {}, ab = ((f.leituras || {}).aberturas || []).map(Number).filter(x => isFinite(x)),
        asv = ((f.leituras || {}).assentamentos || []).map(Number).filter(x => isFinite(x));
      const pmtaBar = kc.pmta_adotada_mpa != null ? Number(kc.pmta_adotada_mpa) * 10 : null, maior = ab.length ? Math.max(...ab) : null;
      const acima = maior != null && pmtaBar != null && emBar(maior, f.unidade) > pmtaBar + 1e-6;
      const lacre = f.lacre_colocado || a.lacre_num;
      const ident = [!vazio(a.marca) ? 'da marca ' + a.marca : null, a.conexao ? 'com conexão ' + a.conexao : null].filter(Boolean);
      const vars = Object.assign({ tipo: tipoNome, ident: ident.length ? ', ' + ident.join(', ') + ',' : '',
        bancada: bancadaTxt(bz), ajuste: unidadeTxt(f.ajuste, f.unidade), aberturas: ab.length ? numsTxt(ab, f.unidade) : '—', assentamentos: asv.length ? numsTxt(asv, f.unidade) : '—',
        ciclos: ab.length || 3, maior: maior != null ? unidadeTxt(maior, f.unidade) : '—', pmta: pmtaBar != null ? bar(kc.pmta_adotada_mpa) : '—',
        lacre: lacre ? txt(M.valvula_lacre, { lacre }) : '', codigo: f.codigo || 'a numerar' }, padraoVars(pz));
      if (f.resultado === 'aprovado') par(comResultado(M.valvula_feita, vars, 'ok'));
      else par(comResultado(M.valvula_reprovada, Object.assign(vars, { motivo: acima ? txt(M.valvula_motivo_pmta, vars) : M.valvula_motivo_tolerancia }), 'nc'));
      fotoAfer(a, 'Aferição da ' + tipoNome);
      conc.valv.push(f.resultado === 'aprovado' ? K.valv_ok : K.valv_nc);
    } else if (caso(a.afericao_caso, a.caso_campos, a.tipo)) { const x = caso(a.afericao_caso, a.caso_campos, a.tipo); parCaso(x); conc.valv.push(x.conc); }   // S146 · item 79
    else { par(txt(M.valvula_nao, { acessorio: !vazio(a.marca) ? a.marca : '', motivo: a.afericao_motivo || 'não informado' })); conc.valv.push(txt(K.valv_nao, { motivo: a.afericao_motivo || 'motivo não informado' })); }
  });

  // ── 8 · espessura mínima requerida ──────────────────────────────────────
  sec('8', T.calculo || 'ESPESSURA MÍNIMA REQUERIDA');
  const mat = V.material || {}, S = R.s_mpa != null ? Number(R.s_mpa) : Number(mat.s_mpa), cor = Number(R.corrosao_mm) || 0;
  par(M.calculo_intro);
  lista(M.calculo_legenda);
  par(txt(M.calculo_minimo, { corrosao: fmt(cor, 2) }));
  // a conta de cada componente (o motor R00): geometria, P e t útil
  const MEM = {};
  rcomps.forEach(rc => {
    const c = compDe(rc.componente_id) || { tipo: rc.tipo, nome: rc.nome };
    const k = rcams.find(x => x.camara_id === rc.camara_id) || rcams[0] || {};
    const P = Math.abs(Number(k.p_operacao_mpa != null ? k.p_operacao_mpa : R.p_operacao_mpa));
    const g = geoDe(V, c), tU = rc.t_min_mm != null ? Number(rc.t_min_mm) - cor : null;
    try { MEM[rc.componente_id] = Object.assign(memoria(g, P, S, tU), { g, P, tU }); } catch (e) { MEM[rc.componente_id] = null; }
  });
  // S143 · item 78 (8): uma conta só para o costado (CF, CT, CS e CI: mesmo R, E e P) e para tampos iguais
  const multiCam = rcams.length > 1;
  const camNome = id => multiCam ? ((rcams.find(k => k.camara_id === id) || {}).nome || '') + ' · ' : '';
  const chaveGeo = m => m ? [m.g.tipo, m.g.R, m.g.L, m.g.d, m.g.C, m.g.alfaGraus, m.g.E, m.P].map(x => x == null ? '' : Number(x).toFixed(4)).join('|') : '';
  const gruposCalc = [];
  rcomps.forEach(rc => {
    const m = MEM[rc.componente_id]; if (!m) return;
    const fam = rc.tipo === 'costado' ? 'costado' : rc.tipo === 'conico' ? 'cone' : rc.tipo === 'janela' ? 'janela' : 'tampos';
    let g = gruposCalc.find(x => x.fam === fam && x.cam === rc.camara_id);
    if (!g) { g = { fam, cam: rc.camara_id, contas: [] }; gruposCalc.push(g); }
    let ct = g.contas.find(x => x.chave === chaveGeo(m));
    if (!ct) { ct = { chave: chaveGeo(m), m, rcs: [] }; g.contas.push(ct); }
    ct.rcs.push(rc);
  });
  const ORD_FAM = { costado: 0, cone: 1, tampos: 2, janela: 3 };
  gruposCalc.sort((a, b) => ORD_FAM[a.fam] - ORD_FAM[b.fam]);
  const TIT_FAM = { costado: 'Costado', tampos: 'Tampos', cone: 'Cone', janela: 'Janelas de visita' };
  // S153 · issue 6, item 13: o bloco da conta — o nome em negrito com a referência da norma em cinza à direita; a fórmula e a
  // conta numa faixa cinza-clara (os "e =" e os "PMTA =" alinhados à esquerda); o resultado em negrito logo abaixo
  const blocoConta = (nome, ref, contas, resultado) => ({ unbreakable: true, margin: [0, 2, 0, 14], stack: [
    nome ? { columns: [{ width: '*', text: presos(nome), style: 'h3' }, { width: 'auto', text: ref || '', style: 'refNorma' }], columnGap: 10 } : null,
    { table: { widths: ['*'], body: [[{ stack: contas.map(t => ({ text: t, style: 'formula' })), fillColor: FAIXA }]] },
      layout: { hLineWidth: () => 0, vLineWidth: i => i === 0 ? 2.5 : 0, vLineColor: () => COR, paddingLeft: () => 10, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 5 },
      margin: [0, 2, 0, 4] },
    resultado || null].filter(Boolean) });
  const siglasDe = rcs => eLista(rcs.map(rc => siglaComp(compDe(rc.componente_id)) || rc.nome));
  gruposCalc.forEach((g, k) => {
    const unica = g.contas.length === 1;
    sub('8.' + (k + 1), camNome(g.cam) + TIT_FAM[g.fam] + (unica ? ' (' + siglasDe(g.contas[0].rcs) + ') – ' + g.contas[0].m.ref : ''));
    g.contas.forEach(ct => {
      const m = ct.m, emin = Math.max(...ct.rcs.map(rc => Number(rc.e_min_mm)));
      // conta única: o nome e a norma já estão no título da subseção
      junto(blocoConta(unica ? null : ct.rcs.map(rc => nomeComp(compDe(rc.componente_id)) || rc.nome).join(' e '), unica ? null : m.ref,
        [m.fe, m.se + ' = ' + fmt(m.e, 3) + ' mm'],
        { text: 'Espessura mínima requerida: ' + fmt(emin, 3) + ' mm' + (m.e < 1.5 ? ' (mínimo de 1,5 mm)' : '') + (cor ? ', com ' + fmt(cor, 2) + ' mm de corrosão' : '') + '.', style: 'resConta' }));
    });
  });

  // ── 9 · PMTA ────────────────────────────────────────────────────────────
  sec('9', T.pmta || 'PRESSÃO MÁXIMA DE TRABALHO ADMISSÍVEL (PMTA)');
  // 9.1 · o código de construção (S143 · item 78: sai do 8 e vem para cá, como no modelo)
  sub('9.1', T.pmta_codigo || 'Código de construção');
  par(V.sem_codigo_construcao ? M.codigo_sem : V.codigo_construcao ? txt(M.codigo_conhecido, /\{\{edicao\}\}/.test(M.codigo_conhecido || '')
    ? { codigo: V.codigo_construcao, edicao: V.codigo_edicao ? ', edição ' + V.codigo_edicao : '' } : { codigo }) : M.codigo_estimado);   // S146 · C1
  // 9.2 · os parâmetros
  sub('9.2', T.pmta_parametros || 'Parâmetros do cálculo');
  const fonteS = String(mat.fonte || 'ASME Seção II, Parte D').replace(/\s*\(imagens da pasta[^)]*\)\)?/i, '').replace(/ASME\s+II-D/i, 'ASME Seção II, Parte D').replace(/\s+$/, '');
  const Es = fam => { const xs = [...new Set(rcomps.filter(rc => (fam === 'costado' ? rc.tipo === 'costado' || rc.tipo === 'conico' : rc.tipo !== 'costado' && rc.tipo !== 'conico') && MEM[rc.componente_id])
    .map(rc => fmt(MEM[rc.componente_id].g.E, 2)))]; return xs.length ? xs.join(' / ') : null; };
  const Rs = [...new Set(rcomps.filter(rc => MEM[rc.componente_id] && MEM[rc.componente_id].g.R != null).map(rc => fmt(MEM[rc.componente_id].g.R, 2) + ' mm'))];
  const Ps = [...new Set(rcams.map(k => k.p_operacao_mpa).concat(rcams.length ? [] : [R.p_operacao_mpa]).filter(x => x != null).map(x => fmt(Math.abs(x), 3) + ' MPa (' + bar(Math.abs(x)) + ')'))];
  tabelaRV([['Material', [mat.especificacao, mat.forma].filter(Boolean).join(', ')], ['Tensão admissível (S)', isFinite(S) ? fmt(S, 1) + ' MPa' : null], ['Fonte da tensão', fonteS],
    ['Eficiência de junta (E) – costado', Es('costado')], ['Eficiência de junta (E) – tampos', Es('tampos')], ['Raio interno (R)', Rs.join(' / ') || null],
    ['Pressão máxima de operação (P)', Ps.join(' / ') || null], ['Sobre-espessura de corrosão', fmt(cor, 2) + ' mm']], [190, '*'], 'Parâmetros do cálculo');
  // 9.3 · a conta por componente (o costado pela região da menor leitura, S140 · item 51) e o quadro com o governante
  sub('9.3', T.pmta_calculo || 'Cálculo da PMTA');
  const rcCalc = [], vistos = {};
  rcomps.forEach(rc => {
    const mesmos = rc.tipo === 'costado' ? rcomps.filter(x => x.tipo === 'costado' && x.camara_id === rc.camara_id) : [];
    if (mesmos.length < 2) { rcCalc.push(Object.assign({}, rc, { nome: nomeComp(compDe(rc.componente_id)) || rc.nome })); return; }
    if (vistos[rc.camara_id]) return; vistos[rc.camara_id] = true;
    const comT = mesmos.filter(x => x.t_min_mm != null).sort((a, b) => Number(a.t_min_mm) - Number(b.t_min_mm));
    const rep = mesmos.find(x => rcams.some(k => k.governante_id === x.componente_id)) || comT[0] || mesmos[0];
    const sg = siglaComp(compDe(rep.componente_id) || { nome: rep.nome, tipo: 'costado' });
    rcCalc.push(Object.assign({}, rep, { nome: 'Costado' + (sg ? ' (menor leitura no ' + sg + ')' : '') }));
  });
  rcCalc.forEach(rc => {
    const m = MEM[rc.componente_id]; if (!m || !m.sp) return;
    const gov = rcams.some(x => x.governante_id === rc.componente_id);
    junto(blocoConta(camNome(rc.camara_id) + rc.nome + (gov ? ' — governante' : ''), m.ref, [m.fp, m.sp + ' = ' + fmt(m.p, 3) + ' MPa (' + bar(m.p) + ')']));
  });
  tabela(['Componente', 't medida', 't útil', 'E', 'PMTA'], rcCalc.map(rc => {
    const m = MEM[rc.componente_id] || {}, gov = rcams.some(x => x.governante_id === rc.componente_id);
    return [{ text: presos(camNome(rc.camara_id) + rc.nome + (gov ? ' (governante)' : '')), style: 'td', bold: gov }, fmt(rc.t_min_mm, 2) + ' mm', m.tU != null ? fmt(m.tU, 2) + ' mm' : '—',
      m.g ? fmt(m.g.E, 2) : '—', rc.pmta_mpa != null ? fmt(rc.pmta_mpa, 3) + ' MPa (' + bar(rc.pmta_mpa) + ')' : '—'];
  }), ['*', 58, 58, 38, 122], 'PMTA por componente');
  // 9.4 · a PMTA adotada, com o texto montado pela regra (S143 · item 78: some o "Justificativa: …" cru)
  sub('9.4', T.pmta_adotada || 'PMTA adotada');
  const ant = d.laudo_anterior || null;
  rcams.forEach(k => {
    const nm = multiCam ? k.nome + ': ' : '';
    const cGov = compDe(k.governante_id), sgGov = siglaComp(cGov);
    const gov = cGov ? (cGov.tipo === 'costado' ? 'costado' + (sgGov ? ', na região ' + sgGov : '') : nomeComp(cGov).replace(/^./, x => x.toLowerCase())) : 'componente governante';
    const camV = cams.find(x => x.id === k.camara_id) || {};
    const placa = camV.pmta_plaqueta_mpa != null ? Number(camV.pmta_plaqueta_mpa) : (V.pmta_plaqueta_mpa != null ? Number(V.pmta_plaqueta_mpa) : null);
    const anterior = camV.pmta_vigente_mpa != null ? Number(camV.pmta_vigente_mpa) : (ant && ant.pmta_mpa != null ? Number(ant.pmta_mpa) : placa);
    const calc = k.pmta_calculada_mpa != null ? Number(k.pmta_calculada_mpa) : null, adot = Number(k.pmta_adotada_mpa);
    const igual = (a, b) => a != null && b != null && Math.abs(a - b) < 0.0005;
    const vars = { governante: gov, calculada: bar(calc), placa: bar(placa), anterior: bar(anterior), pmta: bar(adot), justificativa: String(k.justificativa_pmta || '').replace(/[.\s]+$/, '') };
    let t;
    if (calc != null && placa != null && igual(adot, placa) && calc >= placa - 0.0005) t = M.pmta_placa_mantida;
    else if (calc != null && anterior != null && igual(adot, anterior) && calc >= anterior - 0.0005) t = M.pmta_anterior_mantida;
    else if (calc != null && igual(adot, calc) && anterior != null && calc < anterior - 0.0005) t = M.pmta_reduzida;
    else if (calc != null && igual(adot, calc)) t = M.pmta_calculada;
    else t = M.pmta_plh;
    par(nm + txt(t, vars));
    if (k.pmta_externa_mpa != null) par(nm + txt(M.pmta_externa, { pmta: bar(k.pmta_externa_mpa), justificativa: k.justificativa_externa || '' }));
  });
  // S153 · issue 6, item 14: a PMTA final dentro de uma caixa, no meio da página
  C.push({ unbreakable: true, margin: [0, 8, 0, 12], columns: [{ width: '*', text: '' },
    { width: 'auto', table: { body: [[{ text: presos(txt(M.pmta_final, { pmta: bar(pmtaVaso) })), style: 'caixaPmta', noWrap: true }]] },
      layout: { hLineWidth: () => 1.2, vLineWidth: () => 1.2, hLineColor: () => COR, vLineColor: () => COR, paddingLeft: () => 16, paddingRight: () => 16, paddingTop: () => 8, paddingBottom: () => 8 } },
    { width: '*', text: '' }] });

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
    [I.ambiente && (M.rec_instalacao || {})[I.ambiente]], ['I', 'II'].indexOf(R.categoria) >= 0 ? [txt(M.rec_manual_cat12, { categoria: R.categoria })] : [],
    (I.rec_casos || []).filter(k => PR[k] && PR[k].tipo !== 'conservacao').map(k => PR[k].texto),   // S146 · item 79 (T7) · S149 · item 88: pelo tipo
    acs.some(a => a.tipo === 'disco_ruptura' && presentes(a) && (a.caso_campos || {}).sem_certificado) && PR.D3 ? [PR.D3.texto] : []), true);
  sub('11.2', T.rec_conservacao || 'Recomendações de conservação');
  lista([].concat(recs.filter(r => r.tipo === 'conservacao').map(comPrazo), M.rec_conservacao_gerais || [],
    (I.rec_casos || []).filter(k => PR[k] && PR[k].tipo === 'conservacao').map(k => PR[k].texto)), true);   // S149 · item 88

  // ── 12 · conclusão (S143 · item 76: "Conforme a seção 7.x, …", montado pelos resultados) ──
  sec('12', T.conclusao || 'CONCLUSÃO');
  par(M.conclusao_intro);
  const motivoCurto = m => String(m || 'motivo não informado').replace(/[.\s]+$/, '').replace(/^./, x => x.toLowerCase());
  const tituloTesteMin = tituloTeste.replace(/^Teste /, 'teste ').replace(/Hidrostático|Pneumático|Hidropneumático/, x => x.toLowerCase());
  lista([nc.length ? K.visual_nc : K.visual_ok,
    B.realizada ? (B.resultado === 'com_anomalia' ? K.boro_anomalia : K.boro_ok)
      : caso(B.caso, B.caso_campos) && caso(B.caso, B.caso_campos).conc ? caso(B.caso, B.caso_campos).conc : txt(K.boro_nao, { motivo: motivoCurto(B.motivo_nao) }),   // S146: a frase do caso
    abaixoAlgum ? K.us_abaixo : K.us_ok,
    TE.realizado ? txt(TE.resultado === 'reprovado' ? K.teste_reprovado : K.teste_ok, { tipo: tituloTesteMin, pressao: bar(TE.pressao_mpa) })
      : (M.teste_nao_cond && visOk && !abaixoAlgum ? txt(K.teste_desaconselhado, { tipo: tituloTesteMin }) : txt(K.teste_nao, { tipo: tituloTesteMin, motivo: motivoCurto(TE.motivo_nao) }))]
    .concat(conc.man).concat(conc.valv).map((x, i, a) => x ? String(x).replace(/[;.]\s*$/, i === a.length - 1 ? '.' : ';') : x));
  const inapto = TE.realizado && TE.resultado === 'reprovado';
  par(txt(inapto ? M.parecer_inapto : M.parecer_apto, { pmta: bar(pmtaVaso) }), M.parecer_destaque ? { style: 'destaque' } : null);

  // ── 13 · próximas inspeções ─────────────────────────────────────────────
  sec('13', T.proximas || 'PRÓXIMAS INSPEÇÕES');
  // S144 · item 70: o prazo reduzido em campo ou na revisão (o PLH aprovou com as datas desse prazo)
  const RED = I.prazo_red && R.datas_pelo_plh && R.justificativa_datas === I.prazo_red.just ? I.prazo_red : null;
  const anosTxt = n => n + (Number(n) === 1 ? ' ano' : ' anos');
  if (RED && RED.caso && PR[RED.caso]) par(PR[RED.caso].texto);   // S146 · item 79 (P1)
  else if (RED) par(txt(M.proximas_reduzido || 'Os prazos foram reduzidos para {{prazos}}, a critério do PLH, em razão de: {{justificativa}}.',
    { prazos: [RED.externo != null ? anosTxt(RED.externo) + ' (exame externo)' : null, RED.interno != null ? anosTxt(RED.interno) + ' (exame interno)' : null].filter(Boolean).join(' e '),
      justificativa: String(RED.just || '').replace(/[.\s]+$/, '').replace(/^./, x => x.toLowerCase()) }));
  else if (R.datas_pelo_plh && R.justificativa_datas) par(txt(M.proximas_plh, { justificativa: R.justificativa_datas }));
  else if (V.sem_codigo_construcao) par(M.proximas_sem_codigo);
  else if (V.abaixo_zero_sem_deterioracao) par(M.proximas_abaixo_zero);
  else par(txt(M.proximas_tabela, { categoria: R.categoria || '—' }));
  const prazoTxt = (n, plh, red) => red != null ? anosTxt(red) + ' (reduzido)' : plh ? 'definido pelo PLH' : n == null ? 'a critério do PLH' : anosTxt(n);
  tabela(['Exame', 'Prazo', 'Data limite'], [
    ['Externo', prazoTxt(R.prazo_externo_anos, R.datas_pelo_plh, RED && RED.externo != null && RED.externo < R.prazo_externo_anos ? RED.externo : null), { text: dataBR(R.proxima_externa), style: 'td', bold: true }],
    ['Interno', prazoTxt(R.prazo_interno_anos, R.datas_pelo_plh, RED && RED.interno != null && (R.prazo_interno_anos == null || RED.interno < R.prazo_interno_anos) ? RED.interno : null),
      { text: R.proxima_interna ? dataBR(R.proxima_interna) : '—', style: 'td', bold: true }]], [120, '*', 120]);

  // ── 14 · responsáveis ───────────────────────────────────────────────────
  sec('14', T.responsaveis || 'RESPONSÁVEIS PELA INSPEÇÃO');
  par(M.responsaveis_intro);
  // S144 · item 71: "Nome completo — Função" (a função do cadastro da pessoa) e o registro de quem tem; sem o setor do sistema
  const FUNC_PAPEL = { inspetor: 'Inspetor', auxiliar: 'Auxiliar de Inspeção', plh: 'Profissional Legalmente Habilitado' };
  const eqPlh = (d.equipe || []).find(q => q.papel === 'plh') || null;
  const plh = opc.plh || d.plh || (eqPlh ? { nome: eqPlh.nome, registro: eqPlh.registro } : null);
  const mesmo = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const reg = x => vazio(x) ? '' : String(x);
  tabela(['Nome', 'Função', 'Registro'], [[{ text: plh ? plh.nome : 'O PLH que emitir o laudo', style: 'thl' }, 'Profissional Legalmente Habilitado (responsável técnico)', reg(plh && plh.registro)]]
    .concat((d.equipe || []).filter(q => !(plh && mesmo(q.nome, plh.nome))).map(q => [
      // S145 · A8: quem confirmou a participação com a digital no celular
      { stack: [{ text: q.nome, style: 'thl' }].concat(q.confirmado_em ? [{ text: 'Confirmado eletronicamente em ' + dataBR(q.confirmado_em), style: 'nota' }] : []) },
      q.funcao || FUNC_PAPEL[q.papel] || 'Equipe de inspeção', reg(q.registro)])), ['*', 190, 110]);
  par(M.responsaveis_assinatura, { italics: true, color: CLARO });
  // S145 · A2: o desenho da assinatura do PLH com o texto da aprovação (o laudo vale pela assinatura com o certificado)
  if (CAR) C.push({ unbreakable: true, margin: [0, 4, 0, 8], stack: [
    { image: CAR.imagem, fit: [170, 60] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5, lineColor: CINZA }] },
    { text: CAR.texto, style: 'nota', margin: [0, 2, 0, 0] }] });
  if (opc.numero) par('Relatório nº ' + numero + ', emitido em ' + dataBR(opc.emitidoEm) + (opc.revisao ? '. Revisão ' + opc.revisao + (opc.motivoRev ? ': ' + opc.motivoRev : '') : '') + '.', { color: CLARO });

  // ── 15 · anexos ─────────────────────────────────────────────────────────
  sec('15', T.anexos || 'ANEXOS');
  lista(anexosDoLaudo(d) || M.anexos);   // S148 · item 90: a mesma lista que o PDF junta (medidor, padrões, ART)

  // ── a página ────────────────────────────────────────────────────────────
  const logoCli = emp.logo && /^data:image\/(png|jpe?g);base64,/i.test(emp.logo) ? emp.logo : null;
  const empresaM = M.empresa_emissora || {};
  // S143 · item 63: o cabeçalho do modelo: logomarca (ou o nome) · Relatório nº e ART · Número TAP, TAG, data e página
  const cabDir = [numeroTap ? [{ text: 'Número TAP', style: 'cabMin' }, { text: numeroTap, style: 'cabMin' }] : null,
    [{ text: 'TAG', style: 'cabMin' }, { text: V.tag || '—', style: 'cabMin' }]].filter(Boolean);
  return {
    // S153 · issue 6: o cabeçalho em letra 10 e o rodapé cerca de 1 cm mais alto (o carimbo legível); a mesma margem com e sem o carimbo,
    // para o rascunho quebrar as páginas como o laudo emitido
    pageSize: 'A4', pageMargins: [50, 98, 45, 100],
    info: { title: 'Relatório de inspeção ' + numero + ' · ' + (V.tag || ''), author: empresaM.nome || 'Engetap', creator: 'TapFlow · TapDoc', producer: 'TapFlow · TapDoc (pdfmake)',
      subject: 'NR-13 · ' + (V.tag || '') + ' · modelo ' + ((d.modelo || {}).versao || '—') },
    watermark: opc.marca ? { text: opc.marca, color: '#B42318', opacity: 0.12, bold: true, fontSize: opc.marca.length > 12 ? 38 : 70 } : undefined,
    header: (pag, total) => pag === 1 ? null : {
      margin: [50, 20, 45, 0],
      table: { widths: [112, '*', 190], body: [[
        logoCli ? { image: logoCli, fit: [104, 46], alignment: 'center', margin: [0, 3, 0, 0] } : { text: emp.nome_fantasia || emp.razao_social || '', style: 'cabTxt', margin: [0, cabDir.length > 1 ? 12 : 6, 0, 0] },
        { stack: [{ text: 'Relatório nº ' + numero, style: 'cabNum' }, { text: 'ART: ' + ((d.art || {}).numero || '—'), style: 'cabTxt' }], alignment: 'center', margin: [0, cabDir.length > 1 ? 12 : 5, 0, 0] },
        { table: { widths: [64, '*'], body: cabDir.concat([[{ text: dataTopo, style: 'cabMin' }, { text: 'Página ' + pag + ' de ' + total, style: 'cabMin' }]]) },
          layout: { hLineColor: '#C9D2D8', vLineColor: '#C9D2D8', paddingTop: () => 1, paddingBottom: () => 1 } }]] },
      layout: { hLineColor: '#C9D2D8', vLineColor: '#C9D2D8' }
    },
    // S153 · issue 6, item 5: o carimbo com cerca de 4 cm, a linha da aprovação em letra 8 na largura toda, o logo maior; a capa (item 6) sem o logo
    footer: (pag) => ({ margin: [50, 8, 45, 0], stack: [{ columns: [
      pag === 1 ? { width: 105, text: '' } : { image: LOGO_ENGETAP, width: 105 },
      { stack: [{ text: empresaM.nome || '', style: 'rodBold' }, { text: empresaM.contato || '', style: 'rod' }, { text: empresaM.site || '', style: 'rod' }], alignment: 'center', margin: [0, 4, 0, 0] },
      CAR ? { width: 120, image: CAR.imagem, fit: [114, 46], alignment: 'right' }
          : { text: plh ? plh.nome + '\n' + (plh.registro || '') : '', style: 'rodCar', alignment: 'right', width: 150, margin: [0, 8, 0, 0] }] }]
      .concat(CAR ? [{ text: CAR.texto, style: 'rodCar', alignment: 'right', margin: [0, 3, 0, 0] }] : []) }),
    content: C,
    // título não fica sozinho no pé da página. S153: o pdfmake conta como "seguintes" também os nós do cabeçalho e do rodapé
    // da página; aqui só vale o que vem ABAIXO do título, dentro da área do texto, e que não seja outro título
    pageBreakBefore: (no, seguintes) => !!no.headlineLevel && !!no.startPosition
      && !seguintes.some(n => !n.headlineLevel && n.startPosition && n.startPosition.top > no.startPosition.top && n.startPosition.top < 841.89 - 100),
    styles: {
      // S153 · issue 6: texto corrido 12, preto, sem recuo (item 2); quadros em letra 10 (itens 10 a 12); legendas 10, pretas, sem itálico (itens 8 e 9)
      h1: { fontSize: 13, bold: true, color: COR, margin: [0, 16, 0, 7] },
      h2: { fontSize: 12, bold: true, color: CINZA, margin: [0, 11, 0, 5] },
      h3: { fontSize: 11, bold: true, color: CINZA, margin: [0, 6, 0, 2] },
      par: { fontSize: 12, lineHeight: 1.25, alignment: 'justify', color: PRETO, margin: [0, 0, 0, 7] },
      lista: { fontSize: 12, lineHeight: 1.2, color: PRETO },
      th: { fontSize: 10, bold: true, color: '#164C77', alignment: 'center' },
      thl: { fontSize: 10, bold: true, color: '#164C77' },
      td: { fontSize: 10 },
      legenda: { fontSize: 10, alignment: 'center', color: PRETO, margin: [0, 3, 0, 0] },
      formula: { fontSize: 11, margin: [0, 1, 0, 1] },
      refNorma: { fontSize: 10, color: CLARO, margin: [0, 8, 0, 0] },
      resConta: { fontSize: 12, bold: true, color: PRETO },
      caixaPmta: { fontSize: 12, bold: true, color: PRETO, alignment: 'center' },
      nota: { fontSize: 8, italics: true, color: CLARO },
      destaque: { fontSize: 12, bold: true, margin: [0, 6, 0, 10] },
      sumario: { fontSize: 14, bold: true, color: COR, alignment: 'center', margin: [0, 0, 0, 14] },
      capaEmp: { fontSize: 15, bold: true, alignment: 'center' }, capaCnpj: { fontSize: 11, alignment: 'center', margin: [0, 2, 0, 18] },
      capaTipo: { fontSize: 17, bold: true, alignment: 'center' }, capaSub: { fontSize: 11, alignment: 'center', margin: [0, 2, 0, 0] },   // S153 · item 6: a capa em preto
      capaTag: { fontSize: 22, bold: true, alignment: 'center' }, capaRodape: { fontSize: 11, alignment: 'right' },
      cabNum: { fontSize: 10, bold: true }, cabTxt: { fontSize: 10, color: CINZA }, cabMin: { fontSize: 10 },   // S153 · item 4
      rod: { fontSize: 8, color: CINZA }, rodCar: { fontSize: 8, color: CINZA }, rodBold: { fontSize: 8.5, bold: true, color: CINZA }   // S153 · item 5
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: PRETO }
  };
}

const LaudoPDF = { montar, fotosDoLaudo, anexosDoLaudo, documentosAfericao, espessuras, memoria, geoDe, fmt, versao: 'R06a-S153-2026-11-11' };
if (typeof module !== 'undefined' && module.exports) module.exports = LaudoPDF; else raiz.LaudoPDF = LaudoPDF;
})(typeof window !== 'undefined' ? window : globalThis);
