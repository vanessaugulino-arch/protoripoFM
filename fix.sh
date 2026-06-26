#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# fix.sh — Corrige a instalação de dependências do Fashion Mind
#
# Problema raiz: npm foi usado em vez de pnpm, resultando em binários nativos
# do rollup não instalados (@rollup/rollup-darwin-arm64 ou x64 ficaram vazios).
# Isso causa MODULE_NOT_FOUND ao tentar iniciar o servidor de desenvolvimento.
#
# Solução: reinstalar com pnpm (gerenciador correto para este projeto).
# ─────────────────────────────────────────────────────────────────────────────

set -e

cd "$(dirname "$0")"

echo ""
echo "🔧 Fashion Mind — Corrigindo dependências..."
echo ""

# Remove instalação corrompida
echo "→ Removendo node_modules e package-lock.json (npm)..."
rm -rf node_modules
rm -f package-lock.json

# Verifica se pnpm está disponível
if ! command -v pnpm &> /dev/null; then
  echo "→ pnpm não encontrado. Instalando globalmente..."
  npm install -g pnpm@latest
fi

echo "→ Instalando dependências com pnpm..."
pnpm install

echo ""
echo "✅ Dependências instaladas com sucesso!"
echo ""
echo "Para iniciar o servidor de desenvolvimento:"
echo "  pnpm dev"
echo ""
echo "Para fazer o build de produção:"
echo "  pnpm build"
echo ""
