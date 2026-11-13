/* ============================================================================
 * assinatura-pdf.js · TapDoc · S158 (antes S145: rodada E, decisão A5 do desenho da assinatura)
 * ----------------------------------------------------------------------------
 * Confere o PDF que o PLH devolve assinado com o token (Assinador SERPRO, PAdES):
 *   1. o começo do arquivo é EXATAMENTE o PDF aprovado (a assinatura PAdES é
 *      acrescentada no fim do arquivo; o SHA-256 do começo = o SHA gravado);
 *   2. o resumo (messageDigest) da assinatura bate com os bytes cobertos
 *      (/ByteRange), e o /ByteRange cobre o arquivo inteiro;
 *   3. a assinatura (RSA) dos atributos assinados confere com a chave do
 *      certificado de quem assinou;
 *   4. devolve o nome (CN) e a série do certificado, para o banco comparar com o
 *      PLH que aprovou.
 * Não confere a cadeia até a raiz ICP-Brasil (para isso: verificador do ITI).
 * S158: lê também o CMS com tamanho indefinido (BER), que é como o assinador do
 *   gov.br grava; o banco recusa o certificado do gov.br fora do modo de teste.
 * Puro: sem DOM; roda no navegador e no node (testes). Usa crypto.subtle.
 * ========================================================================== */
(function (raiz) {
'use strict';
const subtle = () => (raiz.crypto && raiz.crypto.subtle) || null;   // no navegador e no node 20+ (globalThis.crypto)
const hex = buf => Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
async function sha(alg, bytes) { return hex(await subtle().digest(alg, bytes)); }

// ── DER ──────────────────────────────────────────────────────────────────
function der(b, i) {   // lê um TLV em i: { tag, ini (do conteúdo), fim (do conteúdo), prox (depois do TLV), cab (início do TLV) }
  const cab = i, tag = b[i++];
  if (i >= b.length) throw new Error('DER: fora do arquivo');
  let len = b[i++];
  if (len === 0x80) {   // S158: tamanho indefinido (BER), como o assinador do gov.br grava: os filhos vão até o 00 00
    if (!(tag & 0x20)) throw new Error('DER: tamanho');
    let k = i;
    while (!(b[k] === 0 && b[k + 1] === 0)) { if (k + 1 >= b.length) throw new Error('DER: fora do arquivo'); k = der(b, k).prox; }
    return { tag, ini: i, fim: k, prox: k + 2, cab };
  }
  if (len & 0x80) { const n = len & 0x7f; if (n < 1 || n > 4) throw new Error('DER: tamanho'); len = 0; for (let k = 0; k < n; k++) len = len * 256 + b[i++]; }
  if (i + len > b.length) throw new Error('DER: fora do arquivo');
  return { tag, ini: i, fim: i + len, prox: i + len, cab };
}
function filhos(b, n) { const r = []; let i = n.ini; while (i < n.fim) { const c = der(b, i); r.push(c); i = c.prox; } return r; }
function oid(b, n) {
  const v = b.subarray(n.ini, n.fim), r = [Math.floor(v[0] / 40), v[0] % 40]; let x = 0;
  for (let i = 1; i < v.length; i++) { x = x * 128 + (v[i] & 0x7f); if (!(v[i] & 0x80)) { r.push(x); x = 0; } }
  return r.join('.');
}
const DIG = { '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512', '1.3.14.3.2.26': 'SHA-1' };
const SIG_RSA = { '1.2.840.113549.1.1.1': null, '1.2.840.113549.1.1.11': 'SHA-256', '1.2.840.113549.1.1.12': 'SHA-384', '1.2.840.113549.1.1.13': 'SHA-512', '1.2.840.113549.1.1.5': 'SHA-1' };
const txt = (b, n) => { const v = b.subarray(n.ini, n.fim); return n.tag === 0x1e ? String.fromCharCode(...Array.from({ length: v.length / 2 }, (_, k) => v[2 * k] * 256 + v[2 * k + 1])) : new TextDecoder('utf-8').decode(v); };
function nome(b, n, alvo) {   // Name → o valor do atributo (CN = 2.5.4.3)
  for (const rdn of filhos(b, n)) for (const at of filhos(b, rdn)) { const [o, v] = filhos(b, at); if (oid(b, o) === alvo) return txt(b, v); }
  return null;
}
function tempo(b, n) {
  const s = new TextDecoder('latin1').decode(b.subarray(n.ini, n.fim));
  const m = n.tag === 0x17 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s);
  if (!m) return null;
  const ano = n.tag === 0x17 ? (+m[1] < 50 ? 2000 : 1900) + +m[1] : +m[1];
  return new Date(Date.UTC(ano, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))).toISOString();
}

// ── o CMS (PKCS#7 SignedData) ──────────────────────────────────────────────
function lerCms(b) {
  const ci = der(b, 0), [tipo, ctx] = filhos(b, ci);
  if (oid(b, tipo) !== '1.2.840.113549.1.7.2') throw new Error('não é uma assinatura CMS (SignedData)');
  const sd = filhos(b, der(b, ctx.ini));
  let k = 3; const certs = [];
  if (sd[k] && sd[k].tag === 0xa0) { for (const c of filhos(b, sd[k])) if (c.tag === 0x30) certs.push(c); k++; }
  if (sd[k] && sd[k].tag === 0xa1) k++;
  const sis = filhos(b, sd[k]);
  if (!sis.length) throw new Error('a assinatura não tem quem assinou');
  const si = filhos(b, sis[0]);
  let j = 1; const sid = si[j++];
  const digAlg = oid(b, filhos(b, si[j++])[0]);
  let attrs = null; if (si[j].tag === 0xa0) attrs = si[j++];
  const sigAlg = oid(b, filhos(b, si[j++])[0]);
  const assin = b.subarray(si[j].ini, si[j].fim);
  // o certificado de quem assinou: pela série (IssuerAndSerialNumber) ou o primeiro
  let serieSid = null;
  if (sid.tag === 0x30) { const [, s] = filhos(b, sid); serieSid = hex(b.subarray(s.ini, s.fim)); }
  let cert = null;
  for (const c of certs) {
    const tbs = filhos(b, filhos(b, c)[0]); const o = tbs[0].tag === 0xa0 ? 1 : 0;
    if (!serieSid || hex(b.subarray(tbs[o].ini, tbs[o].fim)) === serieSid) { cert = { c, tbs, o }; break; }
  }
  let md = null;
  if (attrs) for (const a of filhos(b, attrs)) { const [o, set] = filhos(b, a); if (oid(b, o) === '1.2.840.113549.1.9.4') { const v = filhos(b, set)[0]; md = hex(b.subarray(v.ini, v.fim)); } }
  const r = { digAlg: DIG[digAlg] || null, sigAlg, md, assin, attrs: attrs ? b.slice(attrs.cab, attrs.fim) : null };
  if (cert) {
    const { tbs, o } = cert;
    r.serie = hex(b.subarray(tbs[o].ini, tbs[o].fim));
    r.emissor = nome(b, tbs[o + 2], '2.5.4.3');
    const val = filhos(b, tbs[o + 3]); r.validade = { de: tempo(b, val[0]), ate: tempo(b, val[1]) };
    r.cn = nome(b, tbs[o + 4], '2.5.4.3');
    const spki = tbs[o + 5]; r.spki = b.slice(spki.cab, spki.fim);
    r.chaveAlg = oid(b, filhos(b, filhos(b, spki)[0])[0]);
  }
  return r;
}

// ── as assinaturas do PDF ──────────────────────────────────────────────────
function assinaturas(b) {
  const t = new TextDecoder('latin1').decode(b), r = [], re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m; while ((m = re.exec(t))) r.push({ br: [+m[1], +m[2], +m[3], +m[4]] });
  const vistos = new Set();
  return r.filter(x => { const k = x.br.join(' '); if (vistos.has(k)) return false; vistos.add(k); return true; });
}
/** Os "começos" possíveis do arquivo (terminam num %%EOF): o PDF aprovado é um deles. */
async function prefixos(b) {
  const t = new TextDecoder('latin1').decode(b), r = [];
  let i = -1;
  while ((i = t.indexOf('%%EOF', i + 1)) >= 0) {
    let f = i + 5;
    for (const fim of [f, f + (t[f] === '\r' ? (t[f + 1] === '\n' ? 2 : 1) : t[f] === '\n' ? 1 : 0)]) {
      if (fim < b.length && !r.some(x => x.fim === fim)) r.push({ fim, sha: await sha('SHA-256', b.subarray(0, fim)) });
    }
  }
  return r;
}

/**
 * Confere o PDF assinado. esperado = o SHA-256 do PDF aprovado (ou uma lista deles).
 * Devolve a "conferência" que vai ao banco (tf_laudo_assinado): original_sha256,
 * assinatura_ok, resumo_ok, cobre_tudo, certificado (CN), serie, emissor, validade,
 * assinado_sha256, assinaturas (quantas) e erro (texto para a pessoa, se não conferiu).
 */
async function conferir(bytes, esperado) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const lista = [].concat(esperado || []).filter(Boolean);
  const r = { versao: 'S158', original_sha256: null, assinatura_ok: false, resumo_ok: false, cobre_tudo: false, certificado: null,
              serie: null, emissor: null, validade: null, assinaturas: 0, assinado_sha256: await sha('SHA-256', b), erro: null };
  try {
    if (!(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)) throw new Error('O arquivo não é um PDF.');
    const ps = await prefixos(b);
    const achou = ps.find(p => lista.indexOf(p.sha) >= 0);
    if (achou) { r.original_sha256 = achou.sha; r.original_fim = achou.fim; }
    const sigs = assinaturas(b); r.assinaturas = sigs.length;
    if (!sigs.length) throw new Error('Este PDF não tem assinatura digital. Assine com o token no Assinador SERPRO e devolva o arquivo assinado.');
    if (!achou) throw new Error('Este PDF não é o laudo aprovado (o conteúdo mudou). Assine o PDF do pacote, sem abrir e salvar em outro programa.');
    // a assinatura conferida é a que vai até o fim do arquivo (a última): ela cobre o aprovado e tudo o que
    // veio depois, menos o próprio <conteúdo>. Um /ByteRange falso escrito depois não passa: o resumo e a
    // assinatura RSA são conferidos sobre os bytes que ESTE intervalo diz cobrir.
    const s = sigs.filter(x => x.br[0] === 0 && x.br[2] >= x.br[1] && x.br[2] + x.br[3] <= b.length)
                  .sort((x, y) => (y.br[2] + y.br[3]) - (x.br[2] + x.br[3]))[0] || null;
    if (!s) throw new Error('A assinatura está com o intervalo (/ByteRange) errado.');
    const [a, l1, c, l2] = s.br;
    r.cobre_tudo = c + l2 >= b.length - 2 && ![...b.subarray(c + l2)].some(x => x > 0x20);
    if (!r.cobre_tudo) throw new Error('O PDF foi mudado depois da assinatura.');
    if (l1 < achou.fim) throw new Error('A assinatura não cobre o laudo aprovado.');
    // o conteúdo da assinatura: exatamente <hex> no buraco do intervalo
    const buraco = new TextDecoder('latin1').decode(b.subarray(a + l1, c));
    if (!/^<[0-9a-fA-F\s]+>$/.test(buraco)) throw new Error('A assinatura está ilegível.');
    const h = buraco.replace(/[<>\s]/g, '');
    if (h.length % 2) throw new Error('A assinatura está ilegível.');
    const cms = new Uint8Array(h.length / 2); for (let k = 0; k < cms.length; k++) cms[k] = parseInt(h.substr(2 * k, 2), 16);
    const C = lerCms(cms);
    r.certificado = C.cn || null; r.serie = C.serie || null; r.emissor = C.emissor || null; r.validade = C.validade || null;
    if (!C.digAlg) throw new Error('Resumo da assinatura em formato não suportado.');
    if (!C.attrs || !C.md) throw new Error('A assinatura não traz os atributos assinados (PAdES).');
    const cobertos = new Uint8Array(l1 + l2); cobertos.set(b.subarray(a, a + l1), 0); cobertos.set(b.subarray(c, c + l2), l1);
    r.resumo_ok = (await sha(C.digAlg, cobertos)) === C.md;
    if (!r.resumo_ok) throw new Error('O resumo da assinatura não bate com o arquivo.');
    if (!C.spki) throw new Error('O PDF não traz o certificado de quem assinou.');
    if (C.chaveAlg !== '1.2.840.113549.1.1.1') throw new Error('Tipo de chave do certificado não suportado (só RSA).');
    const hashSig = SIG_RSA[C.sigAlg] === undefined ? null : (SIG_RSA[C.sigAlg] || C.digAlg);
    if (!hashSig) throw new Error('Algoritmo da assinatura não suportado.');
    const chave = await subtle().importKey('spki', C.spki, { name: 'RSASSA-PKCS1-v1_5', hash: hashSig }, false, ['verify']);
    const at = C.attrs.slice(); at[0] = 0x31;   // os atributos assinados são assinados como SET OF
    r.assinatura_ok = await subtle().verify('RSASSA-PKCS1-v1_5', chave, C.assin, at);
    if (!r.assinatura_ok) throw new Error('A assinatura digital do PDF não conferiu.');
  } catch (e) { r.erro = e.message || String(e); }
  return r;
}

const AssinaturaPDF = { conferir, prefixos, assinaturas, versao: 'S158-2026-11-13' };
if (typeof module !== 'undefined' && module.exports) module.exports = AssinaturaPDF; else raiz.AssinaturaPDF = AssinaturaPDF;
})(typeof window !== 'undefined' ? window : globalThis);
