// Configuração pública da página. Tudo aqui é visível para qualquer visitante.
// NUNCA coloque aqui chaves secretas.
window.STATUS_CONFIG = {
    // Chave pública (publishable): só permite ler os dados de status.
    SUPABASE_URL: "https://ycjayvzasqdwguzdfhoa.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_uV0FkJAylJhqIie9Jw-H6Q_cU2r4lh9",

    // Quantos ciclos aparecem nas barras de histórico (o monitor roda a cada 2 min: 60 = 2 h).
    // Máximo: 60, o que a função status_publico_v2 devolve (supabase/schema.sql). Para subir, mude lá também.
    HISTORICO_QTD: 60,

    // A página busca logo depois do horário previsto do próximo ciclo. Este valor só vale quando
    // o ciclo está atrasado ou ainda não há dado: de quanto em quanto tempo tentar de novo.
    PAGINA_ATUALIZACAO_SEGUNDOS: 60,

    // Sem ciclo novo há mais que isso (minutos): todas as redes ficam "Sem informação".
    // Antes disso, com 3 ciclos perdidos, a página só avisa que a atualização está atrasada.
    SEM_INFORMACAO_MINUTOS: 60
};
