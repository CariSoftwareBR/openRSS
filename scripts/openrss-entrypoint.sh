#!/bin/sh
# Como root (Unraid, CasaOS, TrueNAS: a pasta de dados chega como bind mount de outro dono),
# passa /data e o cache do Next para PUID:PGID e roda o app com esse usuário.
# Com --user/user: (ex.: Umbrel), só executa.
set -eu

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  DATA_DIR="${OPENRSS_DATA_DIR:-/data}"

  mkdir -p "$DATA_DIR" /app/.next/cache
  # Só percorre as pastas quando o dono mudou (primeiro boot ou PUID/PGID novos).
  for dir in "$DATA_DIR" /app/.next/cache; do
    if [ "$(stat -c %u:%g "$dir")" != "$PUID:$PGID" ]; then
      chown -R "$PUID:$PGID" "$dir"
    fi
  done

  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
fi

exec "$@"
