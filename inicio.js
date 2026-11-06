// Página de início: apresenta o status e pede a visualização na primeira visita.
// Um clique salva a escolha e abre o status; as outras preferências ficam como estão.
(function () {
    "use strict";
    const S = window.Status;
    const { el, icone } = S;

    const prefs = S.lerPreferencias();
    S.aplicarTema(prefs.comum.tema);

    // Miniatura de cada visualização: esboço estático, só para dar a ideia do formato.
    // o = operacional com movimento intenso, d = degradado, p = operacional com movimento normal.
    const PADRAO = "ooooodoooooopoooooodoooooo";
    function faixa(qtd, deslocamento) {
        return el("span", { classe: "mini-faixa" }, Array.from({ length: qtd }, (_, i) => el("i", { classe: "m-" + PADRAO[(i + deslocamento) % PADRAO.length] })));
    }
    function traco(largura) { return el("span", { classe: "mini-traco", style: "width:" + largura }); }

    function miniatura(id) {
        if (id === "mapa")
            return el("span", { classe: "miniatura mini-mapa", "aria-hidden": "true" }, [
                el("span", { classe: "mini-linhas" }, [0, 3, 7, 11, 5].map(d => el("span", { classe: "mini-linha" }, [traco("18%"), faixa(18, d)]))),
                el("span", { classe: "mini-lateral" }, [0, 1, 2].map(() => el("span", { classe: "mini-linha" }, [el("i", { classe: "m-d" }), traco("70%")])))
            ]);
        return el("span", { classe: "miniatura mini-cards", "aria-hidden": "true" },
            [0, 4, 9, 13].map(d => el("span", { classe: "mini-cartao" }, [traco("55%"), faixa(10, d)])));
    }

    function escolher(id) {
        prefs.comum.visualizacao = id;
        // Sem gravar, o status mandaria de volta para cá: o parâmetro avisa que o início já foi visto.
        location.href = S.salvarPreferencias(prefs) ? "index.html" : "index.html?inicio=visto";
    }

    document.getElementById("opcoes").replaceChildren(...Object.entries(S.VISUALIZACOES).map(([id, v]) => {
        const botao = el("button", { type: "button" }, [
            miniatura(id),
            el("span", { classe: "titulo" }, [icone(v.icone), v.nome + (id === S.PREFERENCIAS_PADRAO.comum.visualizacao ? " (padrão)" : "")]),
            el("small", { texto: v.descricao })
        ]);
        botao.addEventListener("click", () => escolher(id));
        return botao;
    }));
})();
