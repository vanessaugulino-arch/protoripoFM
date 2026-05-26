// src/services/macroData.ts
// APIs públicas — sem token, sem cadastro
// BCB Focus (Olinda), BCB SGS e IBGE SIDRA

const BCB_FOCUS = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata'
const BCB_SGS   = 'https://api.bcb.gov.br/dados/serie'
const IBGE      = 'https://servicodados.ibge.gov.br/api/v3/agregados'

// Busca mediana Focus para um indicador anual
async function getFocus(indicator: string): Promise<number | null> {
  try {
    const encoded = encodeURIComponent(indicator)
    const url = `${BCB_FOCUS}/ExpectativasMercadoAnuais?$filter=Indicador eq '${encoded}'&$orderby=Data desc&$top=5&$select=Indicador,Data,Mediana&$format=json`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    return json?.value?.[0]?.Mediana ?? null
  } catch {
    return null
  }
}

// IPCA projetado — BCB Focus
export async function getIPCA(): Promise<number | null> {
  return getFocus('IPCA')
}

// Selic projetada — BCB Focus
export async function getSelic(): Promise<number | null> {
  return getFocus('Selic')
}

// Câmbio projetado — BCB Focus
export async function getCambio(): Promise<number | null> {
  return getFocus('Câmbio')
}

// PIB projetado — BCB Focus
export async function getPIB(): Promise<number | null> {
  return getFocus('PIB Total')
}

// Custo algodão em pluma — BCB SGS série 28
export async function getAlgodao(): Promise<number | null> {
  try {
    const url = `${BCB_SGS}/28/dados/ultimos/1?formato=json`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    return json?.length > 0 ? parseFloat(json[0].valor.replace(',', '.')) : null
  } catch {
    return null
  }
}

// Inflação Vestuário — IBGE IPCA agregado 1737, variável 63, grupo 6
export async function getInflacaoVestuario(): Promise<number | null> {
  try {
    const url = `${IBGE}/1737/periodos/-1/variaveis/63?localidades=N1[all]&classificacao=315[6]`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const serie = json?.[0]?.resultados?.[0]?.series?.[0]?.serie ?? {}
    const ultimo = Object.values(serie).pop()
    return ultimo ? parseFloat(ultimo as string) : null
  } catch {
    return null
  }
}

// Vendas PMC Vestuário — IBGE agregado 8880, variável 11709, atividade 47781
export async function getPMCVestuario(): Promise<number | null> {
  try {
    const url = `${IBGE}/8880/periodos/-1/variaveis/11709?localidades=N1[all]&classificacao=11046[47781]`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const serie = json?.[0]?.resultados?.[0]?.series?.[0]?.serie ?? {}
    const ultimo = Object.values(serie).pop()
    return ultimo ? parseFloat(ultimo as string) : null
  } catch {
    return null
  }
}

// Busca todos os indicadores em paralelo
export interface MacroData {
  ipca:      number | null
  selic:     number | null
  cambio:    number | null
  pib:       number | null
  algodao:   number | null
  vestuario: number | null
  pmc:       number | null
}

export async function getAllMacroData(): Promise<MacroData> {
  const [ipca, selic, cambio, pib, algodao, vestuario, pmc] = await Promise.allSettled([
    getIPCA(),
    getSelic(),
    getCambio(),
    getPIB(),
    getAlgodao(),
    getInflacaoVestuario(),
    getPMCVestuario(),
  ])

  return {
    ipca:      ipca.status      === 'fulfilled' ? ipca.value      : null,
    selic:     selic.status     === 'fulfilled' ? selic.value     : null,
    cambio:    cambio.status    === 'fulfilled' ? cambio.value    : null,
    pib:       pib.status       === 'fulfilled' ? pib.value       : null,
    algodao:   algodao.status   === 'fulfilled' ? algodao.value   : null,
    vestuario: vestuario.status === 'fulfilled' ? vestuario.value : null,
    pmc:       pmc.status       === 'fulfilled' ? pmc.value       : null,
  }
}
