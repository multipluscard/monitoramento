// Peças comuns às duas visualizações: textos, ícones, selos, resumos e a dica do histórico.
// Todo texto vindo do banco entra por textContent (nada de innerHTML com dado).
(function () {
    "use strict";

    const ORDEM_TIPOS = ["TEF", "POS", "PIX", "WEB"];
    const DESCRICAO_TIPO = {
        TEF: "Transações de cartão nas automações comerciais",
        POS: "Transações de cartão nas maquininhas",
        PIX: "Recebimentos via Pix",
        WEB: "Pagamentos on-line"
    };
    const ROTULO_STATUS = {
        operacional: "Operacional",
        degradado: "Degradado",
        sem_informacao: "Sem informação"
    };
    // Volume no público: abaixo do mínimo de transações é "movimento normal" (verde-claro); no mínimo ou acima,
    // "movimento intenso" (verde-escuro, com marca). Os dados continuam com volume "pouco"/"sem" (ver normalizar() no app.js).
    const ROTULO_VOLUME = { pouco: "Movimento normal", sem: "Movimento normal" };
    const ROTULO_INTENSO = "Movimento intenso";
    // "pendente" e "falha_e_pendente" só aparecem em ciclos gravados antes do alerta de pendentes.
    const ROTULO_MOTIVO = {
        falha: "Alta taxa de falhas",
        pendente: "Transações pendentes",
        falha_e_pendente: "Alta taxa de falhas e transações pendentes"
    };
    const GRAVIDADE = { degradado: 0, sem_informacao: 1, operacional: 2 };
    const GRAVIDADE_MOTIVO = { falha_e_pendente: 0, falha: 1, pendente: 2 };

    // Ícones no traço do Tabler Icons (licença MIT).
    const ICONES = {
        check: '<path d="M5 12l5 5l10 -10"/>',
        alerta: '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/>',
        interrogacao: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 17l0 .01"/><path d="M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4"/>',
        busca: '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
        sol: '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
        lua: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>',
        sistema: '<path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10z"/><path d="M7 20h10"/><path d="M9 16v4"/><path d="M15 16v4"/>',
        atualizar: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
        abaixo: '<path d="M6 9l6 6l6 -6"/>',
        fechar: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
        relogio: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/>',
        erro: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
        engrenagem: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
        cards: '<path d="M4 4h6v6h-6z"/><path d="M14 4h6v6h-6z"/><path d="M4 14h6v6h-6z"/><path d="M14 14h6v6h-6z"/>',
        mapa: '<path d="M3 5h4v4h-4z"/><path d="M10 5h4v4h-4z"/><path d="M17 5h4v4h-4z"/><path d="M3 15h4v4h-4z"/><path d="M10 15h4v4h-4z"/><path d="M17 15h4v4h-4z"/>',
        estrela: '<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"/>',
        subindo: '<path d="M3 17l6 -6l4 4l8 -8"/><path d="M14 7l7 0l0 7"/>'
    };
    const ICONE_STATUS = { operacional: "check", degradado: "alerta", sem_informacao: "interrogacao" };

    function el(tag, atributos, filhos) {
        const no = document.createElement(tag);
        for (const [nome, valor] of Object.entries(atributos || {})) {
            if (valor === null || valor === undefined || valor === false)
                continue;
            if (nome === "texto") no.textContent = valor;
            else if (nome === "classe") no.className = valor;
            else no.setAttribute(nome, valor === true ? "" : valor);
        }
        for (const filho of [].concat(filhos || []))
            if (filho) no.appendChild(typeof filho === "string" ? document.createTextNode(filho) : filho);
        return no;
    }

    function icone(nome) {
        const span = document.createElement("span");
        span.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[nome] || "") + "</svg>";
        return span.firstChild;
    }

    function classeSelo(status) {
        if (status === "operacional") return "selo selo-operacional";
        if (status === "degradado") return "selo selo-degradado";
        return "selo selo-neutro";
    }

    function selo(status) {
        return el("span", { classe: classeSelo(status) }, [icone(ICONE_STATUS[status]), ROTULO_STATUS[status] || status]);
    }

    // Marca discreta ao lado do selo: movimento intenso.
    function marcaIntenso() {
        return el("span", { classe: "marca-secundaria marca-intenso", role: "img", "aria-label": ROTULO_INTENSO, title: ROTULO_INTENSO }, [icone("subindo")]);
    }

    // Situação atual da rede: o selo e, quando houver, a marca de movimento intenso.
    function situacao(atual) {
        return el("span", { classe: "situacao-atual" }, [
            selo(atual.status),
            atual.status !== "sem_informacao" && !atual.volume ? marcaIntenso() : null
        ]);
    }

    // Ordem por situação: degradado, sem informação, operacional; no operacional, o sem volume por último.
    function gravidade(atual) {
        return GRAVIDADE[atual.status] + (atual.volume === "pouco" ? 0.1 : atual.volume === "sem" ? 0.2 : 0);
    }

    // Ordenação das redes dentro de cada tipo: [valor, rótulo curto, rótulo da configuração].
    const ORDENS = [
        ["nome", "Nome", "Por nome"],
        ["situacao", "Situação", "Por situação (degradadas primeiro)"],
        ["favoritas", "Favoritas primeiro", "Favoritas primeiro"]
    ];

    // Favorita é por tipo + rede: favoritar TEF · Cielo não favorita POS · Cielo.
    function chaveFavorita(card) { return card.tipo + "|" + card.rede; }

    // Comparador das redes de um mesmo tipo; o empate fica sempre pelo nome.
    function comparador(ordem, favoritas) {
        const porNome = (a, b) => a.rede.localeCompare(b.rede);
        if (ordem === "situacao")
            return (a, b) => (gravidade(a.atual) - gravidade(b.atual)) || porNome(a, b);
        if (ordem === "favoritas") {
            const fav = c => (favoritas.includes(chaveFavorita(c)) ? 0 : 1);
            return (a, b) => (fav(a) - fav(b)) || porNome(a, b);
        }
        return porNome;
    }

    // Estrela ao lado do nome da rede: liga e desliga a favorita.
    function botaoFavorita(card, favorita, aoAlternar) {
        const nome = card.tipo + " · " + card.rede;
        const botao = el("button", {
            type: "button", classe: "estrela", "data-favorita": chaveFavorita(card), "aria-pressed": String(favorita),
            "aria-label": favorita ? "Tirar " + nome + " das favoritas" : "Marcar " + nome + " como favorita",
            title: favorita ? "Favorita: clique para tirar" : "Marcar como favorita"
        }, [icone("estrela")]);
        botao.addEventListener("click", evento => { evento.stopPropagation(); aoAlternar(card); });
        return botao;
    }

    function motivoMaisGrave(a, b) {
        const ga = GRAVIDADE_MOTIVO[a] === undefined ? 9 : GRAVIDADE_MOTIVO[a];
        const gb = GRAVIDADE_MOTIVO[b] === undefined ? 9 : GRAVIDADE_MOTIVO[b];
        return ga <= gb ? a : b;
    }

    function fmtHora(iso) { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    function fmtDataHora(iso) { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

    // Tipos presentes, na ordem TEF, POS, PIX, WEB e depois qualquer outro em ordem alfabética.
    function tiposPresentes(cards) {
        const presentes = Array.from(new Set(cards.map(c => c.tipo)));
        return ORDEM_TIPOS.filter(t => presentes.includes(t)).concat(presentes.filter(t => !ORDEM_TIPOS.includes(t)).sort());
    }

    function periodoTexto(ciclos, intervaloSeg) {
        const minutos = Math.round(ciclos * intervaloSeg / 60);
        if (minutos >= 60 && minutos % 60 === 0) return (minutos / 60) + " h";
        if (minutos > 60) return Math.floor(minutos / 60) + " h " + (minutos % 60) + " min";
        return minutos + " min";
    }

    // Trechos seguidos de degradação no histórico (mais antigo -> mais recente).
    // Qualquer ciclo não degradado encerra o trecho. Mudar de motivo no meio não abre outro: vale o mais grave.
    function ocorrencias(historico) {
        const lista = [];
        let atual = null;
        for (const h of historico) {
            if (h.status !== "degradado") { atual = null; continue; }
            if (!atual) { atual = { inicio: h.data, fim: h.data, motivo: h.motivo, ciclos: 0 }; lista.push(atual); }
            atual.fim = h.data;
            atual.ciclos++;
            atual.motivo = motivoMaisGrave(atual.motivo, h.motivo);
        }
        return lista;
    }

    // Resumo em linguagem simples, no lugar do "% dos ciclos".
    function resumo(historico, periodo) {
        const occ = ocorrencias(historico);
        const comVolume = historico.filter(h => !h.volume).length;
        if (occ.length === 0)
            return { nivel: comVolume ? "ok" : "neutro", texto: "Sem degradação nas últimas " + periodo + (comVolume ? "" : " · movimento normal"), ocorrencias: occ };
        const ultima = occ[occ.length - 1];
        return {
            nivel: "alerta",
            texto: (occ.length === 1 ? "1 degradação" : occ.length + " degradações") + " nas últimas " + periodo + " · última às " + fmtHora(ultima.fim),
            ocorrencias: occ
        };
    }

    // Completa o histórico com vazios à esquerda até o tamanho da janela.
    function itensHistorico(historico, total) {
        const recorte = historico.slice(-total);
        return new Array(Math.max(0, total - recorte.length)).fill(null).concat(recorte);
    }

    function textoDica(h) {
        if (!h) return "Sem registro";
        let t = fmtHora(h.data) + " · " + (ROTULO_STATUS[h.status] || h.status);
        if (h.motivo && ROTULO_MOTIVO[h.motivo]) t += " — " + ROTULO_MOTIVO[h.motivo];
        if (h.status === "operacional" || h.status === "degradado") t += " · " + (h.volume ? ROTULO_VOLUME[h.volume] : ROTULO_INTENSO);
        return t;
    }

    // ---------------------------------------------------------------------------------
    // Dica do histórico: a faixa inteira é a área de toque; o ciclo vem da posição.
    // Teclado: a faixa é um slider (setas percorrem os ciclos).
    // ---------------------------------------------------------------------------------
    let elDica = null;
    function dica() {
        if (!elDica) {
            elDica = el("div", { classe: "dica", role: "tooltip", hidden: true });
            document.body.appendChild(elDica);
        }
        return elDica;
    }

    function mostrarDica(texto, ancora, x) {
        const d = dica();
        d.textContent = texto;
        d.hidden = false;
        const r = ancora.getBoundingClientRect();
        const largura = d.offsetWidth;
        d.style.left = Math.min(Math.max(8, x - largura / 2), window.innerWidth - largura - 8) + "px";
        d.style.top = Math.max(8, r.top - d.offsetHeight - 8) + "px";
    }

    function esconderDica() { if (elDica) elDica.hidden = true; }

    // itens: lista do tamanho total da faixa (null = sem registro), do mais antigo ao mais recente.
    // aoMover (opcional): recebe o índice sob o cursor, ou -1 ao sair.
    function ligarHistorico(faixa, itens, resumoTexto, aoMover) {
        let indice = itens.length - 1;
        faixa.setAttribute("tabindex", "0");
        faixa.setAttribute("role", "slider");
        faixa.setAttribute("aria-label", "Histórico. " + resumoTexto);
        faixa.setAttribute("aria-valuemin", "1");
        faixa.setAttribute("aria-valuemax", String(itens.length));

        function marcar(i, x) {
            indice = Math.max(0, Math.min(itens.length - 1, i));
            const filhos = faixa.children;
            for (let k = 0; k < filhos.length; k++) filhos[k].classList.toggle("ativo", k === indice);
            const texto = textoDica(itens[indice]);
            faixa.setAttribute("aria-valuenow", String(indice + 1));
            faixa.setAttribute("aria-valuetext", texto);
            const r = faixa.getBoundingClientRect();
            mostrarDica(texto, faixa, x !== undefined ? x : r.left + (indice + 0.5) * r.width / itens.length);
            if (aoMover) aoMover(indice);
        }
        function limpar() {
            for (const f of faixa.children) f.classList.remove("ativo");
            esconderDica();
            if (aoMover) aoMover(-1);
        }
        function porPosicao(evento) {
            const r = faixa.getBoundingClientRect();
            marcar(Math.floor((evento.clientX - r.left) / r.width * itens.length), evento.clientX);
        }

        faixa.addEventListener("pointermove", porPosicao);
        faixa.addEventListener("pointerdown", porPosicao);
        faixa.addEventListener("pointerleave", evento => { if (evento.pointerType === "mouse") limpar(); });
        faixa.addEventListener("focus", () => marcar(indice));
        faixa.addEventListener("blur", limpar);
        faixa.addEventListener("keydown", evento => {
            if (evento.key === "ArrowLeft") { marcar(indice - 1); evento.preventDefault(); }
            else if (evento.key === "ArrowRight") { marcar(indice + 1); evento.preventDefault(); }
            else if (evento.key === "Home") { marcar(0); evento.preventDefault(); }
            else if (evento.key === "End") { marcar(itens.length - 1); evento.preventDefault(); }
            else if (evento.key === "Escape") limpar();
        });
    }

    document.addEventListener("pointerdown", evento => {
        if (!evento.target.closest('[role="slider"]')) esconderDica();
    });
    document.addEventListener("scroll", esconderDica, { passive: true });

    // Faixa de histórico (barras), usada pelas duas visualizações.
    function faixaHistorico(classe, itens, resumoTexto, aoMover) {
        const faixa = el("div", { classe }, itens.map(h => el("span", { classe: h ? "h-" + h.status + (h.volume ? " h-pouco" : "") : "" })));
        ligarHistorico(faixa, itens, resumoTexto, aoMover);
        return faixa;
    }

    function chave(card) { return (card.tipo + "-" + card.rede).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

    // ---------------------------------------------------------------------------------
    // Preferências do visitante: ficam só neste navegador (localStorage).
    // Grupo "comum" vale para as duas visualizações; os outros, para cada uma.
    // ---------------------------------------------------------------------------------
    const CHAVE_PREFERENCIAS = "uptime.preferencias";
    const PREFERENCIAS_PADRAO = {
        comum: { visualizacao: "mapa", tema: "sistema", tiposOcultos: [], mostrarPoucoMovimento: true, sempreDegradadas: true, atualizacaoAutomatica: true, ordem: "nome", favoritas: [], somenteFavoritas: false },
        cards: { periodoCiclos: 60, abaInicial: "TODAS", mostrarAtencao: true, poucoMovimentoAberto: true },
        mapa: { periodoCiclos: 60, mostrarPaineis: true, mostrarOcorrencias: true, densidade: "normal" }
    };
    const VISUALIZACOES = {
        mapa: { nome: "Mapa de calor", descricao: "Todas as redes no tempo, com a linha do tempo das ocorrências.", icone: "mapa" },
        cards: { nome: "Cards", descricao: "Destaca o que precisa de atenção, com abas por tipo.", icone: "cards" }
    };

    function lerPreferencias() {
        let salvas = {};
        try { salvas = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || "{}") || {}; } catch (e) { salvas = {}; }
        const prefs = {};
        for (const grupo of Object.keys(PREFERENCIAS_PADRAO))
            prefs[grupo] = Object.assign({}, PREFERENCIAS_PADRAO[grupo], salvas[grupo] || {});
        if (!VISUALIZACOES[prefs.comum.visualizacao]) prefs.comum.visualizacao = PREFERENCIAS_PADRAO.comum.visualizacao;
        // A ordenação era só da Lista (lista.ordem): quem já tinha escolhido mantém a escolha.
        if (!(salvas.comum && salvas.comum.ordem) && salvas.lista && salvas.lista.ordem) prefs.comum.ordem = salvas.lista.ordem;
        if (!ORDENS.some(o => o[0] === prefs.comum.ordem)) prefs.comum.ordem = PREFERENCIAS_PADRAO.comum.ordem;
        // Cópia: sem ela, marcar uma favorita alteraria a lista do padrão.
        prefs.comum.favoritas = Array.isArray(prefs.comum.favoritas) ? prefs.comum.favoritas.slice() : [];
        return prefs;
    }

    function salvarPreferencias(prefs) {
        try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(prefs)); return true; }
        catch (e) { return false; } // navegador sem armazenamento: vale só nesta visita
    }

    // Apaga tudo: na próxima abertura do status, a página de início aparece de novo.
    function limparPreferencias() {
        try { localStorage.removeItem(CHAVE_PREFERENCIAS); return true; }
        catch (e) { return false; }
    }

    // Primeira visita = o navegador guarda preferências e ainda não há nenhuma salva.
    // Navegador sem armazenamento nunca é primeira visita (senão a página de início voltaria sempre).
    function primeiraVisita() {
        try { return localStorage.getItem(CHAVE_PREFERENCIAS) === null; }
        catch (e) { return false; }
    }

    function aplicarTema(tema) {
        if (tema === "claro") document.documentElement.setAttribute("data-theme", "light");
        else if (tema === "escuro") document.documentElement.setAttribute("data-theme", "dark");
        else document.documentElement.removeAttribute("data-theme");
    }

    // Opções de período do histórico, limitadas ao que a página busca (HISTORICO_QTD do config.js).
    function opcoesPeriodo(maximoCiclos, intervaloSeg) {
        return [15, 30, 60, 120, 180, 360, 720]
            .filter(c => c <= maximoCiclos)
            .map(c => ({ ciclos: c, rotulo: periodoTexto(c, intervaloSeg) }));
    }

    // Banner lateral: cópia do <template id="modelo-anuncio-lateral"> do index.html (null nas outras páginas).
    function anuncioLateral() {
        const modelo = document.getElementById("modelo-anuncio-lateral");
        return modelo ? modelo.content.firstElementChild.cloneNode(true) : null;
    }

    // Menu flutuante: transparente sobre a chamada do topo enquanto a página está no início; com fundo depois de rolar.
    function marcarRolagem() { document.documentElement.classList.toggle("rolado", window.scrollY > 8); }
    window.addEventListener("scroll", marcarRolagem, { passive: true });
    marcarRolagem();

    window.Status = {
        anuncioLateral,
        CHAVE_PREFERENCIAS, PREFERENCIAS_PADRAO, VISUALIZACOES, lerPreferencias, salvarPreferencias, limparPreferencias, primeiraVisita, aplicarTema, opcoesPeriodo,
        ORDENS, chaveFavorita, comparador, botaoFavorita, ORDEM_TIPOS, DESCRICAO_TIPO, ROTULO_STATUS, ROTULO_MOTIVO, ROTULO_VOLUME, ROTULO_INTENSO,
        el, icone, selo, situacao, marcaIntenso, gravidade, motivoMaisGrave, fmtHora, fmtDataHora, tiposPresentes, periodoTexto,
        ocorrencias, resumo, itensHistorico, textoDica, ligarHistorico, faixaHistorico, esconderDica, chave
    };

    // Ano do © no rodapé das três páginas: o HTML traz 2026, aqui vira o ano corrente.
    document.querySelectorAll("[data-ano]").forEach(e => { e.textContent = String(new Date().getFullYear()); });
})();
