/* placa-pdf.js · P1 (S155 · issue 8) — a arte da PLACA DE IDENTIFICAÇÃO do vaso, para a gráfica.
   Puro: dados do vaso + contornos das letras (vendor/placa-letras.js) + biblioteca de QR code (vendor/qrcode.js)
   → os bytes de um PDF de 120 × 100 mm.

   O que a gráfica pediu (Bruno, 12/11/2026):
     · LETRAS EM CURVAS: nenhum texto vai como fonte; cada letra é desenhada pelo contorno (o PDF não tem fonte nenhuma);
     · CMYK: toda cor é escrita em CMYK (operadores k/K e o degradê do símbolo em DeviceCMYK); o preto é só K;
     · SEM MARGEM: a página tem exatamente o tamanho da placa (sem sobra para corte, sem marcas).
   Por isso o PDF é escrito aqui mesmo, operador por operador (sem pdfmake nem pdf-lib): uma página, um conteúdo, um degradê.

   Modelos (os dois primeiros da issue 8):
     · 'vaso'  — uma câmara, uma PMTA;
     · '2pmta' — duas PMTA: vácuo (interna e externa) ou duas câmaras (casco e tubo).
   Tanque/tubulação e caldeira ficam para depois: modelo() devolve o motivo.

   As pressões chegam em MPa (regra 4 do TapDoc) e saem na placa em kgf/cm², como no modelo de hoje. */
(function (raiz) {
'use strict';
const VERSAO = 'P1';
const MM = 72 / 25.4, W = 120 * MM, H = 100 * MM;
const KGF = 10.197162;                                   // 1 MPa em kgf/cm²

// cores (CMYK, de 0 a 1)
const PRETO = [0, 0, 0, 1], BRANCO = [0, 0, 0, 0], FUNDO = [0, 0, 0, 0.07];
const AZUL = [0.99, 0.32, 0.01, 0], NOME = [0, 0, 0, 0.70];        // o azul do arquivo oficial; o nome em cinza (identidade nova)
const GRAD = { de: [1, 0.86, 0.25, 0.01], ate: [0.79, 0.32, 0.01, 0] };   // o degradê do símbolo, do arquivo oficial
const LOGO_L = 368.7, LOGO_A = 88.7;                    // largura e altura do logo sem o ® (unidades do arquivo)

const n2 = (v) => { const s = (Math.round(v * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, '') || '0'; };
const num = (v, casas) => (v == null || v === '' || !isFinite(Number(v))) ? '' : Number(v).toFixed(casas).replace('.', ',');
const kgf = (mpa) => (mpa == null || mpa === '' || !isFinite(Number(mpa))) ? '' : num(Number(mpa) * KGF, 2);
const limpo = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// ── o modelo e o que falta ──────────────────────────────────────────────────
function camarasDe(v){ return (v.camaras || []).filter(Boolean); }
function modelo(v){
  const tipo = v.nr13_tipo || 'vaso', cs = camarasDe(v);
  if (tipo !== 'vaso') return { modelo: null, motivo: 'A placa de ' + (tipo === 'caldeira' ? 'caldeira' : tipo === 'tubulacao' ? 'tubulação' : tipo) + ' ainda não é gerada pelo sistema (só vaso e vaso com 2 PMTA).' };
  if (!cs.length) return { modelo: null, motivo: 'O vaso não tem câmara no resultado.' };
  const ext = cs.filter(c => c.pmta_externa_mpa != null);
  if (cs.length === 1) return { modelo: ext.length ? '2pmta' : 'vaso' };
  if (cs.length === 2 && !ext.length) return { modelo: '2pmta' };
  return { modelo: null, motivo: 'Vaso com mais de duas PMTA: a placa ainda é feita à mão.' };
}
/** O que impede a placa de sair (lista vazia = pode gerar). */
function faltas(v){
  const f = [], m = modelo(v);
  if (!m.modelo) f.push(m.motivo);
  if (!limpo(v.tag)) f.push('Falta a TAG do vaso.');
  if (!limpo(v.tapweb_link)) f.push('Falta o link da ficha do vaso no TapWeb (o QR code).');
  if (!limpo(v.numero_tap)) f.push('Falta o Nº TAP do vaso.');
  if (!limpo(v.categoria)) f.push('Falta a categoria (resultado liberado).');
  if (m.modelo && camarasDe(v).some(c => c.pmta_mpa == null)) f.push('Falta a PMTA no resultado.');
  return f;
}
function codigoDe(v){
  if (v.sem_codigo_construcao) return 'Sem código de construção';
  const c = limpo(v.codigo_construcao), e = limpo(v.codigo_edicao);
  if (c) return c + (e ? ' / ' + e : '');
  return 'ASME Seção VIII Divisão 1 - Adotado';          // sem código na placa nem no prontuário: o adotado para o cálculo (texto do laudo)
}
function fluidoDe(v){
  const fs = []; camarasDe(v).forEach(c => { const f = limpo(c.fluido); if (f && fs.indexOf(f) < 0) fs.push(f); });
  return fs.length ? fs.join(' / ') : limpo(v.fluido);
}
function rotuloCamara(c, i, cs){
  if (cs.length === 1) return i === 0 ? 'INTERNA' : 'EXTERNA';
  const t = c.tipo === 'casco' ? 'CASCO' : c.tipo === 'tubo' ? 'TUBO' : c.tipo === 'camisa' ? 'CAMISA' : '';
  return t || limpo(c.nome).toUpperCase() || ('CÂMARA ' + (i + 1));
}
/** Os textos como saem na placa (a tela mostra e os testes conferem) e os avisos do que saiu em branco. */
function campos(v, ctx){
  ctx = ctx || {}; const cs = camarasDe(v), m = modelo(v).modelo, avisos = [];
  const em = ctx.emissora || {};
  const c = {
    modelo: m, tag: limpo(v.tag), fabricante: limpo(v.fabricante), ano: v.ano_fabricacao ? String(v.ano_fabricacao) : '',
    categoria: limpo(v.categoria), classe: limpo(v.classe_fluido), tap: limpo(v.numero_tap), codigo: codigoDe(v),
    volume: num(v.volume_m3, 3), fluido: fluidoDe(v), cliente: limpo(ctx.cliente).toUpperCase(), qr: limpo(v.tapweb_link),
    emissora: { linhas: (em.linhas || []).map(limpo).filter(Boolean).slice(0, 2), cnpj: limpo(em.cnpj), site: limpo(em.site) },
    pressoes: []
  };
  if (m === 'vaso') c.pressoes = [{ rotulo: '', pmta: kgf(cs[0].pmta_mpa), pth: kgf(cs[0].pth_mpa != null ? cs[0].pth_mpa : v.pth_mpa) }];
  else if (m === '2pmta' && cs.length === 1) c.pressoes = [
    { rotulo: 'INTERNA', pmta: kgf(cs[0].pmta_mpa), pth: kgf(cs[0].pth_mpa != null ? cs[0].pth_mpa : v.pth_mpa) },
    { rotulo: 'EXTERNA', pmta: kgf(cs[0].pmta_externa_mpa), pth: null }];
  else if (m === '2pmta') c.pressoes = cs.map((k, i) => ({ rotulo: rotuloCamara(k, i, cs), pmta: kgf(k.pmta_mpa), pth: kgf(k.pth_mpa) }));
  if (!c.fabricante){ c.fabricante = 'Não identificado'; avisos.push('Sem fabricante no cadastro: sai "Não identificado".'); }
  if (!c.ano){ c.ano = '—'; avisos.push('Sem ano de fabricação: sai um traço.'); }
  if (c.pressoes.some(p => p.pth === '')){ c.pressoes.forEach(p => { if (p.pth === '') p.pth = '—'; }); avisos.push('Sem a pressão de teste hidrostático de fabricação (PTH): sai um traço.'); }
  if (!c.classe){ c.classe = '—'; avisos.push('Sem a classe do fluido: sai um traço.'); }
  if (!c.volume){ c.volume = '—'; avisos.push('Sem o volume: sai um traço.'); }
  if (!c.fluido){ c.fluido = '—'; avisos.push('Sem o fluido: sai um traço.'); }
  if (!v.sem_codigo_construcao && !limpo(v.codigo_construcao)) avisos.push('Sem código de construção no cadastro: sai "ASME Seção VIII Divisão 1 - Adotado".');
  if (!c.emissora.linhas.length || !c.emissora.cnpj) avisos.push('Faltam os dados da Engetap no cabeçalho da placa.');
  return { campos: c, avisos };
}

// ── as letras em curvas ─────────────────────────────────────────────────────
const SEM_ACENTO = (ch) => { try { return ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { return ch; } };
function Letras(L){
  const cache = {};
  function glifo(peso, ch){
    const t = L[peso] || L.n;
    if (t[ch]) return { g: t[ch], ch };
    const b = SEM_ACENTO(ch);
    if (b && b !== ch && b.length === 1 && t[b]) return { g: t[b], ch: b, troca: true };
    return { g: t['?'], ch: '?', troca: true };
  }
  function comandos(peso, ch, g){
    const k = peso + ch; if (cache[k]) return cache[k];
    const out = []; const re = /([MLQCZ])([^MLQCZ]*)/g; let m;
    while ((m = re.exec(g[1]))) out.push([m[1]].concat(m[2].trim() ? m[2].trim().split(/\s+/).map(Number) : []));
    return (cache[k] = out);
  }
  /** largura do texto em pontos */
  function largura(txt, peso, tam){ let w = 0; for (const ch of String(txt)) w += glifo(peso, ch).g[0]; return w * tam / L.em; }
  /** os operadores do texto (só os caminhos; quem chama pinta), com a linha de base em (x, y); ex = achatar na largura */
  function caminho(txt, peso, tam, x, y, ex, trocas){
    const s = tam / L.em, sx = s * (ex || 1); let pen = 0; const o = [];
    for (const ch0 of String(txt)){
      const G = glifo(peso, ch0); if (G.troca && trocas) trocas.push(ch0);
      let cx = 0, cy = 0;
      for (const c of comandos(peso, G.ch, G.g)){
        const X = (i) => x + (pen + c[i]) * sx, Y = (i) => y + c[i] * s;
        if (c[0] === 'M'){ o.push(n2(X(1)) + ' ' + n2(Y(2)) + ' m'); cx = c[1]; cy = c[2]; }
        else if (c[0] === 'L'){ o.push(n2(X(1)) + ' ' + n2(Y(2)) + ' l'); cx = c[1]; cy = c[2]; }
        else if (c[0] === 'Q'){                                   // quadrática → cúbica
          const a1 = cx + 2 / 3 * (c[1] - cx), b1 = cy + 2 / 3 * (c[2] - cy), a2 = c[3] + 2 / 3 * (c[1] - c[3]), b2 = c[4] + 2 / 3 * (c[2] - c[4]);
          o.push(n2(x + (pen + a1) * sx) + ' ' + n2(y + b1 * s) + ' ' + n2(x + (pen + a2) * sx) + ' ' + n2(y + b2 * s) + ' ' + n2(X(3)) + ' ' + n2(Y(4)) + ' c');
          cx = c[3]; cy = c[4];
        }
        else if (c[0] === 'C'){ o.push(n2(X(1)) + ' ' + n2(Y(2)) + ' ' + n2(X(3)) + ' ' + n2(Y(4)) + ' ' + n2(X(5)) + ' ' + n2(Y(6)) + ' c'); cx = c[5]; cy = c[6]; }
        else if (c[0] === 'Z') o.push('h');
      }
      pen += G.g[0];
    }
    return o;
  }
  return { largura, caminho };
}

// ── o QR code (módulos em vetor) ────────────────────────────────────────────
function qrModulos(qrcode, texto){
  const q = qrcode(0, 'M'); q.addData(String(texto)); q.make();
  const n = q.getModuleCount(), linhas = [];
  for (let r = 0; r < n; r++){ const l = []; for (let c = 0; c < n; c++) l.push(q.isDark(r, c)); linhas.push(l); }
  return { n, linhas };
}

// ── o desenho ───────────────────────────────────────────────────────────────
/** Monta o conteúdo da página (texto de operadores PDF). */
function conteudo(C, L, qr){
  const T = Letras(L), o = [], trocas = [], apertos = [];
  const cor = (c) => o.push(c.map(n2).join(' ') + ' k');
  const traco = (c) => o.push(c.map(n2).join(' ') + ' K');
  const ret = (x, y, w, h) => o.push([x, y, w, h].map(n2).join(' ') + ' re');
  /** texto em curvas: alinhamento 'e' (esquerda), 'c' (centro); larguraMax encolhe a letra e, no limite, achata */
  function texto(txt, x, y, o2){
    o2 = o2 || {}; const peso = o2.negrito ? 'b' : 'n'; let tam = o2.tam || 6.4, ex = 1; txt = String(txt == null ? '' : txt);
    if (!txt) return 0;
    if (o2.max){
      let w = T.largura(txt, peso, tam);
      if (w > o2.max){ tam = Math.max(o2.min || 5, tam * o2.max / w); w = T.largura(txt, peso, tam); }
      if (w > o2.max){ ex = o2.max / w; apertos.push(txt); }
    }
    const w = T.largura(txt, peso, tam) * ex, x0 = o2.al === 'c' ? x - w / 2 : x;
    cor(o2.cor || PRETO); T.caminho(txt, peso, tam, x0, y, ex, trocas).forEach(l => o.push(l)); o.push('f');
    return w;
  }
  const rot = (x, y, txt, tam) => String(txt).split('\n').forEach((t, i) => texto(t, x, y - i * 2.6 * MM, { negrito: true, tam: tam || 6.4 }));
  function caixa(x, y, w, txt, tam){
    cor(BRANCO); traco(PRETO); o.push('0.4 w'); ret(x, y - 1.6 * MM, w, 6 * MM); o.push('B');
    const max = w - 1.6 * MM; tam = tam || 10.5; txt = String(txt == null ? '' : txt);
    // texto que não cabe nem com a letra em 6: vai em duas linhas (parte no espaço mais perto do meio)
    if (T.largura(txt, 'n', 6) > max && txt.indexOf(' ') > 0){
      let melhor = -1; const meio = txt.length / 2;
      for (let i = 0; i < txt.length; i++) if (txt[i] === ' ' && (melhor < 0 || Math.abs(i - meio) < Math.abs(melhor - meio))) melhor = i;
      const l1 = txt.slice(0, melhor), l2 = txt.slice(melhor + 1);
      const t2 = Math.min(6.5, 6.5 * max / Math.max(T.largura(l1, 'n', 6.5), T.largura(l2, 'n', 6.5)));
      texto(l1, x + w / 2, y + 1.9 * MM, { tam: t2, al: 'c', max, min: 4 }); texto(l2, x + w / 2, y - 0.5 * MM, { tam: t2, al: 'c', max, min: 4 });
      return;
    }
    texto(txt, x + w / 2, y, { tam, al: 'c', max, min: 6 });
  }
  function un(x, y, t){                                    // "kgf/cm²": o expoente menor e levantado
    const base = t.replace(/[²³]$/, ''), w = texto(base, x, y, { tam: 6 });
    if (base !== t) texto(/²$/.test(t) ? '2' : '3', x + w + 0.2 * MM, y + 1.0 * MM, { tam: 4.5 });
  }

  // fundo e moldura (dentro da página: a placa não tem sobra para corte)
  const r = 3 * MM, bx = 1.2 * MM, by = 1.2 * MM, bw = W - 2.4 * MM, bh = H - 2.4 * MM, k = 0.5523 * r;
  cor(FUNDO); traco(PRETO); o.push(n2(1.8 * MM) + ' w');
  o.push(n2(bx + r) + ' ' + n2(by) + ' m', n2(bx + bw - r) + ' ' + n2(by) + ' l',
    [bx + bw - r + k, by, bx + bw, by + r - k, bx + bw, by + r].map(n2).join(' ') + ' c', n2(bx + bw) + ' ' + n2(by + bh - r) + ' l',
    [bx + bw, by + bh - r + k, bx + bw - r + k, by + bh, bx + bw - r, by + bh].map(n2).join(' ') + ' c', n2(bx + r) + ' ' + n2(by + bh) + ' l',
    [bx + r - k, by + bh, bx, by + bh - r + k, bx, by + bh - r].map(n2).join(' ') + ' c', n2(bx) + ' ' + n2(by + r) + ' l',
    [bx, by + r - k, bx + r - k, by, bx + r, by].map(n2).join(' ') + ' c', 'h B');

  // logo oficial (com o ®), em vetor: 50 mm de largura, no alto à esquerda
  const s = 50 * MM / LOGO_L, lx = 5 * MM, ly = H - 19 * MM + (14 * MM - LOGO_A * s) / 2;
  o.push('q', [s, 0, 0, s, lx, ly].map(v => (Math.round(v * 100000) / 100000).toString()).join(' ') + ' cm');
  (L.logo.formas || []).forEach(f => {
    const d = f.d.replace(/([MLCZ])/g, ' $1 ').trim().split(/\s+/), ops = []; let i = 0;
    while (i < d.length){
      const c = d[i++];
      if (c === 'M'){ ops.push(d[i] + ' ' + d[i + 1] + ' m'); i += 2; }
      else if (c === 'L'){ ops.push(d[i] + ' ' + d[i + 1] + ' l'); i += 2; }
      else if (c === 'C'){ ops.push(d.slice(i, i + 6).join(' ') + ' c'); i += 6; }
      else if (c === 'Z') ops.push('h');
    }
    if (f.g) o.push('q', ops.join('\n'), 'W n', f.g.join(' ') + ' cm', '/Sh0 sh', 'Q');
    else { cor(f.c === 'nome' ? NOME : AZUL); o.push(ops.join('\n'), 'f'); }
  });
  o.push('Q');

  // cabeçalho: a Engetap
  const cx = 81 * MM;
  C.emissora.linhas.forEach((t, i) => texto(t, cx, H - 8 * MM - i * 3 * MM, { negrito: true, tam: 7.2, al: 'c', max: 52 * MM }));
  if (C.emissora.cnpj) texto('CNPJ: ' + C.emissora.cnpj, cx, H - 14 * MM, { negrito: true, tam: 6.6, al: 'c', max: 52 * MM });
  if (C.emissora.site) texto(C.emissora.site, cx, H - 17 * MM, { negrito: true, tam: 6.6, al: 'c', max: 52 * MM });

  // QR code: 21 mm com a margem branca de 1 módulo
  const ql = 21 * MM, qx = 95 * MM, qy = H - 45 * MM, mod = ql / (qr.n + 2);
  cor(BRANCO); ret(qx, qy, ql, ql); o.push('f'); cor(PRETO);
  qr.linhas.forEach((l, rr) => {
    let c = 0;
    while (c < qr.n){
      if (!l[c]){ c++; continue; }
      let f = c; while (f < qr.n && l[f]) f++;
      ret(qx + (c + 1) * mod, qy + ql - (rr + 2) * mod - 0.02, (f - c) * mod, mod + 0.02); c = f;      // corridas na linha; 0,02 pt de sobra tira o fio branco entre linhas
    }
  });
  o.push('f');

  // os campos
  let y = H - 26 * MM; rot(5 * MM, y, 'FABRICANTE:'); caixa(30 * MM, y, 58 * MM, C.fabricante);
  y = H - 34 * MM; rot(5 * MM, y, 'ANO DE FABRICAÇÃO'); caixa(31 * MM, y, 13 * MM, C.ano); rot(47 * MM, y, 'TAG'); caixa(54 * MM, y, 15 * MM, C.tag);
  let yCat = H - 60 * MM;
  if (C.modelo === '2pmta'){
    const col = [54 * MM, 73 * MM], lw = 15 * MM, y1 = H - 43.5 * MM, y2 = H - 52 * MM;
    C.pressoes.forEach((p, i) => texto(p.rotulo, col[i] + lw / 2, y1 + 5 * MM, { negrito: true, tam: 5, al: 'c', max: 18 * MM, min: 3.5 }));
    rot(5 * MM, y1 + 1.3 * MM, 'PRESSÃO MÁXIMA DE TRABALHO\nADMISSÍVEL (PMTA):'); un(42 * MM, y1 - 1.3 * MM, 'kgf/cm²');
    C.pressoes.forEach((p, i) => caixa(col[i], y1, lw, p.pmta));
    rot(5 * MM, y2 + 1.3 * MM, 'PRESSÃO DE TESTE HIDROSTÁTICO\nDE FABRICAÇÃO (PTH):'); un(42 * MM, y2 - 1.3 * MM, 'kgf/cm²');
    C.pressoes.forEach((p, i) => { if (p.pth != null) caixa(col[i], y2, lw, p.pth); });
    yCat = H - 60.5 * MM;
  } else {
    y = H - 42 * MM; rot(5 * MM, y + 1.3 * MM, 'PRESSÃO MÁXIMA DE TRABALHO\nADMISSÍVEL (PMTA):'); caixa(54 * MM, y, 15 * MM, C.pressoes[0].pmta); un(70 * MM, y, 'kgf/cm²');
    y = H - 51 * MM; rot(5 * MM, y + 1.3 * MM, 'PRESSÃO DE TESTE HIDROSTÁTICO DE\nFABRICAÇÃO (PTH):'); caixa(54 * MM, y, 15 * MM, C.pressoes[0].pth); un(70 * MM, y, 'kgf/cm²');
  }
  y = yCat; rot(5 * MM, y, 'CATEGORIA'); caixa(22 * MM, y, 10 * MM, C.categoria);
  rot(36 * MM, y + 1.3 * MM, 'CLASSE\nDO FLUIDO:'); caixa(52 * MM, y, 10 * MM, C.classe);
  rot(66 * MM, y, 'Nº TAP'); caixa(77 * MM, y, 15 * MM, C.tap);
  y = H - 70 * MM; rot(5 * MM, y + 1.3 * MM, 'CÓDIGO DE PROJETO /\nANO DE EDIÇÃO:'); caixa(36 * MM, y, 56 * MM, C.codigo, 8.5);
  y = H - 80 * MM; rot(5 * MM, y, 'VOLUME'); caixa(18 * MM, y, 15 * MM, C.volume); un(34 * MM, y, 'm³');
  rot(43 * MM, y, 'FLUIDO:'); caixa(56 * MM, y, 36 * MM, C.fluido);
  if (C.cliente) texto('[' + C.cliente + ']', 5 * MM, 5 * MM, { negrito: true, tam: 5.5, max: 108 * MM, min: 4 });
  return { ops: o.join('\n') + '\n', trocas, apertos };
}

// ── o arquivo PDF ───────────────────────────────────────────────────────────
function hexUtf16(s){ let h = 'FEFF'; for (let i = 0; i < s.length; i++) h += ('0000' + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4); return '<' + h + '>'; }
function pdf(ops, titulo){
  const cx = '[0 0 ' + n2(W) + ' ' + n2(H) + ']';
  const obj = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox ' + cx + ' /TrimBox ' + cx + ' /Resources << /Shading << /Sh0 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + ops.length + ' >>\nstream\n' + ops + 'endstream',
    '<< /ShadingType 2 /ColorSpace /DeviceCMYK /Coords [0 0 1 0] /Domain [0 1] /Extend [true true] /Function << /FunctionType 2 /Domain [0 1] /C0 ['
      + GRAD.de.join(' ') + '] /C1 [' + GRAD.ate.join(' ') + '] /N 1 >> >>',
    '<< /Title ' + hexUtf16(titulo) + ' /Creator (TapHub TapDoc) /Producer (placa-pdf.js ' + VERSAO + ') >>'
  ];
  let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const pos = [];
  obj.forEach((t, i) => { pos.push(s.length); s += (i + 1) + ' 0 obj\n' + t + '\nendobj\n'; });
  const x = s.length;
  s += 'xref\n0 ' + (obj.length + 1) + '\n0000000000 65535 f \n' + pos.map(p => ('0000000000' + p).slice(-10) + ' 00000 n \n').join('')
    + 'trailer\n<< /Size ' + (obj.length + 1) + ' /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); if (c > 255) throw new Error('placa-pdf: caractere fora do PDF na posição ' + i); b[i] = c; }
  return b;
}
function nomeArquivo(tag){ return 'Placa ' + (limpo(tag).replace(/[\\/:*?"<>|]+/g, '-') || 'sem TAG') + '.pdf'; }

/** Gera a placa de um vaso. v = o vaso de tf_placa_dados; ctx = { emissora, cliente }; libs = { letras, qrcode }.
    Devolve { bytes, nome, modelo, campos, avisos }; se algo impede, lança um erro com a lista (use faltas() antes). */
function gerar(v, ctx, libs){
  libs = libs || {}; const L = libs.letras || raiz.PlacaLetras, Q = libs.qrcode || raiz.qrcode;
  if (!L || !L.n || !L.logo) throw new Error('Faltam os contornos das letras (vendor/placa-letras.js).');
  if (typeof Q !== 'function') throw new Error('Falta a biblioteca do QR code (vendor/qrcode.js).');
  const f = faltas(v); if (f.length) throw new Error('A placa do ' + (limpo(v.tag) || 'vaso') + ' não pode ser gerada: ' + f.join(' '));
  const cc = campos(v, ctx), C = cc.campos, avisos = cc.avisos.slice();
  const d = conteudo(C, L, qrModulos(Q, C.qr));
  if (d.trocas.length) avisos.push('Letra(s) que a placa não tem e foram trocadas: ' + Array.from(new Set(d.trocas)).join(' ') + '.');
  if (d.apertos.length) avisos.push('Texto comprido demais para a caixa (saiu apertado): ' + d.apertos.join(' · ') + '.');
  return { bytes: pdf(d.ops, 'Placa ' + C.tag), nome: nomeArquivo(C.tag), modelo: C.modelo, campos: C, avisos };
}

const PlacaPDF = { gerar, faltas, campos, modelo, nomeArquivo, kgf, versao: VERSAO, LARGURA_MM: 120, ALTURA_MM: 100 };
if (typeof module !== 'undefined' && module.exports) module.exports = PlacaPDF; else raiz.PlacaPDF = PlacaPDF;
})(typeof window !== 'undefined' ? window : globalThis);
