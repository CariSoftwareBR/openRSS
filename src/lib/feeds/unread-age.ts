/** Ao assinar, só os itens das últimas 48h (com data no XML) ficam não lidos. */
export const SUBSCRIBE_UNREAD_MAX_AGE_MS = 48 * 3600_000;
/** Artigo com data de publicação há mais de 14 dias não entra (nem fica) como não lido. */
export const INGEST_UNREAD_MAX_AGE_MS = 14 * 86400_000;
