// Trava de empresa nas funções de banco (migration 044).
//
// 1. Regra estática: toda função SECURITY DEFINER que recebe tenant precisa
//    conferir quem chama, na versão MAIS RECENTE dela nas migrations.
// 2. Comportamento: aplica a 044 num Postgres local (PGlite) com um esqueleto
//    do Supabase e chama a função como anon, usuária de outra empresa, etc.
import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(__dirname, '../migrations')
const arquivos = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

/** Última definição de cada função public.* nas migrations, em ordem. */
function ultimasDefinicoes() {
  const defs = new Map<string, { arquivo: string; corpo: string }>()
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?AS\s+(\$\w*\$)([\s\S]*?)\3/gi
  for (const arquivo of arquivos) {
    const sql = fs.readFileSync(path.join(DIR, arquivo), 'utf8')
    for (const m of sql.matchAll(re)) defs.set(m[1], { arquivo, corpo: m[0] })
  }
  return defs
}

describe('regra: função privilegiada com tenant confere quem chama', () => {
  const defs = ultimasDefinicoes()
  const alvo = [...defs.entries()].filter(([, d]) =>
    /SECURITY\s+DEFINER/i.test(d.corpo) && /\(\s*[^)]*\bp_tenant(_id)?\s+uuid/i.test(d.corpo))

  it('encontra as funções esperadas', () => {
    expect(alvo.length).toBeGreaterThanOrEqual(8)
  })

  it.each(alvo.map(([nome, d]) => [nome, d.arquivo, d.corpo]))('%s (%s)', (_nome, _arquivo, corpo) => {
    const confere = /assert_tenant_access\s*\(/.test(corpo) || /get_tenant_id\(\)\s+OR\s+is_super_admin\(\)/i.test(corpo)
    expect(confere, 'chame PERFORM public.assert_tenant_access(<param>) logo após o BEGIN').toBe(true)
  })
})

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const USUARIA_A = 'aaaaaaaa-0000-0000-0000-000000000001'

async function bancoCom044() {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;
    create schema auth;
    create function auth.uid()  returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create table users (id uuid primary key, tenant_id uuid, system_role text);
    create function get_tenant_id() returns uuid language sql stable security definer set search_path = public
      as $$ select tenant_id from users where id = auth.uid() $$;
    create function is_super_admin() returns boolean language sql stable security definer set search_path = public
      as $$ select coalesce((select system_role = 'super_admin' from users where id = auth.uid()), false) $$;
    create table seasons (id uuid primary key default gen_random_uuid(), tenant_id uuid, fiscal_year int);
    create table plan_cascade_runs (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, year int not null,
      module smallint not null, season_id uuid, status text not null default 'pending', applied_scenario_id uuid,
      error_message text, created_at timestamptz default now(), updated_at timestamptz default now());
    alter table plan_cascade_runs enable row level security;
    create policy plan_cascade_runs_select on plan_cascade_runs for select using (true);
    grant select, insert, update, delete on plan_cascade_runs to authenticated, anon;
    create function get_sales_monthly_aggregates(p_tenant_id uuid) returns int language sql security definer as $$ select 1 $$;
    create function get_hierarchy_revenue_by_path(p_tenant_id uuid) returns int language sql security definer as $$ select 1 $$;
    insert into users values ('${USUARIA_A}', '${A}', 'client_admin');
    insert into plan_cascade_runs (tenant_id, year, module, status) values ('${A}', 2026, 2, 'done'), ('${B}', 2026, 2, 'done');
  `)
  await db.exec(fs.readFileSync(path.join(DIR, '044_security_tenant_guard.sql'), 'utf8'))
  return db
}

/** Simula uma chamada vinda do PostgREST: sessão authenticator + papel + JWT. */
async function comoPostgrest(papel: 'anon' | 'authenticated' | 'service_role', sub: string | null, sql: string) {
  const db = await bancoCom044()
  try {
    await db.exec(`set session authorization authenticator; set role ${papel};
      select set_config('request.jwt.claim.sub', '${sub ?? ''}', false), set_config('request.jwt.claim.role', '${papel}', false);`)
    const r = await db.query(sql)
    return { ok: true as const, rows: r.rows }
  } catch (e) {
    return { ok: false as const, erro: (e as Error).message }
  } finally {
    await db.close()
  }
}

const status = (t: string) => `select get_plan_cascade_status('${t}', 2026)->>'started' as started`

describe('comportamento da 044', () => {
  it('anon não executa função privilegiada', async () => {
    const r = await comoPostgrest('anon', null, status(A))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/permission denied/)
  })

  it('anon não executa nem as funções de vendas que já tinham trava', async () => {
    const r = await comoPostgrest('anon', null, `select get_sales_monthly_aggregates('${A}')`)
    expect(r.ok).toBe(false)
  })

  it('usuária lê a própria empresa', async () => {
    const r = await comoPostgrest('authenticated', USUARIA_A, status(A))
    expect(r).toEqual({ ok: true, rows: [{ started: 'true' }] })
  })

  it('usuária não lê outra empresa', async () => {
    const r = await comoPostgrest('authenticated', USUARIA_A, status(B))
    expect(r).toEqual({ ok: false, erro: 'acesso negado a esta empresa' })
  })

  it('chave de serviço lê qualquer empresa', async () => {
    const r = await comoPostgrest('service_role', null, status(B))
    expect(r.ok).toBe(true)
  })

  it('plan_cascade_runs: usuária só vê linhas da própria empresa; anon não vê nada', async () => {
    expect(await comoPostgrest('authenticated', USUARIA_A, 'select tenant_id from plan_cascade_runs'))
      .toEqual({ ok: true, rows: [{ tenant_id: A }] })
    expect(await comoPostgrest('anon', null, 'select tenant_id from plan_cascade_runs'))
      .toEqual({ ok: true, rows: [] })
  })

  it('conexão direta (SQL editor) não é bloqueada', async () => {
    const db = await bancoCom044()
    const r = await db.query(status(B))
    await db.close()
    expect(r.rows).toEqual([{ started: 'true' }])
  })
})
