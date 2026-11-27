#!/usr/bin/env bash
# Hook "Stop" do Claude Code: antes de o Claude encerrar a resposta, roda os testes.
# Se falharem, sai com código 2 e o erro volta para o Claude corrigir.
INPUT="$(cat)"
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0 # já pediu uma correção nesta rodada; não entra em loop
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

if ! OUT="$(npm test --silent 2>&1)"; then
  echo "Testes de domínio falhando. Corrija antes de terminar:" >&2
  echo "$OUT" | grep -E "not ok|Error|expected|actual|FALHOU" | head -40 >&2
  exit 2
fi

# Só roda os testes do banco se alguma migration/teste SQL mudou e há Postgres disponível.
if git status --porcelain supabase/ | grep -q . && { command -v initdb >/dev/null || [ -n "${DATABASE_URL:-}" ] || ls /usr/lib/postgresql/*/bin/initdb >/dev/null 2>&1; }; then
  if ! OUT="$(./scripts/test-db.sh 2>&1)"; then
    echo "Testes do banco falhando. Corrija antes de terminar:" >&2
    echo "$OUT" | grep -E "FALHOU|ERROR" | head -20 >&2
    exit 2
  fi
fi
exit 0
