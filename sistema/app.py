# -*- coding: utf-8 -*-
"""Servidor web Starlette para o Sistema Mega-Sena & Bolão Potenza."""

import asyncio
from contextlib import asynccontextmanager
import json
import sys

import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

from . import bolao_service, network_service, printer_service, realtime, stats_engine, sync
from .config import APP_VERSION, DATA_DIR, STATIC_DIR, get_bet_price
from .db import init_db


def _err(msg: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=status)


async def api_network_info(request: Request) -> JSONResponse:
    return JSONResponse(network_service.get_network_info())


async def api_network_tunnel_start(request: Request) -> JSONResponse:
    network_service.start_tunnel_if_needed()
    return JSONResponse(network_service.get_network_info())


async def api_realtime_version(request: Request) -> JSONResponse:
    return JSONResponse(realtime.get_current_revision())


async def api_realtime_stream(request: Request) -> StreamingResponse:
    q = await realtime.register_subscriber()

    async def event_generator():
        try:
            cur = realtime.get_current_revision()
            yield f"data: {json.dumps(cur)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            realtime.unregister_subscriber(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def api_health(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "version": APP_VERSION})


async def api_sync_status(request: Request) -> JSONResponse:
    return JSONResponse(sync.get_sync_status())


async def api_sync_run(request: Request) -> JSONResponse:
    force_full = request.query_params.get("full") == "1"
    try:
        res = await asyncio.to_thread(sync.sync_concursos, force_full)
        return JSONResponse(res)
    except Exception as exc:
        return _err(f"Falha ao sincronizar: {exc}", 500)


async def api_stats_overview(request: Request) -> JSONResponse:
    window = int(request.query_params.get("window", 100))
    return JSONResponse(stats_engine.get_overview(window_recent=window))


async def api_concursos(request: Request) -> JSONResponse:
    limit = int(request.query_params.get("limit", 40))
    offset = int(request.query_params.get("offset", 0))
    search_raw = request.query_params.get("concurso")
    search = int(search_raw) if search_raw and search_raw.isdigit() else None
    return JSONResponse(stats_engine.get_concursos(limit=limit, offset=offset, search=search))


async def api_generate_games(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        bolao_id = body.get("bolao_id")
        exclude_sigs = set()
        bolao_apostas = []
        if bolao_id:
            detail = bolao_service.get_bolao_detail(int(bolao_id))
            exclude_sigs = {a["assinatura"] for a in detail["apostas"]}
            bolao_apostas = [a["dezenas"] for a in detail["apostas"]]
        res = await asyncio.to_thread(
            stats_engine.generate_games,
            quantidade=int(body.get("quantidade", 5)),
            dezenas_por_jogo=int(body.get("dezenas_por_jogo", 6)),
            estrategia=str(body.get("estrategia", "cobertura_bolao")),
            rules=body.get("rules") or {},
            exclude_signatures=exclude_sigs,
            fixed_numbers=body.get("fixed_numbers") or [],
            excluded_numbers=body.get("excluded_numbers") or [],
            bolao_apostas=bolao_apostas,
        )
        return JSONResponse(res)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err(f"Erro ao gerar jogos: {exc}", 500)


async def api_fechamento(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        res = await asyncio.to_thread(
            stats_engine.generate_fechamento,
            dezenas_base=body.get("dezenas_base") or [],
            garantia=int(body.get("garantia", 4)),
            condicao=int(body.get("condicao", 4)),
            max_jogos=int(body.get("max_jogos", 120)),
        )
        return JSONResponse(res)
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_nomes_list(request: Request) -> JSONResponse:
    return JSONResponse({"nomes": bolao_service.list_catalogo_nomes()})


async def api_nomes_add(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        item = bolao_service.add_catalogo_nome(body.get("nome", ""))
        return JSONResponse(item, status_code=201)
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_boloes_list(request: Request) -> JSONResponse:
    return JSONResponse(
        {
            "boloes": bolao_service.list_boloes(),
            "xlsx_disponiveis": bolao_service.list_workspace_xlsx(),
        }
    )


async def api_boloes_create(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        res = bolao_service.create_bolao(
            nome=body.get("nome", ""),
            concurso_alvo=body.get("concurso_alvo") or None,
            dezenas_por_jogo=int(body.get("dezenas_por_jogo", 6)),
            jogos_por_cota=int(body.get("jogos_por_cota", 4)),
            valor_cota=float(body["valor_cota"]) if body.get("valor_cota") else None,
            valor_jogo=float(body["valor_jogo"]) if body.get("valor_jogo") else None,
            observacoes=body.get("observacoes", ""),
        )
        realtime.notify_bolao_update(res.get("id"))
        return JSONResponse(res, status_code=201)
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_bolao_detail(request: Request) -> JSONResponse:
    bid = int(request.path_params["bolao_id"])
    try:
        return JSONResponse(bolao_service.get_bolao_detail(bid))
    except ValueError as exc:
        return _err(str(exc), 404)


async def api_bolao_update(request: Request) -> JSONResponse:
    bid = int(request.path_params["bolao_id"])
    try:
        body = await request.json()
        res = bolao_service.update_bolao(bid, body)
        realtime.notify_bolao_update(bid)
        return JSONResponse(res)
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_bolao_delete(request: Request) -> JSONResponse:
    bid = int(request.path_params["bolao_id"])
    bolao_service.delete_bolao(bid)
    realtime.notify_bolao_update(bid)
    return JSONResponse({"ok": True})


async def api_bolao_import_xlsx(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        res = await asyncio.to_thread(
            bolao_service.import_potenza_xlsx,
            body.get("filename", ""),
            body.get("bolao_nome") or None,
            float(body.get("valor_jogo", 6.25)),
        )
        return JSONResponse(res, status_code=201)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err(f"Erro ao importar planilha: {exc}", 500)


async def api_participante_add(request: Request) -> JSONResponse:
    bid = int(request.path_params["bolao_id"])
    try:
        body = await request.json()
        p = bolao_service.add_participante(
            bolao_id=bid,
            nome=body.get("nome", ""),
            cotas=int(body.get("cotas", 1)),
            pago=bool(body.get("pago", False)),
            valor_pago=body.get("valor_pago"),
        )
        realtime.notify_bolao_update(bid)
        return JSONResponse(p, status_code=201)
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_participante_update(request: Request) -> JSONResponse:
    pid = int(request.path_params["part_id"])
    try:
        body = await request.json()
        res = bolao_service.update_participante(pid, body)
        realtime.notify_bolao_update()
        return JSONResponse(res)
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_participante_delete(request: Request) -> JSONResponse:
    pid = int(request.path_params["part_id"])
    bolao_service.delete_participante(pid)
    realtime.notify_bolao_update()
    return JSONResponse({"ok": True})


async def api_participantes_copy(request: Request) -> JSONResponse:
    bid = int(request.path_params["bolao_id"])
    try:
        body = await request.json()
        src_id = int(body["source_bolao_id"])
        cnt = bolao_service.copy_participantes(bid, src_id)
        return JSONResponse({"copiados": cnt, "bolao": bolao_service.get_bolao_detail(bid)})
    except Exception as exc:
        return _err(str(exc), 400)


async def api_aposta_add(request: Request) -> JSONResponse:
    bid = int(request.path_params["bolao_id"])
    try:
        body = await request.json()
        pid = int(body["participante_id"]) if body.get("participante_id") else None
        pnome = body.get("participante_nome") or None
        if "jogos" in body:
            res = bolao_service.add_apostas_batch(
                bolao_id=bid,
                participante_id=pid,
                jogos=body["jogos"],
                origem=str(body.get("origem", "gerador")),
                allow_duplicate=False,
                participante_nome=pnome,
            )
            realtime.notify_bolao_update(bid)
            return JSONResponse(res, status_code=201)
        res = bolao_service.add_aposta(
            bolao_id=bid,
            participante_id=pid,
            dezenas=body.get("dezenas") or [],
            origem=str(body.get("origem", "manual")),
            allow_duplicate=False,
            participante_nome=pnome,
        )
        realtime.notify_bolao_update(bid)
        return JSONResponse(res, status_code=201)
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_aposta_delete(request: Request) -> JSONResponse:
    aid = int(request.path_params["aposta_id"])
    bolao_service.delete_aposta(aid)
    realtime.notify_bolao_update()
    return JSONResponse({"ok": True})


async def api_bolao_conferir(request: Request) -> JSONResponse:
    bid = int(request.path_params["bolao_id"])
    conc_raw = request.query_params.get("concurso")
    dezenas_raw = request.query_params.get("dezenas")
    conc = int(conc_raw) if conc_raw and conc_raw.isdigit() else None
    dezenas = [int(x) for x in dezenas_raw.split(",") if x.strip().isdigit()] if dezenas_raw else None
    try:
        return JSONResponse(bolao_service.conferir_bolao(bid, conc, dezenas_manuais=dezenas))
    except ValueError as exc:
        return _err(str(exc), 400)


async def api_printer_profiles(request: Request) -> JSONResponse:
    return JSONResponse({"profiles": printer_service.list_profiles()})


async def api_printer_profile_save(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        return JSONResponse(printer_service.save_profile(body))
    except Exception as exc:
        return _err(str(exc), 400)


async def api_printer_profile_delete(request: Request) -> JSONResponse:
    pid = int(request.path_params["profile_id"])
    printer_service.delete_profile(pid)
    return JSONResponse({"ok": True})


async def api_printer_build_slips(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        tipo = int(body["tipo_aposta"]) if body.get("tipo_aposta") else None
        per_slip = int(body.get("jogos_por_volante", 3))
        games = body.get("games") or []
        if body.get("bolao_id"):
            detail = bolao_service.get_bolao_detail(int(body["bolao_id"]))
            games = [
                {"id": a["id"], "dezenas": a["dezenas"], "participante": a["participante_nome"]}
                for a in detail["apostas"]
            ]
        return JSONResponse(printer_service.build_slips_payload(games, tipo_aposta=tipo, jogos_por_volante=per_slip))
    except Exception as exc:
        return _err(str(exc), 400)


async def api_prices_table(request: Request) -> JSONResponse:
    base = float(request.query_params.get("base", 6.0))
    return JSONResponse({"base": base, "tabela": {str(n): get_bet_price(n, base) for n in range(6, 21)}})


async def index_page(request: Request) -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@asynccontextmanager
async def lifespan(app: Starlette):
    init_db()
    bolao_service.ensure_catalogo_nomes()
    printer_service.ensure_default_profiles()
    network_service.start_tunnel_if_needed()
    yield
    network_service.stop_tunnel()


routes = [
    Route("/", index_page),
    Route("/api/health", api_health),
    Route("/api/network/info", api_network_info, methods=["GET"]),
    Route("/api/network/tunnel/start", api_network_tunnel_start, methods=["POST"]),
    Route("/api/realtime/version", api_realtime_version, methods=["GET"]),
    Route("/api/realtime/stream", api_realtime_stream, methods=["GET"]),
    Route("/api/sync/status", api_sync_status),
    Route("/api/sync", api_sync_run, methods=["POST"]),
    Route("/api/stats/overview", api_stats_overview),
    Route("/api/concursos", api_concursos),
    Route("/api/prices", api_prices_table),
    Route("/api/gerador", api_generate_games, methods=["POST"]),
    Route("/api/fechamento", api_fechamento, methods=["POST"]),
    Route("/api/nomes", api_nomes_list, methods=["GET"]),
    Route("/api/nomes", api_nomes_add, methods=["POST"]),
    Route("/api/boloes", api_boloes_list, methods=["GET"]),
    Route("/api/boloes", api_boloes_create, methods=["POST"]),
    Route("/api/boloes/import-xlsx", api_bolao_import_xlsx, methods=["POST"]),
    Route("/api/boloes/{bolao_id:int}", api_bolao_detail, methods=["GET"]),
    Route("/api/boloes/{bolao_id:int}", api_bolao_update, methods=["PUT"]),
    Route("/api/boloes/{bolao_id:int}", api_bolao_delete, methods=["DELETE"]),
    Route("/api/boloes/{bolao_id:int}/participantes", api_participante_add, methods=["POST"]),
    Route("/api/boloes/{bolao_id:int}/copy-participantes", api_participantes_copy, methods=["POST"]),
    Route("/api/participantes/{part_id:int}", api_participante_update, methods=["PUT"]),
    Route("/api/participantes/{part_id:int}", api_participante_delete, methods=["DELETE"]),
    Route("/api/boloes/{bolao_id:int}/apostas", api_aposta_add, methods=["POST"]),
    Route("/api/apostas/{aposta_id:int}", api_aposta_delete, methods=["DELETE"]),
    Route("/api/boloes/{bolao_id:int}/conferir", api_bolao_conferir, methods=["GET"]),
    Route("/api/printer/profiles", api_printer_profiles, methods=["GET"]),
    Route("/api/printer/profiles", api_printer_profile_save, methods=["POST"]),
    Route("/api/printer/profiles/{profile_id:int}", api_printer_profile_delete, methods=["DELETE"]),
    Route("/api/printer/build-slips", api_printer_build_slips, methods=["POST"]),
    Route("/styles.css", lambda r: FileResponse(STATIC_DIR / "styles.css")),
    Route("/app.js", lambda r: FileResponse(STATIC_DIR / "app.js")),
    Mount("/static", app=StaticFiles(directory=str(STATIC_DIR)), name="static"),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
]

app = Starlette(routes=routes, middleware=middleware, lifespan=lifespan)


def main() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    if sys.stdout is None or sys.stderr is None:
        log_file = open(DATA_DIR / "server.log", "a", encoding="utf-8")
        if sys.stdout is None:
            sys.stdout = log_file
        if sys.stderr is None:
            sys.stderr = log_file
    uvicorn.run("sistema.app:app", host="0.0.0.0", port=8080, reload=False, use_colors=False, loop="asyncio")


if __name__ == "__main__":
    main()
