/* ============================================================================
 * TAPHUB · NÚCLEO — config.js
 * ----------------------------------------------------------------------------
 * As duas chaves do Supabase, num lugar só (decisão D13, 20/10/2026).
 *
 *   · em app/nucleo/config.js  → VAZIAS. Vazias = modo demonstração (o que
 *     acontece ao abrir por duplo clique): o núcleo não chama o servidor.
 *   · em PUBLICAR/nucleo/config.js → PREENCHIDAS, como nos outros arquivos.
 *
 * ⚠ Hub, Manager e Field ainda têm as constantes SUPABASE_URL e
 *   SUPABASE_ANON_KEY no próprio HTML (a regra antiga vale para eles até
 *   migrarem). Se este arquivo estiver vazio, o núcleo usa as do app que o
 *   chamou — a trava de PIN não some em silêncio.
 * ========================================================================== */
window.TF_CONFIG = { SUPABASE_URL: 'https://ewthwgkgwzgutvxkwqfd.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_W987XKBK3Oo2aQ7FJyq9_w_qWrSg_E4' };
