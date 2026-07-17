#!/usr/bin/env bash
# Obsidian Local REST API helper for the EstBirding memory sink.
#   scripts/obsidian.sh put <vault-path> [local-file] [--force]   # body from file or stdin; expects 204
#   scripts/obsidian.sh get <vault-path>                          # prints file body
#   scripts/obsidian.sh ls  <vault-dir>                           # lists a directory
#   scripts/obsidian.sh rm  <vault-path> [--force]                # deletes; expects 204
# Token: 64-char hex read from .mcp.json (jq is NOT installed here). Endpoint: http://127.0.0.1:27123
set -euo pipefail

HOST="http://127.0.0.1:27123"
MCP="${MCP_JSON:-.mcp.json}"
die() { echo "obsidian.sh: $*" >&2; exit 1; }

get_key() {
  [ -f "$MCP" ] || die "$MCP not found (run from repo root)"
  local k; k=$(grep -oiE '[a-f0-9]{64}' "$MCP" | head -1 || true)
  [ -n "$k" ] || die "no 64-char token in $MCP (Obsidian running? token re-synced after a plugin toggle?)"
  printf '%s' "$k"
}

# Refuse writes/deletes into the nested repo tree (estbirding/, NOT estbirding-memory/) — that path is
# git-tracked and swept by Lovable auto-commit. estbirding-memory/* is the sink and passes freely.
repo_guard() {
  case "$1" in
    estbirding/*) [ "${2:-}" = "--force" ] || die "refusing to touch repo tree '$1' via REST (git-tracked, Lovable-swept). Use --force to override." ;;
  esac
}

KEY="$(get_key)"
cmd="${1:-}"; shift || true

case "$cmd" in
  put)
    path="${1:-}"; [ -n "$path" ] || die "put needs <vault-path>"
    src=""; force=""
    for a in "${@:2}"; do [ "$a" = "--force" ] && force="--force" || src="$a"; done
    repo_guard "$path" "$force"
    if [ -n "$src" ]; then data=(--data-binary "@$src"); else data=(--data-binary @-); fi
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$HOST/vault/$path" \
      -H "Authorization: Bearer $KEY" -H "Content-Type: text/markdown" "${data[@]}") \
      || die "PUT connect failed — is Obsidian running on 27123?"
    echo "PUT $path -> $code"
    case "$code" in
      204) ;;
      401) die "401: token stale (plugin toggled?) — re-sync .mcp.json" ;;
      404) die "404: bad path" ;;
      *)   die "unexpected $code" ;;
    esac ;;
  get)
    path="${1:-}"; [ -n "$path" ] || die "get needs <vault-path>"
    curl -sS "$HOST/vault/$path" -H "Authorization: Bearer $KEY" ;;
  ls)
    dir="${1:-}"; [ -n "$dir" ] || die "ls needs <vault-dir>"
    case "$dir" in */) ;; *) dir="$dir/";; esac
    curl -sS "$HOST/vault/$dir" -H "Authorization: Bearer $KEY" ;;
  rm)
    path="${1:-}"; [ -n "$path" ] || die "rm needs <vault-path>"
    repo_guard "$path" "${2:-}"
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$HOST/vault/$path" \
      -H "Authorization: Bearer $KEY") || die "DELETE connect failed — Obsidian running?"
    echo "DELETE $path -> $code"
    [ "$code" = "204" ] || die "unexpected $code" ;;
  *)
    die "usage: obsidian.sh {put|get|ls|rm} <vault-path> [local-file] [--force]" ;;
esac
