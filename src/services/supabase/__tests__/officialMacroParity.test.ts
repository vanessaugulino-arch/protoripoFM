// Paridade TS ↔ SQL do macro oficial.
//
// officialPlanService.macroFromChannels (tela, ao vivo) e a função Postgres
// recompute_official_macro (gravação oficial) precisam dar o MESMO número.
// Este teste roda a função SQL de verdade (PGlite = Postgres em WASM), lida da
// migration mais recente que a define, e compara campo a campo com a versão TS.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { macroFromChannels, type ChannelAbsolutes } from '../officialPlanService'

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations')
const TENANT = '11111111-1111-1111-1111-111111111111'

/** Corpo da última definição de recompute_official_macro nas migrations. */
function latestRecomputeSql(): string {
  const files = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
  let found = ''
  for (const f of files) {
    const s = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
    const i = s.indexOf('CREATE OR REPLACE FUNCTION public.recompute_official_macro(')
    if (i < 0) continue
    const end = s.indexOf('$fn$;', s.indexOf('AS $fn$', i)) + '$fn$;'.length
    found = s.slice(i, end)
  }
  if (!found) throw new Error('recompute_official_macro não encontrada nas migrations')
  return found
}

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create schema auth;
    create function auth.uid()  returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.role() returns text language sql stable as $$ select null::text $$;
    create function get_tenant_id()  returns uuid    language sql stable as $$ select null::uuid $$;
    create function is_super_admin() returns boolean language sql stable as $$ select false $$;
    create function assert_tenant_access(p uuid) returns void language plpgsql as $$ begin end $$;
    create table channel_scenarios (
      id uuid primary key default gen_random_uuid(), tenant_id uuid, year int,
      is_applied boolean, saved_at timestamptz default now(), channel_data jsonb);
    create table annual_plan_cycles (
      tenant_id uuid, year int, official_macro jsonb, applied_channel_scenario_id uuid,
      detail_level smallint default 1, updated_at timestamptz);
  `)
  await db.exec(latestRecomputeSql())
})

afterAll(async () => { await db?.close() })

async function sqlMacro(channelData: Record<string, ChannelAbsolutes>) {
  await db.exec('delete from channel_scenarios; delete from annual_plan_cycles;')
  await db.query(
    'insert into channel_scenarios (tenant_id, year, is_applied, channel_data) values ($1, 2026, true, $2)',
    [TENANT, JSON.stringify(channelData)],
  )
  await db.query('insert into annual_plan_cycles (tenant_id, year) values ($1, 2026)', [TENANT])
  const r = await db.query<{ m: Record<string, unknown> }>('select recompute_official_macro($1, 2026) as m', [TENANT])
  return r.rows[0].m
}

const CAMPOS = ['receitaBruta', 'pecasVendidas', 'pmv', 'margemBruta', 'custoMedio', 'estoqueMediao',
  'giro', 'cobertura', 'gmroi', 'mkdRS', 'mkdPct', 'orcamento'] as const

function comparar(ts: object, sql: Record<string, unknown>) {
  const diffs: string[] = []
  for (const c of CAMPOS) if (Number((ts as Record<string, unknown>)[c]) !== Number(sql[c])) diffs.push(`${c}: tela=${ts[c]} banco=${sql[c]}`)
  return diffs
}

// Gerador determinístico (mesma sequência a cada execução).
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed / 2 ** 32 }
}

describe('macro oficial: tela e banco dão o mesmo número', () => {
  it('caso de referência com 3 canais', async () => {
    const data = {
      ecommerce: { receita: 412_350.75, producao: 2_731, margemBrutaRS: 198_004.1, estoqueMedioRS: 88_000, markdown: 21_500.3, orcamento: 160_000 },
      atacado:   { receita: 980_000,    producao: 9_850, margemBrutaRS: 352_800,   estoqueMedioRS: 210_500, markdown: 0,       orcamento: 410_000 },
      loja:      { receita: 233_117.4,  producao: 1_402, margemBrutaRS: 117_890.9, estoqueMedioRS: 61_220.5, markdown: 9_870, orcamento: 90_500 },
    }
    expect(comparar(macroFromChannels(data)!, await sqlMacro(data))).toEqual([])
  })

  it('sem canais: tela devolve null e banco devolve macro zerado', async () => {
    // Documenta o comportamento atual: com channel_data = {} a função SQL não
    // retorna NULL (só retorna NULL quando não há cenário aplicado).
    expect(macroFromChannels({})).toBeNull()
    const sql = await sqlMacro({})
    expect(sql?.receitaBruta).toBe(0)
  })

  it('500 combinações sorteadas, inclusive margem negativa e frações de centavo', async () => {
    const rand = rng(20261005)
    const divergencias: string[] = []
    for (let k = 0; k < 500; k++) {
      const n = 1 + Math.floor(rand() * 5)
      const data: Record<string, ChannelAbsolutes> = {}
      for (let j = 0; j < n; j++) {
        const receita = Math.round(rand() * 2_000_000 * 1000) / 1000        // até 3 casas
        data[`canal${j}`] = {
          receita,
          producao:       Math.floor(rand() * 20_000),
          margemBrutaRS:  Math.round((rand() * 1.2 - 0.2) * receita * 1000) / 1000,   // pode ser negativa
          estoqueMedioRS: Math.round(rand() * 500_000 * 100) / 100,
          markdown:       Math.round(rand() * receita * 0.3 * 1000) / 1000,
          orcamento:      Math.round(rand() * 800_000 * 1000) / 1000,
        }
      }
      const diffs = comparar(macroFromChannels(data)!, await sqlMacro(data))
      if (diffs.length) divergencias.push(`#${k} ${diffs.join('; ')}`)
    }
    expect(divergencias).toEqual([])
  })
})
