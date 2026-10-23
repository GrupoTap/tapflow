/**
 * Motor de cálculo NR-13 — TapFlow · módulo de inspeção
 * Versão R00.2 · 23/10/2026 (R00.1 de 19/10 + as correções C1–C4 da auditoria de 20/10)
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

const MotorNR13 = {
    TIPOS, ESPESSURA_MINIMA_ABSOLUTA, espessuraMinima, pmta, avisosDoComponente, minimaLeituras,
    grupoRisco, categoria, prazos, somarAnos, calcularVaso,
    versao: 'R00.2-2026-10-23',
};

if (typeof module !== 'undefined' && module.exports) module.exports = MotorNR13;
if (typeof window !== 'undefined') window.MotorNR13 = MotorNR13;
