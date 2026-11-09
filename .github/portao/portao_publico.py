#!/usr/bin/env python3
# Portão do TapHub — a parte que roda no GrupoTap/tapflow (público). CÓPIA IGUAL da fonte, que mora no
# brunoengetap/tapflow-privado (portao/publico/portao_publico.py); o portão confere que a cópia = a fonte.
# Desenho: processos/github-portao-desenho.md (P1–P12). Modelo: o portão da Proper (GrupoTap/ProperAdmin).
#
#   --chamar   (job "portão", pull_request_target) dispara o workflow `portao` do privado para este Pull request
#              e espera. Traz só ✅/❌ e o NOME do passo que reprovou (nada do privado vem para cá).
#              env: PORTAO_TOKEN (segredo do ambiente "portao"), REPO, HEAD_REPO, PR, SHA
#   --autoteste  pares que TÊM de reprovar (token faltando, vencido, sem permissão; Pull request de fora)
import json, os, sys, time, datetime

PRIVADO = "brunoengetap/tapflow-privado"
WF = "portao.yml"
CHAVE = ("chave do portão vencida ou apagada: gerar outra "
         "(passo a passo em processos/github-portao-desenho.md §6)")


def _api(metodo, caminho, tok, corpo=None):
    import urllib.request, urllib.error
    base = os.environ.get("PORTAO_API", "https://api.github.com").rstrip("/")
    req = urllib.request.Request(base + caminho, method=metodo,
                                 data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Accept": "application/vnd.github+json", "Authorization": "Bearer " + tok,
                                          "User-Agent": "portao-taphub", "X-GitHub-Api-Version": "2022-11-28",
                                          **({"Content-Type": "application/json"} if corpo is not None else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:                       # rede fora do ar
        return 0, {"message": str(e)}


def _erro(msg):
    print("❌ " + msg, flush=True)
    if os.environ.get("GITHUB_ACTIONS"):
        print("::error::" + msg)


def chamar(espera=None, teto=None, janela=180):
    espera = espera if espera is not None else int(os.environ.get("PORTAO_ESPERA", "15"))
    teto = teto if teto is not None else int(os.environ.get("PORTAO_TETO", str(50 * 60)))
    tok = os.environ.get("PORTAO_TOKEN", "").strip()
    repo, pr, sha = os.environ.get("REPO", ""), os.environ.get("PR", ""), os.environ.get("SHA", "")
    cab = os.environ.get("HEAD_REPO", repo)
    if cab.lower() != repo.lower():
        _erro("Pull request vindo de outro repositório (%s): o portão não roda código de fora. "
              "Abra o Pull request a partir de um ramo DESTE repositório." % (cab or "apagado"))
        return 1
    if not tok:
        _erro(CHAVE + " — o segredo PORTAO_TOKEN não está no ambiente \"portao\"")
        return 1
    chamada = "%s-%s-%s" % (sha[:12], os.environ.get("GITHUB_RUN_ID", "0"), os.environ.get("GITHUB_RUN_ATTEMPT", "1"))
    st, j = _api("POST", "/repos/%s/actions/workflows/%s/dispatches" % (PRIVADO, WF), tok,
                 dict(ref="main", inputs=dict(repo=repo, pr=str(pr), sha=sha, chamada=chamada)))
    if st not in (200, 204):
        if st == 401:
            _erro(CHAVE)
        else:
            dica = {403: "a chave do portão não tem a permissão Actions = Read and write no tapflow-privado "
                         "(refazer pelo passo a passo em processos/github-portao-desenho.md §6)",
                    404: "a chave não enxerga o tapflow-privado (repositório não escolhido na chave) ou o "
                         "workflow portao.yml ainda não está no main de lá",
                    422: "o privado recusou os dados da chamada"}.get(st, "resposta inesperada")
            _erro("não consegui chamar o portão no privado (HTTP %d): %s. %s" % (st, dica, str(j.get("message", ""))[:200]))
        return 1
    desde = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    print("chamei o portão no privado (%s) — procurando a execução…" % chamada, flush=True)
    t0, run = time.time(), None
    while time.time() - t0 < janela and run is None:
        st, j = _api("GET", "/repos/%s/actions/workflows/%s/runs?event=workflow_dispatch&per_page=100&created=%%3E%%3D%s"
                     % (PRIVADO, WF, desde), tok)
        for r in (j.get("workflow_runs") or []) if st == 200 else []:
            if (r.get("display_title") or "").endswith(" " + chamada):
                run = r
                break
        if run is None:
            time.sleep(espera or 0.05)
    if run is None:
        _erro("o privado não começou a execução em 3 min (fila do GitHub cheia ou minutos do mês acabaram) — "
              "use \"Re-run jobs\" daqui a pouco")
        return 1
    print("execução no privado: %s" % run.get("html_url", ""), flush=True)
    while run.get("status") != "completed" and time.time() - t0 < teto:
        time.sleep(espera)
        st, j = _api("GET", "/repos/%s/actions/runs/%s" % (PRIVADO, run["id"]), tok)
        if st == 200:
            run = j
    if run.get("status") != "completed":
        _erro("o portão do privado não terminou em %d min" % (teto // 60))
        return 1
    st, j = _api("GET", "/repos/%s/actions/runs/%s/jobs" % (PRIVADO, run["id"]), tok)
    passos = [s for jb in (j.get("jobs") or []) for s in (jb.get("steps") or [])]
    ruins = [s["name"] for s in passos if s.get("conclusion") == "failure"]
    avisos = [s["name"] for s in passos if s.get("name", "").startswith("⚠") and s.get("conclusion") == "success"]
    for n in avisos:                              # o passo de aviso só RODA quando há o que avisar
        print("   " + n)
        if os.environ.get("GITHUB_ACTIONS"):
            print("::warning::" + n)
    if run.get("conclusion") == "success":
        print("✅ portão verde: conferência do código, banco do zero, todas as suítes e as telas"
              + (" — COM AVISO acima" if avisos else ""))
        return 0
    _erro("portão vermelho (%s): não dar Merge" % (run.get("conclusion") or "?"))
    for n in ruins:
        print("   ❌ " + n)
        if os.environ.get("GITHUB_ACTIONS"):
            print("::error::reprovou no passo: %s" % n)
    return 1


def autoteste():
    import threading, http.server, io, contextlib
    falhas = []
    estado = dict(dispatch=204, conclusao="success", aparece=True)

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _r(self, st, j=None):
            b = json.dumps(j or {}).encode()
            self.send_response(st); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            self._r(estado["dispatch"])

        def do_GET(self):
            if "/workflows/" in self.path:
                runs = [dict(id=7, status="completed", conclusion=estado["conclusao"], html_url="x",
                             display_title="portão GrupoTap/tapflow#5 " + CH)] if estado["aparece"] else []
                return self._r(200, dict(workflow_runs=runs))
            if self.path.endswith("/jobs"):
                return self._r(200, dict(jobs=[dict(steps=[dict(name="Suítes", conclusion="failure" if estado["conclusao"] != "success" else "success")])]))
            return self._r(200, dict(id=7, status="completed", conclusion=estado["conclusao"]))

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    CH = "a" * 12 + "-0-1"
    os.environ.update(PORTAO_API="http://127.0.0.1:%d" % srv.server_port, REPO="GrupoTap/tapflow",
                      HEAD_REPO="GrupoTap/tapflow", PR="5", SHA="a" * 40, GITHUB_RUN_ID="0", GITHUB_RUN_ATTEMPT="1")
    os.environ.pop("GITHUB_ACTIONS", None)

    def roda():
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            r = chamar(espera=0, teto=5, janela=1)
        return r, out.getvalue()

    def c(nome, cond, det=""):
        print(("  ✓ " if cond else "  ✗ ") + nome)
        if not cond:
            falhas.append(nome); print(det)

    os.environ.pop("PORTAO_TOKEN", None)
    r, o = roda(); c("sem a chave REPROVA e diz o que fazer", r == 1 and "§6" in o, o)
    os.environ["PORTAO_TOKEN"] = "chave-falsa"
    r, o = roda(); c("verde no privado = verde aqui", r == 0, o)
    estado["dispatch"] = 401
    r, o = roda(); c("chave vencida/apagada (401) REPROVA com o aviso escrito", r == 1 and "vencida ou apagada" in o, o)
    estado["dispatch"] = 403
    r, o = roda(); c("chave sem permissão (403) REPROVA", r == 1 and "permissão" in o, o)
    estado["dispatch"] = 204; estado["conclusao"] = "failure"
    r, o = roda(); c("vermelho no privado REPROVA com o nome do passo", r == 1 and "Suítes" in o, o)
    estado["conclusao"] = "success"; estado["aparece"] = False
    r, o = roda(); c("execução que não aparece REPROVA", r == 1, o)
    estado["aparece"] = True; os.environ["HEAD_REPO"] = "outro/tapflow"
    r, o = roda(); c("Pull request de fora REPROVA sem chamar o privado", r == 1 and "outro repositório" in o, o)
    srv.shutdown()
    print("autoteste do público: %s" % ("✅ ok" if not falhas else "❌ %d errado(s)" % len(falhas)))
    return 1 if falhas else 0


if __name__ == "__main__":
    a = sys.argv[1:]
    if "--chamar" in a:
        sys.exit(chamar())
    if "--autoteste" in a:
        sys.exit(autoteste())
    print("uso: portao_publico.py --chamar | --autoteste")
    sys.exit(9)
