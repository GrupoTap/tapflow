/* recomendacoes.js — RC1 (S163 · issues 12, 18, 20 e 21): a lista das recomendações do laudo (seção 11) e o parágrafo
 * da justificativa do prazo menor (seção 13), montados pela MESMA regra no celular (field/doc/), na revisão e no laudo (doc/).
 * Duas cópias que andam juntas, como o motor: doc/recomendacoes.js e field/doc/recomendacoes.js (trocar o ?v= nas duas páginas,
 * a linha em ESSENCIAIS do field/sw.js e a VERSAO dos dois service workers).
 *
 * Cada recomendação tem um código (chave):
 *   fixa:seg:N · fixa:cons:N   as que o modelo imprime sempre (rec_seguranca_gerais, rec_conservacao_gerais);
 *   regra:ambiente · regra:cat12 · regra:placa · regra:disco:<id> · acessorio:<id>   as que vêm das respostas;
 *   pr:R3 …                    as prontas marcadas ("Recomendações a mais", inspecoes.rec_casos);
 *   r:<id>                     as escritas na revisão (inspecao_recomendacoes; editadas e tiradas lá mesmo).
 * O ajuste (inspecoes.rec_ajustes = { fora:[chave], textos:{ chave: texto } }) tira da lista e troca o texto, só para aquele laudo.
 * Repetidas saem uma vez só (o mesmo texto, ou duas de limpeza periódica: fica a escrita na revisão ou a pronta).
 */
(function (raiz) {
  'use strict';
  const VERSAO = 'RC1';
  const vazio = x => x == null || String(x).trim() === '';
  const txt = (t, o) => String(t || '').replace(/\{\{(\w+)\}\}/g, (m, k) => o && o[k] != null ? o[k] : '');
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const LIMPEZA = /limpeza peri[oó]dica/i;
  const SUBSTITUIR = ['substituir', 'inoperante'];
  const presente = a => ['ausente', 'retirado'].indexOf(a.situacao) < 0;

  /**
   * ctx = { B: os blocos do modelo (rec_seguranca_gerais, rec_conservacao_gerais, rec_instalacao, rec_manual_cat12, rec_regra, prontos),
   *         ambiente, categoria, placa ('indelevel'|'ilegivel'|'sem'), rec_casos:[R…], ajustes:{fora, textos},
   *         acessorios:[{ id, tipo, situacao, resultado, grave, caso_campos }], linhas:[{ id, tipo, texto, prazo, ref }] }
   * Devolve [{ chave, tipo, texto, original, origem, fixa, marcada, editada, prazo, id }] na ordem do laudo:
   * segurança (11.1) primeiro, conservação (11.2) depois.
   */
  function montar(ctx) {
    const B = ctx.B || {}, PR = B.prontos || {}, RG = B.rec_regra || {};
    const aj = ctx.ajustes || {}, fora = Array.isArray(aj.fora) ? aj.fora : [], textos = aj.textos && typeof aj.textos === 'object' ? aj.textos : {};
    const linhas = ctx.linhas || [], rc = ctx.rec_casos || [], acs = ctx.acessorios || [];
    const seg = [], cons = [];
    const por = (L, it) => L.push(it);
    const linha = r => ({ chave: 'r:' + r.id, id: r.id, tipo: r.tipo || 'geral', texto: r.texto, origem: 'livre', prazo: r.prazo || null, ref: r.ref || null });
    // 11.1 · as escritas na revisão (segurança e gerais)
    linhas.filter(r => r.tipo === 'seguranca').forEach(r => por(seg, linha(r)));
    linhas.filter(r => r.tipo !== 'seguranca' && r.tipo !== 'conservacao').forEach(r => por(seg, linha(r)));
    // as que vêm das respostas: o acessório a substituir ou reprovado (o texto do modelo; sem ele, a revisão escreve como antes)
    acs.filter(a => presente(a) && RG[a.tipo] && (SUBSTITUIR.indexOf(a.situacao) >= 0 || a.resultado === 'reprovado' || a.grave)
                    && !linhas.some(r => r.ref === 'acessorio:' + a.id))
      .forEach(a => por(seg, { chave: 'acessorio:' + a.id, tipo: 'seguranca', texto: RG[a.tipo], origem: 'regra' }));
    // a placa ilegível ou ausente (R10 / R11), se não foi marcada à mão nem escrita na revisão
    const pk = ctx.placa === 'ilegivel' ? 'R10' : ctx.placa === 'sem' ? 'R11' : null;
    if (pk && PR[pk] && rc.indexOf('R10') < 0 && rc.indexOf('R11') < 0 && !linhas.some(r => /placa de identifica/i.test(r.texto || '')))
      por(seg, { chave: 'regra:placa', tipo: PR[pk].tipo || 'seguranca', texto: PR[pk].texto, origem: 'regra' });
    // as fixas do modelo
    (B.rec_seguranca_gerais || []).forEach((t, k) => por(seg, { chave: 'fixa:seg:' + (k + 1), tipo: 'seguranca', texto: t, origem: 'fixa', fixa: true }));
    if (ctx.ambiente && B.rec_instalacao && B.rec_instalacao[ctx.ambiente]) por(seg, { chave: 'regra:ambiente', tipo: 'seguranca', texto: B.rec_instalacao[ctx.ambiente], origem: 'regra' });
    if (['I', 'II'].indexOf(ctx.categoria) >= 0 && B.rec_manual_cat12) por(seg, { chave: 'regra:cat12', tipo: 'seguranca', texto: txt(B.rec_manual_cat12, { categoria: ctx.categoria }), origem: 'regra' });
    rc.filter(k => PR[k] && PR[k].tipo !== 'conservacao').forEach(k => por(seg, { chave: 'pr:' + k, tipo: PR[k].tipo || 'seguranca', texto: PR[k].texto, origem: 'pronta' }));
    acs.filter(a => a.tipo === 'disco_ruptura' && presente(a) && (a.caso_campos || {}).sem_certificado && PR.D3)
      .forEach(a => por(seg, { chave: 'regra:disco:' + a.id, tipo: 'seguranca', texto: PR.D3.texto, origem: 'regra' }));
    // 11.2 · conservação
    linhas.filter(r => r.tipo === 'conservacao').forEach(r => por(cons, linha(r)));
    (B.rec_conservacao_gerais || []).forEach((t, k) => por(cons, { chave: 'fixa:cons:' + (k + 1), tipo: 'conservacao', texto: t, origem: 'fixa', fixa: true }));
    rc.filter(k => PR[k] && PR[k].tipo === 'conservacao').forEach(k => por(cons, { chave: 'pr:' + k, tipo: 'conservacao', texto: PR[k].texto, origem: 'pronta' }));
    // o ajuste (só para este laudo) e as repetidas
    const todas = seg.concat(cons).map(x => {
      const ed = x.origem !== 'livre' && !vazio(textos[x.chave]);
      return Object.assign(x, { original: x.texto, texto: ed ? String(textos[x.chave]).trim() : x.texto, editada: ed,
        marcada: x.origem === 'livre' || x.origem === 'pronta' ? true : fora.indexOf(x.chave) < 0 });
    });
    const vistas = new Set(), out = [];
    const limpezaMao = todas.some(x => x.marcada && x.origem !== 'fixa' && LIMPEZA.test(x.texto));
    todas.forEach(x => {
      if (x.marcada && x.origem === 'fixa' && limpezaMao && LIMPEZA.test(x.texto)) return;   // issue 18: a limpeza sai uma vez só
      const n = norm(x.texto);
      if (x.marcada && vistas.has(n)) return;
      if (x.marcada) vistas.add(n);
      out.push(x);
    });
    return out;
  }

  // ── seção 13 · a justificativa do prazo menor (issue 21) ──────────────────
  const PARTES = ['A1', 'A2', 'B', 'O'];
  /** O caso do prazo ("A1+B+O"): as marcas na ordem A1 → A2 → B → Outros. Devolve null se não é desse jeito (P1, texto livre antigo). */
  function partes(caso) {
    if (vazio(caso) || !/^(A1|A2|B|O)(\+(A1|A2|B|O))*$/.test(caso)) return null;
    const p = caso.split('+'); return PARTES.filter(k => p.indexOf(k) >= 0);
  }
  const casoDe = marcas => { const p = PARTES.filter(k => (marcas || []).indexOf(k) >= 0); return p.length ? p.join('+') : null; };
  const sem = s => String(s || '').trim().replace(/[.;\s]+$/, '');
  const minus = s => s.replace(/^./, c => c.toLowerCase());
  const maius = s => s.replace(/^./, c => c.toUpperCase());
  /** O parágrafo do laudo: A (A1 e/ou A2) → B → Outros, ligados por "Adicionalmente," e fechado pela frase fixa. J = blocos.prazo_just. */
  function prazoTexto(caso, outros, J) {
    const p = partes(caso); if (!p || !J) return null;
    const ps = [];
    const a1 = p.indexOf('A1') >= 0 && J.A1, a2 = p.indexOf('A2') >= 0 && J.A2;
    if (a1 && a2) ps.push(sem(J.A1.texto) + ', ' + sem(J.A2.junto || J.A2.texto) + ', ' + sem(J.a_fim) + '.');
    else if (a1) ps.push(sem(J.A1.texto) + ', ' + sem(J.a_fim) + '.');
    else if (a2) ps.push(maius(sem(J.A2.texto)) + ', ' + sem(J.a_fim) + '.');
    if (p.indexOf('B') >= 0 && J.B) ps.push(sem(J.B.texto) + '.');
    if (p.indexOf('O') >= 0 && !vazio(outros)) ps.push(sem(outros) + '.');
    if (!ps.length) return null;
    const liga = sem(J.liga || 'Adicionalmente,');
    return ps.map((s, k) => k ? liga + ' ' + minus(s) : maius(s)).join(' ') + (J.fecho ? ' ' + String(J.fecho).trim() : '');
  }
  /** O resumo curto (vai em prazo_red_just e na justificativa das datas do PLH): os rótulos marcados e o texto de "Outros". */
  function prazoResumo(marcas, outros, J) {
    const p = partes(casoDe(marcas)) || [];
    const r = p.filter(k => k !== 'O').map(k => (J && J[k] && J[k].rotulo) || k);
    if (p.indexOf('O') >= 0 && !vazio(outros)) r.push(String(outros).trim());
    return r.join('; ');
  }
  /** O vaso tem código adotado (o cálculo foi refeito por um código reconhecido): o 13.5.1.6.1 pode não valer. */
  const codigoAdotado = cod => /adotad/i.test(String(cod || ''));

  const api = { versao: VERSAO, montar, partes, casoDe, prazoTexto, prazoResumo, codigoAdotado, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.RecsNR13 = api;
})(typeof window !== 'undefined' ? window : globalThis);
