/**
 * Motor de cálculo NR-13 — TapFlow · módulo de inspeção
 * Versão R00.4 · 30/10/2026 (R00.3 + o teste de válvula com 3 ciclos: abertura e assentamento de cada um, S113)
 * Versão R00.3 · 24/10/2026 (R00.2 de 23/10 + a aferição de manômetro e o teste de válvula, R04a)
 *
 * Calcula espessura mínima requerida e PMTA de cada componente de um vaso de pressão
 * pela ASME VIII Div. 1, a PMTA governante, a categoria (NR-13 13.5.1.1) e as datas das
 * próximas inspeções (NR-13 13.5.4.5, estabelecimento sem SPIE).
 *
 * Unidades: pressão em MPa, comprimentos em mm, tensão em MPa.
 * Sem dependências. Funciona no navegador (Field e Manager) e no Node (testes).
 * Referência das fórmulas: inspecao-nr13/04-memoria-de-calculo.md
 *
 * (Cópia de `inspecao-nr13/codigo/motor-calculo-nr13.js`, do projeto, para o
 *  TapDoc do escritório — doc/. A fonte continua sendo a do projeto: mudou lá,
 *  copia aqui e troca o ?v= no doc/index.html.)
 */

const TIPOS = {
    costado: 'costado',                 // casco cilíndrico, tensão circunferencial — UG-27(c)(1)
    eliptico: 'eliptico',               // tampo elíptico 2:1 — UG-32(d)
    torisferico: 'torisferico',         // tampo torisférico ASME (raio da coroa L, junta 6%) — UG-32(e)
    hemisferico: 'hemisferico',         // tampo hemisférico (L = raio interno) — UG-32(f)
    conico: 'conico',                   // tampo cônico sem rebordo (α ≤ 30°) — UG-32(g)
    plano: 'plano',                     // tampo plano soldado/integral — UG-34 eq. (1)
    janela: 'janela',                   // janela de visita, calculada como tampo plano — UG-34 eq. (1)
};

const ESPESSURA_MINIMA_ABSOLUTA = 1.5;  // mm — UG-16(b), sem a corrosão

function exigir(nome, valor) {
    if (typeof valor !== 'number' || !isFinite(valor) || valor <= 0) {
        throw new Error(`Valor inválido ou ausente para ${nome}: ${valor}`);
    }
}

/** Confere os dados geométricos de cada tipo e devolve o cosseno do cone, quando houver. */
function conferirComponente(c, E) {
    exigir('E', E);
    if (E > 1) throw new Error(`Eficiência de junta acima de 1: ${E}`);
    switch (c.tipo) {
        case TIPOS.costado:
        case TIPOS.eliptico:
            exigir('R', c.R); return null;
        case TIPOS.torisferico:
            exigir('L', c.L); return null;
        case TIPOS.hemisferico:
            exigir('L (raio interno)', c.L); return null;
        case TIPOS.conico:
            exigir('R', c.R); exigir('alfaGraus', c.alfaGraus);
            if (c.alfaGraus > 30) throw new Error(`Cone com semiângulo ${c.alfaGraus}° > 30°: fora da UG-32(g) (ver Apêndice 1-5)`);
            return Math.cos((c.alfaGraus * Math.PI) / 180);
        case TIPOS.plano:
        case TIPOS.janela:
            exigir('d', c.d); exigir('C', c.C); return null;
        default:
            throw new Error(`Tipo de componente desconhecido: ${c.tipo}`);
    }
}

/**
 * Espessura mínima requerida (mm) de um componente, sem corrosão.
 * c = { tipo, R, L, d, alfaGraus, C } · P pressão (MPa) · S tensão admissível (MPa) · E eficiência de junta.
 */
function espessuraMinima(c, P, S, E) {
    exigir('P', P); exigir('S', S);
    const cosA = conferirComponente(c, E);
    let e;
    switch (c.tipo) {
        case TIPOS.costado:
            if (S * E - 0.6 * P <= 0) throw new Error('S·E − 0,6·P ≤ 0: pressão alta demais para o material');
            e = (P * c.R) / (S * E - 0.6 * P); break;
        case TIPOS.eliptico:
            e = (P * c.R) / (S * E - 0.1 * P); break;
        case TIPOS.torisferico:
            e = (0.885 * P * c.L) / (S * E - 0.1 * P); break;
        case TIPOS.hemisferico:
            e = (P * c.L) / (2 * S * E - 0.2 * P); break;
        case TIPOS.conico:
            if (S * E - 0.6 * P <= 0) throw new Error('S·E − 0,6·P ≤ 0: pressão alta demais para o material');
            e = (P * c.R) / (cosA * (S * E - 0.6 * P)); break;
        default: // plano e janela
            e = c.d * Math.sqrt((c.C * P) / (S * E));
    }
    if (!(e > 0) || !isFinite(e)) throw new Error(`Espessura requerida inválida (${e}): conferir os dados`);
    return e;
}

/** PMTA (MPa) de um componente com a espessura medida t (mm), já descontada a corrosão futura se houver. */
function pmta(c, t, S, E) {
    exigir('t', t); exigir('S', S);
    const cosA = conferirComponente(c, E);
    switch (c.tipo) {
        case TIPOS.costado: return (S * E * t) / (c.R + 0.6 * t);
        case TIPOS.eliptico: return (S * E * t) / (c.R + 0.1 * t);
        case TIPOS.torisferico: return (S * E * t) / (0.885 * c.L + 0.1 * t);
        case TIPOS.hemisferico: return (2 * S * E * t) / (c.L + 0.2 * t);
        case TIPOS.conico: return (S * E * t * cosA) / (c.R + 0.6 * t * cosA);
        default: return (t * t * S * E) / (c.d * c.d * c.C); // plano e janela
    }
}

/**
 * Avisos de validade das fórmulas para um componente (não impedem o cálculo, aparecem na revisão).
 */
function avisosDoComponente(c, P, S, E, t) {
    const av = [];
    if (c.tipo === TIPOS.costado) {
        if (P > 0.385 * S * E) av.push('Costado: P > 0,385·S·E — parede espessa, a UG-27 não vale (Apêndice 1-2).');
        if (t != null && t > c.R / 2) av.push('Costado: t > R/2 — parede espessa, a UG-27 não vale (Apêndice 1-2).');
    }
    if (c.tipo === TIPOS.hemisferico) {
        if (P > 0.665 * S * E) av.push('Hemisférico: P > 0,665·S·E — fora da UG-32(f) (Apêndice 1-3).');
        if (t != null && t > 0.356 * c.L) av.push('Hemisférico: t > 0,356·L — fora da UG-32(f) (Apêndice 1-3).');
    }
    if (c.tipo === TIPOS.eliptico) av.push('Elíptico: a fórmula vale só para a relação 2:1 (D/2h = 2). Outra relação exige o Apêndice 1-4(c).');
    if (c.tipo === TIPOS.torisferico) {
        av.push('Torisférico: a fórmula vale para rebordo de 6% de L e L ≤ diâmetro externo. Fora disso, Apêndice 1-4(d).');
        if (t != null && t / c.L < 0.002) av.push('Torisférico: t/L < 0,002 — aplicar o Apêndice 1-4(f).');
    }
    if (c.tipo === TIPOS.conico) av.push('Cone: o reforço da junção cone-cilindro (Apêndice 1-5) não é verificado pelo sistema.');
    if (c.tipo === TIPOS.janela && c.aparafusada !== false) {
        av.push('Janela de visita: se a tampa for aparafusada, a UG-34 exige a eq. (2), com a carga dos parafusos. O cálculo usa a eq. (1), de tampo soldado.');
    }
    return av;
}

/**
 * Menor leitura de uma lista — sempre comparando NÚMEROS.
 * (O TapDoc comparava textos: "10.08" < "9.95" dava verdadeiro e a mínima saía errada.)
 */
function minimaLeituras(leituras) {
    // C3 (R00.2): leitura que não é número ('abc', '1O.08' com a letra O) é ERRO, não some em silêncio.
    // Vazio (null, '') é só "sem leitura".
    const nums = leituras.filter((x) => x != null && String(x).trim() !== '').map((x) => {
        const v = typeof x === 'number' ? x : Number(String(x).trim().replace(',', '.'));
        if (typeof v !== 'number' || !isFinite(v)) throw new Error(`Leitura inválida: ${x}`);
        return v;
    });
    if (!nums.length) return null;
    return Math.min(...nums);
}

/** Categoria (NR-13 Tabela 1): linha = classe do fluido, coluna = grupo de potencial de risco. */
const CATEGORIA = {
    A: ['I', 'I', 'II', 'III', 'III'],
    B: ['I', 'II', 'III', 'IV', 'IV'],
    C: ['I', 'II', 'III', 'IV', 'V'],
    D: ['II', 'III', 'IV', 'V', 'V'],
};

/**
 * Grupo de potencial de risco pelo produto P·V (P em MPa, em módulo; V em m³) — NR-13 13.5.1.1.3.
 * Limites inferiores inclusivos: G1 ≥ 100; G2 ≥ 30; G3 ≥ 2,5; G4 ≥ 1; G5 < 1.
 */
function grupoRisco(pMPa, vM3) {
    const pv = Math.abs(pMPa) * vM3;
    if (pv >= 100) return 1;
    if (pv >= 30) return 2;
    if (pv >= 2.5) return 3;
    if (pv >= 1) return 4;
    return 5;
}

function categoria(classeFluido, pMPa, vM3) {
    // C1 (R00.2): pressão ausente não vira categoria V. Negativa (vácuo) vale; zero não.
    if (typeof pMPa !== 'number' || !isFinite(pMPa) || pMPa === 0) throw new Error(`Pressão de operação inválida ou ausente: ${pMPa}`);
    const linha = CATEGORIA[String(classeFluido || '').toUpperCase()];   // C4: classe minúscula vale (o banco aceita)
    if (!linha) throw new Error(`Classe de fluido inválida: ${classeFluido}`);
    exigir('V', vM3);
    const grupo = grupoRisco(pMPa, vM3);
    const avisos = pMPa < 0 ? ['Vaso sob vácuo: a pressão externa (UG-28) não é calculada pelo sistema.'] : [];
    return { pv: Math.abs(pMPa) * vM3, grupo, categoria: linha[grupo - 1], avisos };
}

/** Prazos máximos (anos) sem SPIE — NR-13 Tabela 2 e as exceções 13.5.1.6.1 e 13.5.4.8. */
const PRAZOS = { I: [1, 3], II: [2, 4], III: [3, 6], IV: [4, 8], V: [5, 10] };

function prazos(cat, opcoes = {}) {
    if (opcoes.semCodigoConstrucao) return { externo: 1, interno: 3, regra: '13.5.1.6.1' };
    if (!PRAZOS[cat]) throw new Error(`Categoria inválida: ${cat}`);
    // 13.5.4.8: abaixo de 0 °C, e só quando a experiência mostra que não há deterioração.
    // Interno: quando exigido pelo código de construção ou a critério do PLH (null = o PLH informa).
    if (opcoes.temperaturaAbaixoDeZeroSemDeterioracao) return { externo: 2, interno: null, regra: '13.5.4.8' };
    const [ext, int] = PRAZOS[cat];
    return { externo: ext, interno: int, regra: '13.5.4.5 (sem SPIE)' };
}

function somarAnos(dataISO, anos) {
    const d = new Date(dataISO + 'T12:00:00');
    d.setFullYear(d.getFullYear() + anos);
    return d.toISOString().slice(0, 10);
}

/**
 * Cálculo completo de um vaso.
 * vaso = { pOperacaoMPa, S, corrosaoMm?, componentes: [{ id, nome, tipo, E, R|L|d|alfaGraus|C, leituras: [] | tMin }] }
 * corrosaoMm: sobre-espessura de corrosão somada à espessura requerida e descontada da medida na PMTA (padrão 0).
 */
function calcularVaso(vaso) {
    const P = vaso.pOperacaoMPa;
    const cor = vaso.corrosaoMm || 0;
    if (cor < 0) throw new Error(`Corrosão negativa: ${cor}`);   // C2 (R00.2): não contorna o mínimo de 1,5 mm
    const avisos = [];
    const comps = vaso.componentes.map((c) => {
        const tMin = c.tMin != null ? c.tMin : minimaLeituras(c.leituras || []);
        const eCalc = espessuraMinima(c, P, vaso.S, c.E);
        const eMin = Math.max(eCalc, ESPESSURA_MINIMA_ABSOLUTA) + cor;
        const tUtil = tMin != null ? tMin - cor : null;
        const pm = tUtil != null && tUtil > 0 ? pmta(c, tUtil, vaso.S, c.E) : null;
        const av = avisosDoComponente(c, P, vaso.S, c.E, tMin);
        if (eCalc < ESPESSURA_MINIMA_ABSOLUTA) av.push(`${c.nome}: espessura calculada abaixo de 1,5 mm — vale o mínimo da UG-16(b).`);
        if (tMin == null) av.push(`${c.nome}: sem leitura — fica fora do governante.`);   // C4 (R00.2)
        avisos.push(...av);
        return {
            id: c.id, nome: c.nome, tipo: c.tipo,
            eMin, tMin, pmtaMPa: pm,
            abaixoDaMinima: tMin != null && tMin < eMin,
            avisos: av,
        };
    });
    const comPmta = comps.filter((c) => c.pmtaMPa != null);
    const governante = comPmta.reduce((a, b) => (b.pmtaMPa < a.pmtaMPa ? b : a), comPmta[0] || null);
    return {
        componentes: comps,
        governante: governante ? { id: governante.id, nome: governante.nome, pmtaMPa: governante.pmtaMPa } : null,
        pmtaAbaixoDaOperacao: governante ? governante.pmtaMPa < P : null,
        avisos,
    };
}

// ════════════════════════════════════════════════════════════════════════════
// R00.3 · AFERIÇÃO DE MANÔMETRO E TESTE DE VÁLVULA (R04a, 24/10/2026)
// Procedimento PR-ENG-001. Pressões na unidade do instrumento (a mesma nas
// leituras, na faixa, na resolução e na U do padrão); a válvula converte para
// MPa só para a tolerância ASME e a PMTA.
// ════════════════════════════════════════════════════════════════════════════
// Dentro de uma função: o motor é carregado como script comum nas páginas, e nomes soltos
// (num, deMPa, media…) colidiriam com os da página.
const R04 = (() => {
const UNIDADES_MPA = { 'MPa': 1, 'bar': 0.1, 'kgf/cm2': 0.0980665, 'psi': 0.00689476, 'kPa': 0.001 };

function paraMPa(v, unidade) {
    const f = UNIDADES_MPA[unidade];
    if (!f) throw new Error('Unidade desconhecida: ' + unidade);
    return v * f;
}
function deMPa(v, unidade) { return v / paraMPa(1, unidade); }

/** Tolerância do manômetro pela posição do ponto na faixa (decisão do Bruno, 24/10):
 *  ±20% de 0 a 25%, ±10% de 25 a 75%, ±5% acima de 75%. No zero: 1 resolução. */
function toleranciaManometro(nominal, faixaIni, faixaFim, refPadrao, resolucao) {
    const pos = (nominal - faixaIni) / (faixaFim - faixaIni);
    if (Math.abs(nominal - faixaIni) < 1e-9) return { pct: null, tol: resolucao, trecho: 'zero' };
    const pct = pos <= 0.25 ? 0.20 : pos <= 0.75 ? 0.10 : 0.05;
    return { pct, tol: pct * Math.abs(refPadrao), trecho: pos <= 0.25 ? '0–25%' : pos <= 0.75 ? '25–75%' : '75–100%' };
}

function media(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function desvio(xs) {
    if (xs.length < 2) return 0;
    const m = media(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1));
}
function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) throw new Error('Valor inválido: ' + v);
    return n;
}

/**
 * Aferição de manômetro: 3 cargas e 3 descargas por ponto.
 * a = { faixaIni, faixaFim, resolucao, uPadrao, kPadrao,
 *       pontos: [{ nominal, leituras: [{ sentido: 'carga'|'descarga', padrao, indicado }] }] }
 * Incerteza (GUM / EA-4/02): raiz da soma dos quadrados de tipo A (desvio dos 6 erros ÷ √n),
 * resolução ÷ (2√3) e U/k do padrão; U = 2 · uc.
 */
function afericaoManometro(a) {
    const faltas = [], avisos = [];
    const ini = num(a.faixaIni), fim = num(a.faixaFim), res = num(a.resolucao);
    const uPad = num(a.uPadrao), kPad = num(a.kPadrao) || 2;
    if (ini === null || fim === null || !(fim > ini)) faltas.push('Informe a faixa de indicação (o fim maior que o início).');
    if (!(res > 0)) faltas.push('Informe a resolução de leitura.');
    if (uPad === null || !(uPad >= 0)) faltas.push('O padrão está sem a incerteza (U) no cadastro.');
    if (faltas.length) return { aprovado: false, completo: false, faltas, avisos, pontos: [] };
    const pontos = (a.pontos || []).map((p) => {
        const nominal = num(p.nominal);
        const ls = (p.leituras || []).map((l) => ({ sentido: l.sentido, padrao: num(l.padrao), indicado: num(l.indicado) }))
            .filter((l) => l.padrao !== null && l.indicado !== null);
        const nc = ls.filter((l) => l.sentido === 'carga').length, nd = ls.filter((l) => l.sentido === 'descarga').length;
        const r = { nominal, n: ls.length, completo: nc >= 3 && nd >= 3 };
        if (!ls.length) return r;
        const erros = ls.map((l) => l.indicado - l.padrao);
        r.refPadrao = media(ls.map((l) => l.padrao));
        r.erroMedio = media(erros);
        const tl = toleranciaManometro(nominal, ini, fim, r.refPadrao, res);
        Object.assign(r, tl);
        const uA = desvio(erros) / Math.sqrt(erros.length), uRes = res / (2 * Math.sqrt(3)), uP = uPad / kPad;
        r.uc = Math.sqrt(uA * uA + uRes * uRes + uP * uP);
        r.U = 2 * r.uc;
        r.ok = Math.abs(r.erroMedio) <= r.tol + 1e-9;
        r.padraoInadequado = r.trecho !== 'zero' && uPad > r.tol / 4 + 1e-12;   // no zero a tolerância é a resolução
        return r;
    });
    const naoZero = pontos.filter((p) => p.nominal !== null && Math.abs(p.nominal - ini) > 1e-9);
    if (naoZero.length < 3) faltas.push('Afira pelo menos 3 pontos além do zero.');
    if (!naoZero.some((p) => (p.nominal - ini) / (fim - ini) > 0.75)) faltas.push('Afira pelo menos um ponto acima de 75% da faixa.');
    pontos.forEach((p) => { if (!p.completo) faltas.push('Ponto ' + p.nominal + ': faltam leituras (3 cargas e 3 descargas).'); });
    pontos.filter((p) => p.padraoInadequado).forEach((p) => avisos.push('Ponto ' + p.nominal + ': padrão inadequado (U do padrão maior que 1/4 da tolerância).'));
    pontos.filter((p) => p.ok === false).forEach((p) => avisos.push('Ponto ' + p.nominal + ': erro ' + p.erroMedio.toFixed(3) + ' fora da tolerância ±' + p.tol.toFixed(3) + '.'));
    const completo = !faltas.length;
    const com = pontos.filter((p) => p.erroMedio !== undefined);
    return {
        completo, faltas, avisos, pontos,
        aprovado: completo && pontos.every((p) => p.ok),
        erroMax: com.length ? Math.max(...com.map((p) => Math.abs(p.erroMedio))) : null,
        Umax: com.length ? Math.max(...com.map((p) => p.U)) : null,
    };
}

/** Tolerância ASME da abertura: ±2 psi até 70 psi; ±3% acima (decisão do Bruno, 24/10). Em MPa. */
function toleranciaValvulaMPa(ajusteMPa) {
    return ajusteMPa <= 70 * 0.00689476 + 1e-12 ? 2 * 0.00689476 : 0.03 * ajusteMPa;
}

/**
 * Teste de válvula: 3 ciclos, cada um com a abertura e o seu assentamento.
 * v = { unidade, ajuste, aberturas: [a1, a2, a3], assentamentos: [s1, s2, s3] (ou, no formato antigo, assentamento), pmtaMPa }
 */
function testeValvula(v) {
    const faltas = [], avisos = [];
    const un = v.unidade || 'bar';
    const aj = num(v.ajuste), ab = (v.aberturas || []).map(num).filter((x) => x !== null);
    // R00.4 (S113): 3 ciclos, cada um com a abertura e o seu assentamento; o formato antigo (1 assentamento) continua valendo
    const porCiclo = Array.isArray(v.assentamentos);
    const asv = porCiclo ? v.assentamentos.map(num).filter((x) => x !== null) : [];
    const as = porCiclo ? (asv.length ? asv.reduce((x, y) => x + y, 0) / asv.length : null) : num(v.assentamento);
    if (!(aj > 0)) faltas.push('Informe a pressão de abertura (plaqueta ou certificado).');
    if (ab.length < 3) faltas.push('Faça 3 aberturas.');
    if (porCiclo ? asv.length < 3 : as === null) faltas.push(porCiclo ? 'Informe o assentamento dos 3 ciclos.' : 'Informe o assentamento.');
    if (faltas.length) return { aprovada: false, completo: false, grave: false, faltas, avisos };
    const ajM = paraMPa(aj, un), med = media(ab), medM = paraMPa(med, un), maxM = paraMPa(Math.max(...ab), un);
    const tolM = toleranciaValvulaMPa(ajM);
    const r = { completo: true, faltas, avisos, media: med, tol: deMPa(tolM, un), desvio: med - aj };
    r.dentroTolerancia = Math.abs(medM - ajM) <= tolM + 1e-9;
    if (!r.dentroTolerancia) avisos.push('Abertura média ' + med.toFixed(3) + ' ' + un + ' fora da tolerância do ajuste (±' + r.tol.toFixed(3) + ').');
    r.assentamentoOk = porCiclo ? asv.every((x, k) => x <= ab[k] + 1e-9) : as <= Math.min(...ab) + 1e-9;
    if (!r.assentamentoOk) avisos.push('Assentamento acima da abertura.');
    r.assentamentoMedio = as;
    const pm = num(v.pmtaMPa);
    r.acimaPMTA = pm !== null && maxM > pm + 1e-9;
    if (r.acimaPMTA) avisos.push('Abertura acima da PMTA vigente (' + deMPa(pm, un).toFixed(3) + ' ' + un + '): NR-13 13.5.1.2 "a".');
    if (pm === null) avisos.push('Sem a PMTA vigente: a abertura não foi conferida contra ela.');
    r.grave = r.acimaPMTA;
    r.aprovada = r.dentroTolerancia && r.assentamentoOk && !r.acimaPMTA;
    return r;
}
    return { UNIDADES_MPA, paraMPa, deMPa, toleranciaManometro, afericaoManometro, toleranciaValvulaMPa, testeValvula };
})();

const MotorNR13 = {
    TIPOS, ESPESSURA_MINIMA_ABSOLUTA, espessuraMinima, pmta, avisosDoComponente, minimaLeituras,
    grupoRisco, categoria, prazos, somarAnos, calcularVaso,
    // R00.3 · R04a
    UNIDADES_MPA: R04.UNIDADES_MPA, paraMPa: R04.paraMPa, deMPa: R04.deMPa, toleranciaManometro: R04.toleranciaManometro,
    afericaoManometro: R04.afericaoManometro, toleranciaValvulaMPa: R04.toleranciaValvulaMPa, testeValvula: R04.testeValvula,
    versao: 'R00.4-2026-10-30',
};

if (typeof module !== 'undefined' && module.exports) module.exports = MotorNR13;
if (typeof window !== 'undefined') window.MotorNR13 = MotorNR13;
