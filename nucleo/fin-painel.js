/* nucleo/fin-painel.js · FP3 (S209, Rodada R14: a reserva = a soma das caixinhas, issue 93; os botões que voltavam ao Painel e o "Precisa de ação" com clique, issue 188) · FP2 (S189: a linha da meta de recebimento no "Entrou × saiu", só quando FINPM.metaEntrou existe) · FP1 (S188) — os quadros do Painel Financeiro e das Projeções do TapFin.
 * Movido do fin/index.html (F21) sem mudar o código, para o TapGestão (aba Reunião) usar os MESMOS gráficos
 * (decisão RE9 do Bruno, 17/11/2026, processos/tapgestao-reuniao-desenho.md). Mudou um gráfico? Muda aqui, e vale
 * nos dois lugares. A página que carrega este arquivo precisa ter: esc, BRL, dataBR, rpc, irPara, visao, finPlural,
 * finpCardMes, _FINP_MESES, modalTituloPagar, modalTituloReceber, medAvisosPainel, osmedAvisosPainel e osmedLigarPainel.
 * Classic script, sem build: as funções ficam globais, como eram dentro do fin/index.html. */
async function pintarPainelFin(){
  visao = 'finp';
  const board = document.getElementById('board');
  board.innerHTML = '<div class="tela"><div class="telaCab"><h2>Painel Financeiro</h2>'
    + '<p>O que precisa de atenção agora, o mês até aqui, e o que vem pela frente.</p></div>'
    + '<div style="margin-bottom:14px"><button class="btn pri" type="button" id="finpNovaPagar">+ Conta a pagar</button> '
    + '<button class="btn pri" type="button" id="finpNovaReceber">+ Conta a receber</button> '
    + '<button class="btn" type="button" id="finpIrCiclo" title="Salários, impostos e o que é recorrente, OS em execução e o ciclo da reserva">Projeções →</button></div>'
    + '<div id="finpCorpo"><p class="nota">Carregando…</p></div></div>';
  document.getElementById('finpNovaPagar').addEventListener('click', () => modalTituloPagar());
  document.getElementById('finpNovaReceber').addEventListener('click', () => modalTituloReceber());
  document.getElementById('finpIrCiclo').addEventListener('click', () => irPara('fincr'));   // S67
  await finpCarregar();
}

async function finpCarregar(){
  const el = document.getElementById('finpCorpo'); if (!el) return;
  let d, pm;
  let proj;
  // S66 · a projeção não pode derrubar o painel: sem o SQL 500, a tela abre como antes e avisa.
  // S69 · + as despesas futuras (recorrentes e outras), que só a tela Projeções soma
  // S70 · + o ciclo pelo saldo real do dia 1º e o plano das provisões (SQL 503)
  let desp, ciclo, med, osmed;
  try{ [d, pm, proj, desp, ciclo, med, osmed] = await Promise.all([rpc('tf_fin_painel', {}), rpc('tf_fin_painel_mensal', {}),
                                          rpc('tf_fin_projecao_os', {}).catch(e => ({ erro: e.message })),
                                          rpc('tf_fin_projecao_despesas', {}).catch(e => ({ erro: e.message })),
                                          rpc('tf_fin_ciclo', {}).catch(e => ({ erro: e.message })),
                                          rpc('tf_fin_medicoes_sem_titulo', {}).catch(() => null),   // F13 · sem a 509: sem aviso
                                          rpc('tf_osmed_avisos', {}).catch(() => [])]); }   // F14 · sem a 306: sem aviso
  catch(e){
    el.innerHTML = '<div class="vazio2"><b>Não consegui abrir o painel</b><p></p>'
      + '<button class="btn" type="button" id="finpDeNovo">Tentar de novo</button></div>';
    el.querySelector('p').textContent = e.message;
    document.getElementById('finpDeNovo').addEventListener('click', finpCarregar);
    return;
  }
  FINPM.d = d; FINPM.pm = pm; FINPM.proj = proj; FINPM.desp = desp; FINPM.ciclo = ciclo; FINPM.med = med; FINPM.osmed = osmed;
  FINPM.meses = fpmMeses(pm);
  if (!FINPM.mes || !FINPM.meses.includes(FINPM.mes)) FINPM.mes = pm.mes_atual;
  fpmRedesenhar();
}

const FINPM = { d: null, pm: null, meses: [], mes: null, abertos: new Set(), proj: null, verProj: false, desp: null, pjMes: null, ciclo: null };

const FPM_FOLHA = ['Pro Labore', 'FGTS', 'GPS', 'Previdência', 'Vale Refeição', 'Plano de Saúde'];

const FPM_COR = { entrou: '#1E7A42', saiu: '#D08A2E', res: '#1B6FA9' };

const FPM_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function fpmMeses(pm){
  const ms = (pm.meses || []).filter(m => Number(m.entrou) > 0).map(m => m.mes);
  const ini = ms.length ? ms[0] : pm.mes_atual;
  const out = [];
  let [a, m] = ini.split('-').map(Number);
  const [fa, fm] = pm.mes_atual.split('-').map(Number);
  while (a < fa || (a === fa && m <= fm)){ out.push(a + '-' + String(m).padStart(2, '0')); m++; if (m > 12){ m = 1; a++; } }
  return out;
}

function fpmMes(k){
  const x = (FINPM.pm.meses || []).find(m => m.mes === k) || { mes: k, entrou: 0, saiu: 0, grupos: {}, clientes: [] };
  if (!x._calc){
    let folha = 0, fixas = 0, cartao = 0;
    Object.entries(x.grupos || {}).forEach(([g, subs]) => Object.entries(subs).forEach(([s, v]) => {
      v = Number(v) || 0;
      if (g === 'Despesas com Pessoal' || FPM_FOLHA.includes(s)) folha += v;
      if (g === 'Despesas Fixas' || g === 'Despesas com Pessoal') fixas += v;
      if (s === 'Fatura de Cartão') cartao += v;
    }));
    Object.assign(x, { entrou: Number(x.entrou) || 0, saiu: Number(x.saiu) || 0, folha, fixas, cartao, _calc: true });
  }
  return x;
}

const fpmRot = k => FPM_NOMES[+k.slice(5, 7) - 1] + '/' + k.slice(0, 4);

const fpmCurto = k => _FINP_MESES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4);

const fpmK = v => (v < 0 ? '−' : '') + 'R$ ' + (Math.abs(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';

const fpmPct = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%';

const fpmBRL = v => (v < 0 ? '−' : '') + BRL(Math.abs(v));

function fpmAnteriores(k, n){ const i = FINPM.meses.indexOf(k); return FINPM.meses.slice(Math.max(0, i - n), Math.max(0, i)); }

function fpmMedia(ms, f){ return ms.length ? ms.reduce((s, k) => s + f(fpmMes(k)), 0) / ms.length : null; }

function fpmFimMes(k){ const [a, m] = k.split('-').map(Number); return k + '-' + String(new Date(a, m, 0).getDate()).padStart(2, '0'); }

function fpmSoma(k, f){ const [a, m] = k.split('-').map(Number); const d = new Date(a, m - 1 + f, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

const fpmSaldoOp = () => (FINPM.pm.contas || []).filter(c => c.papel === 'operacional').reduce((s, c) => s + (Number(c.saldo) || 0), 0);

function fpmTip(e, html){
  let t = document.getElementById('fpmTip');
  if (!t){ t = document.createElement('div'); t.id = 'fpmTip'; t.className = 'fpmTip'; document.body.appendChild(t); }
  t.innerHTML = html; t.style.opacity = 1;
  const w = t.offsetWidth, h = t.offsetHeight; let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}

function fpmTipSai(){ const t = document.getElementById('fpmTip'); if (t) t.style.opacity = 0; }

function fpmLigar(el, i){
  const go = j => { if (j >= 0 && j < FINPM.meses.length){ FINPM.mes = FINPM.meses[j]; fpmRedesenhar(); } };
  document.getElementById('fpmAnt').addEventListener('click', () => go(i - 1));
  document.getElementById('fpmProx').addEventListener('click', () => go(i + 1));
  const vt = document.getElementById('fpmVerTab');   // S70: a tela Projeções não tem gráfico
  if (vt) vt.addEventListener('click', e => { const t = document.getElementById('fpmTab'); t.hidden = !t.hidden; e.target.textContent = t.hidden ? 'ver tabela' : 'esconder tabela'; });
  el.querySelectorAll('.fpmGrupo').forEach(l => {
    const alterna = () => { const g = l.dataset.g; FINPM.abertos.has(g) ? FINPM.abertos.delete(g) : FINPM.abertos.add(g); fpmRedesenhar(); };
    l.addEventListener('click', alterna);
    l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); alterna(); } });
  });
  el.querySelectorAll('[data-tip]').forEach(s => { s.addEventListener('mousemove', e => fpmTip(e, esc(s.dataset.tip))); s.addEventListener('mouseleave', fpmTipSai); });
  el.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => fpmIr(b.dataset.ir)));   // S66 · FP3: "tela:situação" e "os"
  // FP3 (issue 188): a linha do "Precisa de ação" abre a conta
  el.querySelectorAll('[data-fptit]').forEach(l => {
    const abre = () => fpmAbrirTitulo(l.dataset.fptipo, l.dataset.fptit);
    l.addEventListener('click', abre);
    l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); abre(); } });
  });
  osmedLigarPainel(el);   // F14
  const vp = document.getElementById('fpmVerProj');                                                       // S66
  if (vp) vp.addEventListener('click', () => { FINPM.verProj = !FINPM.verProj; fpmRedesenhar(); });
  if (!FINPM._teclas){
    FINPM._teclas = true;
    document.addEventListener('keydown', e => {
      if ((visao !== 'finp' && visao !== 'fincr') || /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
      const j = FINPM.meses.indexOf(FINPM.mes);
      const ir = n => { if (n >= 0 && n < FINPM.meses.length){ FINPM.mes = FINPM.meses[n]; fpmRedesenhar(); } };
      if (e.key === 'ArrowLeft') ir(j - 1); else if (e.key === 'ArrowRight') ir(j + 1);
    });
    addEventListener('resize', () => {
      if (!FINPM.mes) return;
      if (visao === 'finp') fpmGraficosPainel(FINPM.mes); else if (visao === 'fincr') fpjGraficos();   // S71/S72
    });
  }
}

/* FP3 (S209, issue 188): os botões apontavam para telas que não existem no TapFin ("finr", "os") e caíam no Painel.
   "finre:vencidas" = Contas a Receber já em "Vencidas"; "os" = a tabela das OS nas Projeções. A página dá o irPara(tela, situação):
   o TapFin abre a tela; a Reunião do TapGestão abre o TapFin em outra aba. */
function fpmIr(alvo){
  const [v, sit] = String(alvo || '').split(':');
  if (v === 'os') return fpmIrOs();
  irPara(v, sit || undefined);
}

function fpmIrOs(){
  const achar = () => {
    const t = document.querySelector('.fpmProjTab:not(.curta)'); if (!t) return false;
    const d = t.closest('details'); if (d) d.open = true;
    try{ t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }catch(e){ t.scrollIntoView(); }
    return true;
  };
  if (visao === 'fincr' && achar()) return;
  irPara('fincr');
  if (visao !== 'fincr') return;   // a Reunião abre as Projeções em outra aba
  let n = 0; const iv = setInterval(() => { if (achar() || ++n > 50) clearInterval(iv); }, 100);
}

// a página pode ter o finAbrirTitulo (o TapFin abre a lista na conta; a Reunião, o TapFin em outra aba); sem ele, a lista
function fpmAbrirTitulo(tipo, id){
  if (typeof finAbrirTitulo === 'function') return finAbrirTitulo(tipo, id);
  irPara(tipo === 'p' ? 'finpg' : 'finre');
}

function fpmPendencias(d){
  const pend = d.pendencias || [];
  const vencidos = pend.filter(p => p.vencido).length, vencendo = pend.length - vencidos;
  return '<div class="painel" style="margin-bottom:14px;padding:14px">'
    + '<h3 style="margin-top:0">Precisa de ação'
    +   (vencidos ? ' <span class="chip" style="background:var(--crit-soft);color:var(--crit)">' + vencidos + ' vencido' + (vencidos > 1 ? 's' : '') + '</span>' : '')
    +   (vencendo ? ' <span class="chip" style="background:var(--warn-soft);color:var(--warn)">' + vencendo + ' vencendo</span>' : '')
    + '</h3>'
    + medAvisosPainel()   // F13
    + (!pend.length ? '<p class="nota" style="margin:0">Nada vencido ou vencendo nos próximos 7 dias.</p>'
        : pend.map(p => '<div class="ccLin fpmPend" role="button" tabindex="0" data-fptit="' + esc(p.id) + '" data-fptipo="' + esc(p.tipo) + '"'
            + ' title="Abrir esta conta em ' + (p.tipo === 'p' ? 'Contas a Pagar' : 'Contas a Receber') + '" style="border-left:3px solid ' + (p.vencido ? 'var(--crit)' : 'var(--warn)') + ';padding-left:8px">'
            + '<span class="ccData">' + esc(dataBR(p.vencimento)) + (p.vencido ? ' <small style="color:var(--crit)">vencido</small>' : '') + '</span>'
            + '<span class="ccNome">' + esc(p.quem || '—') + '</span>'
            + '<span class="ccDesc">' + esc(p.descricao) + ' <small style="color:var(--ink-3)">· ' + (p.tipo === 'p' ? 'a pagar' : 'a receber') + '</small></span>'
            + '<span class="n v">' + esc(BRL(p.saldo)) + '</span></div>').join('')) + '</div>';
}

function fpmBarra(nome, v, max, cor, n, med, cls){
  return '<div class="fpmLin ' + (cls || '') + '"><span class="fpmNome" title="' + esc(nome) + '">' + esc(nome) + '</span>'
    + '<span class="fpmTrilho"><span class="b" style="width:' + (max ? 100 * v / max : 0) + '%;background:' + cor + '"></span>'
    + (med !== null && med !== undefined ? '<span class="med" style="left:' + (max ? 100 * med / max : 0) + '%" title="média dos 3 meses antes: ' + esc(BRL(med)) + '"></span>' : '') + '</span>'
    + '<span class="fpmN">' + n + '</span></div>';
}

const fpmDias = s => Math.round((new Date(s + 'T12:00:00') - new Date(FINPM.pm.hoje + 'T12:00:00')) / 864e5);

const FPM_PROJ_COR = '#6FB08A';

const fpmProjLista = () => (FINPM.proj && Array.isArray(FINPM.proj.os) ? FINPM.proj.os : [])
  .map(o => ({ ...o, v: Number(o.projecao) || 0, m: o.recebe_em ? String(o.recebe_em).slice(0, 7) : null }));

const fpmProjMes = m => fpmProjLista().filter(o => o.m === m);

const fpmProjComData = () => fpmProjLista().filter(o => o.m);

const fpmProjSemData = () => fpmProjLista().filter(o => !o.m);

// FP3 (S209, issue 93): a reserva é a SOMA DAS CAIXINHAS (pm.reserva, da 527): a conta de reserva nunca recebe a "Reserva
// mensal" e mostrava R$ 0. Sem a 527 (ou na ata de um mês fechado antes dela), como antes: as contas que não são operacionais.
const fpmReservas = () => {
  const R = FINPM.pm && FINPM.pm.reserva;
  if (R && Array.isArray(R.caixinhas)) return [{ nome: 'caixinhas', papel: 'reserva', saldo: Number(R.total) || 0, saldo_inicial: 1, caixinhas: R.caixinhas }];
  return (FINPM.pm.contas || []).filter(c => c.papel !== 'operacional');
};
// o nome de cada caixinha com o saldo (ao passar o mouse)
const fpmResTip = c => c.caixinhas ? c.caixinhas.map(x => x.nome + ': ' + BRL(Number(x.saldo) || 0)).join(' · ') || 'nenhuma caixinha' : c.nome + ': ' + BRL(Number(c.saldo) || 0);
const fpmResNome = c => c.caixinhas ? 'nas caixinhas' : c.nome.replace(/^Banco /, '');
const fpmResSemIni = c => c.caixinhas || Number(c.saldo_inicial) ? '' : ' (sem saldo inicial)';

const fpmTot = L => L.reduce((s, o) => s + (Array.isArray(o) ? o[1] : o.v), 0);

const fpmMesCurto = m => _FINP_MESES[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4);

function fpmProjAvisos(){
  const P = FINPM.proj || {};
  if (P.erro) return '<p class="fpmPq" style="margin:8px 0 0">A projeção das OS em execução não carregou (' + esc(P.erro) + ').</p>';
  const s = P.sem_os || {}, n = Number(s.n) || 0;
  const sm = P.contrato_sem_mob || {}, k = Number(sm.n) || 0;   // F13 · 510
  const avisoMob = !k ? '' : '<p class="fpmPq" style="margin:8px 0 0">⚠ ' + (k === 1 ? '1 título cita' : k + ' títulos citam')
    + ' o contrato sem dizer a mobilização (' + (sm.titulos || []).slice(0, 3).map(x => esc(x.descricao || x.os_codigo || '—')).join('; ') + (k > 3 ? '…' : '')
    + '): ele não abate nenhuma OS. Escreva o código com o sufixo (OS-2026003-M10) no campo OS.</p>';
  if (!n) return avisoMob;
  return '<p class="fpmPq" style="margin:8px 0 0">⚠ ' + finPlural(n, 'título', 'títulos') + ' a receber em aberto, de clientes com OS em execução, '
    + (n === 1 ? 'está' : 'estão') + ' sem o número da OS (' + esc(BRL(Number(s.total) || 0)) + '). Se for de uma dessas OS, ela conta duas vezes (lançado + projeção): informe a OS no título.</p>' + avisoMob;
}

function fpmProjTabela(compacta){
  const C = fpmProjComData(), S = fpmProjSemData();
  if (!C.length && !S.length) return '<p class="nota" style="margin:6px 0 0">Nenhuma OS aberta com proposta aprovada e ainda não lançada no Contas a Receber.</p>';
  const dias = d => d ? fpmDias(String(d).slice(0, 10)) * -1 : null;
  const marca = o => (o.medicao === 'estimada' ? ' <span class="chip" title="OS de contrato: a medição ainda não foi fechada; o valor é a estimativa do TapHub">estimativa</span>' : '')
    + (o.parada ? ' <span class="chip" style="background:var(--warn-soft);color:var(--warn)" title="Sem prazo, sem tarefa marcada e aberta há ' + esc(String(dias(o.aberta_em))) + ' dias">parada</span>' : '');
  if (compacta){
    return (C.length ? '<table class="fpmTabela fpmProjTab curta"><tr><th>OS</th><th>Cliente</th><th>Projeção</th><th>Recebe em</th></tr>'
        + C.map(o => '<tr><td>' + esc(o.numero) + '</td><td>' + esc(o.cliente || '—') + '</td><td><b>' + esc(BRL(o.v)) + '</b></td><td>' + esc(fpmMesCurto(o.m)) + '</td></tr>').join('')
        + '<tr class="sel"><td colspan="2">Total</td><td>' + esc(BRL(fpmTot(C))) + '</td><td></td></tr></table>' : '')
      + (S.length ? '<p class="fpmPq" style="margin:6px 0 0">Fora das contas, sem previsão: ' + S.map(o => esc(o.numero) + ' ' + esc(o.cliente || '') + ' ' + esc(fpmK(o.v)) + (o.parada ? ' (parada)' : '')).join(' · ') + '.</p>' : '')
      + '<p class="fpmPq" style="margin:4px 0 0">O detalhe (aprovado, o que já foi lançado e como o mês foi estimado) está em <button class="fpmLk" type="button" data-ir="fincr">Projeções</button>.</p>';
  }
  const como = o => o.recebe_em
    ? esc(o.dia_origem) + ' → ' + esc(dataBR(o.dia_base).slice(0, 5)) + (o.atrasada ? ' (já passou: conta de hoje)' : '') + ', + ' + esc(String(o.prazo_dias)) + ' dias de prazo do cliente'
    : (o.parada ? 'aberta há ' + esc(String(dias(o.aberta_em))) + ' dias, sem prazo nem tarefa marcada' : 'sem prazo, sem tarefa marcada e sem meta do tipo');
  const lanc = o => {
    const L = o.ligados || [];
    if (!L.length) return '—';
    return esc(BRL(Number(o.lancado) || 0)) + '<small style="display:block;color:var(--ink-3);white-space:normal">'
      + L.map(g => esc(g.descricao || '(sem descrição)') + (g.como === 'valor' ? ' · achado pelo valor' : '')).join('; ') + '</small>';
  };
  const linha = o => '<tr><td>' + esc(o.numero) + marca(o) + '</td><td>' + esc(o.cliente || '—') + '</td><td>' + esc(BRL(Number(o.aprovado) || 0)) + '</td>'
    + '<td>' + lanc(o) + '</td><td><b>' + esc(BRL(o.v)) + '</b></td>'
    + '<td>' + (o.m ? esc(fpmMesCurto(o.m)) : 'sem previsão') + '</td><td>' + como(o) + '</td></tr>';
  return '<div class="fpmRolar"><table class="fpmTabela fpmProjTab"><tr><th>OS</th><th>Cliente</th><th>Aprovado</th><th>Já lançado</th><th>Projeção</th><th>Recebe em</th><th>Como estimei</th></tr>'
    + C.map(linha).join('')
    + (C.length ? '<tr class="sel"><td colspan="4">Total que entra nas contas</td><td>' + esc(BRL(fpmTot(C))) + '</td><td colspan="2"></td></tr>' : '')
    + (S.length ? '<tr><td colspan="7" style="text-align:left;padding-top:10px;color:var(--ink-2)"><b>Sem previsão — fora das contas</b> (' + finPlural(S.length, 'OS', 'OS') + ', ' + esc(BRL(fpmTot(S))) + '). Ponha um prazo na OS, marque a tarefa ou encerre a OS que não vai acontecer.</td></tr>'
        + S.map(linha).join('') : '')
    + '</table></div>';
}

function fpmLinkProj(k){
  if (k !== FINPM.pm.mes_atual || !fpjTemDesp()) return '';
  const x = fpjSerie()[0], nm = FPM_NOMES[+k.slice(5, 7) - 1];
  const partes = [['recorrentes sem título', x.rec], ['outras despesas pela média', x.out], ['provisões do dia 30', x.prov], ['OS em execução', x.os]]
    .filter(p => p[1] > 0.009).map(p => p[0] + ' ' + esc(fpmK(p[1])));
  return '<div class="fpmChamada"><div><b>Projeções:</b> ' + (partes.length ? 'somando o que ainda não foi lançado (' + partes.join(', ') + '), ' : 'sem nada a projetar além do lançado, ') + esc(nm) + ' termina com <b class="' + (x.fim < 0 ? 'fpmNeg' : 'fpmPos') + '">' + esc(fpmBRL(x.fim)) + '</b> nas contas.</div>'
    + '<button type="button" class="btn" data-ir="fincr">Abrir Projeções →</button></div>';
}

const fpjTemDesp = () => !!(FINPM.desp && !FINPM.desp.erro && Array.isArray(FINPM.desp.recorrentes));

const fpjMeses = () => fpjTemDesp() && Array.isArray(FINPM.desp.meses) ? FINPM.desp.meses : [0, 1, 2, 3].map(n => fpmSoma(FINPM.pm.mes_atual, n));

function fpjDespesas(m){
  if (!fpjTemDesp()) return { rec: [], out: [], tRec: 0, tOut: 0, lancadas: 0 };
  const D = FINPM.desp, atual = m === FINPM.pm.mes_atual;
  const vale = r => r.meses && r.meses[m] && r.meses[m].vale;
  const rec = D.recorrentes.filter(r => vale(r) && !r.meses[m].lancada)
    .map(r => ({ ...r, v: Number(r.valor) || 0, venc: r.meses[m].venc, venceu: atual && r.meses[m].venc < FINPM.pm.hoje }))
    .sort((a, b) => String(a.venc).localeCompare(String(b.venc)) || b.v - a.v);
  const lancadas = D.recorrentes.filter(r => vale(r) && r.meses[m].lancada).length;
  const out = (D.outras || []).map(o => ({ ...o, v: Math.max(0, (Number(o.media) || 0) - (atual ? Number(o.ja_no_mes) || 0 : 0)) }))
    .filter(o => o.v > 50).sort((a, b) => b.v - a.v);
  return { rec, out, tRec: fpmTot(rec), tOut: fpmTot(out), lancadas };
}

const fpjTemCiclo = () => !!(FINPM.ciclo && !FINPM.ciclo.erro && Array.isArray(FINPM.ciclo.meses));

function fpjProvPlano(){
  if (!fpjTemCiclo()) return { v: 0, fonte: '' };
  const P = FINPM.ciclo.provisao || {}, cx = Number(P.caixinhas) || 0, rc = Number(P.recorrencias) || 0;
  return cx > 0 ? { v: cx, fonte: 'caixinhas' } : { v: rc, fonte: rc > 0 ? 'recorrencia' : '' };
}

function fpjProvisao(m){
  const pl = fpjProvPlano().v; if (!pl) return 0;
  if (m !== FINPM.pm.mes_atual) return pl;
  const c = FINPM.ciclo.meses.find(x => x.mes === m);
  return Math.max(0, pl - (c ? Number(c.provisao) || 0 : 0));
}

function fpjMes(m, inicio){
  const ab = FINPM.pm.abertos || [], atual = m === FINPM.pm.mes_atual, fim = fpmFimMes(m);
  const noMes = a => atual ? a.d <= fim : a.d.slice(0, 7) === m;
  const rL = ab.filter(a => a.t === 'r' && noMes(a)).reduce((s, a) => s + (Number(a.v) || 0), 0);
  const pL = ab.filter(a => a.t === 'p' && !a.provisao && noMes(a)).reduce((s, a) => s + (Number(a.v) || 0), 0);
  const os = fpmTot(fpmProjMes(m)), D = fpjDespesas(m), prov = fpjProvisao(m);
  return { m, inicio, rL, os, pL, rec: D.tRec, out: D.tOut, prov, D, fim: inicio + rL + os - pL - D.tRec - D.tOut - prov };
}

function fpjSerie(){
  let s = fpmSaldoOp();
  return fpjMeses().map(m => { const x = fpjMes(m, s); s = x.fim; return x; });
}

function fpjRecorrentes30(){
  if (!fpjTemDesp()) return { n: 0, v: 0, nomes: '' };
  const L = [];
  fpjMeses().forEach(m => fpjDespesas(m).rec.forEach(r => { const d = fpmDias(String(r.venc)); if (d <= 30) L.push(r); }));
  return { n: L.length, v: fpmTot(L), nomes: L.slice().sort((a, b) => b.v - a.v).slice(0, 3).map(r => r.fornecedor.split(' ').slice(0, 2).join(' ') + ' ' + fpmK(r.v)).join(' · ') + (L.length > 3 ? ' · +' + (L.length - 3) : '') };
}

async function pintarProjecoes(){
  visao = 'fincr';
  const board = document.getElementById('board');
  board.innerHTML = '<div class="tela"><div class="telaCab"><h2>Projeções futuras</h2>'
    + '<p>O que ainda <b>não foi lançado</b>: salário, impostos e o que é recorrente (tela Recorrentes), a média do que não é recorrente e as OS em execução. Tudo aqui é estimativa — o Painel Financeiro mostra só o lançado.</p></div>'
    + '<div style="margin-bottom:14px"><button class="btn" type="button" data-ir="finp">← Painel Financeiro</button></div>'
    + '<div id="finpCorpo"><p class="nota">Carregando…</p></div></div>';
  board.querySelector('[data-ir]').addEventListener('click', () => irPara('finp'));
  await finpCarregar();
}

const pintarCicloReserva = pintarProjecoes;

function fpmRedesenhar(){ if (visao === 'fincr') fcrDesenhar(); else finpDesenhar(); }

function fcrDesenhar(){
  const el = document.getElementById('finpCorpo'); if (!el || !FINPM.pm) return;
  const k = FINPM.mes, atual = k === FINPM.pm.mes_atual, i = FINPM.meses.indexOf(k);
  const M = fpjMeses();
  if (!FINPM.pjMes || !M.includes(FINPM.pjMes)) FINPM.pjMes = M[1] || M[0];
  const nmPj = fpmRot(FINPM.pjMes), pjAtual = FINPM.pjMes === FINPM.pm.mes_atual;
  const falta = [];
  if (!fpjTemDesp()) falta.push('as despesas recorrentes (SQL 502' + (FINPM.desp && FINPM.desp.erro ? ': ' + FINPM.desp.erro : '') + ')');
  if (FINPM.proj && FINPM.proj.erro) falta.push('as OS em execução (SQL 500/501)');
  if (!fpjTemCiclo()) falta.push('o saldo do dia 1º e as provisões (SQL 503)');
  const chips = '<div class="fpjChips" role="group" aria-label="Escolher o mês do detalhe">Mês em detalhe: ' + M.map(m => '<button type="button" class="btn sm' + (m === FINPM.pjMes ? ' pri' : '') + '" data-pjm="' + m + '" aria-pressed="' + (m === FINPM.pjMes) + '">' + esc(fpmMesCurto(m)) + (m === FINPM.pm.mes_atual ? ' (resto)' : '') + '</button>').join('') + '</div>';
  el.innerHTML = (falta.length ? '<p class="fpmAviso">Não carregou ' + esc(falta.join(' e ')) + '. O resto da tela funciona sem elas.</p>' : '')
    // 1 · os quatro números
    + fpjTiles()
    // 2 · o saldo em linha + entradas × saídas
    + '<div class="fpmG2 fpjG2">'
    +   '<div class="painel fpmCard"><h3>Vai faltar dinheiro?</h3><p class="fpmPq">O saldo nas contas no fim de cada mês, somando o lançado e o projetado. Em tracejado, o mesmo saldo se nenhuma OS em execução for faturada. Clique num mês para detalhar.</p><div id="fpjGSaldo"></div>'
    +     '<details class="fpjDet"><summary>Ver a conta mês a mês</summary>' + fpjSaldoTabela() + '</details></div>'
    +   '<div class="painel fpmCard"><h3>Entra × sai, mês a mês</h3><p class="fpmPq">Cheio é o que já está lançado; hachurado é estimativa (OS, recorrências sem título, média do não recorrente, provisões).</p><div id="fpjGMeses"></div></div>'
    + '</div>'
    // 3 · os sinais
    + fpjSinaisCard()
    // 4 · o mês em detalhe
    + '<h3 class="fpjSecao">' + esc(nmPj.replace(/^./, c => c.toUpperCase())) + (pjAtual ? ' · daqui até o fim do mês' : '') + ' em detalhe</h3>' + chips
    + '<div class="fpmG2 fpjG2">'
    +   '<div class="painel fpmCard"><h3>Como ' + esc(FPM_NOMES[+FINPM.pjMes.slice(5, 7) - 1]) + ' fecha, passo a passo</h3><p class="fpmPq">Do saldo com que o mês começa ao saldo com que termina. Itálico e hachurado = estimativa.</p><div id="fpjGCasc"></div></div>'
    +   '<div class="painel fpmCard"><h3>Dia a dia</h3><p class="fpmPq">O saldo ao fim de cada dia, pelo vencimento de cada conta' + (pjAtual ? ' (começa hoje, com o saldo de hoje; o vencido em aberto cai em hoje)' : '') + '. As "outras" (média) estão espalhadas pelos dias. Passe o mouse no dia.</p><div id="fpjGDias"></div></div>'
    + '</div>'
    + '<div class="fpmG2 fpjG2">' + fpjDespCard(FINPM.pjMes) + fpjRecCard(FINPM.pjMes) + '</div>'
    // 5 · as OS
    + '<div class="painel fpmCard"><h3>OS em execução</h3>'
    + '<p class="fpmPq">OS abertas com proposta aprovada, ainda não faturadas. Projeção = aprovado − o que já está no Contas a Receber ligado à OS (pelo campo OS, pelo número da proposta na descrição ou, sem número, pelo valor até 5% do mesmo cliente). O mês é o prazo da OS (ou a tarefa marcada + 15 dias para o laudo e a nota, ou a meta do tipo) + o prazo de recebimento do cliente.</p>'
    + fpmProjTabela() + fpmProjAvisos() + '</div>'
    // 6 · o ciclo
    + '<h3 class="fpjSecao">Ciclo do dinheiro</h3>'
    + '<p class="fpmPq" style="margin:-4px 0 10px">O que entra num mês vai para o CDB e paga as contas do mês seguinte: no dia 1º o escritório retira do CDB o que vai pagar. O ciclo fecha quando o <b>saldo do dia 1º</b> cobre as contas do mês; quando não cobre, a diferença sai do dinheiro que entra no próprio mês.</p>'
    + '<div class="painel fpmCard"><h3>O saldo do dia 1º pagou o mês?</h3><p class="fpmPq">Azul: com quanto o mês começou. Laranja: as contas do mês. Clique num mês passado para ver o fluxo dele.</p><div id="fpjGCiclo"></div></div>'
    + '<div class="fpmNav" role="group" aria-label="Escolher o mês">'
    +   '<button type="button" class="btn" id="fpmAnt" aria-label="Mês anterior"' + (i <= 0 ? ' disabled' : '') + '>◀</button>'
    +   '<b aria-live="polite">' + esc(fpmRot(k).replace(/^./, c => c.toUpperCase())) + (atual ? '<small>até ' + esc(dataBR(FINPM.pm.hoje).slice(0, 5)) + '</small>' : '') + '</b>'
    +   '<button type="button" class="btn" id="fpmProx" aria-label="Próximo mês"' + (i >= FINPM.meses.length - 1 ? ' disabled' : '') + '>▶</button>'
    + '</div>'
    + fcrFluxo(k)
    + '<details class="fpjDet painel fpmCard" style="padding:10px 14px"><summary>Ciclo mês a mês, em tabela</summary>' + fcrTabela(k).replace('<div class="painel fpmCard"><h3>Ciclo mês a mês</h3>', '<div>').replace(/<p class="fpmPq">O saldo do dia 1º cobriu[^<]*<\/p>/, '') + '</details>'
    + '<div class="fpmNota"><b>Para o ciclo ficar certo:</b> lance em <button class="fpmLk" type="button" data-ir="finb">Contas Bancárias</button> › Transferir entre contas o Sicoob → Inter, a ida para o CDB e o resgate do dia 1º; e em <button class="fpmLk" type="button" data-ir="finrsv">Reservas</button> a provisão do dia 30 para as caixinhas. '
    +   'O saldo do dia 1º só existe a partir da data de corte de todas as contas operacionais.</div>';
  fpjGraficos();
  fpmLigar(el, i);
  el.querySelectorAll('[data-pjm]').forEach(b => b.addEventListener('click', () => { FINPM.pjMes = b.dataset.pjm; fcrDesenhar(); }));
  el.querySelectorAll('.fpjDet').forEach(d => { const id = 'd' + Array.from(d.parentNode.children).indexOf(d) + (d.querySelector('summary') || {}).textContent; d.open = !!FINPM._dets && FINPM._dets[id]; d.addEventListener('toggle', () => { FINPM._dets = FINPM._dets || {}; FINPM._dets[id] = d.open; }); });
}

const fpjNomesOp = () => (FINPM.pm.contas || []).filter(c => c.papel === 'operacional').map(c => c.nome.replace(/^Banco /, '')).join(', ') || 'nenhuma conta';

function fpjSaldoTabela(){
  const S = fpjSerie(), res = fpmReservas();
  const v = (x, cls) => '<td class="' + (cls || '') + (x < 0 ? ' fpmNeg' : '') + '">' + esc(fpmBRL(x)) + '</td>';
  const lin = (rot, f, est, sinal) => '<tr' + (est ? ' class="fpjEst"' : '') + '><th scope="row">' + rot + '</th>' + S.map(x => { const n = f(x); return '<td>' + (n ? (sinal || '') + esc(BRL(n)) : '—') + '</td>'; }).join('') + '</tr>';
  return '<p class="fpmPq" style="margin:8px 0 4px">Começa com o saldo de hoje nas contas (' + esc(fpjNomesOp()) + (res.length ? '; a reserva ' + res.map(c => '<span data-tip="' + esc(fpmResTip(c)) + '">' + esc(fpmResNome(c)) + ' ' + ((Number(c.saldo) || 0) ? esc(fpmK(Number(c.saldo))) : '(sem saldo lançado)') + '</span>').join(', ') + ' não entra' : '') + '). Linhas <span class="fpjEstTxt">em itálico</span> são estimativa. Faturamento que ainda não existe não entra: por isso os meses mais longe sempre parecem piores.</p>'
    + '<div class="fpmRolar"><table class="fpmTabela fpjTab"><tr><th></th>' + S.map(x => '<th>' + esc(fpmMesCurto(x.m)) + (x.m === FINPM.pm.mes_atual ? '<small>até o fim</small>' : '') + '</th>').join('') + '</tr>'
    + '<tr><th scope="row">Começa com</th>' + S.map(x => v(x.inicio)).join('') + '</tr>'
    + lin('+ A receber lançado', x => x.rL, false, '+')
    + lin('+ OS em execução', x => x.os, true, '+')
    + lin('− A pagar lançado', x => x.pL, false, '−')
    + lin('− Recorrentes sem título', x => x.rec, true, '−')
    + lin('− Outras (média de 3 meses)', x => x.out, true, '−')
    + lin('− Provisões (dia 30 → caixinhas)', x => x.prov, true, '−')
    + '<tr class="sel"><th scope="row">Termina com</th>' + S.map(x => v(x.fim)).join('') + '</tr></table></div>';
}

function fpjDespCard(m){
  const D = fpjDespesas(m), nm = FPM_NOMES[+m.slice(5, 7) - 1], atual = m === FINPM.pm.mes_atual;
  if (!fpjTemDesp()) return '<div class="painel fpmCard"><h3>Despesas de ' + esc(nm) + '</h3><p class="nota">Sem o SQL 502 não há como ler as recorrências.</p></div>';
  const grupos = {}; D.rec.forEach(r => (grupos[r.grupo] = grupos[r.grupo] || []).push(r));
  let h = '';
  Object.entries(grupos).sort((a, b) => fpmTot(b[1]) - fpmTot(a[1])).forEach(([g, L]) => {
    h += '<div class="fpjGrupo"><b>' + esc(g) + '</b><span>' + esc(BRL(fpmTot(L))) + '</span></div>'
      + L.map(r => '<div class="fpjItem"><span>' + esc(dataBR(String(r.venc)).slice(0, 5)) + ' · ' + esc(r.fornecedor) + (r.descricao ? ' · ' + esc(r.descricao) : '') + ' <small>' + esc(r.sub) + '</small>'
          + (r.variavel ? ' <span class="chip" title="Valor estimado na recorrência">a confirmar</span>' : '')
          + (r.venceu ? ' <span class="chip" style="background:var(--warn-soft);color:var(--warn)">venceu sem título</span>' : '') + '</span><span>' + esc(BRL(r.v)) + '</span></div>').join('');
  });
  const x = fpjSerie().find(s => s.m === m) || { pL: 0, prov: 0 }, tot = x.pL + D.tRec + D.tOut + x.prov;
  return '<div class="painel fpmCard"><h3>Despesas de ' + esc(nm) + (atual ? ' (até o fim do mês)' : '') + ' <small class="fpmHoje">· ' + esc(fpmK(tot)) + '</small></h3>'
    + '<p class="fpmPq">Por grupo: o já lançado, as recorrências ainda sem título (' + finPlural(D.lancadas, 'já lançada', 'já lançadas') + ' estão no lançado), a média do que não é recorrente e as provisões.</p>'
    + fpjDespGrupos(m)
    + '<details class="fpjDet"><summary>Ver recorrência por recorrência (' + D.rec.length + ') e as outras (' + D.out.length + ')</summary>'
    + (D.rec.length ? h + '<div class="fpjGrupo tot"><b>Recorrentes</b><span>' + esc(BRL(D.tRec)) + '</span></div>' : '<p class="nota">Todas as recorrências de ' + esc(nm) + ' já têm título.</p>')
    + (D.out.length ? '<div class="fpjGrupo" style="margin-top:10px"><b>Outras (não recorrentes, média de 3 meses' + (atual ? ', menos o que já saiu' : '') + ')</b><span>' + esc(BRL(D.tOut)) + '</span></div>'
        + D.out.slice(0, 8).map(o => '<div class="fpjItem fpjEst"><span>' + esc(o.sub) + ' <small>' + esc(o.grupo) + '</small></span><span>' + esc(BRL(o.v)) + '</span></div>').join('')
        + (D.out.length > 8 ? '<p class="fpmPq" style="margin:2px 0 0">+ ' + (D.out.length - 8) + ' outras.</p>' : '') : '')
    + fpjProvLinha(m) + '</details>'
    + '<p class="fpmPq" style="margin:8px 0 0">Valor errado ou recorrência que acabou? Corrija em <button class="fpmLk" type="button" data-ir="finrec">Recorrentes</button>.</p>'
    + '</div>';
}

function fpjProvLinha(m){
  const P = fpjProvPlano(), v = fpjProvisao(m), atual = m === FINPM.pm.mes_atual;
  if (!fpjTemCiclo()) return '';
  if (!P.v) return '<p class="fpmPq" style="margin:10px 0 0">Provisões do dia 30: sem valor mensal nas caixinhas (tela <button class="fpmLk" type="button" data-ir="finrsv">Reservas</button>) — não entram na conta.</p>';
  return '<div class="fpjGrupo" style="margin-top:10px"><b>Provisões (dia 30 → caixinhas)</b><span>' + esc(BRL(v)) + '</span></div>'
    + '<p class="fpmPq" style="margin:2px 0 0">' + (P.fonte === 'caixinhas' ? 'Pelo valor mensal das caixinhas (Reservas)' : 'Pela recorrência de provisão (' + esc(BRL(P.v)) + ') — ponha o valor mensal de cada caixinha em <button class="fpmLk" type="button" data-ir="finrsv">Reservas</button> e pause a recorrência')
    + (atual && v < P.v ? '; ' + esc(BRL(P.v - v)) + ' já guardados este mês' : '') + '.</p>';
}

function fpjRecCard(m){
  const ab = FINPM.pm.abertos || [], atual = m === FINPM.pm.mes_atual, fim = fpmFimMes(m), nm = FPM_NOMES[+m.slice(5, 7) - 1];
  const R = ab.filter(a => a.t === 'r' && (atual ? a.d <= fim : a.d.slice(0, 7) === m)).map(a => ({ ...a, v: Number(a.v) || 0 })).sort((a, b) => a.d.localeCompare(b.d));
  const O = fpmProjMes(m), C = fpjRecClientes(m);
  return '<div class="painel fpmCard"><h3>Receitas de ' + esc(nm) + ' <small class="fpmHoje">· ' + esc(fpmK(C.tot)) + '</small></h3>'
    + '<p class="fpmPq">Por cliente: o lançado para receber e as OS em execução com previsão para ' + esc(nm) + '.' + (C.n > 1 && C.top3 >= 0.6 ? ' <b>Os 3 maiores são ' + esc(fpmPct(C.top3)) + ' do mês.</b>' : '') + '</p>'
    + (C.n ? C.html : '<p class="nota">Nada lançado nem projetado para ' + esc(nm) + '.</p>')
    + '<details class="fpjDet"><summary>Ver título por título (' + R.length + ') e as OS (' + O.length + ')</summary>'
    + '<div class="fpjGrupo"><b>A receber lançado</b><span>' + esc(BRL(fpmTot(R))) + '</span></div>'
    + (R.length ? R.map(a => '<div class="fpjItem"><span>' + esc(dataBR(a.d).slice(0, 5)) + ' · ' + esc(a.q) + (a.etapa === 'a_faturar' ? ' <small>a faturar</small>' : '') + (fpmDias(a.d) < 0 ? ' <span class="chip" style="background:var(--crit-soft);color:var(--crit)">vencido</span>' : '') + '</span><span>' + esc(BRL(a.v)) + '</span></div>').join('') : '<p class="nota" style="margin:2px 0">Nada lançado.</p>')
    + '<div class="fpjGrupo" style="margin-top:10px"><b>OS em execução (projeção)</b><span>' + esc(BRL(fpmTot(O))) + '</span></div>'
    + (O.length ? O.map(o => '<div class="fpjItem fpjEst"><span>' + esc(o.numero) + ' · ' + esc(o.cliente || '') + ' <small>' + esc(dataBR(String(o.recebe_em).slice(0, 10)).slice(0, 5)) + '</small></span><span>' + esc(BRL(o.v)) + '</span></div>').join('') : '<p class="nota" style="margin:2px 0">Nenhuma OS com previsão para ' + esc(nm) + '.</p>')
    + '</details></div>';
}

function fcCiclo(m){
  const atual = FINPM.pm.mes_atual;
  if (m > atual){
    const x = fpjSerie().find(s => s.m === m); if (!x) return null;
    const contas = x.pL + x.rec + x.out + x.prov;
    return { m, ab: x.inicio, contas, pago: 0, resto: contas, x, prev: true, parcial: false };
  }
  const c = fpjTemCiclo() ? FINPM.ciclo.meses.find(y => y.mes === m) : null;
  // sem o saldo do dia 1º (antes do corte), o que saiu vem do Painel (caixa, com o histórico do SIGE)
  const temAb = !!(c && c.abertura !== null && c.abertura !== undefined);
  const pago = temAb ? (Number(c.pagou) || 0) + (Number(c.provisao) || 0) : fpmMes(m).saiu;
  let resto = 0, x = null;
  if (m === atual){ x = fpjMes(m, 0); resto = x.pL + x.rec + x.out + x.prov; }
  return { m, ab: temAb ? Number(c.abertura) : null, faltam: c ? c.faltam || [] : [],
           contas: pago + resto, pago, resto, x, entrou: temAb ? Number(c.entrou) || 0 : fpmMes(m).entrou, prev: false, parcial: m === atual };
}

function fcrFluxo(k){
  const nome = m => FPM_NOMES[+m.slice(5, 7) - 1], nk = fpmSoma(k, 1);
  const box = (rot, val, exp, cls) => '<div class="fcrBox ' + (cls || '') + '"><div class="r">' + rot + '</div><div class="v">' + val + '</div><div class="e">' + exp + '</div></div>';
  const seta = '<div class="fcrSeta" aria-hidden="true">→</div>';
  const res = (c, mes) => {
    if (c.ab === null) return box('Sobra ou falta', '—', 'sem o saldo do dia 1º');
    const v = c.ab - c.contas, est = c.prev ? ' · previsto' : c.parcial ? ' · estimado até o fim do mês' : '';
    return v < 0 ? box('Falta', esc(BRL(-v)), 'paga com o dinheiro que entra em ' + esc(nome(mes)) + est, 'res neg')
                 : box('Sobra', '+' + esc(BRL(v)), 'fica para ' + esc(nome(fpmSoma(mes, 1))) + est, 'res');
  };
  const contasExp = c => c.prev
      ? 'previstas: lançado ' + esc(fpmK(c.x.pL)) + ' · recorrentes ' + esc(fpmK(c.x.rec)) + ' · outras ' + esc(fpmK(c.x.out)) + ' · provisões ' + esc(fpmK(c.x.prov))
      : c.parcial ? 'pagas até hoje ' + esc(fpmK(c.pago)) + ' + falta pagar ' + esc(fpmK(c.resto)) + ' (lançado e estimado)'
                  : c.ab === null ? 'saiu no mês (Painel)' : 'pagas no mês, com as provisões';
  const abExp = c => c.prev ? 'previsto: o saldo de hoje + o que falta entrar − o que falta sair em ' + esc(nome(fpmSoma(c.m, -1)))
      : c.ab === null ? (c.faltam && c.faltam.length ? 'sem saldo: ' + esc(c.faltam.map(n => n.replace(/^Banco /, '')).join(', ')) + (c.faltam.length > 1 ? ' começam' : ' começa') + ' depois do dia 1º (data de corte)' : 'sem o saldo do dia 1º (SQL 503)')
      : 'saldo real no dia 1º · ' + esc(fpjNomesOp());
  const linha = (c, tit) => '<div class="fcrTit">' + tit + '</div><div class="fcrFluxo">'
    + box((c.prev ? 'Vai começar ' : 'Começou ') + esc(nome(c.m)) + ' com', c.ab === null ? '—' : esc(BRL(c.ab)), abExp(c), c.prev ? 'fpjEst' : '')
    + seta + box('Contas de ' + esc(nome(c.m)), esc(BRL(c.contas)), contasExp(c), c.prev || c.parcial ? 'fpjEst' : '')
    + seta + res(c, c.m) + '</div>';
  const c1 = fcCiclo(k), c2 = fcCiclo(nk);
  let h = linha(c1, 'Ciclo de ' + esc(nome(k)) + ': o saldo do dia 1º pagou as contas de ' + esc(nome(k)) + '?');
  if (c1.ab !== null && c1.ab - c1.contas < 0 && !c1.prev)
    h += '<p class="fpmPq" style="margin:4px 0 0">Entrou em ' + esc(nome(k)) + (c1.parcial ? ' até hoje' : '') + ': ' + esc(BRL(c1.entrou)) + '. A falta foi coberta com esse dinheiro — e ele deixa de ir para o CDB, o que diminui o saldo de 1º de ' + esc(nome(nk)) + '.</p>';
  if (c2) h += linha(c2, 'Próximo ciclo: ' + esc(nome(nk)));
  return '<div class="painel fpmCard">' + h
    + (k === FINPM.pm.mes_atual ? '<p class="fpmPq" style="margin:10px 0 0">No dia 1º de ' + esc(nome(nk)) + ' o escritório retira do CDB o valor das contas de ' + esc(nome(nk)) + '. Os números em itálico são estimativa (as mesmas contas da tabela do saldo projetado).</p>' : '')
    + '</div>';
}

function fcrTabela(k){
  const atual = FINPM.pm.mes_atual;
  const passados = fpjTemCiclo() ? FINPM.ciclo.meses.filter(c => c.abertura !== null && c.abertura !== undefined).map(c => c.mes) : [];
  const L = [...new Set([...passados, ...fpjMeses().filter(m => m > atual)])].sort().map(fcCiclo).filter(Boolean);
  if (!L.length) return '';
  return '<div class="painel fpmCard"><h3>Ciclo mês a mês</h3>'
    + '<p class="fpmPq">O saldo do dia 1º cobriu as contas do mês? Em itálico, o estimado.</p>'
    + '<div class="fpmRolar"><table class="fpmTabela"><tr><th>Mês</th><th>Começou com (dia 1º)</th><th>Contas do mês</th><th>Sobra / falta</th></tr>'
    + L.map(c => { const v = c.ab === null ? null : c.ab - c.contas;
        return '<tr class="' + (c.m === k ? 'sel' : '') + (c.prev || c.parcial ? ' fpjEst' : '') + '"><td>' + esc(fpmRot(c.m)) + (c.prev ? ' <small>previsto</small>' : c.parcial ? ' <small>até o fim</small>' : '') + '</td>'
          + '<td>' + (c.ab === null ? '—' : esc(BRL(c.ab))) + '</td><td>' + esc(BRL(c.contas)) + '</td>'
          + '<td class="' + (v !== null && v < 0 ? 'fpmNeg' : '') + '">' + (v === null ? '—' : v < 0 ? 'falta ' + esc(BRL(-v)) : 'sobra ' + esc(BRL(v))) + '</td></tr>'; }).join('')
    + '</table></div></div>';
}

const FPJ_COR = { lanc: FPM_COR.entrou, os: '#6FB08A', pago: FPM_COR.saiu, rec: '#E0A85A', out: '#EBC48A', prov: FPM_COR.res, saldo: FPM_COR.res, neg: '#B3261E', grade: '#EBEFF1', zero: '#9AA4AA', txt: '#14181B', txt2: '#78838A' };

const fpjFmt = v => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) >= 100000 ? 0 : 1 }) + ' mil' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));

const fpjK = v => (v < 0 ? '−' : '') + fpjFmt(Math.abs(v));

function fpjDefs(cores){
  return '<defs>' + cores.map(c => '<pattern id="h' + c.slice(1) + '" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">'
    + '<rect width="6" height="6" fill="' + c + '"/><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-width="3" opacity=".7"/></pattern>').join('') + '</defs>';
}

const fpjHach = c => 'url(#h' + c.slice(1) + ')';

function fpjBarV(x, y0, y1, w, fill, op){
  const top = Math.min(y0, y1), h = Math.max(1, Math.abs(y0 - y1)), r = Math.min(4, h, w / 2), baseEmbaixo = y1 <= y0;
  const d = baseEmbaixo
    ? 'M' + x + ',' + (top + h) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + top + ' ' + (x + w) + ',' + (top + r) + 'V' + (top + h) + 'Z'
    : 'M' + x + ',' + top + 'V' + (top + h - r) + 'Q' + x + ',' + (top + h) + ' ' + (x + r) + ',' + (top + h) + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + (top + h) + ' ' + (x + w) + ',' + (top + h - r) + 'V' + top + 'Z';
  return '<path d="' + d + '" fill="' + fill + '"' + (op !== undefined ? ' opacity="' + op + '"' : '') + '/>';
}

function fpjEscala(vals, pt, ih, passoMin){
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), amp = Math.max(hi - lo, passoMin || 1000);
  const passo = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000].find(p => amp / p <= 6) || 500000;
  const max = Math.ceil(hi / passo) * passo, min = Math.floor(lo / passo) * passo;
  return { min, max, passo, y: v => pt + ih * (max - v) / (max - min || 1) };
}

function fpjGrade(E, pl, W, pr){
  let s = '';
  for (let v = E.min; v <= E.max + 1e-6; v += E.passo)
    s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + E.y(v) + '" y2="' + E.y(v) + '" stroke="' + (Math.abs(v) < 1e-6 ? FPJ_COR.zero : FPJ_COR.grade) + '"' + (Math.abs(v) < 1e-6 ? ' stroke-width="1.5"' : '') + '/>'
      + '<text x="' + (pl - 6) + '" y="' + (E.y(v) + 4) + '" text-anchor="end" font-size="10.5" fill="' + FPJ_COR.txt2 + '">' + esc(fpjK(v)) + '</text>';
  return s;
}

function fpjLiga(el, sel, tip){
  el.querySelectorAll(sel).forEach(r => { r.addEventListener('mousemove', e => fpmTip(e, tip(r))); r.addEventListener('mouseleave', fpmTipSai); });
}

const FPJ_HALO = ' stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round"';

const fpjLin = (rot, v, cls) => '<div class="l' + (cls ? ' ' + cls : '') + '"><span>' + rot + '</span><span>' + v + '</span></div>';

function fpjSerieSemOS(){
  let s = fpmSaldoOp();
  return fpjMeses().map(m => { const x = fpjMes(m, s); const fim = x.fim - x.os; const y = { ...x, inicio: s, os: 0, fim }; s = fim; return y; });
}

function fpjTiles(){
  const S = fpjSerie(), S0 = fpjSerieSemOS(), hoje = fpmSaldoOp();
  const pior = S.reduce((a, x) => x.fim < a.fim ? x : a, S[0]);
  const primNeg = S.find(x => x.fim < 0), primNeg0 = S0.find(x => x.fim < 0);
  const nm = m => FPM_NOMES[+m.slice(5, 7) - 1];
  // quanto falta faturar, com vencimento até o pior mês, para ele fechar no zero
  const meta = Math.max(0, -pior.fim);
  // fôlego: até que mês o saldo aguenta
  const folego = primNeg ? 'até ' + nm(fpmSoma(primNeg.m, -1)) : 'os 4 meses';
  const tile = (rot, val, exp, cls, dot) => '<div class="painel fpmTile"><div class="fpmRot">' + (dot ? '<i class="fpmDot" style="background:' + dot + '"></i>' : '') + rot + '</div><div class="fpmVal ' + (cls || '') + '">' + val + '</div><div class="fpmExp">' + exp + '</div></div>';
  return '<div class="fpmG4 fpjG4">'
    + tile('Saldo hoje nas contas', esc(fpmBRL(hoje)), esc(fpjNomesOp()), '', FPJ_COR.saldo)
    + tile('Ponto mais baixo', esc(fpmBRL(pior.fim)), 'fim de ' + esc(fpmRot(pior.m)) + (pior.fim < 0 ? ', com tudo o que está lançado e projetado' : ': o saldo não fica negativo'), pior.fim < 0 ? 'fpmNeg' : 'fpmPos', pior.fim < 0 ? FPJ_COR.neg : FPM_COR.entrou)
    + tile('O saldo aguenta', esc(folego), primNeg ? 'fica negativo em ' + esc(nm(primNeg.m)) + (primNeg0 && primNeg0.m < primNeg.m ? '; sem as OS, já em ' + esc(nm(primNeg0.m)) : '') : (primNeg0 ? 'mas sem as OS em execução fica negativo em ' + esc(nm(primNeg0.m)) : 'mesmo sem as OS em execução'), primNeg ? 'fpmNeg' : 'fpmPos')
    + tile('Falta faturar', meta ? esc(fpmBRL(meta)) : 'nada', meta ? 'com vencimento até ' + esc(nm(pior.m)) + ', para fechar no zero (além das OS já contadas)' : 'o lançado e o projetado cobrem os 4 meses', meta ? 'fpmNeg' : 'fpmPos')
    + '</div>';
}

function fpjGrafSaldo(){
  const el = document.getElementById('fpjGSaldo'); if (!el) return;
  const S = fpjSerie(), S0 = fpjSerieSemOS();
  const W = Math.max(240, el.clientWidth || 700), H = 230, pl = 58, pr = 16, pt = 22, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  const estreito = W < 560, rotM = m => estreito ? _FINP_MESES[+m.slice(5, 7) - 1] : fpmMesCurto(m), fmtV = v => estreito ? fpjK(v) : fpmK(v);
  const pts = [{ rot: 'hoje', fim: S[0].inicio, fim0: S0[0].inicio, m: null }, ...S.map((x, i) => ({ rot: rotM(x.m), fim: x.fim, fim0: S0[i].fim, m: x.m }))];
  const E = fpjEscala(pts.flatMap(p => [p.fim, p.fim0]), pt, ih, 20000);
  const xs = i => pl + iw * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Saldo projetado no fim de cada mês" style="display:block">' + fpjGrade(E, pl, W, pr);
  // faixa vermelha abaixo de zero
  if (E.min < 0) s += '<rect x="' + pl + '" y="' + E.y(0) + '" width="' + iw + '" height="' + (E.y(E.min) - E.y(0)) + '" fill="' + FPJ_COR.neg + '" opacity=".05"/>';
  // área sob a linha principal
  const linha = pts.map((p, i) => xs(i) + ',' + E.y(p.fim)).join(' ');
  s += '<polygon points="' + xs(0) + ',' + E.y(0) + ' ' + linha + ' ' + xs(pts.length - 1) + ',' + E.y(0) + '" fill="' + FPJ_COR.saldo + '" opacity=".08"/>';
  s += '<polyline fill="none" stroke="' + FPJ_COR.txt2 + '" stroke-width="1.5" stroke-dasharray="4 3" points="' + pts.map((p, i) => xs(i) + ',' + E.y(p.fim0)).join(' ') + '"/>';
  s += '<polyline fill="none" stroke="' + FPJ_COR.saldo + '" stroke-width="2.5" points="' + linha + '"/>';
  pts.forEach((p, i) => {
    const neg = p.fim < 0, x = xs(i), y = E.y(p.fim);
    s += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="' + (neg ? FPJ_COR.neg : FPJ_COR.saldo) + '" stroke="#fff" stroke-width="2"/>';
    const anc = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
    s += '<text x="' + x + '" y="' + (neg ? y + 18 : y - 10) + '" text-anchor="' + anc + '" font-size="' + (estreito ? 10.5 : 11.5) + '" font-weight="700" fill="' + (neg ? FPJ_COR.neg : FPJ_COR.txt) + '"' + FPJ_HALO + '>' + esc(fmtV(p.fim)) + '</text>';
    s += '<text x="' + x + '" y="' + (H - 10) + '" text-anchor="' + anc + '" font-size="11.5" fill="' + (p.m === FINPM.pjMes ? FPJ_COR.txt : FPJ_COR.txt2) + '" font-weight="' + (p.m === FINPM.pjMes ? 700 : 400) + '">' + esc(p.rot) + '</text>';
    const w = iw / (pts.length - 1);
    s += '<rect class="fpjHit" data-i="' + i + '" x="' + (x - w / 2) + '" y="' + pt + '" width="' + w + '" height="' + (ih + pb - 4) + '" fill="transparent" style="cursor:' + (p.m ? 'pointer' : 'default') + '"/>';
  });
  s += '</svg>';
  el.innerHTML = s + '<div class="fpmLeg"><span><i class="ln" style="background:' + FPJ_COR.saldo + ';height:3px"></i>Com as OS em execução</span><span><i class="ln" style="background:' + FPJ_COR.txt2 + ';border-top:2px dashed ' + FPJ_COR.txt2 + ';height:0"></i>Sem as OS (se nada for faturado)</span><span><i style="background:' + FPJ_COR.neg + ';opacity:.25"></i>Abaixo de zero</span></div>';
  fpjLiga(el, '.fpjHit', r => { const p = pts[+r.dataset.i]; return '<b>' + esc(p.m ? fpmRot(p.m) : 'Hoje') + '</b>' + fpjLin('Com as OS', esc(fpmBRL(p.fim))) + fpjLin('Sem as OS', esc(fpmBRL(p.fim0))); });
  el.querySelectorAll('.fpjHit').forEach(r => r.addEventListener('click', () => { const p = pts[+r.dataset.i]; if (p.m){ fpmTipSai(); FINPM.pjMes = p.m; fcrDesenhar(); } }));
}

function fpjGrafCascata(){
  const el = document.getElementById('fpjGCasc'); if (!el) return;
  const x = fpjSerie().find(s => s.m === FINPM.pjMes); if (!x) return;
  fpjCascata(el, [
    { rot: 'Começa com', rotCurto: 'Começa', v: x.inicio, tipo: 'tot' },
    { rot: '+ A receber lançado', rotCurto: '+ Receber', v: x.rL, cor: FPJ_COR.lanc },
    { rot: '+ OS em execução', rotCurto: '+ OS', v: x.os, cor: FPJ_COR.os, est: true },
    { rot: '− A pagar lançado', rotCurto: '− Pagar', v: -x.pL, cor: FPJ_COR.pago },
    { rot: '− Recorrentes sem título', rotCurto: '− Recorrentes', v: -x.rec, cor: FPJ_COR.rec, est: true },
    { rot: '− Outras (média)', rotCurto: '− Outras', v: -x.out, cor: FPJ_COR.out, est: true },
    { rot: '− Provisões (caixinhas)', rotCurto: '− Provisões', v: -x.prov, cor: FPJ_COR.prov, est: true },
    { rot: 'Termina com', rotCurto: 'Termina', v: x.fim, tipo: 'tot' }]);
}

function fpjGrafMeses(){
  const el = document.getElementById('fpjGMeses'); if (!el) return;
  const S = fpjSerie();
  const W = Math.max(240, el.clientWidth || 700), H = 230, pl = 58, pr = 10, pt = 22, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  const E = fpjEscala(S.flatMap(x => [x.rL + x.os, x.pL + x.rec + x.out + x.prov]), pt, ih, 20000);
  const bw = iw / S.length, barW = Math.min(34, bw * 0.3), gap = 4;
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Entradas e saídas previstas por mês" style="display:block">' + fpjDefs([FPJ_COR.os, FPJ_COR.rec, FPJ_COR.out, FPJ_COR.prov]) + fpjGrade(E, pl, W, pr);
  const pilha = (x0, segs, cls) => { let acc = 0, h = ''; segs.forEach(sg => { if (sg.v > 0.009){ h += '<rect class="' + cls + '" x="' + x0 + '" y="' + E.y(acc + sg.v) + '" width="' + barW + '" height="' + Math.max(1, E.y(acc) - E.y(acc + sg.v) - (acc ? 2 : 0)) + '" fill="' + (sg.est ? fpjHach(sg.cor) : sg.cor) + '"/>'; acc += sg.v; } }); return h; };
  S.forEach((x, i) => {
    const cx = pl + bw * i + bw / 2, sel = x.m === FINPM.pjMes, e = x.rL + x.os, sa = x.pL + x.rec + x.out + x.prov;
    s += '<g opacity="' + (sel || !FINPM.pjMes ? 1 : 0.55) + '">' + pilha(cx - barW - gap / 2, [{ v: x.rL, cor: FPJ_COR.lanc }, { v: x.os, cor: FPJ_COR.os, est: true }], 'fpjE' + i)
      + pilha(cx + gap / 2, [{ v: x.pL, cor: FPJ_COR.pago }, { v: x.rec, cor: FPJ_COR.rec, est: true }, { v: x.out, cor: FPJ_COR.out, est: true }, { v: x.prov, cor: FPJ_COR.prov, est: true }], 'fpjS' + i) + '</g>';
    if (bw >= 120 || sel){
      s += '<text x="' + (cx - barW / 2 - gap / 2) + '" y="' + (E.y(e) - 5) + '" text-anchor="' + (bw >= 120 ? 'middle' : 'end') + '" font-size="10.5" font-weight="700" fill="' + FPJ_COR.lanc + '"' + FPJ_HALO + '>' + esc(fpjK(e)) + '</text>';
      s += '<text x="' + (cx + barW / 2 + gap / 2) + '" y="' + (E.y(sa) - 5) + '" text-anchor="' + (bw >= 120 ? 'middle' : 'start') + '" font-size="10.5" font-weight="700" fill="' + FPJ_COR.pago + '"' + FPJ_HALO + '>' + esc(fpjK(sa)) + '</text>';
    }
    s += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11.5" fill="' + (sel ? FPJ_COR.txt : FPJ_COR.txt2) + '" font-weight="' + (sel ? 700 : 400) + '">' + esc(bw < 120 ? _FINP_MESES[+x.m.slice(5, 7) - 1] : fpmMesCurto(x.m)) + (x.m === FINPM.pm.mes_atual ? (bw < 120 ? '*' : ' (resto)') : '') + '</text>';
    s += '<rect class="fpjHit" data-i="' + i + '" x="' + (pl + bw * i) + '" y="' + pt + '" width="' + bw + '" height="' + (ih + pb - 4) + '" fill="transparent" style="cursor:pointer"/>';
  });
  s += '</svg>';
  el.innerHTML = s + (bw < 120 ? '<div class="fpmPq" style="margin:2px 0 0">* mês corrente, daqui até o fim · toque num mês para ver os valores</div>' : '') + '<div class="fpmLeg"><span><i style="background:' + FPJ_COR.lanc + '"></i>A receber lançado</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.os + '"></i>OS em execução</span>'
    + '<span><i style="background:' + FPJ_COR.pago + '"></i>A pagar lançado</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.rec + '"></i>Recorrentes sem título</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.out + '"></i>Outras (média)</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.prov + '"></i>Provisões</span></div>';
  fpjLiga(el, '.fpjHit', r => { const x = S[+r.dataset.i]; return '<b>' + esc(fpmRot(x.m)) + '</b>' + fpjLin('A receber lançado', '+' + esc(fpjFmt(x.rL))) + fpjLin('OS em execução', '+' + esc(fpjFmt(x.os))) + fpjLin('A pagar lançado', '−' + esc(fpjFmt(x.pL))) + fpjLin('Recorrentes', '−' + esc(fpjFmt(x.rec))) + fpjLin('Outras', '−' + esc(fpjFmt(x.out))) + fpjLin('Provisões', '−' + esc(fpjFmt(x.prov))) + fpjLin('<b>Resultado</b>', '<b>' + esc(fpmBRL(x.rL + x.os - x.pL - x.rec - x.out - x.prov)) + '</b>'); });
  el.querySelectorAll('.fpjHit').forEach(r => r.addEventListener('click', () => { fpmTipSai(); FINPM.pjMes = S[+r.dataset.i].m; fcrDesenhar(); }));
}

function fpjDias(m){
  const atual = m === FINPM.pm.mes_atual, fim = fpmFimMes(m), hoje = FINPM.pm.hoje;
  const d0 = atual ? hoje : m + '-01';
  const x = (atual ? fpjSerie() : fpjSerie()).find(s => s.m === m); if (!x) return null;
  const dias = []; for (let d = new Date(d0 + 'T12:00:00'); ; d.setDate(d.getDate() + 1)){ const k = d.toISOString().slice(0, 10); if (k > fim) break; dias.push(k); }
  const ev = {}; dias.forEach(k => ev[k] = { ent: 0, sai: 0, itens: [] });
  const poe = (k, v, rot, est) => { if (k < d0) k = d0; if (k > fim) k = fim; const e = ev[k]; if (!e) return; if (v > 0) e.ent += v; else e.sai += -v; e.itens.push({ v, rot, est }); };
  const ab = FINPM.pm.abertos || [], noMes = a => atual ? a.d <= fim : a.d.slice(0, 7) === m;
  ab.filter(a => a.t === 'r' && noMes(a)).forEach(a => poe(a.d, Number(a.v) || 0, a.q + (a.d < d0 ? ' (vencido)' : '')));
  ab.filter(a => a.t === 'p' && !a.provisao && noMes(a)).forEach(a => poe(a.d, -(Number(a.v) || 0), a.q + (a.d < d0 ? ' (vencido)' : '')));
  fpmProjMes(m).forEach(o => poe(String(o.recebe_em).slice(0, 10), o.v, o.numero + ' ' + (o.cliente || ''), true));
  const D = fpjDespesas(m);
  D.rec.forEach(r => poe(String(r.venc), -r.v, r.fornecedor + (r.venceu ? ' (venceu sem título)' : ''), true));
  if (x.prov > 0){ const P = FINPM.ciclo && FINPM.ciclo.provisao || {}; const dp = Math.min(Number(P.dia) || 30, +fim.slice(8)); poe(m + '-' + String(dp).padStart(2, '0'), -x.prov, 'Provisões → caixinhas', true); }
  if (x.out > 0 && dias.length){ const porDia = x.out / dias.length; dias.forEach(k => { ev[k].sai += porDia; ev[k].outras = porDia; }); }
  let saldo = x.inicio; const serie = dias.map(k => { saldo += ev[k].ent - ev[k].sai; return { k, saldo, ...ev[k] }; });
  const pior = serie.reduce((a, s) => s.saldo < a.saldo ? s : a, serie[0]);
  return { m, d0, fim, inicio: x.inicio, serie, pior, atual };
}

function fpjGrafDias(){
  const el = document.getElementById('fpjGDias'); if (!el) return;
  const R = fpjDias(FINPM.pjMes); if (!R || !R.serie.length){ el.innerHTML = ''; return; }
  const S = R.serie, n = S.length;
  const W = Math.max(240, el.clientWidth || 700), H = 240, pl = 58, pr = 12, pt = 22, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
  const E = fpjEscala([R.inicio, ...S.flatMap(s => [s.saldo, s.ent, -s.sai])], pt, ih, 10000);
  const xs = i => pl + iw * (i + 0.5) / n, bw = Math.max(2, Math.min(14, iw / n - 2));
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Saldo dia a dia do mês" style="display:block">' + fpjGrade(E, pl, W, pr);
  if (E.min < 0) s += '<rect x="' + pl + '" y="' + E.y(0) + '" width="' + iw + '" height="' + (E.y(E.min) - E.y(0)) + '" fill="' + FPJ_COR.neg + '" opacity=".05"/>';
  S.forEach((d, i) => {
    if (d.ent > 0.009) s += fpjBarV(xs(i) - bw / 2, E.y(0), E.y(d.ent), bw, FPJ_COR.lanc, .85);
    if (d.sai > 0.009) s += fpjBarV(xs(i) - bw / 2, E.y(0), E.y(-d.sai), bw, FPJ_COR.pago, .85);
  });
  const pts = [[pl, E.y(R.inicio)], ...S.map((d, i) => [xs(i), E.y(d.saldo)])];
  s += '<polyline fill="none" stroke="' + FPJ_COR.saldo + '" stroke-width="2.5" points="' + pts.map(p => p.join(',')).join(' ') + '"/>';
  // o ponto mais baixo
  const pi = S.indexOf(R.pior), px = xs(pi), py = E.y(R.pior.saldo), neg = R.pior.saldo < 0;
  s += '<circle cx="' + px + '" cy="' + py + '" r="5.5" fill="' + (neg ? FPJ_COR.neg : FPJ_COR.saldo) + '" stroke="#fff" stroke-width="2"/>';
  const dir = px > W - 150 ? -1 : 1;
  s += '<text x="' + (px + dir * 9) + '" y="' + (py + 4) + '" text-anchor="' + (dir > 0 ? 'start' : 'end') + '" font-size="11.5" font-weight="700" fill="' + (neg ? FPJ_COR.neg : FPJ_COR.txt) + '"' + FPJ_HALO + '>' + esc('dia ' + R.pior.k.slice(8) + ': ' + fpmK(R.pior.saldo)) + '</text>';
  // dias no eixo: 1, 5, 10, 15, 20, 25, fim
  S.forEach((d, i) => { const dia = +d.k.slice(8); if (i === 0 || i === n - 1 || dia % 5 === 0) s += '<text x="' + xs(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="' + FPJ_COR.txt2 + '">' + dia + '</text>'; });
  S.forEach((d, i) => { s += '<rect class="fpjHit" data-i="' + i + '" x="' + (xs(i) - iw / n / 2) + '" y="' + pt + '" width="' + (iw / n) + '" height="' + (ih + pb - 4) + '" fill="transparent"/>'; });
  s += '</svg>';
  el.innerHTML = s + '<div class="fpmLeg"><span><i class="ln" style="background:' + FPJ_COR.saldo + ';height:3px"></i>Saldo no fim do dia</span><span><i style="background:' + FPJ_COR.lanc + '"></i>Entra no dia</span><span><i style="background:' + FPJ_COR.pago + '"></i>Sai no dia</span></div>';
  fpjLiga(el, '.fpjHit', r => { const d = S[+r.dataset.i]; const L = d.itens.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 6);
    return '<b>' + esc(dataBR(d.k)) + '</b>' + fpjLin('Saldo no fim do dia', '<b>' + esc(fpmBRL(d.saldo)) + '</b>') + L.map(i => fpjLin((i.est ? '<i>' : '') + esc(i.rot.slice(0, 34)) + (i.est ? '</i>' : ''), (i.v > 0 ? '+' : '−') + esc(fpjFmt(Math.abs(i.v))))).join('') + (d.itens.length > 6 ? '<div class="l"><span>+ ' + (d.itens.length - 6) + ' itens</span></div>' : '') + (d.outras ? fpjLin('<i>outras (média, por dia)</i>', '−' + esc(fpjFmt(d.outras))) : ''); });
  return R;
}

function fpjBarraH(rot, segs, max, sub){
  const tot = segs.reduce((s, g) => s + g.v, 0);
  return '<div class="fpjBH"><span class="r" title="' + esc(rot) + '">' + esc(rot) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</span>'
    + '<span class="t">' + segs.filter(g => g.v > 0.009).map(g => '<i class="' + (g.est ? 'fpmHach' : '') + '" style="width:' + (max ? 100 * g.v / max : 0) + '%;background:' + g.cor + '" title="' + esc(g.rot + ': ' + BRL(g.v)) + '"></i>').join('') + '</span>'
    + '<span class="n">' + esc(fpjK(tot)) + '</span></div>';
}

function fpjDespGrupos(m){
  const D = fpjDespesas(m), atual = m === FINPM.pm.mes_atual, fim = fpmFimMes(m);
  const ab = FINPM.pm.abertos || [], noMes = a => atual ? a.d <= fim : a.d.slice(0, 7) === m;
  const G = {};
  const add = (g, k, v) => { if (!(v > 0.009)) return; G[g] = G[g] || { lanc: 0, rec: 0, out: 0 }; G[g][k] += v; };
  ab.filter(a => a.t === 'p' && !a.provisao && noMes(a)).forEach(a => add(a.g || '—', 'lanc', Number(a.v) || 0));
  D.rec.forEach(r => add(r.grupo || '—', 'rec', r.v));
  D.out.forEach(o => add(o.grupo || '—', 'out', o.v));
  const prov = fpjProvisao(m);
  const L = Object.entries(G).map(([g, x]) => ({ g, ...x, tot: x.lanc + x.rec + x.out })).sort((a, b) => b.tot - a.tot);
  if (prov > 0) L.push({ g: 'Provisões (caixinhas)', lanc: 0, rec: 0, out: 0, prov, tot: prov });
  const max = Math.max(1, ...L.map(x => x.tot));
  return L.map(x => fpjBarraH(x.g, [{ v: x.lanc, cor: FPJ_COR.pago, rot: 'Lançado' }, { v: x.rec, cor: FPJ_COR.rec, est: true, rot: 'Recorrentes sem título' }, { v: x.out, cor: FPJ_COR.out, est: true, rot: 'Outras (média)' }, { v: x.prov || 0, cor: FPJ_COR.prov, est: true, rot: 'Provisões' }], max)).join('')
    + '<div class="fpmLeg" style="margin-top:6px"><span><i style="background:' + FPJ_COR.pago + '"></i>Lançado</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.rec + '"></i>Recorrentes</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.out + '"></i>Outras (média)</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.prov + '"></i>Provisões</span></div>';
}

function fpjRecClientes(m){
  const atual = m === FINPM.pm.mes_atual, fim = fpmFimMes(m), ab = FINPM.pm.abertos || [];
  const C = {};
  const add = (q, k, v) => { if (!(v > 0.009)) return; C[q] = C[q] || { lanc: 0, os: 0 }; C[q][k] += v; };
  ab.filter(a => a.t === 'r' && (atual ? a.d <= fim : a.d.slice(0, 7) === m)).forEach(a => add(a.q || '—', 'lanc', Number(a.v) || 0));
  fpmProjMes(m).forEach(o => add(o.cliente || '—', 'os', o.v));
  const L = Object.entries(C).map(([q, x]) => ({ q, ...x, tot: x.lanc + x.os })).sort((a, b) => b.tot - a.tot);
  const tot = L.reduce((s, x) => s + x.tot, 0), max = Math.max(1, ...L.map(x => x.tot));
  const top = L.slice(0, 8), resto = L.slice(8), top3 = L.slice(0, 3).reduce((s, x) => s + x.tot, 0);
  return { html: top.map(x => fpjBarraH(x.q, [{ v: x.lanc, cor: FPJ_COR.lanc, rot: 'Lançado' }, { v: x.os, cor: FPJ_COR.os, est: true, rot: 'OS em execução' }], max, tot ? fpmPct(x.tot / tot) : '')).join('')
      + (resto.length ? fpjBarraH('Outros (' + resto.length + ')', [{ v: resto.reduce((s, x) => s + x.lanc, 0), cor: FPJ_COR.lanc, rot: 'Lançado' }, { v: resto.reduce((s, x) => s + x.os, 0), cor: FPJ_COR.os, est: true, rot: 'OS' }], max) : '')
      + '<div class="fpmLeg" style="margin-top:6px"><span><i style="background:' + FPJ_COR.lanc + '"></i>Lançado</span><span><i class="fpjHachCss" style="background:' + FPJ_COR.os + '"></i>OS em execução</span></div>',
    tot, n: L.length, top3: tot ? top3 / tot : 0, top: L[0] };
}

function fpjSinais(){
  const S = fpjSerie(), S0 = fpjSerieSemOS(), nm = m => FPM_NOMES[+m.slice(5, 7) - 1], hoje = FINPM.pm.hoje, L = [];
  const sinal = (grav, txt, ir, rot) => L.push({ grav, txt, ir, rot });
  const pior = S.reduce((a, x) => x.fim < a.fim ? x : a, S[0]), primNeg = S.find(x => x.fim < 0), primNeg0 = S0.find(x => x.fim < 0);
  if (primNeg) sinal('crit', 'O saldo fica negativo em <b>' + esc(nm(primNeg.m)) + '</b> (' + esc(fpmBRL(primNeg.fim)) + ')' + (pior.m !== primNeg.m ? ' e chega a ' + esc(fpmBRL(pior.fim)) + ' em ' + esc(nm(pior.m)) : '') + '. Para fechar no zero faltam <b>' + esc(fpmBRL(-pior.fim)) + '</b> de faturamento com vencimento até ' + esc(nm(pior.m)) + ', ou contas adiadas nesse valor.', 'fincr', null);
  else if (primNeg0) sinal('warn', 'Com as OS em execução o saldo aguenta os 4 meses, mas <b>sem elas</b> fica negativo em ' + esc(nm(primNeg0.m)) + ' (' + esc(fpmBRL(primNeg0.fim)) + '). Faturar as OS no prazo é o que segura o caixa.', 'fincr', null);
  else sinal('ok', 'O saldo não fica negativo nos 4 meses, com ou sem as OS em execução.', null, null);
  // depende das OS: quanto do que entra é projeção
  const totE = S.reduce((s, x) => s + x.rL + x.os, 0), totOS = S.reduce((s, x) => s + x.os, 0);
  if (totE > 0 && totOS / totE >= 0.3) sinal('warn', esc(fpmPct(totOS / totE)) + ' do que deve entrar nos 4 meses (' + esc(fpmK(totOS)) + ') ainda é <b>OS em execução</b>, não título. Executar e faturar essas OS no prazo é o que decide os meses seguintes.', 'fincr', null);
  // OS sem previsão
  const semD = fpmProjSemData(); if (semD.length) sinal('warn', finPlural(semD.length, 'OS sem previsão', 'OS sem previsão') + ' (' + esc(fpmK(fpmTot(semD))) + ') ficam <b>fora de todas as contas</b>' + (semD.some(o => o.parada) ? ', ' + finPlural(semD.filter(o => o.parada).length, 'delas parada', 'delas paradas') : '') + '. Ponha um prazo, marque a tarefa ou encerre a OS.', 'os', 'Ver as OS');
  // recorrências vencidas sem título no mês corrente
  const Dm = fpjDespesas(FINPM.pm.mes_atual), venc = Dm.rec.filter(r => r.venceu);
  if (venc.length) sinal('warn', finPlural(venc.length, 'recorrência já venceu', 'recorrências já venceram') + ' em ' + esc(nm(FINPM.pm.mes_atual)) + ' e não ' + (venc.length === 1 ? 'tem' : 'têm') + ' título (' + esc(fpmK(fpmTot(venc))) + '): ' + esc(venc.slice(0, 3).map(r => r.fornecedor.split(' ').slice(0, 2).join(' ')).join(', ')) + (venc.length > 3 ? '…' : '') + '. Foram pagas sem lançar, ou a recorrência acabou? Lance ou pause.', 'finrec', 'Recorrentes');
  // a receber vencido
  const ab = FINPM.pm.abertos || [], vencR = ab.filter(a => a.t === 'r' && a.d < hoje && a.etapa !== 'a_faturar');
  if (vencR.length) sinal('warn', finPlural(vencR.length, 'título a receber vencido', 'títulos a receber vencidos') + ' (' + esc(fpmK(vencR.reduce((s, a) => s + (Number(a.v) || 0), 0))) + '): ' + esc(vencR.slice(0, 3).map(a => a.q.split(' ').slice(0, 2).join(' ')).join(', ')) + '. Cobrar: a projeção conta com esse dinheiro.', 'finre:vencidas', 'Contas a Receber');
  // concentração de clientes nos próximos 2 meses
  const C = {}; S.slice(0, 2).forEach(x => { ab.filter(a => a.t === 'r' && (x.m === FINPM.pm.mes_atual ? a.d <= fpmFimMes(x.m) : a.d.slice(0, 7) === x.m)).forEach(a => C[a.q] = (C[a.q] || 0) + (Number(a.v) || 0)); fpmProjMes(x.m).forEach(o => C[o.cliente || '—'] = (C[o.cliente || '—'] || 0) + o.v); });
  const CL = Object.entries(C).sort((a, b) => b[1] - a[1]), totC = CL.reduce((s, c) => s + c[1], 0);
  if (CL.length && totC > 0 && CL[0][1] / totC >= 0.3) sinal('info', '<b>' + esc(CL[0][0]) + '</b> responde por ' + esc(fpmPct(CL[0][1] / totC)) + ' do que deve entrar até ' + esc(nm(S[1] ? S[1].m : S[0].m)) + ' (' + esc(fpmK(CL[0][1])) + '). Um atraso desse cliente muda tudo.', 'finre', 'Contas a Receber');
  // recorrências a confirmar
  const aconf = fpjMeses().slice(0, 2).flatMap(m => fpjDespesas(m).rec.filter(r => r.variavel));
  const nomesAC = [...new Set(aconf.map(r => r.fornecedor.split(' ').slice(0, 2).join(' ')))];
  if (aconf.length) sinal('info', finPlural(nomesAC.length, 'recorrência com valor', 'recorrências com valor') + ' "a confirmar" ' + (nomesAC.length === 1 ? 'pesa' : 'pesam') + ' ' + esc(fpmK(fpmTot(aconf))) + ' nos próximos 2 meses: ' + esc(nomesAC.slice(0, 4).join(', ')) + (nomesAC.length > 4 ? '…' : '') + '. Quanto mais certo o valor, mais certa a projeção.', 'finrec', 'Recorrentes');
  // a maior recorrência
  const Dn = fpjDespesas(S[1] ? S[1].m : S[0].m), maior = Dn.rec.slice().sort((a, b) => b.v - a.v)[0];
  if (maior && Dn.tRec > 0 && maior.v / Dn.tRec >= 0.12 && maior.v >= 5000) sinal('info', 'A maior recorrência de ' + esc(nm(S[1] ? S[1].m : S[0].m)) + ' é <b>' + esc(maior.fornecedor) + (maior.descricao ? ' · ' + esc(maior.descricao) : '') + '</b>: ' + esc(fpmK(maior.v)) + ', ' + esc(fpmPct(maior.v / Dn.tRec)) + ' das recorrentes. Confira se o valor está certo.', 'finrec', 'Recorrentes');
  // provisões
  if (fpjTemCiclo()){
    const P = fpjProvPlano(), c = FINPM.ciclo.meses.find(y => y.mes === FINPM.pm.mes_atual), guard = c ? Number(c.provisao) || 0 : 0;
    if (!P.v) sinal('info', 'As caixinhas não têm <b>valor por mês</b>: as provisões (13º, impostos, rescisões) não entram na projeção.', 'finrsv', 'Reservas');
    else if (guard < P.v) sinal('info', 'Provisões de ' + esc(nm(FINPM.pm.mes_atual)) + ': ' + (guard ? esc(fpmK(guard)) + ' guardados de ' : 'nada guardado ainda dos ') + esc(fpmK(P.v)) + ' planejados' + (P.fonte === 'recorrencia' ? ' (pela recorrência — ponha o valor nas caixinhas)' : '') + '.', 'finrsv', 'Reservas');
    // ciclo do mês corrente
    const cc = fcCiclo(FINPM.pm.mes_atual);
    if (cc && cc.ab !== null && cc.ab - cc.contas < 0) sinal('warn', 'As contas de ' + esc(nm(FINPM.pm.mes_atual)) + ' (' + esc(fpmK(cc.contas)) + ') passam do saldo com que o mês começou (' + esc(fpmK(cc.ab)) + ') em <b>' + esc(fpmBRL(cc.contas - cc.ab)) + '</b>: o dinheiro que entra no mês está pagando o próprio mês, e não vai para o CDB.', 'fincr', null);
  }
  // receita média × saídas previstas
  const ant = fpmAnteriores(FINPM.pm.mes_atual, 3), medE = fpmMedia(ant, x => x.entrou);
  const saiMes = S.slice(1).length ? S.slice(1).reduce((s, x) => s + x.pL + x.rec + x.out + x.prov, 0) / S.slice(1).length : 0;
  if (medE && saiMes && saiMes > medE) sinal('warn', 'Saídas previstas de <b>' + esc(fpmK(saiMes)) + '/mês</b> contra uma entrada média de ' + esc(fpmK(medE)) + '/mês nos últimos 3 meses: a empresa precisa faturar ' + esc(fpmK(saiMes - medE)) + ' a mais por mês, ou cortar.', null, null);
  else if (medE && saiMes) sinal('ok', 'Saídas previstas de ' + esc(fpmK(saiMes)) + '/mês contra uma entrada média de ' + esc(fpmK(medE)) + '/mês: cabe, com folga de ' + esc(fpmK(medE - saiMes)) + '/mês.', null, null);
  return L;
}

function fpjSinaisCard(){
  const L = fpjSinais(), ico = { crit: '●', warn: '▲', info: '■', ok: '✓' };
  return '<div class="painel fpmCard fpjSinais"><h3>O que pede decisão</h3><p class="fpmPq">Lido dos gráficos abaixo. Do mais urgente para o menos.</p>'
    + L.map(s => '<div class="fpjSinal ' + s.grav + '"><span class="i" aria-hidden="true">' + ico[s.grav] + '</span><div>' + s.txt + '</div>' + (s.ir && s.ir !== 'fincr' ? '<button type="button" class="btn sm" data-ir="' + esc(s.ir) + '">' + esc(s.rot || 'Abrir') + ' →</button>' : '') + '</div>').join('') + '</div>';
}

function fpjGrafCiclo(){
  const el = document.getElementById('fpjGCiclo'); if (!el) return;
  const atual = FINPM.pm.mes_atual;
  const passados = fpjTemCiclo() ? FINPM.ciclo.meses.filter(c => c.abertura !== null && c.abertura !== undefined).map(c => c.mes) : [];
  const L = [...new Set([...passados, ...fpjMeses().filter(m => m > atual)])].sort().map(fcCiclo).filter(c => c && c.ab !== null);
  if (!L.length){ el.innerHTML = '<p class="nota">Sem saldo do dia 1º ainda (precisa da data de corte de todas as contas e do SQL 503).</p>'; return; }
  const W = Math.max(240, el.clientWidth || 700), H = 220, pl = 58, pr = 10, pt = 22, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  const E = fpjEscala(L.flatMap(c => [c.ab, c.contas]), pt, ih, 20000);
  const bw = iw / L.length, barW = Math.min(34, bw * 0.3), gap = 4;
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Saldo do dia 1º contra as contas do mês" style="display:block">' + fpjDefs([FPJ_COR.saldo, FPJ_COR.pago]) + fpjGrade(E, pl, W, pr);
  L.forEach((c, i) => {
    const cx = pl + bw * i + bw / 2, est = c.prev || c.parcial, v = c.ab - c.contas, sel = c.m === FINPM.mes;
    s += fpjBarV(cx - barW - gap / 2, E.y(0), E.y(c.ab), barW, est ? fpjHach(FPJ_COR.saldo) : FPJ_COR.saldo, sel ? 1 : .75) + fpjBarV(cx + gap / 2, E.y(0), E.y(c.contas), barW, est ? fpjHach(FPJ_COR.pago) : FPJ_COR.pago, sel ? 1 : .75);
    const topo = Math.min(E.y(c.ab), E.y(c.contas));
    s += '<text x="' + cx + '" y="' + (topo - 6) + '" text-anchor="middle" font-size="' + (bw < 100 ? 10 : 11) + '" font-weight="700" fill="' + (v < 0 ? FPJ_COR.neg : FPM_COR.entrou) + '"' + FPJ_HALO + '>' + esc(bw < 100 ? (v < 0 ? '−' : '+') + fpjFmt(Math.abs(v)) : (v < 0 ? 'falta ' : 'sobra ') + fpjFmt(Math.abs(v))) + '</text>';
    s += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11.5" fill="' + (sel ? FPJ_COR.txt : FPJ_COR.txt2) + '" font-weight="' + (sel ? 700 : 400) + '">' + esc(bw < 100 ? _FINP_MESES[+c.m.slice(5, 7) - 1] : fpmMesCurto(c.m)) + (c.prev ? '*' : c.parcial ? '†' : '') + '</text>';
    s += '<rect class="fpjHit" data-i="' + i + '" x="' + (pl + bw * i) + '" y="' + pt + '" width="' + bw + '" height="' + (ih + pb - 4) + '" fill="transparent" style="cursor:pointer"/>';
  });
  s += '</svg>';
  el.innerHTML = s + '<div class="fpmLeg"><span><i style="background:' + FPJ_COR.saldo + '"></i>Começou com (dia 1º)</span><span><i style="background:' + FPJ_COR.pago + '"></i>Contas do mês</span><span class="fpmPq" style="margin:0">hachurado = estimado · † até o fim do mês · * previsto</span></div>';
  fpjLiga(el, '.fpjHit', r => { const c = L[+r.dataset.i]; return '<b>' + esc(fpmRot(c.m)) + '</b>' + fpjLin('Começou com', esc(fpmBRL(c.ab))) + fpjLin('Contas do mês', esc(fpmBRL(c.contas))) + fpjLin(c.ab - c.contas < 0 ? '<b>Falta</b>' : '<b>Sobra</b>', '<b>' + esc(fpmBRL(Math.abs(c.ab - c.contas))) + '</b>'); });
  el.querySelectorAll('.fpjHit').forEach(r => r.addEventListener('click', () => { const c = L[+r.dataset.i]; if (FINPM.meses.includes(c.m)){ fpmTipSai(); FINPM.mes = c.m; fpmRedesenhar(); } }));
}

function fpjGraficos(){ fpjGrafSaldo(); fpjGrafCascata(); fpjGrafMeses(); fpjGrafDias(); fpjGrafCiclo(); }

const FPM_GRUPO_COR = { 'Despesas com Pessoal': '#D08A2E', 'Despesas Fixas': '#8C5A1E', 'Despesas Variáveis': '#E6B877', 'Impostos': '#7B5EA7' };

const fpmGrupoCor = g => FPM_GRUPO_COR[g] || '#B9C2C7';

const fpmDelta = (v, med, inverso) => {
  if (med === null || med === undefined || !med) return '';
  const d = (v - med) / med, bom = inverso ? d <= 0 : d >= 0;
  return '<span class="fpmDelta ' + (Math.abs(d) < 0.05 ? 'neutro' : bom ? 'bom' : 'ruim') + '">' + (d >= 0 ? '+' : '−') + esc(fpmPct(Math.abs(d))) + '</span>';
};

function fpjCascata(el, passos){
  if (!el) return;
  let acum = 0; const corrida = [];
  passos.forEach(p => { if (p.tipo === 'tot'){ p.de = 0; p.ate = p.v; acum = p.v; } else { p.de = acum; p.ate = acum + p.v; acum = p.ate; } corrida.push(p.de, p.ate); });
  const W = Math.max(240, el.clientWidth || 700), estreito = W < 480, rotW = estreito ? 96 : 170, valW = 78, pl = rotW, pr = valW + 6, iw = W - pl - pr, rh = 26, H = passos.length * rh + 8;
  const lo = Math.min(0, ...corrida), hi = Math.max(0, ...corrida), xs = v => pl + iw * (v - lo) / ((hi - lo) || 1);
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Passo a passo" style="display:block">' + fpjDefs([...new Set(passos.filter(p => p.est && p.cor).map(p => p.cor))]);
  s += '<line x1="' + xs(0) + '" x2="' + xs(0) + '" y1="2" y2="' + (H - 4) + '" stroke="' + FPJ_COR.zero + '" stroke-width="1.5"/>';
  passos.forEach((p, i) => {
    const y = 4 + i * rh, a = xs(Math.min(p.de, p.ate)), b = xs(Math.max(p.de, p.ate)), w = Math.max(2, b - a);
    const cor = p.tipo === 'tot' ? (p.v < 0 ? FPJ_COR.neg : FPJ_COR.saldo) : p.cor, fill = p.est ? fpjHach(cor) : cor;
    const rot = estreito && p.rotCurto ? p.rotCurto : p.rot;
    s += '<text x="' + (pl - 8) + '" y="' + (y + 15) + '" text-anchor="end" font-size="11.5" fill="' + FPJ_COR.txt + '"' + (p.est ? ' font-style="italic"' : '') + (p.tipo === 'tot' ? ' font-weight="700"' : '') + '>' + esc(rot) + '</text>';
    if (Math.abs(p.v) > 0.009 || p.tipo === 'tot') s += '<rect x="' + a + '" y="' + (y + 4) + '" width="' + w + '" height="' + (rh - 10) + '" rx="3" fill="' + fill + '" class="fpjHit" data-i="' + i + '"/>';
    if (i > 0 && p.tipo !== 'tot') s += '<line x1="' + xs(p.de) + '" x2="' + xs(p.de) + '" y1="' + (y - 2) + '" y2="' + (y + 4) + '" stroke="' + FPJ_COR.txt2 + '" stroke-dasharray="2 2"/>';
    s += '<text x="' + (W - 2) + '" y="' + (y + 15) + '" text-anchor="end" font-size="11.5" fill="' + (p.tipo === 'tot' && p.v < 0 ? FPJ_COR.neg : FPJ_COR.txt) + '"' + (p.tipo === 'tot' ? ' font-weight="700"' : '') + '>' + esc(Math.abs(p.v) < 0.009 && p.tipo !== 'tot' ? '—' : (p.tipo === 'tot' ? fpmK(p.v) : (p.v > 0 ? '+' : '−') + fpjFmt(Math.abs(p.v)))) + '</text>';
  });
  el.innerHTML = s + '</svg>';
  fpjLiga(el, '.fpjHit', r => { const p = passos[+r.dataset.i]; return '<b>' + esc(p.rot) + '</b>' + fpjLin('Valor', esc(fpmBRL(p.v))) + (p.tipo === 'tot' ? '' : fpjLin('Saldo depois', esc(fpmBRL(p.ate)))) + (p.quem ? '<div class="l"><span>' + esc(p.quem) + '</span></div>' : '') + (p.est ? '<div class="l"><span><i>estimativa</i></span></div>' : ''); });
}

function fpmSpark(vals, cor, iSel, corNeg){
  const w = 9, g = 3, H = 26, n = vals.length, W = n * (w + g);
  const max = Math.max(1, ...vals.map(v => Math.abs(v)));
  const y0 = vals.some(v => v < 0) ? H / 2 : H;
  return '<svg class="fpmSpark" width="' + W + '" height="' + H + '" aria-hidden="true">' + vals.map((v, i) => {
    const h = Math.max(1, Math.abs(v) / max * (y0 === H ? H - 2 : H / 2 - 1)), y = v >= 0 ? y0 - h : y0;
    return '<rect x="' + (i * (w + g)) + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + (v < 0 && corNeg ? corNeg : cor) + '" opacity="' + (i === iSel ? 1 : 0.4) + '"/>';
  }).join('') + '</svg>';
}

function finpDesenhar(){
  const el = document.getElementById('finpCorpo'); if (!el || !FINPM.d) return;
  const d = FINPM.d, k = FINPM.mes, atual = k === FINPM.pm.mes_atual;
  const i = FINPM.meses.indexOf(k);
  el.innerHTML = fpmPendencias(d) + osmedAvisosPainel()   // F14
    + '<div class="fpmNav" role="group" aria-label="Escolher o mês">'
    +   '<button type="button" class="btn" id="fpmAnt" aria-label="Mês anterior"' + (i <= 0 ? ' disabled' : '') + '>◀</button>'
    +   '<b aria-live="polite">' + esc(fpmRot(k).replace(/^./, c => c.toUpperCase())) + (atual ? '<small>até ' + esc(dataBR(FINPM.pm.hoje).slice(0, 5)) + '</small>' : '') + '</b>'
    +   '<button type="button" class="btn" id="fpmProx" aria-label="Próximo mês"' + (i >= FINPM.meses.length - 1 ? ' disabled' : '') + '>▶</button>'
    + '</div>'
    + (atual ? fpmProgressoMes(k) : '')
    + '<div class="fpmG4">' + fpmTiles(k) + '</div>'
    + fpmLeitura(k)
    + (atual ? '<div class="fpmG2">' + fpmFechamento(k) + fpmProximos(k) + '</div>' : '')
    + '<div class="fpmG2">'
    +   '<div class="painel fpmCard"><h3>Entrou × saiu, mês a mês</h3><p class="fpmPq">A empresa está gerando ou queimando caixa? Clique numa coluna para ir ao mês.</p>'
    +     '<div id="fpmGraf"></div>'
    +     '<div class="fpmLeg"><span><i style="background:' + FPM_COR.entrou + '"></i>Entrou</span><span><i style="background:' + FPM_COR.saiu + '"></i>Saiu</span><span><i class="ln" style="background:' + FPM_COR.res + '"></i>Resultado (entrou − saiu)</span>'
    +     '<button class="fpmLk" type="button" id="fpmVerTab">ver tabela</button></div><div id="fpmTab" hidden></div></div>'
    +   '<div class="painel fpmCard"><h3>Resultado acumulado</h3><p class="fpmPq">A soma dos resultados desde ' + esc(fpmRot(FINPM.meses[0])) + ': quanto a empresa guardou ou consumiu de caixa no período.</p><div id="fpmGrafAcum"></div></div>'
    + '</div>'
    + '<div class="fpmG2">' + fpmDespesas(k) + fpmClientes(k) + '</div>'
    + '<div class="painel fpmCard"><h3>Para onde foi, mês a mês</h3><p class="fpmPq">Despesas pagas por grupo em cada mês. O mês corrente é parcial.</p><div id="fpmGrafGrupos"></div></div>'
    + '<div class="fpmG2">' + fpmReceber() + fpmPagar() + '</div>'
    + '<div class="fpmG4">' + fpmIndicadores(k) + '</div>'
    + (atual ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px">'
        + finpCardMes('Receitas', 'var(--ok)', d.realizado_receita, Number(FINPM.pm.previsto_receita) || 0, (d.comparativo_mes || []).filter(c => c.tipo === 'r'))
        + finpCardMes('Despesas', 'var(--warn)', d.realizado_despesa, d.previsto_despesa, (d.comparativo_mes || []).filter(c => c.tipo === 'p'))
        + '</div><p class="fpmPq" style="margin-top:6px">Previsto das receitas = o que vence no mês (recebido ou não). Previsto das despesas = soma dos orçamentos das subcategorias (Categorias).</p>' : '')
    + '<div class="fpmNota">Tudo pelo <b>caixa</b> (data em que o dinheiro entrou ou saiu). Março a setembro/2026 vêm do histórico do SIGE; o que passou pelo Sicoob antes de outubro está na data de vencimento. O saldo das contas só existe a partir da data de corte. Nada aqui é estimativa: o que ainda não foi lançado está em <button class="fpmLk" type="button" data-ir="fincr">Projeções</button>.</div>';
  fpmGraficosPainel(k);
  fpmLigar(el, i);
  el.querySelectorAll('.fpjDet').forEach(d => { const id = 'p' + (d.querySelector('summary') || {}).textContent; d.open = !!FINPM._dets && FINPM._dets[id]; d.addEventListener('toggle', () => { FINPM._dets = FINPM._dets || {}; FINPM._dets[id] = d.open; }); });
}

function fpmGraficosPainel(k){ fpmGrafico(k); fpmGrafAcum(k); fpmGrafGrupos(k); fpmGrafFechamento(k); fpmGrafProximos(k); fpmGrafPagar(); }

function fpmProgressoMes(k){
  const fim = +fpmFimMes(k).slice(8), dia = +FINPM.pm.hoje.slice(8), pct = dia / fim;
  return '<div class="fpmMesBarra"><div class="t"><span style="width:' + (100 * pct).toFixed(1) + '%"></span></div>'
    + '<div class="r">Dia <b>' + dia + '</b> de ' + fim + ' (' + esc(fpmPct(pct)) + ' do mês). O mês ainda está correndo: os recebimentos entram até o fim dele, e a folha e as contas fixas saem no começo — por isso o resultado parcial costuma aparecer negativo.</div></div>';
}

function fpmTiles(k){
  const x = fpmMes(k), ant = fpmAnteriores(k, 3), atual = k === FINPM.pm.mes_atual, i = FINPM.meses.indexOf(k);
  const janela = FINPM.meses.slice(Math.max(0, i - 5), i + 1), iSel = janela.indexOf(k);
  const serie = f => janela.map(m => f(fpmMes(m)));
  const cmp = (v, mm, inverso) => mm === null ? '<span class="fpmCmp">sem meses anteriores para comparar</span>'
    : '<span class="fpmCmp">média dos 3 meses antes: <b>' + esc(fpmK(mm)) + '</b>' + (atual ? '' : ' ' + fpmDelta(v, mm, inverso)) + '</span>';
  const res = x.entrou - x.saiu;
  const t = (cor, rot, val, cls, extra, spark) => '<div class="painel fpmTile"><div class="fpmRot">' + (cor ? '<span class="fpmDot" style="background:' + cor + '"></span>' : '') + rot + (spark ? '<span class="fpmSparkBox">' + spark + '</span>' : '') + '</div>'
    + '<div class="fpmVal ' + (cls || '') + '">' + val + '</div>' + extra + '</div>';
  const contas = (FINPM.pm.contas || []).filter(c => c.papel === 'operacional'), saldo = fpmSaldoOp();
  const segs = contas.filter(c => (Number(c.saldo) || 0) > 0).map((c, j) => ({ nome: c.nome.replace(/^Banco /, ''), v: Number(c.saldo) || 0, cor: [FPM_COR.res, '#5B93C4', '#9BBEDB', '#C7DCEB'][j % 4] }));
  const barraContas = saldo > 0 && segs.length ? '<div class="fpmSeg" style="height:10px;margin:6px 0 4px">' + segs.map(g => '<span data-tip="' + esc(g.nome + ': ' + BRL(g.v)) + '" style="width:' + (100 * g.v / saldo) + '%;background:' + g.cor + '"></span>').join('') + '</div>' : '';
  return t(FPM_COR.entrou, 'Entrou', esc(BRL(x.entrou)), '', cmp(x.entrou, fpmMedia(ant, m => m.entrou)), fpmSpark(serie(m => m.entrou), FPM_COR.entrou, iSel))
    + t(FPM_COR.saiu, 'Saiu', esc(BRL(x.saiu)), '', cmp(x.saiu, fpmMedia(ant, m => m.saiu), true), fpmSpark(serie(m => m.saiu), FPM_COR.saiu, iSel))
    + t(FPM_COR.res, 'Resultado', esc(fpmBRL(res)), res < 0 ? 'fpmNeg' : 'fpmPos', cmp(res, fpmMedia(ant, m => m.entrou - m.saiu)), fpmSpark(serie(m => m.entrou - m.saiu), FPM_COR.res, iSel, FPJ_COR.neg))
    + t('', 'Saldo nas contas', atual ? esc(BRL(saldo)) : '—', '',
        atual ? barraContas + '<span class="fpmCmp">' + contas.map((c, j) => '<i class="fpmDot" style="background:' + (segs.find(g => g.nome === c.nome.replace(/^Banco /, '')) || { cor: '#C7DCEB' }).cor + ';width:7px;height:7px"></i> ' + esc(c.nome.replace(/^Banco /, '')) + ' ' + esc(fpmK(Number(c.saldo) || 0))
                  + (Number(c.saldo_inicial) ? '' : ' <small>(sem saldo inicial)</small>')).join(' · ')
                  + fpmReservas().map(c => '<br><span data-tip="' + esc(fpmResTip(c)) + '" title="' + esc(fpmResTip(c)) + '">reserva ' + esc(fpmResNome(c)) + ' ' + esc(fpmK(Number(c.saldo) || 0)) + fpmResSemIni(c) + '</span>').join('') + '</span>'
              : '<span class="fpmCmp">o saldo só existe a partir da data de corte</span>');
}

function fpmLeitura(k){
  const x = fpmMes(k), ant = fpmAnteriores(k, 3), atual = k === FINPM.pm.mes_atual, nm = FPM_NOMES[+k.slice(5, 7) - 1], L = [];
  const medE = fpmMedia(ant, m => m.entrou), medS = fpmMedia(ant, m => m.saiu), res = x.entrou - x.saiu;
  const sinal = (grav, txt, ir, rot) => L.push({ grav, txt, ir, rot });
  if (!atual){
    if (res < 0) sinal('warn', esc(nm.replace(/^./, c => c.toUpperCase())) + ' queimou caixa: saiu ' + esc(fpmBRL(-res)) + ' a mais do que entrou.');
    else sinal('ok', esc(nm.replace(/^./, c => c.toUpperCase())) + ' gerou caixa: sobraram ' + esc(BRL(res)) + '.');
    if (medE && Math.abs(x.entrou - medE) / medE >= 0.15) sinal(x.entrou < medE ? 'warn' : 'ok', 'Entrou ' + esc(fpmPct(Math.abs(x.entrou - medE) / medE)) + (x.entrou < medE ? ' abaixo' : ' acima') + ' da média dos 3 meses anteriores (' + esc(fpmK(medE)) + ').');
    if (medS && Math.abs(x.saiu - medS) / medS >= 0.15) sinal(x.saiu > medS ? 'warn' : 'ok', 'Saiu ' + esc(fpmPct(Math.abs(x.saiu - medS) / medS)) + (x.saiu > medS ? ' acima' : ' abaixo') + ' da média (' + esc(fpmK(medS)) + ').');
  } else {
    const fim = +fpmFimMes(k).slice(8), pct = +FINPM.pm.hoje.slice(8) / fim;
    if (medE) sinal(x.entrou / medE < pct * 0.8 ? 'warn' : 'info', 'Até o dia ' + FINPM.pm.hoje.slice(8) + ' entrou ' + esc(fpmPct(x.entrou / medE)) + ' do que costuma entrar num mês inteiro (' + esc(fpmK(medE)) + '), com ' + esc(fpmPct(pct)) + ' do mês passado.');
    if (medS) sinal('info', 'Já saiu ' + esc(fpmPct(x.saiu / medS)) + ' do que costuma sair num mês inteiro (' + esc(fpmK(medS)) + '). A folha e as contas fixas saem no começo.');
  }
  // grupos acima da média
  const tot = subs => Object.values(subs || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  Object.keys(x.grupos || {}).forEach(g => {
    const v = tot(x.grupos[g]), med = ant.length ? ant.reduce((s, m) => s + tot((fpmMes(m).grupos || {})[g]), 0) / ant.length : null;
    if (med && v > med * 1.2 && v - med > 1000) sinal('warn', '<b>' + esc(g) + '</b>: ' + esc(fpmK(v)) + ', ' + esc(fpmPct((v - med) / med)) + ' acima da média (' + esc(fpmK(med)) + ').' + (atual ? ' E o mês não acabou.' : ''));
  });
  // vencidos
  const ab = FINPM.pm.abertos || [], vencR = ab.filter(a => a.t === 'r' && fpmDias(a.d) < 0 && a.etapa !== 'a_faturar'), vencP = ab.filter(a => a.t === 'p' && !a.provisao && fpmDias(a.d) < 0);
  if (vencR.length) sinal('warn', finPlural(vencR.length, 'título a receber vencido', 'títulos a receber vencidos') + ' (' + esc(fpmK(vencR.reduce((s, a) => s + (Number(a.v) || 0), 0))) + '): ' + esc(vencR.slice(0, 3).map(a => a.q.split(' ').slice(0, 2).join(' ')).join(', ')) + '. Cobrar.', 'finre:vencidas', 'Contas a Receber');
  if (vencP.length) sinal('crit', finPlural(vencP.length, 'conta a pagar vencida', 'contas a pagar vencidas') + ' (' + esc(fpmK(vencP.reduce((s, a) => s + (Number(a.v) || 0), 0))) + '): ' + esc(vencP.slice(0, 3).map(a => a.q.split(' ').slice(0, 2).join(' ')).join(', ')) + '.', 'finpg:vencidas', 'Contas a Pagar');
  // concentração do mês
  const cl = (x.clientes || []).map(c => [c[0], Number(c[1]) || 0]);
  if (x.entrou > 0 && cl.length && cl[0][1] / x.entrou >= 0.4) sinal('info', '<b>' + esc(cl[0][0]) + '</b> foi ' + esc(fpmPct(cl[0][1] / x.entrou)) + ' do que entrou em ' + esc(nm) + '.');
  if (x.cartao > 0 && x.saiu > 0 && x.cartao / x.saiu >= 0.15) sinal('info', 'A fatura do cartão foi ' + esc(fpmPct(x.cartao / x.saiu)) + ' do que saiu (' + esc(fpmK(x.cartao)) + '), lançada como uma conta só. O detalhe das compras está em <button class="fpmLk" type="button" data-ir="fincar">Cartões</button>.');
  if (!L.length) return '';
  const ico = { crit: '●', warn: '▲', info: '■', ok: '✓' };
  return '<div class="painel fpmCard fpjSinais"><h3>Leitura de ' + esc(nm) + '</h3>'
    + L.slice(0, 6).map(s => '<div class="fpjSinal ' + s.grav + '"><span class="i" aria-hidden="true">' + ico[s.grav] + '</span><div>' + s.txt + '</div>' + (s.ir ? '<button type="button" class="btn sm" data-ir="' + esc(s.ir) + '">' + esc(s.rot) + ' →</button>' : '') + '</div>').join('') + '</div>';
}

function fpmFechamento(k){
  const x = fpmMes(k), ab = FINPM.pm.abertos || [], fim = fpmFimMes(k);
  const vaiE = ab.filter(a => a.t === 'r' && a.d <= fim).map(a => [a.q, Number(a.v) || 0]);
  const vaiS = ab.filter(a => a.t === 'p' && !a.provisao && a.d <= fim);
  const sE = fpmTot(vaiE), sS = vaiS.reduce((s, a) => s + (Number(a.v) || 0), 0);
  const res = x.entrou + sE - x.saiu - sS, nm = FPM_NOMES[+k.slice(5, 7) - 1];
  const lista = (L, n) => L.slice(0, n).map(a => esc(a[0]) + ' ' + esc(fpmK(a[1]))).join(' · ') + (L.length > n ? ' · +' + (L.length - n) : '');
  const sai = {}; vaiS.forEach(a => { sai[a.q] = (sai[a.q] || 0) + (Number(a.v) || 0); });
  return '<div class="painel fpmCard"><h3>Como ' + esc(nm) + ' deve fechar <small class="fpmHoje">· só o lançado</small></h3>'
    + '<p class="fpmPq">O que já entrou e saiu, mais o que está lançado para entrar e sair até o fim do mês.</p>'
    + '<div id="fpmGrafFech"></div>'
    + '<div class="fpmGrande ' + (res < 0 ? 'fpmNeg' : 'fpmPos') + '" style="margin-top:4px">' + (res < 0 ? '−' : '+') + esc(BRL(Math.abs(res))) + '</div>'
    + '<div style="font-size:13px">' + (res < 0 ? 'Entradas menos saídas de ' + esc(nm) + ', com o que está lançado.' : 'de saldo no mês, com o que está lançado.') + '</div>'
    + '<details class="fpjDet"><summary>Ver o que está lançado</summary>'
    + (vaiE.length ? '<p class="fpmPq" style="margin:6px 0 0"><b>Para entrar:</b> ' + lista(vaiE.slice().sort((a, b) => b[1] - a[1]), 6) + '.</p>' : '<p class="fpmPq" style="margin:6px 0 0">Nada lançado para entrar.</p>')
    + (vaiS.length ? '<p class="fpmPq" style="margin:4px 0 0"><b>Para sair:</b> ' + lista(Object.entries(sai).sort((a, b) => b[1] - a[1]), 6) + '. A provisão mensal (reserva) não entra.</p>' : '<p class="fpmPq" style="margin:4px 0 0">Nada lançado para sair.</p>') + '</details>'
    + fpmLinkProj(k)
    + '</div>';
}

function fpmGrafFechamento(k){
  const el = document.getElementById('fpmGrafFech'); if (!el) return;
  const x = fpmMes(k), ab = FINPM.pm.abertos || [], fim = fpmFimMes(k);
  const sE = ab.filter(a => a.t === 'r' && a.d <= fim).reduce((s, a) => s + (Number(a.v) || 0), 0);
  const sS = ab.filter(a => a.t === 'p' && !a.provisao && a.d <= fim).reduce((s, a) => s + (Number(a.v) || 0), 0);
  fpjCascata(el, [
    { rot: 'Já entrou', rotCurto: 'Entrou', v: x.entrou, cor: FPM_COR.entrou },
    { rot: '+ Lançado para entrar', rotCurto: '+ A entrar', v: sE, cor: FPJ_COR.os, est: true },
    { rot: '− Já saiu', rotCurto: '− Saiu', v: -x.saiu, cor: FPM_COR.saiu },
    { rot: '− Lançado para sair', rotCurto: '− A sair', v: -sS, cor: FPJ_COR.rec, est: true },
    { rot: 'Resultado do mês', rotCurto: 'Resultado', v: x.entrou + sE - x.saiu - sS, tipo: 'tot' }]);
}

function fpmProximosDados(k){
  const ab = FINPM.pm.abertos || [];
  return [1, 2, 3].map(n => fpmSoma(k, n)).map(m => {
    const R = ab.filter(a => a.t === 'r' && a.d.slice(0, 7) === m).map(a => [a.q, Number(a.v) || 0]);
    const P = ab.filter(a => a.t === 'p' && !a.provisao && a.d.slice(0, 7) === m).map(a => [a.q, Number(a.v) || 0]);
    return { m, R, P, r: fpmTot(R), p: fpmTot(P) };
  });
}

function fpmProximos(k){
  const L = fpmProximosDados(k);
  const lista = (X, n) => X.slice().sort((a, b) => b[1] - a[1]).slice(0, n).map(a => esc(a[0]) + ' ' + esc(fpmK(a[1]))).join(' · ') + (X.length > n ? ' · +' + (X.length - n) : '');
  return '<div class="painel fpmCard"><h3>Lançado para os próximos meses</h3>'
    + '<p class="fpmPq">Só os títulos que já existem, pelo vencimento. Salário, impostos e o que é recorrente ainda não lançado, e as OS em execução, estão em <button class="fpmLk" type="button" data-ir="fincr">Projeções</button>.</p>'
    + '<div id="fpmGrafProx"></div>'
    + '<details class="fpjDet"><summary>Ver quem</summary>'
    + L.map(l => '<div class="fpmProx"><div class="fpmProxCab"><b>' + esc(fpmRot(l.m).replace(/^./, c => c.toUpperCase())) + '</b><span>' + finPlural(l.R.length + l.P.length, 'título', 'títulos') + '</span></div>'
      + (l.R.length ? '<p class="fpmPq" style="margin:2px 0 0">Receber: ' + lista(l.R, 4) + '.</p>' : '')
      + (l.P.length ? '<p class="fpmPq" style="margin:2px 0 0">Pagar: ' + lista(l.P, 4) + '.</p>' : '')
      + (!l.R.length && !l.P.length ? '<p class="fpmPq" style="margin:2px 0 0">Nada lançado.</p>' : '') + '</div>').join('') + '</details></div>';
}

function fpmGrafProximos(k){
  const el = document.getElementById('fpmGrafProx'); if (!el) return;
  const L = fpmProximosDados(k);
  const W = Math.max(240, el.clientWidth || 600), H = 190, pl = 54, pr = 10, pt = 20, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
  const E = fpjEscala(L.flatMap(l => [l.r, l.p]), pt, ih, 10000);
  const bw = iw / L.length, barW = Math.min(40, bw * 0.3), gap = 4;
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="A receber e a pagar lançados por mês" style="display:block">' + fpjGrade(E, pl, W, pr);
  L.forEach((l, i) => {
    const cx = pl + bw * i + bw / 2;
    s += fpjBarV(cx - barW - gap / 2, E.y(0), E.y(l.r), barW, FPM_COR.entrou) + fpjBarV(cx + gap / 2, E.y(0), E.y(l.p), barW, FPM_COR.saiu);
    s += '<text x="' + (cx - gap / 2 - 2) + '" y="' + (E.y(l.r) - 5) + '" text-anchor="end" font-size="10.5" font-weight="700" fill="' + FPM_COR.entrou + '"' + FPJ_HALO + '>' + esc(fpjK(l.r)) + '</text>';
    s += '<text x="' + (cx + gap / 2 + 2) + '" y="' + (E.y(l.p) - 5) + '" text-anchor="start" font-size="10.5" font-weight="700" fill="' + FPM_COR.saiu + '"' + FPJ_HALO + '>' + esc(fpjK(l.p)) + '</text>';
    const net = l.r - l.p;
    s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11.5" fill="' + FPJ_COR.txt + '" font-weight="700">' + esc(fpmMesCurto(l.m)) + '</text>';
    s += '<rect class="fpjHit" data-i="' + i + '" x="' + (pl + bw * i) + '" y="' + pt + '" width="' + bw + '" height="' + (ih + pb - 4) + '" fill="transparent"/>';
  });
  el.innerHTML = s + '</svg><div class="fpmLeg"><span><i style="background:' + FPM_COR.entrou + '"></i>A receber</span><span><i style="background:' + FPM_COR.saiu + '"></i>A pagar</span></div>';
  fpjLiga(el, '.fpjHit', r => { const l = L[+r.dataset.i]; return '<b>' + esc(fpmRot(l.m)) + '</b>' + fpjLin('A receber', '+' + esc(fpjFmt(l.r)) + ' · ' + l.R.length) + fpjLin('A pagar', '−' + esc(fpjFmt(l.p)) + ' · ' + l.P.length) + fpjLin('<b>Diferença</b>', '<b>' + esc(fpmBRL(l.r - l.p)) + '</b>'); });
}

function fpmGrafico(k){
  const el = document.getElementById('fpmGraf'); if (!el) return;
  const M = FINPM.meses;
  const W = Math.max(240, el.clientWidth || 700), H = 250, pl = 54, pr = 10, pt = 22, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  // FP2 (S189): a meta de recebimento (só a Reunião do TapGestão põe FINPM.metaEntrou; no TapFin fica sem a linha)
  const META = Number(FINPM.metaEntrou) > 0 ? Number(FINPM.metaEntrou) : 0;
  const E = fpjEscala(M.flatMap(m => { const x = fpmMes(m); return [x.entrou, x.saiu, x.entrou - x.saiu]; }).concat(META ? [META] : []), pt, ih, 25000);
  const bw = iw / M.length, barW = Math.min(26, bw * 0.3), gap = 2, rotula = bw >= 150;
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Entrou, saiu e resultado por mês" style="display:block">' + fpjDefs([FPM_COR.entrou, FPM_COR.saiu]) + fpjGrade(E, pl, W, pr);
  const pts = [];
  M.forEach((m, i) => {
    const x = fpmMes(m), cx = pl + bw * i + bw / 2, sel = m === k, op = sel ? 1 : 0.5, parcial = m === FINPM.pm.mes_atual;
    s += fpjBarV(cx - barW - gap / 2, E.y(0), E.y(x.entrou), barW, parcial ? fpjHach(FPM_COR.entrou) : FPM_COR.entrou, op) + fpjBarV(cx + gap / 2, E.y(0), E.y(x.saiu), barW, parcial ? fpjHach(FPM_COR.saiu) : FPM_COR.saiu, op);
    if (rotula || sel){
      s += '<text x="' + (cx - barW / 2 - gap / 2) + '" y="' + (E.y(x.entrou) - (cx + barW / 2 + 48 > W - pr && Math.abs(E.y(x.entrou) - E.y(x.saiu)) < 14 ? 17 : 5)) + '" text-anchor="' + (rotula ? 'middle' : 'end') + '" font-size="10" font-weight="700" fill="' + FPM_COR.entrou + '"' + FPJ_HALO + '>' + esc(fpjK(x.entrou)) + '</text>';
      const dir = cx + barW / 2 + 48 > W - pr;   // perto da borda direita, o rótulo vira para dentro
      s += '<text x="' + (rotula ? cx + barW / 2 + gap / 2 : dir ? cx + barW + gap / 2 : cx + barW / 2 + gap / 2) + '" y="' + (E.y(x.saiu) - 5) + '" text-anchor="' + (rotula ? 'middle' : dir ? 'end' : 'start') + '" font-size="10" font-weight="700" fill="' + FPM_COR.saiu + '"' + FPJ_HALO + '>' + esc(fpjK(x.saiu)) + '</text>';
    }
    s += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11.5" fill="' + (sel ? FPJ_COR.txt : FPJ_COR.txt2) + '" font-weight="' + (sel ? 700 : 400) + '">' + (bw < 60 ? _FINP_MESES[+m.slice(5, 7) - 1] : fpmCurto(m)) + (parcial ? '*' : '') + '</text>';
    pts.push([cx, E.y(x.entrou - x.saiu), m]);
  });
  s += '<polyline fill="none" stroke="' + FPM_COR.res + '" stroke-width="2" points="' + pts.map(p => p[0] + ',' + p[1]).join(' ') + '"/>';
  if (META) s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + E.y(META) + '" y2="' + E.y(META) + '" stroke="#4338CA" stroke-width="2" stroke-dasharray="6 4"/>'
    + '<text x="' + (pl + 4) + '" y="' + (E.y(META) - 5) + '" font-size="11" font-weight="700" fill="#4338CA"' + FPJ_HALO + '>meta ' + esc(fpjK(META)) + '</text>';
  pts.forEach(p => { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (p[2] === k ? 5 : 4) + '" fill="' + FPM_COR.res + '" stroke="#fff" stroke-width="2"/>'; });
  const sp = pts.find(p => p[2] === k), sx = fpmMes(k), rv = sx.entrou - sx.saiu;
  if (sp){
    const nearR = sp[0] > W - 50;
    s += '<text x="' + (nearR ? W - 2 : sp[0]) + '" y="' + (rv < 0 ? sp[1] + 18 : sp[1] - 9) + '" text-anchor="' + (nearR ? 'end' : 'middle') + '" font-size="11.5" font-weight="700" fill="' + (rv < 0 ? FPJ_COR.neg : FPJ_COR.txt) + '"' + FPJ_HALO + '>' + esc(fpmK(rv)) + '</text>';
  }
  M.forEach((m, i) => { s += '<rect class="fpmHit" data-m="' + m + '" x="' + (pl + bw * i) + '" y="' + pt + '" width="' + bw + '" height="' + (ih + pb - 4) + '" fill="transparent" style="cursor:pointer"/>'; });
  s += '</svg><div class="fpmPq" style="margin:2px 0 0">* mês corrente, até hoje (hachurado)</div>';
  el.innerHTML = s;
  el.querySelectorAll('.fpmHit').forEach(r => {
    const m = r.dataset.m, x = fpmMes(m);
    r.addEventListener('mousemove', e => fpmTip(e, '<b>' + esc(fpmRot(m)) + '</b><div class="l"><span>Entrou</span><span>' + esc(BRL(x.entrou)) + '</span></div>'
      + '<div class="l"><span>Saiu</span><span>' + esc(BRL(x.saiu)) + '</span></div><div class="l"><span>Resultado</span><span>' + esc(fpmBRL(x.entrou - x.saiu)) + '</span></div>'));
    r.addEventListener('mouseleave', fpmTipSai);
    r.addEventListener('click', () => { fpmTipSai(); FINPM.mes = m; fpmRedesenhar(); });
  });
  document.getElementById('fpmTab').innerHTML = '<table class="fpmTabela"><tr><th>Mês</th><th>Entrou</th><th>Saiu</th><th>Resultado</th><th>Acumulado</th></tr>'
    + M.map((m, i) => { const x = fpmMes(m), r = x.entrou - x.saiu, ac = M.slice(0, i + 1).reduce((s, mm) => s + fpmMes(mm).entrou - fpmMes(mm).saiu, 0); return '<tr class="' + (m === k ? 'sel' : '') + '"><td>' + esc(fpmRot(m)) + '</td><td>' + esc(BRL(x.entrou)) + '</td><td>' + esc(BRL(x.saiu)) + '</td><td class="' + (r < 0 ? 'fpmNeg' : '') + '">' + esc(fpmBRL(r)) + '</td><td class="' + (ac < 0 ? 'fpmNeg' : '') + '">' + esc(fpmBRL(ac)) + '</td></tr>'; }).join('') + '</table>';
}

function fpmGrafAcum(k){
  const el = document.getElementById('fpmGrafAcum'); if (!el) return;
  const M = FINPM.meses; let ac = 0;
  const S = M.map(m => { const x = fpmMes(m); ac += x.entrou - x.saiu; return { m, v: ac }; });
  const W = Math.max(240, el.clientWidth || 700), H = 250, pl = 54, pr = 14, pt = 22, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  const E = fpjEscala(S.map(p => p.v), pt, ih, 25000);
  const xs = i => pl + iw * (S.length === 1 ? 0.5 : i / (S.length - 1));
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Resultado acumulado" style="display:block">' + fpjGrade(E, pl, W, pr);
  if (E.min < 0) s += '<rect x="' + pl + '" y="' + E.y(0) + '" width="' + iw + '" height="' + (E.y(E.min) - E.y(0)) + '" fill="' + FPJ_COR.neg + '" opacity=".05"/>';
  const linha = S.map((p, i) => xs(i) + ',' + E.y(p.v)).join(' ');
  s += '<polygon points="' + xs(0) + ',' + E.y(0) + ' ' + linha + ' ' + xs(S.length - 1) + ',' + E.y(0) + '" fill="' + FPM_COR.res + '" opacity=".08"/>';
  s += '<polyline fill="none" stroke="' + FPM_COR.res + '" stroke-width="2.5" points="' + linha + '"/>';
  S.forEach((p, i) => {
    const sel = p.m === k, neg = p.v < 0, x = xs(i), y = E.y(p.v);
    s += '<circle cx="' + x + '" cy="' + y + '" r="' + (sel ? 5.5 : 4) + '" fill="' + (neg ? FPJ_COR.neg : FPM_COR.res) + '" stroke="#fff" stroke-width="2"/>';
    if (sel || i === S.length - 1 || S.length <= 6) s += '<text x="' + x + '" y="' + (neg && y + 18 < H - pb - 2 ? y + 18 : y - 10) + '" text-anchor="' + (i === 0 ? 'start' : i === S.length - 1 ? 'end' : 'middle') + '" font-size="11" font-weight="700" fill="' + (neg ? FPJ_COR.neg : FPJ_COR.txt) + '"' + FPJ_HALO + '>' + esc(fpjK(p.v)) + '</text>';
    s += '<text x="' + x + '" y="' + (H - 10) + '" text-anchor="' + (i === 0 ? 'start' : i === S.length - 1 ? 'end' : 'middle') + '" font-size="11.5" fill="' + (sel ? FPJ_COR.txt : FPJ_COR.txt2) + '" font-weight="' + (sel ? 700 : 400) + '">' + (iw / S.length < 60 ? _FINP_MESES[+p.m.slice(5, 7) - 1] : fpmCurto(p.m)) + (p.m === FINPM.pm.mes_atual ? '*' : '') + '</text>';
    const w = iw / Math.max(1, S.length - 1);
    s += '<rect class="fpjHit" data-i="' + i + '" x="' + (x - w / 2) + '" y="' + pt + '" width="' + w + '" height="' + (ih + pb - 4) + '" fill="transparent" style="cursor:pointer"/>';
  });
  const ult = S[S.length - 1];
  el.innerHTML = s + '</svg><div style="font-size:13px;margin-top:4px">Desde ' + esc(fpmRot(M[0])) + ': <b class="' + (ult.v < 0 ? 'fpmNeg' : 'fpmPos') + '">' + esc(fpmBRL(ult.v)) + '</b>' + (ult.v < 0 ? ' — a empresa consumiu caixa no período.' : ' — a empresa guardou caixa no período.') + '</div>';
  fpjLiga(el, '.fpjHit', r => { const p = S[+r.dataset.i], x = fpmMes(p.m); return '<b>' + esc(fpmRot(p.m)) + '</b>' + fpjLin('Resultado do mês', esc(fpmBRL(x.entrou - x.saiu))) + fpjLin('<b>Acumulado</b>', '<b>' + esc(fpmBRL(p.v)) + '</b>'); });
  el.querySelectorAll('.fpjHit').forEach(r => r.addEventListener('click', () => { fpmTipSai(); FINPM.mes = S[+r.dataset.i].m; fpmRedesenhar(); }));
}

function fpmDespesas(k){
  const x = fpmMes(k), ant = fpmAnteriores(k, 3);
  const tot = subs => Object.values(subs || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const gs = Object.keys(x.grupos || {}).map(g => ({ g, tot: tot(x.grupos[g]),
      med: ant.length ? ant.reduce((s, m) => s + tot((fpmMes(m).grupos || {})[g]), 0) / ant.length : null,
      subs: Object.entries(x.grupos[g]).map(([s, v]) => [s || '(sem subcategoria)', Number(v) || 0]).sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.tot - a.tot);
  const max = Math.max(1, ...gs.map(z => Math.max(z.tot, z.med || 0)));
  let h = '';
  gs.forEach(z => {
    const ab = FINPM.abertos.has(z.g);
    h += '<div class="fpmLin fpmGrupo' + (ab ? ' aberto' : '') + '" data-g="' + esc(z.g) + '" role="button" tabindex="0">'
      + '<span class="fpmNome" title="' + esc(z.g) + '"><i class="fpmDot" style="background:' + fpmGrupoCor(z.g) + '"></i> ' + esc(z.g) + '</span>'
      + '<span class="fpmTrilho"><span class="b" style="width:' + (100 * z.tot / max) + '%;background:' + fpmGrupoCor(z.g) + '"></span>'
      + (z.med !== null ? '<span class="med" style="left:' + (100 * z.med / max) + '%" title="média dos 3 meses antes: ' + esc(BRL(z.med)) + '"></span>' : '') + '</span>'
      + '<span class="fpmN">' + esc(fpmK(z.tot)) + ' ' + fpmDelta(z.tot, z.med, true) + (z.med !== null ? '<small>média ' + esc(fpmK(z.med)) + '</small>' : '') + '</span></div>';
    if (ab) z.subs.slice(0, 15).forEach(sb => { h += fpmBarra(sb[0], sb[1], max, fpmGrupoCor(z.g), esc(BRL(sb[1])), null, 'fpmSub'); });
  });
  if (x.cartao > 0) h += '<p class="fpmPq" style="margin:8px 0 0">Fatura de cartão: <b>' + esc(BRL(x.cartao)) + '</b> (' + fpmPct(x.cartao / (x.saiu || 1)) + ' do que saiu) — lançada como uma conta só, sem dizer com o que foi gasto.</p>';
  return '<div class="painel fpmCard"><h3>Para onde foi o dinheiro</h3><p class="fpmPq">Despesas pagas no mês por grupo. O traço preto é a média dos 3 meses anteriores; a etiqueta diz quanto acima ou abaixo. Clique para abrir as subcategorias.</p>'
    + (gs.length ? h : '<p class="nota">Nada pago neste mês.</p>') + '</div>';
}

function fpmGrafGrupos(k){
  const el = document.getElementById('fpmGrafGrupos'); if (!el) return;
  const M = FINPM.meses, tot = subs => Object.values(subs || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const grupos = [...new Set(M.flatMap(m => Object.keys(fpmMes(m).grupos || {})))].sort((a, b) => (FPM_GRUPO_COR[a] ? 0 : 1) - (FPM_GRUPO_COR[b] ? 0 : 1) || a.localeCompare(b));
  const W = Math.max(240, el.clientWidth || 700), H = 240, pl = 54, pr = 10, pt = 22, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  const totais = M.map(m => Object.values(fpmMes(m).grupos || {}).reduce((t, g) => t + tot(g), 0));
  const E = fpjEscala(totais, pt, ih, 25000);
  const bw = iw / M.length, barW = Math.min(44, bw * 0.55);
  let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Despesas por grupo, mês a mês" style="display:block">' + fpjDefs(grupos.map(fpmGrupoCor)) + fpjGrade(E, pl, W, pr);
  M.forEach((m, i) => {
    const x = fpmMes(m), cx = pl + bw * i + bw / 2, sel = m === k, parcial = m === FINPM.pm.mes_atual; let acc = 0;
    grupos.forEach(g => { const v = tot((x.grupos || {})[g]); if (v > 0.009){ s += '<rect x="' + (cx - barW / 2) + '" y="' + E.y(acc + v) + '" width="' + barW + '" height="' + Math.max(1, E.y(acc) - E.y(acc + v) - (acc ? 1.5 : 0)) + '" fill="' + (parcial ? fpjHach(fpmGrupoCor(g)) : fpmGrupoCor(g)) + '" opacity="' + (sel ? 1 : 0.7) + '"/>'; acc += v; } });
    s += '<text x="' + cx + '" y="' + (E.y(acc) - 5) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + FPJ_COR.txt + '"' + FPJ_HALO + '>' + esc(fpjK(acc)) + '</text>';
    s += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11.5" fill="' + (sel ? FPJ_COR.txt : FPJ_COR.txt2) + '" font-weight="' + (sel ? 700 : 400) + '">' + (bw < 60 ? _FINP_MESES[+m.slice(5, 7) - 1] : fpmCurto(m)) + (parcial ? '*' : '') + '</text>';
    s += '<rect class="fpjHit" data-m="' + m + '" x="' + (pl + bw * i) + '" y="' + pt + '" width="' + bw + '" height="' + (ih + pb - 4) + '" fill="transparent" style="cursor:pointer"/>';
  });
  el.innerHTML = s + '</svg><div class="fpmLeg">' + grupos.map(g => '<span><i style="background:' + fpmGrupoCor(g) + '"></i>' + esc(g) + '</span>').join('') + '</div>';
  fpjLiga(el, '.fpjHit', r => { const x = fpmMes(r.dataset.m); return '<b>' + esc(fpmRot(r.dataset.m)) + '</b>' + grupos.map(g => { const v = tot((x.grupos || {})[g]); return v ? fpjLin(esc(g), esc(fpjFmt(v))) : ''; }).join('') + fpjLin('<b>Total</b>', '<b>' + esc(BRL(x.saiu)) + '</b>'); });
  el.querySelectorAll('.fpjHit').forEach(r => r.addEventListener('click', () => { fpmTipSai(); FINPM.mes = r.dataset.m; fpmRedesenhar(); }));
}

function fpmClientes(k){
  const x = fpmMes(k), tot = x.entrou || 1, i = FINPM.meses.indexOf(k), janela = FINPM.meses.slice(Math.max(0, i - 5), i + 1);
  const L = (x.clientes || []).slice(0, 6).map(c => [c[0], Number(c[1]) || 0]);
  const resto = (x.clientes || []).slice(6).reduce((s, c) => s + (Number(c[1]) || 0), 0);
  const max = Math.max(1, ...L.map(c => c[1]));
  const hist = nome => janela.map(m => { const c = (fpmMes(m).clientes || []).find(z => z[0] === nome); return c ? Number(c[1]) || 0 : 0; });
  const meses = nome => hist(nome).filter(v => v > 0).length;
  let h = L.map(c => '<div class="fpmLin"><span class="fpmNome" title="' + esc(c[0]) + '">' + esc(c[0]) + '</span>'
    + '<span class="fpmTrilho"><span class="b" style="width:' + (100 * c[1] / max) + '%;background:' + FPM_COR.entrou + '"></span></span>'
    + '<span class="fpmN">' + esc(fpmK(c[1])) + '<small>' + fpmPct(c[1] / tot) + ' · <span data-tip="' + esc('pagou em ' + meses(c[0]) + ' dos últimos ' + janela.length + ' meses') + '">' + fpmSpark(hist(c[0]), FPM_COR.entrou, janela.indexOf(k)) + '</span></small></span></div>').join('');
  if (resto > 0) h += fpmBarra('Outros (' + ((x.clientes || []).length - 6) + ')', resto, max, '#9CCBAE', esc(fpmK(resto)) + '<small>' + fpmPct(resto / tot) + '</small>');
  const top3 = L.slice(0, 3).reduce((s, c) => s + c[1], 0);
  return '<div class="painel fpmCard"><h3>De onde veio</h3><p class="fpmPq">Recebimentos do mês por cliente (filiais do mesmo CNPJ juntas). As barrinhas mostram os últimos ' + janela.length + ' meses de cada um: cliente que repete é base; cliente que aparece uma vez é oportunidade.' + (L.length > 2 && top3 / tot >= 0.6 ? ' <b>Os 3 maiores são ' + esc(fpmPct(top3 / tot)) + ' do mês.</b>' : '') + '</p>'
    + (L.length ? h : '<p class="nota">Nada recebido neste mês.</p>') + '</div>';
}

function fpmReceber(){
  const R = (FINPM.pm.abertos || []).filter(a => a.t === 'r').map(a => ({ ...a, v: Number(a.v) || 0 }));
  const faixas = [['Vencido', a => fpmDias(a.d) < 0, FPJ_COR.neg], ['Até 30 dias', a => fpmDias(a.d) >= 0 && fpmDias(a.d) <= 30, FPM_COR.entrou],
                  ['31 a 60', a => fpmDias(a.d) > 30 && fpmDias(a.d) <= 60, '#5FA77B'], ['61 a 90', a => fpmDias(a.d) > 60 && fpmDias(a.d) <= 90, '#9CCBAE'],
                  ['Mais de 90', a => fpmDias(a.d) > 90, '#C9E3D2']];
  const grupos = faixas.map(f => R.filter(f[1])), tots = grupos.map(L => L.reduce((s, a) => s + a.v, 0));
  const total = tots.reduce((a, b) => a + b, 0);
  const regua = total ? '<div class="fpmSeg" style="height:22px;margin:4px 0 6px">' + faixas.map((f, i) => tots[i] > 0 ? '<span data-tip="' + esc(f[0] + ': ' + BRL(tots[i]) + ' · ' + grupos[i].map(a => a.q + ' ' + fpmK(a.v)).join(' · ')) + '" style="width:' + (100 * tots[i] / total) + '%;background:' + f[2] + '"></span>' : '').join('') + '</div>'
    + '<div class="fpmLeg" style="margin:0 0 10px">' + faixas.map((f, i) => tots[i] > 0 || i < 2 ? '<span><i style="background:' + f[2] + '"></i>' + esc(f[0]) + ' <b>' + esc(fpjK(tots[i])) + '</b> <small>(' + grupos[i].length + ')</small></span>' : '').join('') + '</div>' : '';
  // quem deve, com a parte vencida em vermelho
  const cl = {}; R.forEach(a => { const c = cl[a.q] = cl[a.q] || { v: 0, venc: 0 }; c.v += a.v; if (fpmDias(a.d) < 0) c.venc += a.v; });
  const top = Object.entries(cl).sort((a, b) => b[1].v - a[1].v), max = Math.max(1, ...top.map(c => c[1].v));
  const lista = top.slice(0, 6).map(c => '<div class="fpmLin"><span class="fpmNome" title="' + esc(c[0]) + '">' + esc(c[0]) + '</span>'
    + '<span class="fpmTrilho"><span class="b" style="width:' + (100 * c[1].v / max) + '%;background:' + FPM_COR.entrou + '"></span>' + (c[1].venc ? '<span class="b" style="width:' + (100 * c[1].venc / max) + '%;background:' + FPJ_COR.neg + '" title="vencido ' + esc(BRL(c[1].venc)) + '"></span>' : '') + '</span>'
    + '<span class="fpmN">' + esc(fpmK(c[1].v)) + (c[1].venc ? '<small class="fpmNeg">vencido ' + esc(fpmK(c[1].venc)) + '</small>' : '') + '</span></div>').join('')
    + (top.length > 6 ? '<p class="fpmPq" style="margin:4px 0 0">+ ' + (top.length - 6) + ' clientes.</p>' : '');
  return '<div class="painel fpmCard"><h3>A receber <small class="fpmHoje">· posição de hoje</small></h3>'
    + '<p class="fpmPq">Em aberto: <b>' + esc(BRL(total)) + '</b> em ' + finPlural(R.length, 'título', 'títulos') + ' (os "a faturar" estão com vencimento estimado). A régua divide pelo prazo; abaixo, quem deve.</p>'
    + (R.length ? regua + lista : '<p class="nota">Nada em aberto.</p>')
    + (grupos[0].length ? '<p class="fpmPq" style="margin:8px 0 0"><b>Vencidos:</b> ' + grupos[0].map(a => esc(a.q) + ' ' + esc(BRL(a.v)) + ' (desde ' + esc(dataBR(a.d).slice(0, 5)) + ')').join(' · ') + '. <button class="fpmLk" type="button" data-ir="finre:vencidas">Contas a Receber</button></p>' : '')
    + '</div>';
}

function fpmPagarDados(){
  const ab = FINPM.pm.abertos || [];
  const P = ab.filter(a => a.t === 'p' && !a.provisao && fpmDias(a.d) <= 30).map(a => ({ ...a, v: Number(a.v) || 0 }));
  const RL = ab.filter(a => a.t === 'r' && fpmDias(a.d) <= 30).map(a => ({ ...a, v: Number(a.v) || 0 }));
  return { P, RL, tp: fpmTot(P), rec30: fpmTot(RL), saldo: fpmSaldoOp() };
}

function fpmPagar(){
  const D = fpmPagarDados(), fim = D.saldo + D.rec30 - D.tp, R30 = fpjRecorrentes30();
  return '<div class="painel fpmCard"><h3>A pagar nos próximos 30 dias <small class="fpmHoje">· só o lançado</small></h3><p class="fpmPq">O dinheiro em conta, mais o que está lançado para entrar, menos o que está lançado para sair, nos próximos 30 dias.</p>'
    + '<div id="fpmGrafPagar"></div>'
    + '<div style="font-size:13px;margin-top:6px">Com o que está lançado: <b class="' + (fim < 0 ? 'fpmNeg' : 'fpmPos') + '">' + esc(fpmBRL(fim)) + '</b> daqui a 30 dias.</div>'
    + (R30.n ? '<div class="fpmChamada" style="margin-top:8px"><div>⚠ Ainda <b>não lançadas</b> e vencendo nestes 30 dias: ' + finPlural(R30.n, 'recorrência', 'recorrências') + ' (' + esc(BRL(R30.v)) + ') — '
        + esc(R30.nomes) + '. Não estão somadas aqui.</div><button type="button" class="btn" data-ir="fincr">Ver em Projeções →</button></div>' : '')
    + (D.P.length ? '<p class="fpmPq" style="margin:6px 0 0">Maiores a pagar: ' + D.P.slice().sort((a, b) => b.v - a.v).slice(0, 4).map(a => esc(a.q) + ' ' + esc(fpmK(a.v))).join(' · ') + '. A provisão mensal (reserva) não entra.</p>' : '')
    + (fpmReservas().length ? '<p class="fpmPq" style="margin:4px 0 0">Fora daqui: ' + fpmReservas().map(c => '<span data-tip="' + esc(fpmResTip(c)) + '">' + (c.caixinhas ? 'a reserva nas caixinhas' : esc(c.nome)) + ' ' + esc(fpmK(Number(c.saldo) || 0)) + fpmResSemIni(c) + '</span>').join(' · ') + '.</p>' : '')
    + '</div>';
}

function fpmGrafPagar(){
  const el = document.getElementById('fpmGrafPagar'); if (!el) return;
  const D = fpmPagarDados();
  fpjCascata(el, [
    { rot: 'Saldo nas contas hoje', rotCurto: 'Saldo hoje', v: D.saldo, tipo: 'tot' },
    { rot: '+ A receber em 30 dias', rotCurto: '+ Receber', v: D.rec30, cor: FPM_COR.entrou, quem: D.RL.slice().sort((a, b) => b.v - a.v).slice(0, 4).map(a => a.q + ' ' + fpmK(a.v)).join(' · ') },
    { rot: '− A pagar em 30 dias', rotCurto: '− Pagar', v: -D.tp, cor: FPM_COR.saiu, quem: D.P.slice().sort((a, b) => b.v - a.v).slice(0, 4).map(a => a.q + ' ' + fpmK(a.v)).join(' · ') },
    { rot: 'Daqui a 30 dias', rotCurto: 'Em 30 dias', v: D.saldo + D.rec30 - D.tp, tipo: 'tot' }]);
}

function fpmMedidor(v, max, limite, cor, inverso){
  const p = Math.max(0, Math.min(1, v / max)), l = Math.max(0, Math.min(1, limite / max));
  const ruim = inverso ? v < limite : v > limite;
  return '<div class="fpmMed"><div class="t"><span style="width:' + (100 * p).toFixed(1) + '%;background:' + (ruim ? FPJ_COR.neg : cor) + '"></span><i style="left:' + (100 * l).toFixed(1) + '%"></i></div></div>';
}

function fpmIndicadores(k){
  const atual = k === FINPM.pm.mes_atual, i = FINPM.meses.indexOf(k);
  const base = atual ? fpmAnteriores(k, 3) : FINPM.meses.slice(Math.max(0, i - 2), i + 1);
  if (!base.length) return '';
  const soma = f => base.reduce((s, m) => s + f(fpmMes(m)), 0);
  const per = fpmCurto(base[0]) + (base.length > 1 ? ' a ' + fpmCurto(base[base.length - 1]) : '');
  const ent = soma(m => m.entrou), entMed = ent / base.length, folha = ent ? soma(m => m.folha) / ent : 0;
  const eq = soma(m => m.fixas) / base.length, saiMed = soma(m => m.saiu) / base.length;
  const saldo = fpmSaldoOp() + fpmReservas().reduce((s, c) => s + (Number(c.saldo) || 0), 0), semInicial = (FINPM.pm.contas || []).some(c => !Number(c.saldo_inicial) && (c.papel === 'operacional' || !FINPM.pm.reserva));   // FP3: a reserva das caixinhas não tem "saldo inicial" de conta
  const cl = {}; base.forEach(m => (fpmMes(m).clientes || []).forEach(([n, v]) => cl[n] = (cl[n] || 0) + (Number(v) || 0)));
  const top = Object.entries(cl).sort((a, b) => b[1] - a[1]);
  const conc = ent ? ((top[0] ? top[0][1] : 0) + (top[1] ? top[1][1] : 0)) / ent : 0;
  const folego = saiMed ? saldo / saiMed : 0;
  const card = (rot, val, med, exp, cls) => '<div class="painel fpmTile"><div class="fpmRot">' + rot + '</div><div class="fpmVal ' + (cls || '') + '" style="font-size:20px">' + val + '</div>' + med + '<div class="fpmExp">' + exp + '</div></div>';
  return card('Peso da folha', fpmPct(folha), fpmMedidor(folha, 1, 0.5, FPM_COR.saiu), 'Salários, encargos, benefícios e pró-labore ÷ o que entrou (' + per + '). O traço é 50%: acima disso sobra pouco para o resto.', folha > 0.5 ? 'fpmNeg' : '')
    + card('Ponto de equilíbrio', esc(fpmK(eq)) + '/mês', fpmMedidor(eq, Math.max(eq, entMed) * 1.15, entMed, FPM_COR.saiu), 'Média das Despesas Fixas + Pessoal (' + per + '): o mínimo que precisa entrar todo mês. O traço é o que entrou em média (' + esc(fpmK(entMed)) + ').', eq > entMed ? 'fpmNeg' : '')
    + card('Fôlego de caixa', saiMed ? folego.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + (folego === 1 ? ' mês' : ' meses') : '—', fpmMedidor(folego, 3, 1, FPM_COR.res, true), 'Saldo de hoje nas contas e na reserva ÷ média do que saiu por mês (' + per + '). O traço é 1 mês.' + (semInicial ? ' Provisório: há conta sem saldo inicial.' : ''), saiMed && folego < 1 ? 'fpmNeg' : '')
    + card('Concentração', fpmPct(conc), fpmMedidor(conc, 1, 0.4, FPM_COR.entrou), 'Os 2 maiores clientes (' + per + '): ' + (top[0] ? esc(top[0][0]) : '—') + (top[1] ? ' e ' + esc(top[1][0]) : '') + '. O traço é 40%: acima disso, perder um deles pesa.', conc > 0.4 ? 'fpmNeg' : '');
}

