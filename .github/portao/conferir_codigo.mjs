#!/usr/bin/env node
// conferir_codigo.mjs — item 23 da lista de melhorias (S133)
// Conferência automática do código ANTES de montar o zip. Pega erro de digitação e de nome
// que o navegador só mostraria quando alguém abrisse aquela tela:
//   1. erro de sintaxe (o módulo inteiro não abre);
//   2. nome que não existe (função ou variável escrita errado, ou que saiu do arquivo) — no-undef;
//   3. chave repetida em objeto, "case" repetido, argumento repetido, constante reatribuída etc.;
//   4. a mesma `let`/`const`/`class` de topo declarada duas vezes na página (o navegador para o 2º script);
//   5. onclick="fn(...)" (no HTML e dentro das strings que montam HTML) chamando função que não existe;
//   6. e-mail de verdade no código (item 27, S135): o GitHub é público, e o modo demonstração usa só
//      endereços fictícios (@example.com). Fora disso, só as dicas genéricas de PERMITIDOS abaixo.
//   7. CNPJ no código (item 28, S139): os exemplos do modo demonstração usam só CNPJ fictício, com a raiz
//      começando por 000000 (ex.: 00.000.010/0001-00) ou a máscara 00.000.000/0000-00. Qualquer outro CNPJ
//      escrito no código (com pontos, ou 14 dígitos num campo "cnpj") recusa.
//
// Uso:  node conferir_codigo.mjs <pasta PUBLICAR ou app>  [--aceitos conferir_codigo_aceitos.json] [--gravar-aceitos]
//   Sai com código 0 quando não há achado NOVO; 1 quando há (a publicação não segue).
//   O que já existia quando a conferência nasceu fica em conferir_codigo_aceitos.json (a "catraca", como a
//   auditoria_orfas.txt): não trava, mas também não pode crescer. Corrigiu um? Ele some da lista sozinho com
//   --gravar-aceitos (só usar para TIRAR linhas; achado novo se corrige no código).
// Dependências (no container): npm i eslint@9 globals acorn   (na pasta _teste_local)
import fs from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';
import globals from 'globals';
import * as acorn from 'acorn';

const args = process.argv.slice(2);
const raiz = args.find(a => !a.startsWith('--')) || '.';
const iA = args.indexOf('--aceitos');
const arqAceitos = iA >= 0 ? args[iA + 1] : path.join(path.dirname(new URL(import.meta.url).pathname), 'conferir_codigo_aceitos.json');
const gravar = args.includes('--gravar-aceitos');

// ── as páginas: todo index.html, menos "Versões anteriores", node_modules e vendor ──
function paginas(dir, out = []){
  for (const e of fs.readdirSync(dir, { withFileTypes: true })){
    if (/^(Versões anteriores|Vers.es anteriores|node_modules|vendor|\.git)$/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, out);
    else if (/\.html$/i.test(e.name) && !/^TF[A-Z]*_/.test(e.name)) out.push(p);
  }
  return out;
}

const REGRAS = {
  'no-undef': ['error', { typeof: false }],
  'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-dupe-class-members': 'error', 'no-duplicate-case': 'error',
  'no-const-assign': 'error', 'no-func-assign': 'error', 'no-class-assign': 'error', 'no-import-assign': 'error',
  'no-redeclare': ['error', { builtinGlobals: false }], 'no-self-assign': 'error', 'no-obj-calls': 'error',
  'use-isnan': 'error', 'valid-typeof': 'error', 'no-unsafe-negation': 'error', 'no-unsafe-finally': 'error',
  'getter-return': 'error', 'no-setter-return': 'error', 'no-compare-neg-zero': 'error', 'no-dupe-else-if': 'error',
};
const GLOBAIS_NAV = { ...globals.browser, ...globals.es2024, ...globals.serviceworker,
  // bibliotecas de fora, carregadas na hora (vendor/ e CDN) e o "module" do teste no Node (typeof module === 'object')
  pdfMake: 'readonly', PDFLib: 'readonly', JSZip: 'readonly', jspdf: 'readonly', XLSX: 'readonly', module: 'readonly' };
const linter = new Linter();

// nomes de topo de um trecho de código (var/function/let/const/class) e os window.X = … / globalThis.X = …
function topo(codigo){
  const lex = new Set(), soltos = new Set();
  let ast;
  try{ ast = acorn.parse(codigo, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }); }
  catch(e){ return { lex, soltos, erro: e }; }
  for (const n of ast.body){
    if (n.type === 'FunctionDeclaration' && n.id) soltos.add(n.id.name);
    else if (n.type === 'ClassDeclaration' && n.id) lex.add(n.id.name);
    else if (n.type === 'VariableDeclaration'){
      const alvo = n.kind === 'var' ? soltos : lex;
      const nomes = p => { if (!p) return; if (p.type === 'Identifier') alvo.add(p.name);
        else if (p.type === 'ObjectPattern') p.properties.forEach(q => nomes(q.value || q.argument));
        else if (p.type === 'ArrayPattern') p.elements.forEach(nomes);
        else if (p.type === 'AssignmentPattern') nomes(p.left); else if (p.type === 'RestElement') nomes(p.argument); };
      n.declarations.forEach(d => nomes(d.id));
    }
  }
  // window.X = …, globalThis.X = …, self.X = … em qualquer lugar
  for (const m of codigo.matchAll(/\b(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) soltos.add(m[1]);
  // o padrão do núcleo: (function (raiz) { … raiz.Documentos = api; })(window)
  for (const m of codigo.matchAll(/\}\)\(\s*(?:typeof window|window|globalThis|this)/g)){
    const par = (codigo.match(/^\s*(?:;\s*)?\(\s*function\s*\(\s*([A-Za-z_$][\w$]*)/m) || [])[1];
    if (par) for (const k of codigo.matchAll(new RegExp('\\b' + par + '\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)', 'g'))) soltos.add(k[1]);
    break;
  }
  for (const m of codigo.matchAll(/\b(?:window|globalThis|self)\[['"]([A-Za-z_$][\w$]*)['"]\]\s*=(?!=)/g)) soltos.add(m[1]);
  return { lex, soltos, erro: null };
}

// os <script> da página, na ordem: externos (src relativo, lidos do disco) e de dentro
function scripts(arq){
  const html = fs.readFileSync(arq, 'utf8'), out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))){
    const at = m[1];
    if (/type\s*=\s*["']?(module|application\/(ld\+)?json|text\/(template|x-template|plain))/i.test(at)) continue;
    const src = (at.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    const linha = html.slice(0, m.index).split('\n').length;
    if (src){
      if (/^(https?:)?\/\//i.test(src)) continue;          // CDN: não é nosso
      const p = path.resolve(path.dirname(arq), src.split('?')[0]);
      if (!fs.existsSync(p)){ out.push({ nome: src, codigo: null, falta: true, linha }); continue; }
      out.push({ nome: path.relative(raiz, p).split(path.sep).join('/'), codigo: fs.readFileSync(p, 'utf8'), externo: true, linha: 1 });
    } else if (m[2].trim()) {
      // arquivos nossos carregados na hora por carregarScript('x.js') (vendor/ fica pela lista de bibliotecas)
      for (const k of m[2].matchAll(/carregarScript\(\s*['"]([^'"?]+\.js)/g)){
        if (/vendor\//.test(k[1])) continue;
        const p = path.resolve(path.dirname(arq), k[1]);
        if (fs.existsSync(p)) out.push({ nome: path.relative(raiz, p).split(path.sep).join('/'), codigo: fs.readFileSync(p, 'utf8'), externo: true, linha: 1 });
        else out.push({ nome: k[1], codigo: null, falta: true, linha });
      }
      out.push({ nome: path.relative(raiz, arq).split(path.sep).join('/'), codigo: m[2], linha, html });
    }
  }
  return { html, out };
}

const achados = [];
const add = (arquivo, linha, regra, texto) => achados.push({ arquivo, linha, regra, texto });

for (const arq of paginas(raiz).sort()){
  const { html, out } = scripts(arq);
  const pag = path.relative(raiz, arq).split(path.sep).join('/');
  if (!out.length) continue;
  // 1º passe: o que a página declara no topo (todos os scripts juntos, como no navegador)
  const glob = {}, lexDe = new Map();
  for (const s of out){
    if (s.falta){ add(pag, s.linha, 'script-faltando', 'a página carrega "' + s.nome + '", que não existe na pasta'); continue; }
    const t = topo(s.codigo);
    if (t.erro) continue; // o 2º passe reporta
    for (const n of t.lex){
      if (lexDe.has(n) && !s.externo) add(pag, s.linha, 'topo-repetido', '"' + n + '" declarado de novo (já existe em ' + lexDe.get(n) + ')');
      lexDe.set(n, s.nome); glob[n] = 'writable';
    }
    for (const n of t.soltos) glob[n] = 'writable';
  }
  // 2º passe: o ESLint em cada trecho, com os globais da página
  for (const s of out){
    if (s.falta) continue;
    if (s.externo && achados.some(a => a.arquivo === s.nome && a.vistoEm)) continue; // externo: uma vez só
    const msgs = linter.verify(s.codigo, {
      languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...GLOBAIS_NAV, ...glob } },
      linterOptions: { reportUnusedDisableDirectives: 'off' },
      rules: REGRAS,
    });
    const quem = s.externo ? s.nome : pag;
    for (const g of msgs){
      const linha = (g.line || 1) + (s.externo ? 0 : s.linha - 1);
      add(quem, linha, g.fatal ? 'sintaxe' : g.ruleId, g.message);
    }
    if (s.externo) achados.push({ arquivo: s.nome, vistoEm: pag, controle: true });
  }
  // 5. onclick="fn(" e afins: no HTML e nas strings que montam HTML
  const reOn = /\bon[a-z]+\s*=\s*\\?["']\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/g; let m;
  const PALAVRAS = new Set(['if', 'return', 'function', 'typeof', 'void', 'new', 'this', 'event']);
  while ((m = reOn.exec(html))){
    const n = m[1];
    if (PALAVRAS.has(n) || n in glob || n in GLOBAIS_NAV) continue;
    add(pag, html.slice(0, m.index).split('\n').length, 'onclick-sem-funcao', 'on…="' + n + '(…)" chama uma função que a página não tem');
  }
}

// os service workers (sw.js) não são carregados por <script>: conferidos sozinhos
(function sws(dir){
  for (const e of fs.readdirSync(dir, { withFileTypes: true })){
    if (/^(Versões anteriores|Vers.es anteriores|node_modules|vendor|\.git)$/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sws(p);
    else if (e.name === 'sw.js'){
      const nome = path.relative(raiz, p).split(path.sep).join('/');
      for (const g of linter.verify(fs.readFileSync(p, 'utf8'), { languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: GLOBAIS_NAV }, rules: REGRAS }))
        add(nome, g.line || 1, g.fatal ? 'sintaxe' : g.ruleId, g.message);
    }
  }
})(raiz);

// 6. e-mail de verdade no código (item 27, S135). O repositório é público: nomes e e-mails dos exemplos são fictícios.
//    Vale: @example.com/.org/.net, *.test, *.example e as dicas genéricas dos campos em PERMITIDOS. Fora da catraca:
//    e-mail de pessoa nunca é "aceito" — corrige-se no código.
const PERMITIDOS = new Set(['nome@engetap.com.br', 'financeiro@cliente.com.br']);
const ficticio = d => /^(example\.(com|org|net))$/i.test(d) || /\.(test|example|invalid)$/i.test(d);
const emails = [];
(function varre(dir){
  for (const e of fs.readdirSync(dir, { withFileTypes: true })){
    if (/^(Versões anteriores|Vers.es anteriores|node_modules|vendor|\.git)$/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varre(p);
    else if (/\.(html|js|mjs|webmanifest|json)$/i.test(e.name) && !/^TF[A-Z]*_/.test(e.name)){
      const nome = path.relative(raiz, p).split(path.sep).join('/'), txt = fs.readFileSync(p, 'utf8');
      for (const m of txt.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)){
        const end = m[0].toLowerCase(), dom = m[1].toLowerCase();
        if (!/\.[a-z]{2,}$/.test(dom) || ficticio(dom) || PERMITIDOS.has(end)) continue;
        if (/^\d/.test(dom) || /^(eslint|types|babel)/.test(end)) continue;   // versões de pacote (x@1.2.3)
        emails.push({ arquivo: nome, linha: txt.slice(0, m.index).split('\n').length, end });
      }
    }
  }
})(raiz);

// 7. CNPJ no código (item 28, S139). Vale só a raiz começando por 000000 (fictício); fora da catraca, como o e-mail.
const cnpjs = [];
(function varre(dir){
  for (const e of fs.readdirSync(dir, { withFileTypes: true })){
    if (/^(Versões anteriores|Vers.es anteriores|node_modules|vendor|\.git)$/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varre(p);
    else if (/\.(html|js|mjs|webmanifest|json)$/i.test(e.name) && !/^TF[A-Z]*_/.test(e.name)){
      const nome = path.relative(raiz, p).split(path.sep).join('/'), txt = fs.readFileSync(p, 'utf8');
      const achou = (m, num) => { const d = num.replace(/\D/g, ''); if (/^000000/.test(d)) return;
        cnpjs.push({ arquivo: nome, linha: txt.slice(0, m.index).split('\n').length, num }); };
      for (const m of txt.matchAll(/(?<![\d.])(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})(?![\d])/g)) achou(m, m[1]);
      for (const m of txt.matchAll(/cnpj['"]?\s*[:=]\s*['"](\d{14})['"]/gi)) achou(m, m[1]);
    }
  }
})(raiz);

// ── comparar com a catraca ──
const reais = achados.filter(a => !a.controle);
// a chave não leva o número da linha (muda a cada rodada): arquivo + regra + texto, contando repetições
const chave = a => a.arquivo + ' · ' + a.regra + ' · ' + a.texto;
const conta = l => l.reduce((m, a) => (m[chave(a)] = (m[chave(a)] || 0) + 1, m), {});
const agora = conta(reais);
let aceitos = {};
try{ aceitos = JSON.parse(fs.readFileSync(arqAceitos, 'utf8')).aceitos || {}; }catch(e){}
const novos = [], sumiram = [];
for (const [k, n] of Object.entries(agora)){ const a = aceitos[k] || 0; if (n > a) novos.push([k, n - a]); }
for (const [k, n] of Object.entries(aceitos)){ const a = agora[k] || 0; if (a < n) sumiram.push([k, n - a]); }

const porArq = reais.reduce((m, a) => (m[a.arquivo] = (m[a.arquivo] || 0) + 1, m), {});
console.log('Conferência do código — ' + Object.keys(porArq).length + ' arquivo(s) com achado, ' + reais.length + ' achado(s); na catraca: '
  + Object.values(aceitos).reduce((s, n) => s + n, 0));
if (sumiram.length){ console.log('\nCorrigidos (saem da catraca com --gravar-aceitos):'); sumiram.forEach(([k, n]) => console.log('  − ' + k + (n > 1 ? ' (×' + n + ')' : ''))); }
if (novos.length){
  console.log('\nNOVOS — corrigir antes de montar o zip:');
  for (const [k] of novos){
    const ex = reais.filter(a => chave(a) === k).map(a => a.linha);
    console.log('  ✗ ' + k + '  (linha ' + ex.join(', ') + ')');
  }
}
if (gravar){
  // só grava quando não há novo (a catraca só diminui); a 1ª vez (sem o arquivo) grava tudo o que já existia
  const so = (novos.length && fs.existsSync(arqAceitos)) ? null : agora;
  if (so === null || emails.length || cnpjs.length){ console.log('\nNão gravei: há achado novo. Corrija no código.'); process.exit(1); }
  fs.writeFileSync(arqAceitos, JSON.stringify({ como_usar: 'Catraca da conferir_codigo.mjs: achados que já existiam. Não acrescentar à mão; achado novo se corrige no código.', aceitos: so }, null, 1) + '\n');
  console.log('\nCatraca gravada (' + Object.keys(so).length + ' linhas).');
  process.exit(0);
}
if (emails.length){
  console.log('\nE-MAIL DE VERDADE NO CÓDIGO (item 27) — trocar por um fictício @example.com:');
  for (const e of emails) console.log('  ✗ ' + e.arquivo + ' (linha ' + e.linha + '): ' + e.end);
}
if (cnpjs.length){
  console.log('\nCNPJ NO CÓDIGO (item 28) — trocar por um fictício com a raiz 000000 (ex.: 00.000.010/0001-00):');
  for (const c of cnpjs) console.log('  ✗ ' + c.arquivo + ' (linha ' + c.linha + '): ' + c.num);
}
const falhas = novos.length + emails.length + cnpjs.length;
console.log(falhas ? '\nRESULTADO: FALHOU (' + novos.length + ' novo(s), ' + emails.length + ' e-mail(s), ' + cnpjs.length + ' CNPJ).' : '\nRESULTADO: ok (nenhum achado novo, nenhum e-mail de verdade, nenhum CNPJ de verdade).');
process.exit(falhas ? 1 : 0);
