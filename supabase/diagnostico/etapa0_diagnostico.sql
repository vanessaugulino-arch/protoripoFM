-- etapa0_diagnostico.sql — SÓ LEITURA. Não altera nada no banco.
--
-- Como usar: Supabase > SQL Editor > colar tudo > Run. O resultado é uma
-- linha com uma coluna "diagnostico" (JSON). Copiar o valor e mandar pra
-- Rayssa. Não contém dados de clientes: só estrutura (tabelas, colunas,
-- políticas de acesso e permissões de funções).
--
-- Serve para duas coisas da etapa 0:
--   1. Reconstruir no repositório o schema base, que foi criado direto no
--      banco e não está em supabase/migrations.
--   2. Achar o que ainda aceita acesso anônimo ou entre empresas.

WITH
tabelas AS (
  SELECT c.relname AS tabela,
         c.relrowsecurity AS rls_ligada,
         c.reltuples::bigint AS linhas_estimadas,
         (SELECT jsonb_agg(jsonb_build_object(
                   'coluna', a.attname,
                   'tipo', format_type(a.atttypid, a.atttypmod),
                   'nulo', NOT a.attnotnull,
                   'default', pg_get_expr(d.adbin, d.adrelid)) ORDER BY a.attnum)
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS colunas,
         (SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname)
            FROM pg_constraint k WHERE k.conrelid = c.oid) AS restricoes,
         (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid))
            FROM pg_index i WHERE i.indrelid = c.oid) AS indices,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
         has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
         has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
         has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
),
politicas AS (
  SELECT tablename AS tabela, policyname AS nome, cmd AS operacao,
         roles::text[] AS papeis, qual AS usando, with_check AS checa
    FROM pg_policies WHERE schemaname = 'public'
),
funcoes AS (
  SELECT p.proname AS funcao,
         pg_get_function_identity_arguments(p.oid) AS argumentos,
         p.prosecdef AS security_definer,
         l.lanname AS linguagem,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
         p.proconfig AS config,
         pg_get_functiondef(p.oid) AS definicao
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.prokind = 'f'
),
gatilhos AS (
  SELECT event_object_table AS tabela, trigger_name AS nome,
         action_timing AS quando, event_manipulation AS evento,
         action_statement AS acao
    FROM information_schema.triggers WHERE trigger_schema = 'public'
),
alertas AS (
  SELECT 'tabela sem RLS: ' || tabela AS alerta FROM tabelas WHERE NOT rls_ligada
  UNION ALL
  SELECT 'anon pode escrever em ' || tabela FROM tabelas
   WHERE rls_ligada AND (anon_insert OR anon_update OR anon_delete)
     AND EXISTS (SELECT 1 FROM politicas p WHERE p.tabela = tabelas.tabela
                  AND ('anon' = ANY(p.papeis) OR 'public' = ANY(p.papeis))
                  AND p.operacao IN ('INSERT','UPDATE','DELETE','ALL')
                  AND coalesce(p.usando, p.checa, 'true') ~* '^\(?\s*true\s*\)?$')
  UNION ALL
  SELECT 'política aberta (true): ' || tabela || '.' || nome FROM politicas
   WHERE coalesce(usando, checa) ~* '^\(?\s*true\s*\)?$'
  UNION ALL
  SELECT 'função privilegiada executável por anon: ' || funcao || '(' || argumentos || ')'
    FROM funcoes WHERE security_definer AND anon_executa
)
SELECT jsonb_build_object(
  'gerado_em',  now(),
  'postgres',   current_setting('server_version'),
  'alertas',    (SELECT coalesce(jsonb_agg(alerta ORDER BY alerta), '[]') FROM alertas),
  'tabelas',    (SELECT jsonb_agg(to_jsonb(t) ORDER BY tabela) FROM tabelas t),
  'politicas',  (SELECT jsonb_agg(to_jsonb(p) ORDER BY tabela, nome) FROM politicas p),
  'funcoes',    (SELECT jsonb_agg(to_jsonb(f) ORDER BY funcao) FROM funcoes f),
  'gatilhos',   (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY tabela, nome), '[]') FROM gatilhos g),
  'enums',      (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', t.typname,
                   'valores', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid))), '[]')
                   FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'public' AND t.typtype = 'e')
) AS diagnostico;
