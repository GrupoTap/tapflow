/* ============================================================================
 * nucleo/documentos.js — D1 · o gerador de documentos pelo MODELO DO CLIENTE
 * ----------------------------------------------------------------------------
 * Decisão do Bruno (29/10/2026, 09h41–09h45): os documentos exportados seguem
 * o padrão do cliente (o RDO em Word e o Consolidado em Excel), e os valores em
 * dinheiro saem como moeda em TODOS os módulos. O modelo é o próprio arquivo do
 * cliente com MARCADORES no lugar dos dados; o layout, o logo, as mesclagens e
 * as fórmulas ficam como estão. Um modelo por contrato (outro cliente, outro
 * layout). O PDF sai com o mesmo visual, montado aqui (pdfmake), para ninguém
 * precisar abrir o Word só para converter.
 *
 * MARCADORES (no texto de uma célula do Word ou do Excel)
 *   {campo}            → dados.campo
 *   {@lista.campo}     → linha repetida: cada linha do modelo que tem um
 *   {@lista}             marcador da lista é uma "vaga". A 1ª vaga recebe
 *                        dados.lista[0], a 2ª dados.lista[1]… Vaga sem item fica
 *                        em branco (no Excel, a linha é escondida, a não ser que
 *                        a lista esteja em opcoes.manter). No Word, item a mais
 *                        do que vaga ganha uma linha nova, copiada da última.
 *   Célula do Excel que é SÓ um marcador recebe o tipo certo: número fica
 *   número (o formato R$ da célula vale), data "AAAA-MM-DD" vira data do Excel.
 *
 * API (tudo devolve Promise):
 *   Documentos.preencherDocx(bytesDoModelo, dados)          → Uint8Array (.docx)
 *   Documentos.preencherXlsx(bytesDoModelo, dados, opcoes)  → Uint8Array (.xlsx)
 *   Documentos.pdfRdo(dados, bytesDoModeloDocx)             → Uint8Array (.pdf)
 *   Documentos.pdfBoletim(dados, bytesDoModeloXlsx)         → Uint8Array (.pdf)
 *   Documentos.baixar(bytes, nome)                          → baixa no navegador
 *   Documentos.moeda(1150) → "R$ 1.150,00" · qtd(22.72727) → "22,7273"
 *   Documentos.data("2026-06-19") → "19/06/2026" · atividade({inicio,fim,texto})
 *
 * Bibliotecas (carregadas sob demanda, ANTES do ato — regra do CLAUDE.md §7):
 *   nucleo/vendor/jszip.min.js (3.10.1) · doc/vendor/pdfmake.min.js e vfs_fonts.js
 * Chat central · D1 · 29/10/2026.
 * ========================================================================== */
(function (raiz) {
  'use strict';
  var VERSAO = 'D1';
  var BASE = (function () {
    try { var s = document.currentScript && document.currentScript.src; if (s) return new URL('../', s).href; } catch (e) {}
    return '';
  })();

  /* ── formatos (a regra da moeda vale para todos os módulos) ─────────────── */
  function num(v) { var n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; }
  function moeda(v) {
    var n = num(v); if (n == null) return '';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function qtd(v) { var n = num(v); if (n == null) return ''; return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }); }
  function data(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : (v == null ? '' : String(v)); }
  function atividade(a) {
    if (a == null) return '';
    if (typeof a === 'string') return a;
    return (a.inicio || '') + (a.fim ? ' às ' + a.fim : '') + (a.texto ? ' ' + a.texto : '');
  }
  function serialExcel(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return null; return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000; }

  /* ── utilidades ─────────────────────────────────────────────────────────── */
  function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function desXml(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
  var RE_MARCA = /\{(@?[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)\}/g;
  function lerValor(dados, chave, item) {
    if (chave.charAt(0) === '@') {
      var p = chave.slice(1).split('.'); if (item == null) return '';
      return p.length > 1 ? item[p[1]] : item;
    }
    return dados[chave];
  }
  function listaDe(texto) { var m = /\{@([A-Za-z0-9_]+)/.exec(texto); return m ? m[1] : null; }
  function texto(v) { return v == null ? '' : String(v); }

  var _libs = {};
  function carregar(src) {
    if (_libs[src]) return _libs[src];
    _libs[src] = new Promise(function (ok, erro) {
      var s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = function () { delete _libs[src]; erro(new Error('Não consegui carregar ' + src.split('/').pop() + '. Confira a internet e tente de novo.')); };
      document.head.appendChild(s);
    });
    return _libs[src];
  }
  function zipLib() {
    if (raiz.JSZip) return Promise.resolve(raiz.JSZip);
    return carregar(BASE + 'nucleo/vendor/jszip.min.js?v=3.10.1').then(function () { return raiz.JSZip; });
  }
  function pdfLib() {
    if (raiz.pdfMake && raiz.pdfMake.vfs) return Promise.resolve(raiz.pdfMake);
    return carregar(BASE + 'doc/vendor/pdfmake.min.js').then(function () { return carregar(BASE + 'doc/vendor/vfs_fonts.js'); }).then(function () { return raiz.pdfMake; });
  }

  /* ── Word ───────────────────────────────────────────────────────────────── */
  function preencherDocx(bytes, dados) {
    return zipLib().then(function (JSZip) { return JSZip.loadAsync(bytes); }).then(function (zip) {
      return zip.file('word/document.xml').async('string').then(function (xml) {
        // 1 · as linhas de lista (vagas), na ordem em que aparecem
        var linhas = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
        var vagas = {};
        linhas.forEach(function (tr) { var l = listaDe(tr); if (l) (vagas[l] = vagas[l] || []).push(tr); });
        Object.keys(vagas).forEach(function (l) {
          var itens = dados[l] || [], vs = vagas[l], ultima = vs[vs.length - 1];
          vs.forEach(function (tr, i) {
            var novo = preencherTexto(tr, dados, itens[i]);
            if (i === vs.length - 1 && itens.length > vs.length) {        // item a mais: linhas novas copiadas da última
              for (var k = vs.length; k < itens.length; k++) novo += preencherTexto(ultima, dados, itens[k]);
            }
            xml = xml.replace(tr, function () { return novo; });
          });
        });
        // 2 · o resto dos marcadores
        xml = preencherTexto(xml, dados, null);
        zip.file('word/document.xml', xml);
        return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      });
    });
  }
  function preencherTexto(xml, dados, item) {
    return xml.replace(/(<w:t\b[^>]*>)([^<]*)(<\/w:t>)/g, function (m, a, t, b) {
      if (t.indexOf('{') < 0) return m;
      var novo = desXml(t).replace(RE_MARCA, function (mm, chave) {
        if (chave.charAt(0) === '@' && item === null) return mm;          // lista: fica para a vez da linha
        var v = lerValor(dados, chave, item);
        if (chave === '@atividades' || /\.?atividade$/.test(chave)) v = atividade(v);
        return texto(v);
      });
      return a.indexOf('xml:space') < 0 ? a.replace('<w:t', '<w:t xml:space="preserve"') + escXml(novo) + b : a + escXml(novo) + b;
    });
  }

  /* ── Excel ──────────────────────────────────────────────────────────────── */
  function preencherXlsx(bytes, dados, opcoes) {
    opcoes = opcoes || {}; var manter = opcoes.manter || [];
    return zipLib().then(function (JSZip) { return JSZip.loadAsync(bytes); }).then(function (zip) {
      var ss = zip.file('xl/sharedStrings.xml');
      return (ss ? ss.async('string') : Promise.resolve('')).then(function (ssx) {
        var compart = (ssx.match(/<si>[\s\S]*?<\/si>/g) || []).map(function (si) {
          return desXml((si.match(/<t[^>]*>[^<]*<\/t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join(''));
        });
        var folhas = Object.keys(zip.files).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
        return Promise.all(folhas.map(function (n) {
          return zip.file(n).async('string').then(function (x) { zip.file(n, preencherFolha(x, compart, dados, manter)); });
        })).then(function () {
          // recalcula ao abrir (as fórmulas do modelo não guardam valor)
          return zip.file('xl/workbook.xml').async('string').then(function (wb) {
            if (/<calcPr\b/.test(wb)) wb = wb.replace(/<calcPr\b([^>]*?)\/>/, function (m, a) { return /fullCalcOnLoad/.test(a) ? m : '<calcPr' + a + ' fullCalcOnLoad="1"/>'; });
            else wb = wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
            zip.file('xl/workbook.xml', wb);
            return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
          });
        });
      });
    });
  }
  function textoCelula(c, compart) {
    var t = /\bt="([^"]+)"/.exec(c); t = t && t[1];
    if (t === 's') { var v = /<v>(\d+)<\/v>/.exec(c); return v ? compart[+v[1]] : ''; }
    if (t === 'inlineStr') return desXml((c.match(/<t[^>]*>[^<]*<\/t>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); }).join(''));
    return null;
  }
  function preencherFolha(xml, compart, dados, manter) {
    var cont = {};                                                        // quantas vagas de cada lista já passaram
    return xml.replace(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, function (row) {
      var lista = null, item, vazia = true;
      // a lista da linha (pelo 1º marcador de lista encontrado)
      (row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).some(function (c) { var tx = textoCelula(c, compart); if (tx && listaDe(tx)) { lista = listaDe(tx); return true; } return false; });
      if (lista) { var i = cont[lista] = (cont[lista] == null ? 0 : cont[lista] + 1); item = (dados[lista] || [])[i]; vazia = item == null; }
      var nova = row.replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, function (c) {
        var tx = textoCelula(c, compart); if (!tx || tx.indexOf('{') < 0) return c;
        var ref = /\br="([A-Z]+\d+)"/.exec(c)[1], st = /\bs="(\d+)"/.exec(c); st = st ? ' s="' + st[1] + '"' : '';
        var so = /^\{(@?[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)\}$/.exec(tx);
        if (so) {
          var v = lerValor(dados, so[1], item);
          if (v == null || v === '') return '<c r="' + ref + '"' + st + '/>';
          if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
          var se = typeof v === 'string' ? serialExcel(v) : null;
          if (se != null) return '<c r="' + ref + '"' + st + '><v>' + se + '</v></c>';
          return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + escXml(v) + '</t></is></c>';
        }
        var s = tx.replace(RE_MARCA, function (m, chave) { var v = lerValor(dados, chave, item); return texto(typeof v === 'string' && serialExcel(v) != null ? data(v) : v); });
        return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + escXml(s) + '</t></is></c>';
      });
      if (lista && vazia && manter.indexOf(lista) < 0) nova = nova.replace(/^<row\b/, '<row hidden="1"');
      return nova;
    }).replace(/(<sheetData>[\s\S]*<\/sheetData>)/, function (m) {
      // item a mais do que vaga no Excel é erro: o modelo precisa de mais linhas
      Object.keys(cont).forEach(function (l) { if ((dados[l] || []).length > cont[l] + 1) throw new Error('O modelo tem ' + (cont[l] + 1) + ' linhas para "' + l + '" e vieram ' + dados[l].length + '. Peça um modelo com mais linhas.'); });
      return m;
    });
  }

  /* ── PDF com o mesmo visual (pdfmake) ───────────────────────────────────── */
  function imagensDo(bytes, pasta) {
    if (!bytes) return Promise.resolve([]);
    return zipLib().then(function (JSZip) { return JSZip.loadAsync(bytes); }).then(function (zip) {
      var ns = Object.keys(zip.files).filter(function (n) { return n.indexOf(pasta) === 0 && /\.(png|jpe?g)$/i.test(n); }).sort();
      return Promise.all(ns.map(function (n) { return zip.file(n).async('base64').then(function (b) { return { nome: n, url: 'data:image/' + (/png$/i.test(n) ? 'png' : 'jpeg') + ';base64,' + b }; }); }));
    });
  }
  // logo com muita margem transparente (o Excel recorta na tela): apara pelo conteúdo
  function aparar(url) {
    if (!url || typeof document === 'undefined') return Promise.resolve(url);
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
          var g = c.getContext('2d'); g.drawImage(im, 0, 0);
          var px = g.getImageData(0, 0, c.width, c.height).data, x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
          for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) {
            var i = (y * c.width + x) * 4;
            if (px[i + 3] > 20 && (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
          if (x1 < 0) return ok(url);
          var w = x1 - x0 + 1, h = y1 - y0 + 1, o = document.createElement('canvas'); o.width = w; o.height = h;
          o.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h); ok(o.toDataURL('image/png'));
        } catch (e) { ok(url); }
      };
      im.onerror = function () { ok(url); }; im.src = url;
    });
  }
  var AZ = '#4F81BD', CINZA = '#D9D9D9', AM = '#FFFF00';
  function gerarPdf(def) {
    return pdfLib().then(function (pm) {
      return new Promise(function (ok) { pm.createPdf(def).getBuffer(function (b) { ok(new Uint8Array(b)); }); });
    });
  }
  function pdfRdo(d, modeloDocx) {
    return imagensDo(modeloDocx, 'word/media/').then(function (imgs) {
      return aparar(imgs[0] && imgs[0].url).then(function (logo) { var cli = d.cliente || 'Cliente';
      var cel = function (rot, val) { return { text: [{ text: rot + ' ', bold: true }, texto(val)], fontSize: 9 }; };
      var faixa = function (t) { return [{ text: t, colSpan: 4, alignment: 'center', bold: true, color: 'white', fillColor: AZ, fontSize: 8 }, {}, {}, {}]; };
      var linha = function (t) { return [{ text: texto(t), colSpan: 4, fontSize: 9, margin: [0, 1, 0, 1] }, {}, {}, {}]; };
      var eq = (d.equipe || []).slice();
      while (eq.length < 5) eq.push({});
      var at = (d.atividades || []).map(atividade); while (at.length < 8) at.push('');
      var co = (d.comentarios || []).slice(); while (co.length < 5) co.push('');
      var body = [
        [logo ? { image: logo, fit: [150, 40], colSpan: 2, alignment: 'center' } : { text: 'ENGETAP', colSpan: 2 }, {},
         { text: 'RELATÓRIO DIÁRIO DE OBRA', bold: true, italics: true, fontSize: 14, alignment: 'center', margin: [0, 10, 0, 0] },
         { text: [{ text: 'Revisão:\n', fontSize: 6 }, { text: texto(d.revisao || '1'), fontSize: 10, bold: true }], alignment: 'right' }],
        [cel('Responsável ' + cli + ':', d.fiscal), {}, cel('Data:', data(d.data)), {}],
        [cel('Responsável Contratada:', d.responsavel), {}, cel('Horário Inicio de Turno:', d.inicio_turno), {}],
        [cel('Contrato/Pedido Nº:', d.contrato_pedido), {}, cel('Intervalo de Jornada:', d.intervalo), {}],
        [cel('RDO Nº:', d.rdo_numero), {}, cel('Horário de Saída da Equipe:', d.saida), {}],
        [{ text: 'Nº', style: 'th' }, { text: 'NÚMERO PESSOAL', style: 'th' }, { text: 'NOME', style: 'th' }, { text: 'FUNÇÃO', style: 'th' }]
      ];
      eq.slice(0, Math.max(5, eq.length)).forEach(function (p, i) { body.push([{ text: String(i + 1), alignment: 'center', fontSize: 9 }, { text: texto(p.numero), alignment: 'center', fontSize: 9 }, { text: texto(p.nome), alignment: 'center', fontSize: 9 }, { text: texto(p.funcao), alignment: 'center', fontSize: 9 }]); });
      body.push(faixa('DESCRIÇÃO DAS ATIVIDADES')); at.forEach(function (t) { body.push(linha(t)); });
      body.push(faixa('COMENTÁRIOS CONTRATADA')); co.forEach(function (t) { body.push(linha(t)); });
      body.push(faixa('OBSERVAÇÕES ' + cli.toUpperCase())); for (var k = 0; k < 5; k++) body.push(linha(''));
      body.push(faixa('OUTROS'));
      body.push([{ text: [{ text: 'OCORRÊNCIAS DE SEGURANÇA: ', bold: true }, texto(d.ocorrencias)], colSpan: 4, fontSize: 9, margin: [0, 2, 0, 40] }, {}, {}, {}]);
      body.push([{ text: cli.toUpperCase(), colSpan: 2, alignment: 'center', decoration: 'underline', fontSize: 9, margin: [0, 4, 0, 50] }, {}, { text: 'CONTRATADA', colSpan: 2, alignment: 'center', decoration: 'underline', fontSize: 9, margin: [0, 4, 0, 50] }, {}]);
      // as linhas 2–5 do cabeçalho: a 1ª e a 3ª colunas levam colSpan 2
      for (var r = 1; r <= 4; r++) { body[r][0].colSpan = 2; body[r][2].colSpan = 2; }
      return gerarPdf({ pageSize: 'A4', pageMargins: [36, 36, 36, 36], info: { title: 'RDO ' + texto(d.rdo_numero) },
        styles: { th: { bold: true, fontSize: 7, color: 'white', fillColor: AZ, alignment: 'center' } }, defaultStyle: { fontSize: 9 },
        content: [{ table: { widths: [70, 110, '*', 130], body: body }, layout: { hLineWidth: function () { return 0.6; }, vLineWidth: function () { return 0.6; } } }] });
      });
    });
  }
  function pdfBoletim(d, modeloXlsx) {
    return imagensDo(modeloXlsx, 'xl/media/').then(function (imgs) {
      var porNome = {}; imgs.forEach(function (i) { porNome[i.nome] = i.url; });
      var logoF = d.logo_fornecedor || porNome['xl/media/image1.png'] || (imgs[0] && imgs[0].url);
      var logoC = d.logo_cliente || porNome['xl/media/image2.jpg'] || (imgs[1] && imgs[1].url);
      return Promise.all([aparar(logoF), aparar(logoC)]).then(function (lg) { logoF = lg[0]; logoC = lg[1];
      var cod = {}; (d.codigos || []).forEach(function (c) { cod[String(c.item)] = c; });
      var th = function (t, x) { var o = { text: t, bold: true, fontSize: 6.5, alignment: 'center', fillColor: '#F2F2F2' }; for (var k in x || {}) o[k] = x[k]; return o; };
      var R = function (v, x) { var o = { text: moeda(v), alignment: 'right', fontSize: 7 }; for (var k in x || {}) o[k] = x[k]; return o; };
      var Q = function (v, x) { var o = { text: v == null || v === '' ? '' : qtd(v), alignment: 'center', fontSize: 7 }; for (var k in x || {}) o[k] = x[k]; return o; };
      var linhas = [], tot = { J: 0, K: 0, L: 0, M: 0, N: 0 };
      (d.itens || []).forEach(function (it) {
        var c = cod[String(it.item)] || {}, p = num(c.preco) || 0, ant = num(it.anterior) || 0, mes = num(it.mes) || 0, prev = num(it.previsto) || 0, acum = ant + mes;
        var J = Math.round(ant * p * 100) / 100, K = Math.round(mes * p * 100) / 100, L = J + K, M = Math.round(prev * p * 100) / 100, N = M - L;
        tot.J += J; tot.K += K; tot.L += L; tot.M += M; tot.N += N;
        linhas.push([{ text: texto(it.item), fontSize: 7, alignment: 'center' }, { text: texto(c.codigo), bold: true, fontSize: 7.5, alignment: 'center' }, { text: texto(c.texto), bold: true, fontSize: 7, alignment: 'center' },
          { text: texto(it.un || 'UN.'), fontSize: 7, alignment: 'center' }, R(p), Q(prev, { fillColor: CINZA }), Q(ant), Q(mes, { fillColor: CINZA }), Q(acum),
          R(J, { fillColor: AM }), R(K), R(L, { fillColor: AM }), R(M), R(N, { fillColor: AM }), { text: prev ? Math.round(acum / prev * 100) + '%' : '', fontSize: 7, alignment: 'right', fillColor: AM }]);
      });
      var vazio = function (n) { var a = []; for (var i = 0; i < n; i++) a.push({}); return a; };
      var cab = [
        [logoF ? { image: logoF, fit: [150, 38], colSpan: 3, rowSpan: 4, alignment: 'center' } : { text: 'ENGETAP', colSpan: 3, rowSpan: 4 }, {}, {},
         { text: 'Previsão', bold: true, colSpan: 4, alignment: 'center', fontSize: 8 }, {}, {}, {}, { text: 'INÍCIO DO PEDIDO:', fontSize: 6, colSpan: 2 }, {}, { text: 'ÁREA:', fontSize: 6, colSpan: 2 }, {}, { text: 'Contrato', fontSize: 6, colSpan: 2 }, {},
         logoC ? { image: logoC, fit: [68, 30], colSpan: 2, rowSpan: 4, alignment: 'center' } : { text: '', colSpan: 2, rowSpan: 4 }, {}],
        [{}, {}, {}, { text: texto(d.objeto_curto || 'Inspeções em Vasos de Pressão'), bold: true, colSpan: 4, alignment: 'center', fontSize: 8 }, {}, {}, {}, { text: data(d.inicio_pedido), colSpan: 2, alignment: 'center', fontSize: 7 }, {}, { text: texto(d.area), bold: true, colSpan: 2, alignment: 'center', fontSize: 7 }, {}, { text: texto(d.contrato_cliente), bold: true, colSpan: 2, alignment: 'center', fontSize: 7 }, {}, {}, {}],
        [{}, {}, {}, { text: texto(d.unidade), bold: true, colSpan: 4, rowSpan: 2, alignment: 'center', fontSize: 7, margin: [0, 6, 0, 0] }, {}, {}, {}, { text: 'TÉRMINO DO PEDIDO:', fontSize: 6, colSpan: 2 }, {}, { text: 'RESPONSÁVEL:', fontSize: 6, colSpan: 2 }, {}, { text: 'Pedido', fontSize: 6, colSpan: 2 }, {}, {}, {}],
        [{}, {}, {}, {}, {}, {}, {}, { text: data(d.termino_pedido), colSpan: 2, alignment: 'center', fontSize: 7 }, {}, { text: texto(d.responsavel_cliente), bold: true, colSpan: 2, alignment: 'center', fontSize: 7 }, {}, { text: texto(d.pedido), bold: true, colSpan: 2, alignment: 'center', fontSize: 7 }, {}, {}, {}],
        [{ text: 'BOLETIM DE MEDIÇÃO', bold: true, colSpan: 11, alignment: 'center', fillColor: '#A6A6A6', fontSize: 8 }].concat(vazio(10), [{ text: data(d.data), colSpan: 2, bold: true, fontSize: 7 }, {}, { text: 'Folha: 01', colSpan: 2, bold: true, fontSize: 7 }, {}]),
        [{ text: 'OBJETO: ' + texto(d.objeto || 'Inspeção em Vasos de Pressão e Tubulações'), bold: true, colSpan: 11, fontSize: 7 }].concat(vazio(10), [{ text: 'Mobilização: ' + texto(d.mobilizacao), colSpan: 2, bold: true, fontSize: 7 }, {}, { text: 'Medição Nº: ' + texto(d.medicao), colSpan: 2, bold: true, fontSize: 7 }, {}]),
        [th('Item', { rowSpan: 2 }), th('Código', { rowSpan: 2 }), th('DESCRIÇÃO DO ITEM', { rowSpan: 2 }), th('UNID. MED.', { rowSpan: 2 }), th('PREÇO UNITÁRIO', { rowSpan: 2 }), th('QUANTITATIVOS', { colSpan: 4 }), {}, {}, {}, th('VALORES EM REAIS', { colSpan: 5 }), {}, {}, {}, {}, th('EXEC.%', { rowSpan: 2 })],
        [{}, {}, {}, {}, {}, th('TOTAL PREVISTO'), th('ACUMULADO ANTERIOR'), th('DO MÊS'), th('TOTAL ACUMULADO'), th('ACUMULADO ANTERIOR'), th('DO MÊS'), th('TOTAL ACUMULADO'), th('PREVISTO CONTRATO'), th('SALDO'), {}]
      ];
      var corpo = cab.concat(linhas, [[{ text: '', colSpan: 9, fillColor: '#A6A6A6' }].concat(vazio(8), [R(tot.J, { bold: true }), R(tot.K, { bold: true }), R(tot.L, { bold: true }), R(tot.M, { bold: true }), R(tot.N, { bold: true }), { text: '' }])]);
      var meds = []; for (var i = 1; i <= 20; i++) meds.push(d['med_' + (i < 10 ? '0' : '') + i]);
      var medCel = function (i) { return [{ text: 'MED ' + (i < 9 ? '0' : '') + (i + 1), fontSize: 6.5 }, { text: meds[i] == null ? '' : moeda(meds[i]), fontSize: 6.5, alignment: 'right' }]; };
      var quadro = [[{ text: 'QUADRO DE CONTROLE', colSpan: 10, alignment: 'center', fontSize: 7, bold: true }].concat(vazio(9))];
      var rotQ = [['VALOR CONTRATUAL (R$):', moeda(d.valor_contratual)], ['VALOR MEDIDO ACUMULADO (R$):', moeda(tot.L)], ['SALDO CONTRATUAL (R$):', moeda((num(d.valor_contratual) || 0) - tot.L)], ['DATA INÍCIO DO CONTRATO:', data(d.data_inicio)], ['DATA TÉRMINO DO CONTRATO:', data(d.data_termino)]];
      for (var q = 0; q < 5; q++) quadro.push([{ text: rotQ[q][0], fontSize: 6.5, bold: true }, { text: rotQ[q][1], fontSize: 6.5, alignment: 'right' }].concat(medCel(q), medCel(q + 5), medCel(q + 10), medCel(q + 15)));
      var se = (d.servicos || []).map(function (s, k) { var c = cod[String(s.item)] || {};
        return [{ text: texto(s.item), fontSize: 7, alignment: 'center' }, { text: texto(c.codigo), fontSize: 7, alignment: 'center' }, { text: texto(c.texto), fontSize: 7 }, { text: texto(s.servico), fontSize: 7 }, { text: texto(s.rdo), fontSize: 7, alignment: 'center' }, { text: data(s.data), fontSize: 7, alignment: 'center' }, { text: texto(s.equipe), fontSize: 7, alignment: 'center' }]; });
      var thA = function (t) { return { text: t, bold: true, color: 'white', fillColor: '#1F4E79', fontSize: 7 }; };
      return gerarPdf({ pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [22, 22, 22, 22], info: { title: 'Medição ' + texto(d.medicao) },
        content: [
          { table: { widths: [18, 38, '*', 26, 46, 38, 44, 34, 38, 50, 48, 52, 52, 46, 28], body: corpo }, layout: { hLineWidth: function () { return 0.5; }, vLineWidth: function () { return 0.5; } } },
          { margin: [0, 6, 0, 0], table: { widths: [120, '*'], body: [[{ text: 'Valor Medido', fillColor: '#FFE699', fontSize: 8 }, { text: moeda(tot.K), color: 'red', fontSize: 11, fillColor: '#FFE699' }]] }, layout: 'noBorders' },
          { margin: [0, 10, 0, 0], table: { widths: ['*', '*', '*', '*'], body: [[{ text: 'Fiscal - Contratante', alignment: 'center', fontSize: 7 }, { text: 'Gestor do Contrato - Contratante', alignment: 'center', fontSize: 7 }, { text: 'Fiscal - Fornecedor', alignment: 'center', fontSize: 7 }, { text: 'Gestor do Contrato - Fornecedor', alignment: 'center', fontSize: 7 }],
            [{ text: texto(d.fiscal), bold: true, alignment: 'center', fontSize: 7 }, { text: texto(d.gestor), bold: true, alignment: 'center', fontSize: 7 }, { text: texto(d.fiscal_fornecedor), bold: true, alignment: 'center', fontSize: 7 }, { text: texto(d.gestor_fornecedor), bold: true, alignment: 'center', fontSize: 7 }]] } },
          { margin: [0, 10, 0, 0], table: { widths: [110, 70, 34, 52, 34, 52, 34, 52, 34, '*'], body: quadro }, layout: { hLineWidth: function () { return 0.4; }, vLineWidth: function () { return 0.4; } } },
          { text: '', pageBreak: 'before' },
          { text: 'SERVIÇO EXECUTADO · Medição Nº ' + texto(d.medicao), bold: true, fontSize: 9, margin: [0, 0, 0, 6] },
          { table: { headerRows: 1, widths: [24, 44, 150, '*', 50, 50, 50], body: [[thA('Item'), thA('Código'), thA('DESCRIÇÃO DO ITEM'), thA('Serviço Executado'), thA('Nº da RDO'), thA('Data'), thA('Equipe')]].concat(se) } }
        ] });
      });
    });
  }

  function baixar(bytes, nome) {
    var tipo = /\.docx$/i.test(nome) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : /\.xlsx$/i.test(nome) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : /\.pdf$/i.test(nome) ? 'application/pdf' : 'application/octet-stream';
    var url = URL.createObjectURL(new Blob([bytes], { type: tipo })), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var api = { versao: VERSAO, preencherDocx: preencherDocx, preencherXlsx: preencherXlsx, pdfRdo: pdfRdo, pdfBoletim: pdfBoletim, baixar: baixar,
              moeda: moeda, qtd: qtd, data: data, atividade: atividade, _serialExcel: serialExcel };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Documentos = api;
})(typeof window !== 'undefined' ? window : globalThis);
