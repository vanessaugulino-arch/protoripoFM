# Fashion Mind

Aplicação de planejamento de coleções e estoque (React + Vite + Supabase).

## Rodando localmente

```bash
pnpm install
pnpm dev
```

## Build de produção

```bash
pnpm build
```

Gera os arquivos estáticos em `dist/`.

## Deploy

Configurado para deploy via Netlify (`netlify.toml`), lendo `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` das variáveis de ambiente do host.
