// Página pública de status: lê as views do Supabase, monta o modelo e entrega à visualização escolhida.
// JS puro, sem build. Visualizações em vistas.js; peças comuns e preferências em comum.js.
(function () {
    "use strict";
    const S = window.Status;
    const { el, icone } = S;

    // Primeira visita: apresenta a página e pede a visualização antes de mostrar o status.
    // ?inicio=visto evita voltar ao início quando o navegador lê mas não consegue gravar.
    if (S.primeiraVisita() && !/[?&]inicio=visto\b/.test(location.search)) {
        location.replace("inicio.html");
        return;
    }

    const config = window.STATUS_CONFIG || {};
    // A função status_publico_v2 devolve no máximo 60 ciclos: acima disso não há o que mostrar.
    const HISTORICO_QTD = Math.max(1, Math.min(60, Number(config.HISTORICO_QTD) || 60));
    const ATUALIZACAO_SEG = Math.max(15, Number(config.PAGINA_ATUALIZACAO_SEGUNDOS) || 60);
    // Ciclos perdidos (pelo intervalo do último ciclo) até avisar que a atualização está atrasada.
    const CICLOS_ATRASO = 3;
    // Sem ciclo novo há mais que isso: todas as redes ficam "Sem informação".
    const SEM_INFORMACAO_MIN = Math.max(1, Number(config.SEM_INFORMACAO_MINUTOS) || 60);
    // Folga depois do horário previsto do próximo ciclo: o monitor grava alguns segundos depois.
    const FOLGA_CICLO_SEG = 20;

    const elVista = document.getElementById("vista");
    const elAviso = document.getElementById("aviso");
    const elAtualizacao = document.getElementById("atualizacao");

    let prefs = S.lerPreferencias();
    let modelo = null;
    let restante = ATUALIZACAO_SEG;
    let carregando = false;

    // Dados lidos do Supabase, guardados entre as atualizações para buscar só o que é novo.
    // { servicos: [{tipo, rede}], assinatura, ciclos: [horário, do mais antigo ao mais recente],
    //   itens: Map("TIPO|REDE" → 2 caracteres por ciclo), ultimo: {data_verificacao, intervalo_consulta_segundos, config} }
    let dados = null;
    let ultimaBusca = 0;

    // ---------------------------------------------------------------------------------
    // Supabase (REST/PostgREST, só leitura). Uma chamada por atualização: a função
    // status_publico_v2 (supabase/schema.sql), que devolve o status em formato compacto.
    // ---------------------------------------------------------------------------------
    async function buscarStatus(desde) {
        let url = config.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/status_publico_v2";
        if (desde) url += "?p_desde=" + encodeURIComponent(desde);
        const resposta = await fetch(url, { headers: { apikey: config.SUPABASE_ANON_KEY } });
        if (!resposta.ok)
            throw new Error("status_publico_v2: HTTP " + resposta.status);
        return resposta.json();
    }

    // "celulas" vem num texto só: rede a rede, na ordem de servicos, com 2 caracteres por ciclo.
    // Devolve as células de cada rede, na mesma ordem.
    function celulasPorRede(r, qtServicos) {
        const tamanho = r.ciclos.length * 2;
        if (r.celulas.length !== qtServicos * tamanho)
            throw new Error("status_publico_v2: celulas com " + r.celulas.length + " caracteres, esperado " + qtServicos * tamanho);
        return Array.from({ length: qtServicos }, (_, i) => r.celulas.substr(i * tamanho, tamanho));
    }

    function horario(iso) { return new Date(iso).getTime(); }

    function lerUltimo(r, configAnterior) {
        if (!r.ultimo) return null;
        return { data_verificacao: r.ultimo.data, intervalo_consulta_segundos: r.ultimo.intervalo, config: r.ultimo.config || configAnterior || {} };
    }

    async function cargaCompleta() {
        const r = await buscarStatus(null);
        const servicos = r.servicos.map(s => ({ tipo: s[0], rede: s[1] }));
        const celulas = celulasPorRede(r, servicos.length);
        return {
            servicos,
            assinatura: r.assinatura,
            ciclos: r.ciclos,
            itens: new Map(servicos.map((s, i) => [s.tipo + "|" + s.rede, celulas[i]])),
            ultimo: lerUltimo(r, null)
        };
    }

    async function carregarDados() {
        if (!dados || !dados.ciclos.length) {
            dados = await cargaCompleta();
            return dados;
        }

        // Incremental: só os ciclos depois do último que a página já tem (normalmente 0 ou 1).
        const r = await buscarStatus(dados.ciclos[dados.ciclos.length - 1]);
        // Lista de redes ou config mudou (assinatura diferente): as células não batem com a lista
        // guardada. Refaz a carga completa.
        if (r.assinatura !== dados.assinatura) {
            dados = await cargaCompleta();
            return dados;
        }
        const novos = r.ciclos.length;
        if (novos) {
            const celulas = celulasPorRede(r, dados.servicos.length);
            dados.servicos.forEach((s, i) => {
                const k = s.tipo + "|" + s.rede;
                dados.itens.set(k, dados.itens.get(k) + celulas[i]);
            });
            dados.ciclos = dados.ciclos.concat(r.ciclos);
            // Mantém só os últimos HISTORICO_QTD ciclos (2 caracteres por ciclo).
            const sobra = dados.ciclos.length - HISTORICO_QTD;
            if (sobra > 0) {
                dados.ciclos = dados.ciclos.slice(sobra);
                for (const [k, celulas] of dados.itens) dados.itens.set(k, celulas.slice(sobra * 2));
            }
        }
        dados.ultimo = lerUltimo(r, dados.ultimo && dados.ultimo.config);
        return dados;
    }

    // Converte os 2 caracteres de um ciclo (ver status_publico_v2 no schema.sql) no item que normalizar() espera.
    const STATUS_POR_LETRA = { o: "operacional", d: "degradado", b: "baixo_movimento" };
    const MOTIVO_POR_LETRA = { f: "falha", p: "pendente", a: "falha_e_pendente" };
    function itemDaCelula(celula) {
        if (!celula || celula[0] === ".") return null;
        const letra = celula[0];
        return {
            status: STATUS_POR_LETRA[letra.toLowerCase()],
            motivo: MOTIVO_POR_LETRA[celula[1]] || null,
            pouco_movimento: letra !== letra.toLowerCase()
        };
    }

    // Volume não é status: sem falha, a rede é operacional; abaixo do mínimo de transações é "movimento normal" no público.
    // Rede ausente no ciclo = nenhuma transação. "baixo_movimento" só vem de ciclos gravados antes do pouco_movimento.
    function normalizar(item) {
        if (!item) return { status: "operacional", motivo: null, volume: "sem" };
        if (item.status === "baixo_movimento") return Object.assign({}, item, { status: "operacional", volume: "pouco" });
        return Object.assign({}, item, { volume: item.pouco_movimento ? "pouco" : null });
    }

    function montarModelo(dados) {
        // O histórico vai do mais antigo ao mais recente.
        const ciclos = dados.ciclos;
        const ultimo = dados.ultimo;
        const iUltimo = ultimo ? ciclos.findIndex(c => horario(c) === horario(ultimo.data_verificacao)) : -1;

        let atrasado = false;
        let desatualizado = true;
        if (ultimo) {
            const idadeMs = Date.now() - horario(ultimo.data_verificacao);
            atrasado = idadeMs > CICLOS_ATRASO * ultimo.intervalo_consulta_segundos * 1000;
            desatualizado = idadeMs > SEM_INFORMACAO_MIN * 60 * 1000;
        }

        const cards = dados.servicos.map(servico => {
            const celulas = dados.itens.get(servico.tipo + "|" + servico.rede) || "";
            const celula = i => itemDaCelula(celulas.substr(i * 2, 2));
            const historico = ciclos.map((data, i) => {
                const item = normalizar(celula(i));
                return { data, status: item.status, motivo: item.motivo, volume: item.volume };
            });
            const doUltimo = iUltimo >= 0 ? celula(iUltimo) : null;
            const atual = desatualizado ? { status: "sem_informacao" } : normalizar(doUltimo);
            return { tipo: servico.tipo, rede: servico.rede, nome: servico.tipo + " · " + servico.rede, atual, historico };
        });

        return { ultimo, atrasado, desatualizado, ciclos: ciclos.slice(), cards };
    }

    // Próxima busca: logo depois do horário previsto do próximo ciclo. Atrasado ou sem dado: o intervalo do config.js.
    function segundosAteProximaBusca() {
        if (!dados || !dados.ultimo) return ATUALIZACAO_SEG;
        const intervalo = dados.ultimo.intervalo_consulta_segundos || 120;
        const previsto = horario(dados.ultimo.data_verificacao) + (intervalo + FOLGA_CICLO_SEG) * 1000;
        const seg = Math.ceil((previsto - Date.now()) / 1000);
        return seg >= 15 && seg <= intervalo + FOLGA_CICLO_SEG ? seg : ATUALIZACAO_SEG;
    }

    // ---------------------------------------------------------------------------------
    // Renderização
    // ---------------------------------------------------------------------------------
    function intervaloSeg() { return (modelo && modelo.ultimo && modelo.ultimo.intervalo_consulta_segundos) || 120; }

    // Período nunca maior do que a página busca.
    function prefsEfetivas() {
        const p = JSON.parse(JSON.stringify(prefs));
        for (const grupo of ["cards", "mapa"]) p[grupo].periodoCiclos = Math.min(p[grupo].periodoCiclos, HISTORICO_QTD);
        return p;
    }

    function vistaAtual() {
        const nome = window.Vistas[prefs.comum.visualizacao] ? prefs.comum.visualizacao : "mapa";
        document.body.dataset.vista = nome;
        elVista.className = "vista-" + nome;
        return window.Vistas[nome];
    }

    function render() {
        const vista = vistaAtual();
        if (!modelo) return;
        vista.render(elVista, { modelo, prefs: prefsEfetivas(), intervaloSeg: intervaloSeg(), alterarComum, alternarFavorita });
    }

    // Preferência do grupo "comum" mudada pela própria vista (ordenação, só favoritas): salva e redesenha.
    function alterarComum(chave, valor) {
        prefs.comum[chave] = valor;
        S.salvarPreferencias(prefs);
        render();
    }

    // A vista é redesenhada inteira: o foco volta para a estrela da mesma rede.
    function alternarFavorita(card) {
        const k = S.chaveFavorita(card);
        const favoritas = prefs.comum.favoritas;
        prefs.comum.favoritas = favoritas.includes(k) ? favoritas.filter(f => f !== k) : favoritas.concat([k]);
        S.salvarPreferencias(prefs);
        render();
        const estrela = Array.from(elVista.querySelectorAll("[data-favorita]")).find(b => b.dataset.favorita === k);
        if (estrela) estrela.focus();
    }

    function avisar(tipo, titulo, texto) {
        elAviso.replaceChildren(el("div", { classe: "aviso " + (tipo === "erro" ? "aviso-erro" : "aviso-alerta") }, [
            icone(tipo === "erro" ? "erro" : "relogio"), el("div", {}, [el("b", { texto: titulo }), texto])
        ]));
    }

    function avisoDoModelo() {
        if (!modelo.ultimo) avisar("alerta", "Ainda não há dados recentes.", "Assim que o monitoramento enviar a primeira verificação, as redes aparecem aqui.");
        else if (modelo.desatualizado) avisar("alerta", "Sem informação no momento.", "O monitoramento não envia dados desde " + S.fmtDataHora(modelo.ultimo.data_verificacao) + ". O histórico abaixo vai até esse horário.");
        else if (modelo.atrasado) avisar("alerta", "Atualização atrasada.", "A última verificação foi às " + S.fmtHora(modelo.ultimo.data_verificacao) + ". As situações abaixo são desse horário.");
        else elAviso.replaceChildren();
    }

    // No celular fica só o horário: as partes "longo" somem no CSS.
    function mostrarAtualizacao() {
        if (!modelo || !modelo.ultimo) { elAtualizacao.textContent = carregando ? "Carregando…" : ""; return; }
        const resto = prefs.comum.atualizacaoAutomatica ? " · próxima atualização em " + restante + " s" : " · atualização automática desligada";
        elAtualizacao.replaceChildren(
            el("span", { classe: "longo", texto: "Última verificação às " }),
            S.fmtHora(modelo.ultimo.data_verificacao),
            el("span", { classe: "longo", texto: resto })
        );
    }

    async function atualizar() {
        if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
            avisar("erro", "Configuração ausente.", "Preencha SUPABASE_URL e SUPABASE_ANON_KEY no config.js.");
            return;
        }
        if (carregando) return;
        carregando = true;
        ultimaBusca = Date.now();
        restante = ATUALIZACAO_SEG;
        if (modelo) document.body.classList.add("atualizando");
        else vistaAtual().esqueleto(elVista);
        mostrarAtualizacao();
        try {
            modelo = montarModelo(await carregarDados());
            avisoDoModelo();
            render();
        } catch (erro) {
            // Mantém a última renderização; só avisa.
            avisar("erro", "Não foi possível atualizar agora.", modelo ? "Mostrando a última atualização. Nova tentativa em instantes." : "Nova tentativa em instantes.");
            if (!modelo) elVista.replaceChildren();
            // Resposta fora do esperado pode deixar os dados guardados pela metade: a próxima é completa.
            dados = null;
            console.error(erro);
        } finally {
            carregando = false;
            restante = segundosAteProximaBusca();
            document.body.classList.remove("atualizando");
            mostrarAtualizacao();
        }
    }

    // ---------------------------------------------------------------------------------
    // Barra superior: atualizar, tema, ajuda (a engrenagem é um link para configuracao.html)
    // ---------------------------------------------------------------------------------
    function desenharBotaoTema() {
        const tema = prefs.comum.tema;
        document.querySelectorAll("[data-tema-botao]").forEach(b => {
            b.replaceChildren(icone(tema === "claro" ? "sol" : tema === "escuro" ? "lua" : "sistema"));
            b.setAttribute("aria-label", "Tema: " + tema + ". Trocar");
            b.title = "Tema: " + tema;
        });
    }

    document.querySelectorAll("[data-tema-botao]").forEach(b => b.addEventListener("click", () => {
        const ordem = ["sistema", "claro", "escuro"];
        prefs.comum.tema = ordem[(ordem.indexOf(prefs.comum.tema) + 1) % ordem.length];
        S.salvarPreferencias(prefs);
        S.aplicarTema(prefs.comum.tema);
        desenharBotaoTema();
    }));
    document.querySelectorAll("[data-atualizar-botao]").forEach(b => { b.appendChild(icone("atualizar")); b.addEventListener("click", atualizar); });
    document.querySelectorAll("[data-config-botao]").forEach(b => b.appendChild(icone("engrenagem")));
    document.querySelectorAll("[data-ajuda-botao]").forEach(b => {
        b.append(icone("interrogacao"), el("span", { classe: "rotulo-botao", texto: "Como ler" }));
        b.addEventListener("click", abrirAjuda);
    });
    // Banner lateral da página (Cards); no Mapa ele vai na coluna das ocorrências (vistas.js).
    document.querySelectorAll("[data-anuncio-lateral]").forEach(a => { const banner = S.anuncioLateral(); if (banner) a.appendChild(banner); });

    function abrirAjuda() {
        const c = (modelo && modelo.ultimo && modelo.ultimo.config) || {};
        const v = (chave, padrao) => (c[chave] !== undefined && c[chave] !== null ? c[chave] : padrao);
        // Texto em linguagem simplificada (princípios do STE): uma ideia por frase, voz ativa, mesmo termo para a mesma coisa.
        // Sem número de transações nem limite: o leitor não deve conseguir deduzir o volume de uma rede.
        const janela = v("janela_minutos", 10);
        const fundo = el("div", { classe: "ajuda-fundo" });
        const fechar = el("button", { classe: "botao botao-icone fechar", "aria-label": "Fechar ajuda" }, [icone("fechar")]);
        const painel = el("aside", { classe: "ajuda", role: "dialog", "aria-modal": "true", "aria-label": "Como ler esta página" }, [
            fechar,
            el("h2", { texto: "Como ler" }),
            el("p", { texto: "Esta página mostra se as redes de captura da Multiplus Card processam as transações normalmente. O monitoramento verifica as redes a cada " + Math.round(intervaloSeg() / 60) + " minutos." }),
            el("h3", { texto: "Situações" }),
            el("ul", {}, [
                el("li", {}, [S.selo("operacional"), " a taxa de transações negadas nos últimos minutos está dentro do normal."]),
                el("li", {}, [S.selo("degradado"), " a taxa de transações negadas nos últimos minutos passou do limite de alerta."]),
                el("li", {}, [S.selo("sem_informacao"), " o monitoramento não envia dados há mais de " + SEM_INFORMACAO_MIN + " minutos. Se o atraso for menor, um aviso no topo da página mostra o horário da última verificação."])
            ]),
            el("h3", { texto: "Marca ao lado da situação" }),
            el("p", { texto: "A marca dá uma informação a mais. A marca não muda a situação da rede." }),
            el("ul", {}, [
                el("li", {}, [S.marcaIntenso(), " movimento intenso: a rede teve movimento intenso nos últimos " + janela + " minutos. Sem esta marca, a rede tem movimento normal."])
            ]),
            el("h3", { texto: "Histórico" }),
            el("p", { texto: "Cada barra é uma verificação do monitoramento. A barra da direita é a verificação mais recente." }),
            // Amostra da cor no lugar do nome dela: as mesmas classes h- das barras.
            el("ul", { classe: "cores-ajuda" }, [
                ["h-operacional", "operacional, com movimento intenso"],
                ["h-operacional h-pouco", "operacional, com movimento normal"],
                ["h-degradado", "degradado, com movimento intenso"],
                ["h-degradado h-pouco", "degradado, com movimento normal"]
            ].map(([classe, texto]) => el("li", {}, [el("i", { classe, "aria-hidden": "true" }), texto]))),
            el("h3", { texto: "O que não é falha da rede" }),
            el("p", { texto: "As recusas do emissor do cartão não entram no cálculo. Exemplo de recusa do emissor: saldo insuficiente." }),
            el("h3", { texto: "Redes que aparecem na página" }),
            el("p", { texto: "A página mostra uma rede quando há atividade recente nela." }),
            el("h3", { texto: "Personalizar" }),
            el("p", {}, ["Em ", el("a", { href: "configuracao.html", texto: "Configurações" }), ", você pode escolher:"]),
            el("ul", {}, [
                el("li", { texto: "a visualização: mapa ou cards;" }),
                el("li", { texto: "a ordem das redes;" }),
                el("li", { texto: "os tipos de rede que a página mostra;" }),
                el("li", { texto: "outros detalhes." })
            ]),
            el("p", { texto: "A página salva as escolhas somente neste navegador." }),
            el("p", { texto: "Para ver somente as suas redes:" }),
            el("ol", {}, [
                el("li", { texto: "Clique na estrela ao lado do nome da rede." }),
                el("li", { texto: "Marque a opção \"Só favoritas\"." })
            ]),
            el("p", { texto: "Se uma rede que não é favorita ficar degradada, um aviso aparece no topo da página." }),
            el("p", {}, ["Para ver de novo a apresentação da página, abra o ", el("a", { href: "inicio.html", texto: "início" }), "."]),
            el("h3", { texto: "Suporte técnico" }),
            el("p", { texto: "Dúvida? Fale com o suporte técnico da Multiplus Card:" }),
            el("ul", {}, [
                el("li", {}, [el("a", { href: "tel:08007778134", texto: "0800 777 8134" }), " · WhatsApp e ligação"]),
                el("li", {}, [el("a", { href: "mailto:atendimento@multipluscard.com.br", texto: "atendimento@multipluscard.com.br" })])
            ])
        ]);
        function sair() { fundo.remove(); painel.remove(); document.removeEventListener("keydown", tecla); }
        function tecla(e) { if (e.key === "Escape") sair(); }
        fundo.addEventListener("click", sair);
        fechar.addEventListener("click", sair);
        document.addEventListener("keydown", tecla);
        document.body.append(fundo, painel);
        fechar.focus();
    }

    // Preferências mudadas na página de configurações (em outra aba): aplica na hora.
    window.addEventListener("storage", evento => {
        if (evento.key !== S.CHAVE_PREFERENCIAS) return;
        prefs = S.lerPreferencias();
        S.aplicarTema(prefs.comum.tema);
        desenharBotaoTema();
        render();
    });

    S.aplicarTema(prefs.comum.tema);
    desenharBotaoTema();
    vistaAtual();

    // Aba oculta (outra aba, janela minimizada): não busca nada. Ao voltar, atualiza na hora se já passou um ciclo.
    setInterval(() => {
        if (!prefs.comum.atualizacaoAutomatica || carregando || document.hidden) return;
        restante--;
        if (restante <= 0) atualizar();
        else mostrarAtualizacao();
    }, 1000);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden || !prefs.comum.atualizacaoAutomatica || carregando) return;
        if (Date.now() - ultimaBusca > intervaloSeg() * 1000) atualizar();
    });

    atualizar();
})();
