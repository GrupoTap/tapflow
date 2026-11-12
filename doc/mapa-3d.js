/* ============================================================================
 * TapDoc · mapa-3d.js — o mapa dos pontos de medição em 3D (issue 7, S151)
 * Desenho: processos/mapa-pontos-3d-desenho.md (13 decisões, 11/11/2026).
 * ----------------------------------------------------------------------------
 * Duas partes:
 *   · calcular(dados)  — PURA (sem 3D, sem tela): medidas, altura de cada tampo
 *     (medida × calculada, aviso de 10%), cotas, escala e a posição de cada ponto
 *     na folha. É o que os testes conferem (números, não a imagem).
 *   · desenhar(calc, THREE) — monta o vaso com o three.js e devolve um <canvas>
 *     com a folha (2200 × 1720). Só a tela de revisão carrega o three.js.
 * A folha do horizontal é a de hoje (6 vistas, 3 cotas); a do vertical e do silo
 * tem 5 colunas. A perspectiva é sempre isométrica. comModelo(dados, modelo) completa o que falta ao vaso com as
 * medidas padrão do modelo dele (silos iguais, decisão 12). O desenho não precisa ser
 * exato, só proporcional e parecido (regra do Bruno): o que importa é o mapa.
 * ========================================================================== */
(function (raiz) {
'use strict';
const VERSAO = 'M2-S152';   // M2 (S152): o modelo de vaso (as medidas padrão dos silos iguais, decisão 12) · M1 (S151): a primeira versão
const W = 2200, H = 1720;
const CORES = { vermelho: '#b3121a', preto: '#1e1e1e', bege: '#cfc9a6', azul: '#1f4f9a', cinza: '#8a8f96', branco: '#e8e8e8' };
const COR_NOME = { vermelho: 'Vermelho', preto: 'Preto', bege: 'Bege', azul: 'Azul', cinza: 'Cinza', branco: 'Branco' };
const CLARAS = ['bege', 'branco', 'cinza'];
const TIPOS_TAMPO = ['eliptico', 'torisferico', 'hemisferico', 'conico', 'plano'];
const TIPO_NOME = { eliptico: 'elíptico 2:1', torisferico: 'torisférico', hemisferico: 'hemisférico', conico: 'cônico', plano: 'plano' };
const ALERTA_PCT = 10;   // decisão 9: acima de 10% entre a medida e a calculada, o quadro fica amarelo

const n = v => { const x = Number(v); return v == null || v === '' || !isFinite(x) ? null : x; };
const arred = (v, c) => { const k = Math.pow(10, c == null ? 1 : c); return Math.round(v * k) / k; };
function fmt(v) { return arred(v, 1).toLocaleString('pt-BR'); }
const posDe = c => c.posicao || ((String(c.nome || '').match(/\b(direito|esquerdo|superior|inferior)\b/i) || [])[1] || '').toLowerCase() || null;
function siglaCostado(c) {
  const m = String(c.nome || '').match(/\b(CF|CT|CS|CI|CLD|CLE)\s*$/i);
  if (m) return m[1].toUpperCase();
  return ({ frontal: 'CF', traseiro: 'CT', superior: 'CS', inferior: 'CI', direito: 'CLD', esquerdo: 'CLE' })[c.posicao] || null;
}

/** A altura calculada do tampo pelo tipo (decisão 9). `esp` = espessura (tampo plano); cone: pelo semiângulo. */
function alturaCalculada(tipo, D, o) {
  o = o || {};
  if (tipo === 'eliptico') return D / 4;
  if (tipo === 'hemisferico') return D / 2;
  if (tipo === 'torisferico') return 0.194 * D;
  if (tipo === 'plano') return n(o.esp) > 0 ? n(o.esp) : null;
  if (tipo === 'conico') { const a = n(o.alfa) > 0 ? n(o.alfa) : 30, rs = Math.min(n(o.saida) > 0 ? n(o.saida) / 2 : 0, D / 2 * 0.9); return (D / 2 - rs) / Math.tan(a * Math.PI / 180); }
  return null;
}

/** Um tampo: a medida, a calculada, a diferença e a que o desenho usa (corrigida > medida > calculada). */
function tampo(c, D, saida, lado) {
  const alfa = n(c.alfa_graus), esp = n(c.espessura_nominal_mm);
  const calc = alturaCalculada(c.tipo, D, { esp, alfa, saida }), med = n(c.altura_medida_mm) > 0 ? n(c.altura_medida_mm) : null,
    cor = n(c.altura_desenho_mm) > 0 ? n(c.altura_desenho_mm) : null;
  const uso = cor != null ? cor : med != null ? med : calc != null ? calc : Math.max(8, 0.02 * D);
  const dif = med != null && calc ? Math.abs(med - calc) / calc * 100 : null;
  const t = { id: c.id || null, lado, tipo: c.tipo, tipo_nome: TIPO_NOME[c.tipo] || c.tipo, nome: c.nome || null,
    h_calc: calc != null ? arred(calc, 1) : null, h_med: med, h_cor: cor, h_uso: arred(uso, 1),
    do_modelo: !!c.do_modelo, origem: c.do_modelo ? 'modelo' : cor != null ? 'corrigida' : med != null ? 'medida' : calc != null ? 'calculada' : 'estimada',
    dif_pct: dif != null ? arred(dif, 1) : null, alerta: dif != null && dif > ALERTA_PCT };
  if (c.tipo === 'conico') {
    t.r_saida = Math.min(saida > 0 ? saida / 2 : 0, D / 2 * 0.9);
    t.alfa = arred(Math.atan((D / 2 - t.r_saida) / uso) * 180 / Math.PI, 1);   // o ângulo que o desenho mostra (pela altura usada)
    t.sem_alfa = !(alfa > 0) && cor == null && med == null;
  }
  return t;
}

/* ── a projeção das vistas ortogonais (pura): câmera em +dir olhando o centro ── */
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const esc3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function naFolha(v, p, s) { const dir = cruz(v.up, v.dir); return [v.c[0] + esc3(p, dir) * s, v.c[1] - esc3(p, v.up) * s]; }

/** Os pontos no referencial do vaso DEITADO (eixo X; ponta A em −X, ponta B em +X; frente em +Z; cima em +Y). */
function pontosDeitado(D, L, A, B) {
  const R = D / 2, o = 1.01, out = [];
  [0, 1, 2, 3].map(i => -L / 2 + L * (i + 0.5) / 4).forEach(x => {
    out.push({ r: 'frente', p: [x, 0, R * o], v: [0, 0, 1] });
    out.push({ r: 'tras', p: [x, 0, -R * o], v: [0, 0, -1] });
    out.push({ r: 'cima', p: [x, R * o, 0], v: [0, 1, 0] });
    out.push({ r: 'baixo', p: [x, -R * o, 0], v: [0, -1, 0] });
  });
  [[-1, 'A', A], [1, 'B', B]].forEach(([s, r, t]) => {
    if (t.tipo === 'conico') {   // decisão 4: 4 pontos em cruz no cone, vistos de lado e da ponta
      const k = 0.42, rr = R - (R - t.r_saida) * k, a = t.alfa * Math.PI / 180;
      [0, 1, 2, 3].forEach(i => { const th = i * Math.PI / 2;
        out.push({ r, cone: true, p: [s * (L / 2 + t.h_uso * k), rr * Math.cos(th) * 1.02, rr * Math.sin(th) * 1.02], v: [s * Math.sin(a), Math.cos(th) * Math.cos(a), Math.sin(th) * Math.cos(a)] }); });
      return;
    }
    const rr = 0.55 * R, xr = t.tipo === 'plano' ? Math.max(t.h_uso, 0.02 * D) : t.h_uso * Math.sqrt(Math.max(0, 1 - Math.pow(rr / R, 2)));
    [[rr, 0], [-rr, 0], [0, rr], [0, -rr]].forEach(([y, z]) => out.push({ r, p: [s * (L / 2 + xr * o), y, z], v: [s, 0, 0] }));
  });
  return out;
}

/** Os dois tampos da lista: A = esquerdo (horizontal) ou inferior (vertical); B = direito ou superior. Sem posição, o 1º é o B. */
function doisTampos(comps) {
  const tps = comps.filter(c => TIPOS_TAMPO.indexOf(c.tipo) >= 0);
  const ladoDe = c => { const p = posDe(c); return p === 'direito' || p === 'superior' ? 'B' : p === 'esquerdo' || p === 'inferior' ? 'A' : null; };
  let cA = tps.find(c => ladoDe(c) === 'A'), cB = tps.find(c => ladoDe(c) === 'B');
  const soltos = tps.filter(c => c !== cA && c !== cB && !ladoDe(c));
  if (!cB && soltos.length) cB = soltos.shift();
  if (!cA && soltos.length) cA = soltos.shift();
  return { tps, cA, cB };
}

/**
 * comModelo(dados, modelo) → os dados do vaso completados com as medidas padrão do modelo (decisão 12).
 * O que o vaso tem de seu vale; o modelo só entra onde falta. O semiângulo do cone do modelo vale para o desenho.
 */
function comModelo(dados, m) {
  if (!m) return dados;
  const o = Object.assign({}, dados);
  if (o.posicao !== 'horizontal' && o.posicao !== 'vertical') o.posicao = m.posicao;
  if (!(n(o.circunferencia_mm) > 0) && n(m.diametro_mm) > 0) o.circunferencia_mm = n(m.diametro_mm) * Math.PI;
  if (!(n(o.costado_mm) > 0)) o.costado_mm = m.costado_comprimento_mm;
  if (!CORES[o.cor]) o.cor = m.cor_mapa;
  o.pes = !!o.pes || !!m.pes;
  if (!(n(o.cone_saida_mm) > 0)) o.cone_saida_mm = m.cone_saida_mm;
  const vt = o.posicao === 'vertical';
  const comps = (o.componentes || []).filter(c => c && c.ativo !== false).map(c => c.tipo === 'conico' && n(m.alfa_graus) > 0 ? Object.assign({}, c, { alfa_graus: m.alfa_graus }) : c);
  const t = doisTampos(comps);
  const novo = (L, tipo, alt) => ({ id: 'modelo:' + L, do_modelo: true, tipo, nome: 'Tampo ' + (vt ? (L === 'B' ? 'superior' : 'inferior') : (L === 'B' ? 'direito' : 'esquerdo')),
    posicao: vt ? (L === 'B' ? 'superior' : 'inferior') : (L === 'B' ? 'direito' : 'esquerdo'), altura_desenho_mm: alt, alfa_graus: m.alfa_graus });
  if (!t.cB && m.tampo_b_tipo) comps.push(novo('B', m.tampo_b_tipo, m.tampo_b_altura_mm));
  if (!t.cA && m.tampo_a_tipo) comps.push(novo('A', m.tampo_a_tipo, m.tampo_a_altura_mm));
  if (m.janela && vt && !comps.some(c => c.tipo === 'janela')) comps.push({ id: 'modelo:JV', do_modelo: true, tipo: 'janela', nome: 'Janela de visita' });
  o.componentes = comps; o.modelo_nome = m.nome || null;
  return o;
}

/**
 * calcular(dados) → tudo o que o desenho e a revisão precisam, em números.
 * dados = { posicao, circunferencia_mm, costado_mm, cor, pes, cone_saida_mm, camaras (quantas ativas),
 *           componentes:[{ id, tipo, nome, posicao, alfa_graus, espessura_nominal_mm, altura_medida_mm, altura_desenho_mm, ativo }],
 *           regioes: ['CF','TE',…] (as que têm leitura; sem a lista, todas) }
 */
function calcular(dados) {
  dados = dados || {};
  const vertical = dados.posicao === 'vertical';
  const circ = n(dados.circunferencia_mm), D = circ > 0 ? arred(circ / Math.PI, 1) : null, L = n(dados.costado_mm) > 0 ? n(dados.costado_mm) : null;
  const comps = (dados.componentes || []).filter(c => c && c.ativo !== false);
  const cor = CORES[dados.cor] ? dados.cor : 'cinza';
  const saida = n(dados.cone_saida_mm) > 0 ? n(dados.cone_saida_mm) : 0;
  const R0 = { versao: VERSAO, modelo_nome: dados.modelo_nome || null, pode: false, motivo: null, vertical, D, L, cor, cor_hex: CORES[cor], clara: CLARAS.indexOf(cor) >= 0, tampos: [], cotas: [], marcas: [], avisos: [] };
  // os dois tampos: A = esquerdo (horizontal) ou inferior (vertical); B = direito ou superior
  const { tps, cA, cB } = doisTampos(comps);
  if (D && cA) R0.tampos.push(tampo(cA, D, saida, 'A'));
  if (D && cB) R0.tampos.push(tampo(cB, D, saida, 'B'));
  R0.tampos.forEach(t => { t.sigla = vertical ? (t.lado === 'A' ? 'TI' : 'TS') : (t.lado === 'A' ? 'TE' : 'TD');
    t.rotulo = vertical ? (t.lado === 'A' ? 'Tampo inferior' : 'Tampo superior') : (t.lado === 'A' ? 'Tampo esquerdo' : 'Tampo direito'); });
  const nao = m => { R0.motivo = m; return R0; };
  // decisão 5: quando não dá para desenhar
  if (dados.posicao !== 'horizontal' && dados.posicao !== 'vertical') return nao('Falta a posição do vaso (horizontal ou vertical).');
  if (!D) return nao('Falta a circunferência do costado (dá o diâmetro).');
  if (n(dados.camaras) > 1) return nao('Vaso com mais de uma câmara (trocador de calor, camisa): fora do desenho padrão.');
  if (tps.length > 2 || !cA || !cB) return nao(tps.length > 2 ? 'O vaso tem mais de dois tampos na lista de componentes: fora do desenho padrão.' : 'Faltam os dois tampos na lista de componentes do vaso.');
  if (!L) return nao('Falta o comprimento do costado (medido entre as soldas).');
  if (L / D < 0.1 || L / D > 40) return nao('O comprimento do costado não combina com o diâmetro: confira as medidas.');
  const A = R0.tampos.find(t => t.lado === 'A'), B = R0.tampos.find(t => t.lado === 'B');
  if (A.h_uso > 3 * D || B.h_uso > 3 * D) return nao('A altura de um tampo não combina com o diâmetro: confira as medidas.');
  [A, B].forEach(t => { if (t.sem_alfa) R0.avisos.push(t.rotulo + ': sem o semiângulo do cone; o desenho usa 30°.'); });

  const R = D / 2, temJV = vertical && comps.some(c => c.tipo === 'janela'), temPes = vertical && !!dados.pes;
  // a extensão de cada ponta no desenho (o plano tem uma espessura mínima para aparecer; o cone com saída ganha o bocal)
  const ext = t => t.tipo === 'plano' ? Math.max(t.h_uso, 0.02 * D) : t.h_uso;
  const eA = ext(A), eB = ext(B);
  const conA = A.tipo === 'conico';
  const perna = temPes ? (conA ? 0.48 * D : 0.6 * D) : 0;
  const O = Object.assign(R0, { pode: true, R, pes: temPes, janela: temJV, ext_a: arred(eA, 1), ext_b: arred(eB, 1), perna: arred(perna, 1), largura: W, altura: H });
  const tem = sg => !dados.regioes || dados.regioes.indexOf(sg) >= 0;
  let pts = pontosDeitado(D, L, A, B), vistas;
  const cotas = O.cotas, dois = A.tipo !== B.tipo || Math.abs(A.h_uso - B.h_uso) > 0.5;
  const txtAlt = t => fmt(t.h_uso) + (t.tipo === 'conico' ? ' (cone ' + Math.round(t.alfa) + '°)' : '');
  if (!vertical) {
    const Lt = L + eA + eB, s = Math.min(320 / D, 640 / Lt), off = (eB - eA) / 2;
    const col = { esq: 330, cen: 1080, dir: 1830 }, lin = { sup: 360, fre: 830, inf: 1300 };
    vistas = [
      { nome: 'superior', c: [col.cen, lin.sup], dir: [0, 1, 0], up: [0, 0, -1], w: Lt, h: D },
      { nome: 'frontal', c: [col.cen, lin.fre], dir: [0, 0, 1], up: [0, 1, 0], w: Lt, h: D },
      { nome: 'inferior', c: [col.cen, lin.inf], dir: [0, -1, 0], up: [0, 0, 1], w: Lt, h: D },
      { nome: 'TE', c: [col.esq, lin.fre], dir: [-1, 0, 0], up: [0, 1, 0], w: D, h: D },
      { nome: 'TD', c: [col.dir, lin.fre], dir: [1, 0, 0], up: [0, 1, 0], w: D, h: D }];
    const nomes = { frente: 'CF', tras: 'CT', cima: 'CS', baixo: 'CI', A: 'TE', B: 'TD' };
    pts = pts.map(p => ({ n: nomes[p.r], cone: p.cone, p: [p.p[0] - off, p.p[1], p.p[2]], v: p.v }));
    Object.assign(O, { escala: s, comprimento_total: arred(Lt, 1), deslocamento: arred(off, 1), perspectiva: { c: [col.dir + 20, lin.sup - 40], w: 620, h: 420, dir: [0.62, 0.46, 0.64], caixa: [Lt / 2, D / 2, D / 2] } });
    cotas.push({ chave: 'costado', valor: L, texto: fmt(L), vista: 'frontal' });
    cotas.push({ chave: 'diametro', valor: D, texto: 'Ø ' + fmt(D), vista: 'TE' });
    cotas.push({ chave: 'tampo_b', valor: B.h_uso, texto: txtAlt(B), vista: 'inferior', sigla: 'TD' });
    if (dois) cotas.push({ chave: 'tampo_a', valor: A.h_uso, texto: txtAlt(A), vista: 'inferior', sigla: 'TE' });
    O.rotulos = [['CS', 'superior'], ['CF', 'frontal'], ['CI', 'inferior'], ['TE (tampo esquerdo)', 'TE'], ['TD (tampo direito)', 'TD']];
    O.nota = 'CT: costado traseiro, lado de trás (não aparece)';
  } else {
    // em pé: o eixo vira Y (ponta B em cima). Gira 90°: x' = −y, y' = x.
    const stub = conA && A.r_saida > 0 ? 0.1 * D : 0;
    const topo = L / 2 + eB, base = -(L / 2 + eA + Math.max(perna, stub)), y0 = (topo + base) / 2, Lt = topo - base;
    const larg = temPes ? D * 1.2 : D, s = Math.min(1250 / Lt, 290 / D);
    const X = { cle: 250, cf: 660, cld: 1070, tp: 1500, pe: 1940 }, cy = 860;
    vistas = [
      { nome: 'CLE', c: [X.cle, cy], dir: [-1, 0, 0], up: [0, 1, 0], w: larg, h: Lt },
      { nome: 'CF', c: [X.cf, cy], dir: [0, 0, 1], up: [0, 1, 0], w: larg, h: Lt },
      { nome: 'CLD', c: [X.cld, cy], dir: [1, 0, 0], up: [0, 1, 0], w: larg, h: Lt },
      { nome: 'TS', c: [X.tp, 480], dir: [0, 1, 0], up: [0, 0, -1], w: larg, h: larg },
      { nome: 'TI', c: [X.tp, 1260], dir: [0, -1, 0], up: [0, 0, 1], w: larg, h: larg }];
    const nomes = { frente: 'CF', tras: 'CT', cima: 'CLE', baixo: 'CLD', A: 'TI', B: 'TS' };
    pts = pts.map(p => ({ n: nomes[p.r], cone: p.cone, p: [-p.p[1], p.p[0] - y0, p.p[2]], v: [-p.v[1], p.v[0], p.v[2]] }));
    const rj = Math.min(0.17 * D, 320), yj = L * 0.18;
    if (temJV) {   // decisão 4: 5 pontos na janela (centro e cruz); o ponto do CF que cairia sobre ela sai
      pts = pts.filter(p => !(p.n === 'CF' && Math.abs(p.p[1] + y0 - yj) < L / 8));
      [[0, 0], [0.72, 0], [-0.72, 0], [0, 0.72], [0, -0.72]].forEach(([dx, dy]) => pts.push({ n: 'JV', p: [dx * rj, yj + dy * rj - y0, R + 0.09 * D], v: [0, 0, 1] }));
    }
    Object.assign(O, { escala: s, comprimento_total: arred(Lt, 1), centro_y: arred(y0, 1), base_y: arred(base, 1), larg_vista: arred(larg, 1), saida_bocal: arred(stub, 1),
      janela_raio: temJV ? arred(rj, 1) : null, janela_y: temJV ? arred(yj, 1) : null,
      perspectiva: { c: [X.pe, cy], w: 420, h: 1100, dir: [0.62, 0.30, 0.66], caixa: [larg / 2, Lt / 2, larg / 2] } });
    cotas.push({ chave: 'costado', valor: L, texto: fmt(L), vista: 'CF' });
    cotas.push({ chave: 'diametro', valor: D, texto: 'Ø ' + fmt(D), vista: 'TS' });
    cotas.push({ chave: 'tampo_b', valor: B.h_uso, texto: txtAlt(B), vista: 'CLD', sigla: 'TS' });
    if (dois) cotas.push({ chave: 'tampo_a', valor: A.h_uso, texto: txtAlt(A), vista: 'CLD', sigla: 'TI' });
    O.rotulos = [['CLE (lateral esquerdo)', 'CLE'], ['CF (frontal)', 'CF'], ['CLD (lateral direito)', 'CLD'], ['TS (tampo superior)', 'TS'], [conA ? 'TI (cone, visto de baixo)' : 'TI (tampo inferior)', 'TI']];
    O.nota = 'CT: costado traseiro, lado de trás (não aparece)' + (temJV ? '  ·  JV: janela de visita (5 pontos)' : '');
  }
  O.vistas = vistas.map(v => ({ nome: v.nome, c: v.c, dir: v.dir, up: v.up, w: arred(v.w, 1), h: arred(v.h, 1), px_w: Math.ceil(v.w * O.escala) + 20, px_h: Math.ceil(v.h * O.escala) + 20 }));
  O.pontos = pts.filter(p => tem(p.n));
  // cada ponto aparece na vista para a qual está virado (o CT nunca aparece)
  O.vistas.forEach(v => O.pontos.forEach(p => {
    if (esc3(p.v, v.dir) < (p.cone ? 0.25 : 0.45)) return;
    const q = naFolha(v, p.p, O.escala);
    O.marcas.push({ n: p.n, vista: v.nome, x: arred(q[0], 1), y: arred(q[1], 1), sz: p.n === 'JV' ? 8 : 11 });
  }));
  O.regioes = [...new Set(O.marcas.map(m => m.n))];
  // a "assinatura": muda quando muda qualquer coisa que muda a figura (a revisão compara para saber se a imagem guardada vale)
  O.assinatura = VERSAO + '|' + [dados.posicao, D, L, cor, temPes ? 1 : 0, temJV ? 1 : 0, saida,
    A.tipo, A.h_uso, B.tipo, B.h_uso, (dados.regioes || ['*']).slice().sort().join(',')].join('|');
  return O;
}

/* ── o desenho (three.js) ─────────────────────────────────────────────────── */
function desenhar(O, THREE) {
  if (!O || !O.pode) throw new Error((O && O.motivo) || 'Este vaso não dá para desenhar em 3D.');
  THREE = THREE || raiz.THREE;
  if (!THREE) throw new Error('A biblioteca de 3D não carregou.');
  const folha = document.createElement('canvas'); folha.width = W; folha.height = H;
  const g = folha.getContext('2d');
  let r3;
  try { r3 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { r3 = null; }
  if (!r3) throw new Error('Este aparelho não consegue desenhar em 3D.');
  try {
    const D = O.D, L = O.L, R = D / 2, A = O.tampos.find(t => t.lado === 'A'), B = O.tampos.find(t => t.lado === 'B'), s = O.escala;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(O.cor_hex), metalness: 0.25, roughness: 0.42, side: THREE.DoubleSide });
    const aco = new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.4, roughness: 0.5 });
    // o vaso deitado: eixo X, ponta A em −X, ponta B em +X
    const vaso = new THREE.Group();
    const cil = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 96, 1, true), mat); cil.rotation.z = Math.PI / 2; vaso.add(cil);
    [[-1, A], [1, B]].forEach(([sd, t]) => {
      const p = new THREE.Group();   // a ponta, com +Y para fora
      if (t.tipo === 'plano') { const hv = Math.max(t.h_uso, 0.02 * D); const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, hv, 96), mat); m.position.y = hv / 2; p.add(m); }
      else if (t.tipo === 'conico') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(t.r_saida, 0.5), R, t.h_uso, 96, 1, t.r_saida > 0), mat); m.position.y = t.h_uso / 2; p.add(m);
        if (t.r_saida > 0) { const b = new THREE.Mesh(new THREE.CylinderGeometry(t.r_saida, t.r_saida, 0.1 * D, 32), aco); b.position.y = t.h_uso + 0.05 * D; p.add(b); }
      } else { const m = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), mat); m.scale.set(1, t.h_uso / R, 1); p.add(m); }
      p.rotation.z = -sd * Math.PI / 2; p.position.x = sd * L / 2; vaso.add(p);
      const aro = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; aro.push(new THREE.Vector3(sd * L / 2, R * Math.cos(a) * 1.002, R * Math.sin(a) * 1.002)); }
      vaso.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(aro), new THREE.LineBasicMaterial({ color: 0x000000 })));   // a linha da solda
    });
    const cena = new THREE.Scene(), mundo = new THREE.Group(); mundo.add(vaso); cena.add(mundo);
    cena.add(new THREE.AmbientLight(0xffffff, 0.55));
    const luz = new THREE.DirectionalLight(0xffffff, 0.75); luz.position.set(0.4, 0.8, 1); cena.add(luz);
    const luz2 = new THREE.DirectionalLight(0xffffff, 0.3); luz2.position.set(-1, -0.3, -0.4); cena.add(luz2);
    const barra = (v1, v2, r, lados) => { const len = v1.distanceTo(v2), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, lados || 16), aco);
      m.position.copy(v1.clone().add(v2).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize()); mundo.add(m); };
    if (!O.vertical) vaso.position.x = -O.deslocamento;
    else {
      vaso.rotation.z = Math.PI / 2;
      const cone = A.tipo === 'conico', base = O.base_y;
      if (O.pes) {   // decisão 3: pés presos no anel da junção corpo-cone, com contraventamento em X
        const yA = cone ? -L / 2 : -L / 2 + 0.12 * L, rp = Math.max(12, D * 0.022), rr2 = cone ? R * 1.12 : R * 1.02, pernas = [];
        if (cone) { const an = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.03, R * 1.03, 0.025 * D, 96), aco); an.position.y = yA; mundo.add(an); }
        for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, x = R * Math.cos(a), z = R * Math.sin(a), x2 = rr2 * Math.cos(a), z2 = rr2 * Math.sin(a); pernas.push([x, z]);
          barra(new THREE.Vector3(x, yA, z), new THREE.Vector3(x2, base, z2), rp);
          if (cone) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12 * D, 0.03 * D, 0.12 * D), aco); sp.position.set(x2, base + 0.015 * D, z2); mundo.add(sp); } }
        for (let k = 0; k < 4; k++) { const [x1, z1] = pernas[k], [x2, z2] = pernas[(k + 1) % 4], ya = base + (yA - base) * 0.08, yb = cone ? yA - (yA - base) * 0.25 : -L / 2 - O.ext_a * 0.35;
          barra(new THREE.Vector3(x1, ya, z1), new THREE.Vector3(x2, yb, z2), rp * 0.45, 8); barra(new THREE.Vector3(x1, yb, z1), new THREE.Vector3(x2, ya, z2), rp * 0.45, 8); }
      }
      if (O.janela) { const rj = O.janela_raio, yj = O.janela_y;
        const pesc = new THREE.Mesh(new THREE.CylinderGeometry(rj, rj, 0.08 * D, 48), mat); pesc.rotation.x = Math.PI / 2; pesc.position.set(0, yj, R + 0.03 * D); mundo.add(pesc);
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(rj * 1.18, rj * 1.18, 0.02 * D, 48), aco); fl.rotation.x = Math.PI / 2; fl.position.set(0, yj, R + 0.075 * D); mundo.add(fl); }
      mundo.position.y = -O.centro_y;
    }
    mundo.updateMatrixWorld(true);
    const foto = (cam, w, h) => { r3.setPixelRatio(1); r3.setSize(w, h, false); r3.setClearColor(0xffffff, 0); r3.render(cena, cam); return r3.domElement; };
    const orto = (dir, up, mw, mh) => { const c = new THREE.OrthographicCamera(-mw, mw, mh, -mh, 1, 1e6);
      c.position.set(dir[0] * 1e5, dir[1] * 1e5, dir[2] * 1e5); c.up.set(up[0], up[1], up[2]); c.lookAt(0, 0, 0); c.updateMatrixWorld(); c.updateProjectionMatrix(); return c; };
    const iso = (dir, hx, hy, hz, pw, ph) => {   // perspectiva isométrica: sem distorção, cabe na caixa pw × ph
      const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1e7), d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      c.position.copy(d.multiplyScalar(1e5)); c.up.set(0, 1, 0); c.lookAt(0, 0, 0); c.updateMatrixWorld();
      let mx = 0, my = 0;
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const e of [-1, 1]) { const v = new THREE.Vector3(a * hx, b * hy, e * hz).applyMatrix4(c.matrixWorldInverse); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)); }
      const k = Math.max(mx / pw, my / ph) * 2 * 1.04;
      c.left = -pw / 2 * k; c.right = pw / 2 * k; c.top = ph / 2 * k; c.bottom = -ph / 2 * k; c.updateProjectionMatrix(); return c; };
    // a folha
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    O.vistas.forEach(v => g.drawImage(foto(orto(v.dir, v.up, v.px_w / 2 / s, v.px_h / 2 / s), v.px_w, v.px_h), v.c[0] - v.px_w / 2, v.c[1] - v.px_h / 2));
    const P = O.perspectiva; g.drawImage(foto(iso(P.dir, P.caixa[0], P.caixa[1], P.caixa[2], P.w, P.h), P.w, P.h), P.c[0] - P.w / 2, P.c[1] - P.h / 2);
    O.marcas.forEach(m => { g.save(); g.lineWidth = 3; g.strokeStyle = O.clara ? '#222' : '#fff';
      for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(m.x - Math.cos(a) * m.sz, m.y - Math.sin(a) * m.sz); g.lineTo(m.x + Math.cos(a) * m.sz, m.y + Math.sin(a) * m.sz); g.stroke(); }
      g.restore(); });
    // as cotas
    const linha = (x1, y1, x2, y2, lw) => { g.save(); g.strokeStyle = '#111'; g.lineWidth = lw || 1.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore(); };
    const cota = (x1, y1, x2, y2, txt, lado) => { g.save(); g.strokeStyle = '#111'; g.fillStyle = '#111'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      [[x1, y1, ang], [x2, y2, ang + Math.PI]].forEach(([x, y, a]) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a + 0.3) * 18, y + Math.sin(a + 0.3) * 18); g.lineTo(x + Math.cos(a - 0.3) * 18, y + Math.sin(a - 0.3) * 18); g.closePath(); g.fill(); });
      if (txt) { g.font = '40px Arial'; g.textAlign = 'center'; g.textBaseline = lado > 0 ? 'top' : 'bottom'; g.fillText(txt, (x1 + x2) / 2, (y1 + y2) / 2 + (lado > 0 ? 8 : -8)); }
      g.restore(); };
    const txtH = (t, x, y, al) => { g.save(); g.font = '40px Arial'; g.textAlign = al; g.textBaseline = 'top'; g.fillStyle = '#111'; g.fillText(t, x, y); g.restore(); };
    const txtV = (t, x, y, al) => { g.save(); g.translate(x, y); g.rotate(-Math.PI / 2); g.font = '40px Arial'; g.textAlign = al; g.textBaseline = 'bottom'; g.fillStyle = '#111'; g.fillText(t, 0, 0); g.restore(); };
    const rotulo = (t, x, y, al) => { g.save(); g.font = '600 30px Arial'; g.fillStyle = '#1b4f80'; g.textAlign = al || 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); g.restore(); };
    const V = nome => O.vistas.find(v => v.nome === nome), ct = ch => O.cotas.find(c => c.chave === ch), meiaD = D * s / 2;
    if (!O.vertical) {
      const off = O.deslocamento, fre = V('frontal'), te = V('TE'), inf = V('inferior'), Lt = O.comprimento_total;
      const xa = fre.c[0] + (-L / 2 - off) * s, xb = fre.c[0] + (L / 2 - off) * s, yc = fre.c[1] - meiaD - 55;
      linha(xa, fre.c[1] - meiaD, xa, yc - 12); linha(xb, fre.c[1] - meiaD, xb, yc - 12); cota(xa, yc, xb, yc, ct('costado').texto, -1);
      const ty = te.c[1] - meiaD - 55;
      linha(te.c[0] - meiaD, te.c[1], te.c[0] - meiaD, ty - 12); linha(te.c[0] + meiaD, te.c[1], te.c[0] + meiaD, ty - 12); cota(te.c[0] - meiaD, ty, te.c[0] + meiaD, ty, ct('diametro').texto, -1);
      const iy = inf.c[1] + meiaD + 55, ix1 = inf.c[0] + (L / 2 - off) * s, ix2 = ix1 + O.ext_b * s;
      linha(ix1, inf.c[1], ix1, iy + 12); linha(ix2, inf.c[1], ix2, iy + 12); linha(ix1 - 70, iy, ix2 + 70, iy, 2); cota(ix1, iy, ix2, iy, '', 1); txtH(ct('tampo_b').texto, ix2 + 16, iy + 6, 'left');
      if (ct('tampo_a')) { const jx1 = inf.c[0] + (-L / 2 - off) * s, jx2 = jx1 - O.ext_a * s;
        linha(jx1, inf.c[1], jx1, iy + 12); linha(jx2, inf.c[1], jx2, iy + 12); linha(jx2 - 70, iy, jx1 + 70, iy, 2); cota(jx2, iy, jx1, iy, '', 1); txtH(ct('tampo_a').texto, jx2 - 16, iy + 6, 'right'); }
      const sup = V('superior');
      rotulo('CS', sup.c[0] - Lt * s / 2 - 30, sup.c[1], 'right'); rotulo('CF', fre.c[0] - Lt * s / 2 - 30, fre.c[1] - 45, 'right'); rotulo('CI', inf.c[0] - Lt * s / 2 - 30, inf.c[1], 'right');
      rotulo('TE (tampo esquerdo)', te.c[0], te.c[1] + meiaD + 45); rotulo('TD (tampo direito)', V('TD').c[0], V('TD').c[1] + meiaD + 45);
      rotulo(O.nota, W / 2, H - 40);
    } else {
      const cf = V('CF'), cld = V('CLD'), ts = V('TS'), ti = V('TI'), cy = cf.c[1], y0 = O.centro_y, Y = y => cy - (y - y0) * s, folga = O.pes ? 0.05 * D * s : 0;
      const fx = cf.c[0] - R * s - 45 - folga, ya = Y(L / 2), yb = Y(-L / 2);
      linha(cf.c[0] - R * s, ya, fx - 12, ya); linha(cf.c[0] - R * s, yb, fx - 12, yb); cota(fx, ya, fx, yb, '', 1); txtV(ct('costado').texto, fx - 14, O.janela ? yb - (yb - ya) * 0.3 : (ya + yb) / 2, 'center');   // com a janela de visita, o texto desce (o pescoço dela aparece na vista ao lado)
      const tR = R * s, ty = ts.c[1] - O.larg_vista * s / 2 - 50;
      linha(ts.c[0] - tR, ts.c[1], ts.c[0] - tR, ty - 12); linha(ts.c[0] + tR, ts.c[1], ts.c[0] + tR, ty - 12); cota(ts.c[0] - tR, ty, ts.c[0] + tR, ty, ct('diametro').texto, -1);
      const hx = cld.c[0] - R * s - 45 - folga, h1 = Y(L / 2), h2 = Y(L / 2 + O.ext_b);
      linha(cld.c[0], h1, hx - 12, h1); linha(cld.c[0], h2, hx - 12, h2); linha(hx, h2 - 70, hx, h1 + 70, 2); cota(hx, h2, hx, h1, '', 1); txtV(ct('tampo_b').texto, hx - 14, h2 - 80, 'left');
      if (ct('tampo_a')) { const cone = A.tipo === 'conico', bx = cld.c[0] + R * s + (cone ? 70 : 45) + (O.pes ? (cone ? 0.12 : 0.08) * D * s : 0), b1 = Y(-L / 2), b2 = Y(-L / 2 - O.ext_a);
        linha(cld.c[0], b1, bx + 12, b1); linha(cld.c[0], b2, bx + 12, b2);
        if (cone) { cota(bx, b1, bx, b2, '', 1); txtV(ct('tampo_a').texto, bx + 44, b2, 'left'); }   // o texto sobe a partir da ponta do cone (não invade o tampo inferior, ao lado)
        else { linha(bx, b1 - 70, bx, b2 + 70, 2); cota(bx, b1, bx, b2, '', 1); txtV(ct('tampo_a').texto, bx + 44, b2 + 80, 'right'); } }
      const yl = Y(O.base_y) + 50;
      O.rotulos.slice(0, 3).forEach(([t, vn]) => rotulo(t, V(vn).c[0], yl));
      rotulo(O.rotulos[3][0], ts.c[0], ts.c[1] + O.larg_vista * s / 2 + 45); rotulo(O.rotulos[4][0], ti.c[0], ti.c[1] + O.larg_vista * s / 2 + 45);
      rotulo(O.nota, W / 2, H - 30);
    }
  } finally {
    try { r3.dispose(); if (r3.forceContextLoss) r3.forceContextLoss(); } catch (e) {}
  }
  return folha;
}

const Mapa3D = { calcular, comModelo, doisTampos, desenhar, alturaCalculada, CORES, COR_NOME, ALERTA_PCT, LARGURA: W, ALTURA: H, versao: VERSAO };
if (typeof module !== 'undefined' && module.exports) module.exports = Mapa3D; else raiz.Mapa3D = Mapa3D;
})(typeof window !== 'undefined' ? window : globalThis);
