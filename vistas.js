// As duas visualizações da página: cards e mapa de calor.
// Cada uma expõe esqueleto(alvo) e render(alvo, ctx), com ctx = { modelo, prefs, intervaloSeg }.
// O estado de tela (filtros, abas, linhas abertas) fica guardado aqui e sobrevive às atualizações.
(function () {
    "use strict";
    const S = window.Status;
    const { el, icone } = S;

    // Operacional com movimento normal (abaixo do mínimo de transações): nos cards, ficam num grupo próprio que pode ser recolhido.
    function calma(atual) { return atual.status === "operacional" && !!atual.volume; }

    function favorita(c, comum) { return comum.favoritas.includes(S.chaveFavorita(c)); }

    // Filtros do grupo "comum" (tipos ocultos, movimento normal, só favoritas).
    // O filtro de movimento normal esconde a rede degradada só com "sempre mostrar degradadas" desligado;
    // o "só favoritas" esconde, e faixaFavoritas() avisa.
    function cardsVisiveis(modelo, comum) {
        return modelo.cards
            .filter(c => !comum.tiposOcultos.includes(c.tipo))
            .filter(c => comum.mostrarPoucoMovimento || !c.atual.volume || (comum.sempreDegradadas && c.atual.status === "degradado"))
            .filter(c => !comum.somenteFavoritas || favorita(c, comum));
    }

    function vazio(texto) { return el("p", { classe: "vazio-filtro", texto }); }

    function estrela(c, ctx) { return S.botaoFavorita(c, favorita(c, ctx.prefs.comum), ctx.alternarFavorita); }

    // Caixa "Só favoritas" das barras de filtro: grava a preferência (vale para as duas vistas).
    function opcaoSoFavoritas(ctx, classe) {
        const entrada = el("input", { type: "checkbox", checked: ctx.prefs.comum.somenteFavoritas });
        entrada.addEventListener("change", () => ctx.alterarComum("somenteFavoritas", entrada.checked));
        return el("label", { classe }, [entrada, " Só favoritas"]);
    }

    // Caixa "Só movimento intenso": é a preferência mostrarPoucoMovimento (Configurações) ao contrário.
    // A rede degradada continua aparecendo se "sempre mostrar degradadas" estiver ligado (ver cardsVisiveis).
    function opcaoSoIntenso(ctx, classe) {
        const entrada = el("input", { type: "checkbox", checked: !ctx.prefs.comum.mostrarPoucoMovimento });
        entrada.addEventListener("change", () => ctx.alterarComum("mostrarPoucoMovimento", !entrada.checked));
        return el("label", { classe, title: ctx.prefs.comum.sempreDegradadas ? "Esconde as redes com movimento normal. As degradadas continuam aparecendo (Configurações)." : "Esconde as redes com movimento normal, inclusive as degradadas (Configurações)." }, [entrada, " Só movimento intenso"]);
    }

    // Legenda das cores do histórico: a mesma nas duas vistas (usa as classes h- das barras).
    function legendaCores() {
        const item = (classe, texto) => el("span", {}, [el("i", { classe }), texto]);
        return el("div", { classe: "legenda-cores" }, [
            item("h-operacional", "Operacional · movimento intenso"),
            item("h-operacional h-pouco", "Operacional · movimento normal"),
            item("h-degradado", "Degradado · movimento intenso"),
            item("h-degradado h-pouco", "Degradado · movimento normal"),
            item("", "Sem registro")
        ]);
    }

    // Caixa "Só com ocorrência" (estado de tela de cada vista, não é preferência salva).
    function rotuloSoOcorrencia(entrada, periodo, classe) {
        return el("label", { classe, title: "Só as redes com degradação nas últimas " + periodo }, [entrada, " Só com ocorrência"]);
    }

    // Com "só favoritas" ligado: quantas aparecem e quantas degradadas ficaram de fora.
    function faixaFavoritas(ctx) {
        const comum = ctx.prefs.comum;
        if (!comum.somenteFavoritas) return null;
        const doTipo = ctx.modelo.cards.filter(c => !comum.tiposOcultos.includes(c.tipo));
        const qtFavoritas = doTipo.filter(c => favorita(c, comum)).length;
        const degFora = ctx.modelo.desatualizado ? 0 : doTipo.filter(c => !favorita(c, comum) && c.atual.status === "degradado").length;
        const verTodas = el("button", { type: "button", classe: "botao", texto: "Ver todas" });
        verTodas.addEventListener("click", () => ctx.alterarComum("somenteFavoritas", false));
        return el("div", { classe: "filtro-favoritas" + (degFora ? " alerta" : ""), "aria-live": "polite" }, [
            icone(degFora ? "alerta" : "estrela"),
            el("span", {}, [
                qtFavoritas ? "Mostrando só as favoritas (" + qtFavoritas + " de " + doTipo.length + ")."
                    : "Nenhuma favorita marcada. Clique em Ver todas e marque a estrela ao lado do nome da rede.",
                degFora ? el("b", { texto: " " + (degFora === 1 ? "1 rede fora das favoritas está degradada." : degFora + " redes fora das favoritas estão degradadas.") }) : null
            ]),
            verTodas
        ]);
    }

    // =================================================================================
    // A · Cards
    // =================================================================================
    const cards = (function () {
        const estado = { aba: null, busca: "", soOcorrencia: false, poucoAberto: null };

        function cartao(c, mostrarTipo, ciclos, periodo, ctx) {
            const historico = c.historico.slice(-ciclos);
            const r = S.resumo(historico, periodo);
            const faixa = S.faixaHistorico("faixa-historico", S.itensHistorico(c.historico, ciclos), r.texto);
            const corpo = [];
            if (c.atual.status === "degradado") corpo.push(el("span", { classe: "motivo", texto: S.ROTULO_MOTIVO[c.atual.motivo] }));
            return el("article", { classe: "cartao" + (c.atual.status === "degradado" ? " atencao" : "") }, [
                el("div", { classe: "cabeca" }, [el("div", {}, [mostrarTipo ? el("div", { classe: "tipo", texto: c.tipo }) : null, el("div", { classe: "rede" }, [estrela(c, ctx), el("span", { texto: c.rede })])]), S.situacao(c.atual)]),
                ...corpo,
                faixa,
                el("div", { classe: "rodape-cartao" }, [
                    el("span", { texto: "há " + periodo }),
                    el("span", { texto: "agora" })
                ])
            ]);
        }

        function render(alvo, ctx) {
            const prefs = ctx.prefs.cards;
            const visiveis = cardsVisiveis(ctx.modelo, ctx.prefs.comum);
            const tipos = S.tiposPresentes(visiveis);
            if (estado.aba === null) estado.aba = prefs.abaInicial;
            if (estado.aba !== "TODAS" && !tipos.includes(estado.aba)) estado.aba = tipos[0] || "TODAS";
            if (estado.poucoAberto === null) estado.poucoAberto = prefs.poucoMovimentoAberto;
            const ciclos = prefs.periodoCiclos;
            const periodo = S.periodoTexto(ciclos, ctx.intervaloSeg);
            const ordenar = S.comparador(ctx.prefs.comum.ordem, ctx.prefs.comum.favoritas);

            // Situação geral
            const deg = visiveis.filter(c => c.atual.status === "degradado").sort(ordenar);
            const estadoGeral = el("div", { classe: "estado-geral " + (ctx.modelo.desatualizado ? "neutro" : deg.length ? "alerta" : "ok"), "aria-live": "polite" }, [
                el("span", { classe: "ponto" }),
                ctx.modelo.desatualizado ? "Situação atual indisponível"
                    : deg.length ? (deg.length === 1 ? "1 rede precisa de atenção" : deg.length + " redes precisam de atenção") : "Todas as redes operando normalmente"
            ]);

            // Abas
            const abas = el("nav", { classe: "abas", role: "tablist", "aria-label": "Tipo de captura" });
            for (const tipo of tipos.concat(["TODAS"])) {
                const doTipo = tipo === "TODAS" ? visiveis : visiveis.filter(c => c.tipo === tipo);
                const d = doTipo.filter(c => c.atual.status === "degradado").length;
                const b = el("button", { role: "tab", "aria-selected": String(estado.aba === tipo) }, [
                    tipo === "TODAS" ? "Todas" : tipo,
                    el("span", { classe: "qt", texto: String(doTipo.length) }),
                    d ? el("span", { classe: "marca-alerta", title: d + " com degradação" }, [icone("alerta"), String(d)]) : null
                ]);
                b.addEventListener("click", () => { estado.aba = tipo; render(alvo, ctx); });
                abas.appendChild(b);
            }
            const campo = el("input", { classe: "campo", type: "search", placeholder: "Buscar rede", "aria-label": "Buscar rede", value: estado.busca });
            const conteudo = el("div");
            campo.addEventListener("input", () => { estado.busca = campo.value; renderConteudo(); });
            const so = el("input", { type: "checkbox", checked: estado.soOcorrencia });
            so.addEventListener("change", () => { estado.soOcorrencia = so.checked; renderConteudo(); });
            abas.appendChild(rotuloSoOcorrencia(so, periodo, "so-favoritas"));
            abas.appendChild(opcaoSoFavoritas(ctx, "so-favoritas"));
            abas.appendChild(opcaoSoIntenso(ctx, "so-favoritas"));
            abas.appendChild(el("div", { classe: "busca" }, [icone("busca"), campo]));

            function renderConteudo() {
                conteudo.replaceChildren();
                const busca = estado.busca.trim().toUpperCase();
                const todas = estado.aba === "TODAS";
                const lista = (todas ? visiveis : visiveis.filter(c => c.tipo === estado.aba))
                    .filter(c => !busca || c.rede.toUpperCase().includes(busca))
                    .filter(c => !estado.soOcorrencia || S.ocorrencias(c.historico.slice(-ciclos)).length)
                    .sort((a, b) => (todas ? tipos.indexOf(a.tipo) - tipos.indexOf(b.tipo) : 0) || ordenar(a, b));
                if (!lista.length) { conteudo.appendChild(vazio("Nenhuma rede encontrada.")); return; }

                const mostrarAtencao = prefs.mostrarAtencao && !busca && deg.length > 0;
                if (mostrarAtencao) {
                    conteudo.appendChild(el("h2", { classe: "bloco rotulo-grupo" }, [icone("alerta"), "Precisa de atenção · todas as categorias"]));
                    conteudo.appendChild(el("div", { classe: "grade" }, deg.map(c => cartao(c, true, ciclos, periodo, ctx))));
                } else if (prefs.mostrarAtencao && !busca && !ctx.modelo.desatualizado) {
                    conteudo.appendChild(el("div", { classe: "tudo-ok" }, [icone("check"), "Nenhuma rede com degradação agora."]));
                }

                const ativas = lista.filter(c => !calma(c.atual))
                    .filter(c => !(mostrarAtencao && c.atual.status === "degradado"));
                const pouco = lista.filter(c => calma(c.atual));
                if (ativas.length) {
                    conteudo.appendChild(el("h2", { classe: "bloco rotulo-grupo", texto: todas ? "Todas as redes" : estado.aba + (S.DESCRICAO_TIPO[estado.aba] ? " · " + S.DESCRICAO_TIPO[estado.aba] : "") }));
                    conteudo.appendChild(el("div", { classe: "grade" }, ativas.map(c => cartao(c, todas, ciclos, periodo, ctx))));
                }
                if (pouco.length) {
                    const det = el("details", { classe: "pouco", open: estado.poucoAberto }, [
                        el("summary", {}, [icone("abaixo"), "Operacionais com movimento normal agora (" + pouco.length + ")"]),
                        el("div", { classe: "grade" }, pouco.map(c => cartao(c, todas, ciclos, periodo, ctx)))
                    ]);
                    det.addEventListener("toggle", () => { estado.poucoAberto = det.open; });
                    conteudo.appendChild(det);
                }
            }

            alvo.replaceChildren(...[faixaFavoritas(ctx), estadoGeral, abas, legendaCores(), conteudo].filter(Boolean));
            renderConteudo();
        }

        function esqueleto(alvo) {
            alvo.replaceChildren(
                el("div", { classe: "esqueleto", style: "height:28px;width:320px;margin-top:4px" }),
                el("div", { classe: "abas" }, Array.from({ length: 4 }, () => el("span", { classe: "esqueleto", style: "width:70px;height:22px;margin:8px 6px" }))),
                el("div", { classe: "grade", style: "margin-top:22px" }, Array.from({ length: 8 }, () => el("div", { classe: "esqueleto esqueleto-cartao" })))
            );
        }

        return { render, esqueleto };
    })();

    // =================================================================================
    // B · Mapa de calor + ocorrências
    // =================================================================================
    const mapa = (function () {
        const estado = { tipo: null, busca: "", soOcorrencia: false };

        function paineis(visiveis, rerender) {
            const alvo = el("section", { classe: "paineis", "aria-label": "Resumo por tipo (clique para filtrar)" });
            for (const tipo of S.tiposPresentes(visiveis)) {
                const doTipo = visiveis.filter(c => c.tipo === tipo);
                // ok + pouco = operacionais; ok = movimento intenso; pouco = movimento normal.
                const pouco = doTipo.filter(c => calma(c.atual)).length;
                const ok = doTipo.filter(c => c.atual.status === "operacional").length - pouco;
                const deg = doTipo.filter(c => c.atual.status === "degradado").length;
                const dist = el("div", { classe: "distribuicao", "aria-hidden": "true" });
                for (const [classe, qt] of [["d-ok", ok], ["d-ok-pouco", pouco], ["d-deg", deg]])
                    if (qt) { const s = el("span", { classe }); s.style.flex = qt + " 0 0"; dist.appendChild(s); }
                const painel = el("button", { classe: "painel", "aria-pressed": String(estado.tipo === tipo), title: S.DESCRICAO_TIPO[tipo] || tipo }, [
                    // Sem selo de situação no tipo: rede degradada não condena o meio de captura. A situação é só por rede.
                    el("div", { classe: "cabeca" }, [el("span", { classe: "tipo", texto: tipo })]),
                    el("div", { classe: "numero" }, [el("b", { texto: String(ok + pouco) }), " de " + doTipo.length + " redes operacionais agora"]),
                    dist,
                    el("div", { classe: "legenda" }, [el("span", { texto: ok + " mov. intenso" }), pouco ? el("span", { texto: pouco + " mov. normal" }) : null, deg ? el("span", { texto: deg + " degradada" + (deg > 1 ? "s" : "") }) : null])
                ]);
                painel.addEventListener("click", () => { estado.tipo = estado.tipo === tipo ? null : tipo; rerender(); });
                alvo.appendChild(painel);
            }
            return alvo;
        }

        // Uma linha por rede: desde a ocorrência mais antiga do período, com a situação da mais recente.
        function linhaDoTempo(visiveis, ciclos, periodo, desatualizado) {
            const lista = [];
            for (const c of visiveis) {
                const historico = c.historico.slice(-ciclos);
                const occ = S.ocorrencias(historico);
                if (!occ.length) continue;
                const ultimo = historico[historico.length - 1];
                const maisRecente = occ[occ.length - 1];
                lista.push({
                    card: c,
                    inicio: occ[0].inicio,
                    fim: maisRecente.fim,
                    vezes: occ.length,
                    motivo: occ.map(o => o.motivo).reduce(S.motivoMaisGrave),
                    andamento: !desatualizado && ultimo && maisRecente.fim === ultimo.data
                });
            }
            lista.sort((a, b) => b.fim.localeCompare(a.fim));
            const ul = el("ul", { classe: "linha-tempo" });
            if (!lista.length) ul.appendChild(el("li", { classe: "sem-ocorrencias", texto: "Nenhuma degradação nas últimas " + periodo + "." }));
            for (const o of lista)
                ul.appendChild(el("li", { classe: o.andamento ? "" : "resolvida" }, [
                    el("div", { classe: "quando", texto: S.fmtHora(o.inicio) + (o.fim !== o.inicio ? " – " + S.fmtHora(o.fim) : "") + (o.vezes > 1 ? " · " + o.vezes + " vezes" : "") }),
                    el("div", { classe: "quem", texto: o.card.tipo + " · " + o.card.rede }),
                    el("div", { classe: "oque", texto: S.ROTULO_MOTIVO[o.motivo] || "" }),
                    el("div", { classe: "situacao " + (o.andamento ? "em-andamento" : "ok"), texto: o.andamento ? "Em andamento" : "Normalizado" })
                ]));
            return el("aside", { classe: "quadro lateral" }, [
                el("div", { classe: "quadro-cabeca" }, [el("h2", { texto: "Ocorrências" }), el("span", { classe: "rotulo-grupo", texto: lista.length ? (lista.length === 1 ? "1 rede" : lista.length + " redes") + " em " + periodo : "" })]),
                ul
            ]);
        }

        function render(alvo, ctx) {
            const prefs = ctx.prefs.mapa;
            const visiveis = cardsVisiveis(ctx.modelo, ctx.prefs.comum);
            const ciclos = prefs.periodoCiclos;
            const periodo = S.periodoTexto(ciclos, ctx.intervaloSeg);
            if (estado.tipo && !visiveis.some(c => c.tipo === estado.tipo)) estado.tipo = null;
            const rerender = () => render(alvo, ctx);

            // Cursor de tempo comum: destaca a mesma coluna em todas as linhas.
            const datas = S.itensHistorico(ctx.modelo.ciclos.map(d => ({ data: d })), ciclos).map(x => x && x.data);
            const cursor = el("span", { classe: "cursor-hora", hidden: true });
            let colunaAtual = -1;
            const matriz = el("div", { classe: "matriz" + (prefs.densidade === "compacta" ? " compacta" : "") });
            function marcarColuna(i) {
                if (i === colunaAtual) return;
                colunaAtual = i;
                matriz.querySelectorAll(".celulas").forEach(linha => {
                    for (let k = 0; k < linha.children.length; k++) linha.children[k].classList.toggle("coluna", k === i);
                });
                cursor.hidden = i < 0 || !datas[i];
                if (!cursor.hidden) { cursor.textContent = S.fmtHora(datas[i]); cursor.style.left = ((i + 0.5) / ciclos * 100) + "%"; }
            }

            const busca = el("input", { classe: "campo", type: "search", placeholder: "Buscar rede", "aria-label": "Buscar rede", value: estado.busca });
            const so = el("input", { type: "checkbox", checked: estado.soOcorrencia });
            function termoBusca() { return estado.busca.trim().toUpperCase(); }

            // A coluna de ocorrências obedece o tipo escolhido no painel e a busca.
            let lateral = null;
            function renderLateral() {
                if (!prefs.mostrarOcorrencias) return;
                const termo = termoBusca();
                const filtradas = visiveis
                    .filter(c => !estado.tipo || c.tipo === estado.tipo)
                    .filter(c => !termo || c.rede.toUpperCase().includes(termo));
                const novo = linhaDoTempo(filtradas, ciclos, periodo, ctx.modelo.desatualizado);
                if (lateral) lateral.replaceWith(novo);
                lateral = novo;
            }

            function renderMatriz() {
                matriz.replaceChildren();
                colunaAtual = -1;
                const marcas = el("div", { classe: "marcas" }, [el("span", { texto: "há " + periodo }), el("span", { texto: "agora" }), cursor]);
                matriz.appendChild(el("div", { classe: "eixo", "aria-hidden": "true" }, [el("span", { texto: "Rede" }), el("span", { texto: "Agora" }), marcas]));
                const termo = termoBusca();
                const ordenar = S.comparador(ctx.prefs.comum.ordem, ctx.prefs.comum.favoritas);
                let total = 0;
                for (const tipo of S.tiposPresentes(visiveis)) {
                    if (estado.tipo && estado.tipo !== tipo) continue;
                    const doTipo = visiveis.filter(c => c.tipo === tipo)
                        .filter(c => !termo || c.rede.toUpperCase().includes(termo))
                        .filter(c => !estado.soOcorrencia || S.ocorrencias(c.historico.slice(-ciclos)).length)
                        .sort(ordenar);
                    if (!doTipo.length) continue;
                    total += doTipo.length;
                    matriz.appendChild(el("div", { classe: "grupo", texto: tipo + (S.DESCRICAO_TIPO[tipo] ? " · " + S.DESCRICAO_TIPO[tipo] : "") }));
                    for (const c of doTipo) {
                        const r = S.resumo(c.historico.slice(-ciclos), periodo);
                        const celulas = S.faixaHistorico("celulas", S.itensHistorico(c.historico, ciclos), c.rede + ". " + r.texto, marcarColuna);
                        matriz.appendChild(el("div", { classe: "linha-mapa", title: c.nome }, [el("span", { classe: "nome" }, [estrela(c, ctx), el("span", { texto: c.rede })]), S.situacao(c.atual), celulas]));
                    }
                }
                if (!total) matriz.appendChild(vazio("Nenhuma rede encontrada com esses filtros."));
            }
            busca.addEventListener("input", () => { estado.busca = busca.value; renderMatriz(); renderLateral(); });
            so.addEventListener("change", () => { estado.soOcorrencia = so.checked; renderMatriz(); });

            const quadro = el("section", { classe: "quadro" }, [
                el("div", { classe: "quadro-cabeca" }, [
                    el("h2", { texto: (estado.tipo ? estado.tipo + " · " : "") + "Últimas " + periodo }),
                    rotuloSoOcorrencia(so, periodo),
                    opcaoSoFavoritas(ctx),
                    opcaoSoIntenso(ctx),
                    el("div", { classe: "busca" }, [icone("busca"), busca])
                ]),
                legendaCores(),
                matriz
            ]);

            const partes = [faixaFavoritas(ctx)].filter(Boolean);
            if (prefs.mostrarPaineis) partes.push(paineis(visiveis, rerender));
            renderLateral();
            // Coluna da direita: ocorrências (se ligadas) e, embaixo, o banner lateral preso na tela ao rolar.
            const coluna = el("div", { classe: "coluna-lateral" }, [lateral, S.anuncioLateral()].filter(Boolean));
            partes.push(el("div", { classe: "corpo" }, [quadro, coluna]));
            alvo.replaceChildren(...partes);
            renderMatriz();
        }

        function esqueleto(alvo) {
            alvo.replaceChildren(
                el("section", { classe: "paineis" }, Array.from({ length: 4 }, () => el("div", { classe: "esqueleto", style: "height:96px;border-radius:12px" }))),
                el("div", { classe: "corpo" }, [
                    el("section", { classe: "quadro", style: "padding:14px" }, Array.from({ length: 12 }, () => el("div", { classe: "esqueleto", style: "height:22px;margin:8px 0" }))),
                    el("aside", { classe: "quadro", style: "padding:14px" }, Array.from({ length: 4 }, () => el("div", { classe: "esqueleto", style: "height:56px;margin:10px 0" })))
                ])
            );
        }

        return { render, esqueleto };
    })();

    window.Vistas = { cards, mapa };
})();
