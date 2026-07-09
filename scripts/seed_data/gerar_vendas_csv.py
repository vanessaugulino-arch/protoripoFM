#!/usr/bin/env python3
"""
gerar_vendas_csv.py
Gera os arquivos CSV de vendas para importar pelo Fashion Mind.

Uso:
  pip3 install openpyxl
  python3 gerar_vendas_csv.py /caminho/para/"base icloud import.xlsx"

Os arquivos gerados ficam na mesma pasta deste script:
  import_sales_part1.csv, import_sales_part2.csv ...

Após gerado, importe cada arquivo pelo Fashion Mind:
  Configurações → Importar Dados → Histórico de Vendas
"""

import sys
import csv
import hashlib
import openpyxl
from pathlib import Path
from datetime import date, timedelta

# ── Config ────────────────────────────────────────────────────────────────────

TEMPORADAS_RECENTES = {"PV25", "OI25", "PV26"}  # Altere para incluir mais se quiser
CHUNK_SIZE = 10_000  # linhas por arquivo CSV (padrão 10 mil)
OUT_DIR = Path(__file__).parent

# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_str(v):
    return str(v).strip() if v is not None else ""

def safe_float(v):
    try:
        return str(round(float(v), 2))
    except Exception:
        return ""

def fmt_date(v):
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if len(s) == 10 and s[2] == "/":
        d, m, y = s.split("/")
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    return s[:10] if len(s) >= 10 else s

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    excel_path = sys.argv[1] if len(sys.argv) > 1 else "base icloud import.xlsx"

    print(f"Abrindo: {excel_path}")
    print("(pode demorar 1-2 min para abrir o arquivo grande...)")
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    ws = wb["VENDAS"]

    headers = [
        "Código (SKU)", "Data da Venda", "Canal de Venda", "Quantidade Vendida",
        "Receita Bruta (R$)", "Desconto (R$)", "Preço Realizado por Unidade (R$)", "Tipo de Venda",
    ]

    rows_out = []
    total = 0
    skipped = 0

    print(f"Filtrando temporadas: {TEMPORADAS_RECENTES}")

    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue  # pular cabeçalho
        sku = safe_str(r[2]) if len(r) > 2 else ""
        if not sku:
            skipped += 1
            continue
        temporada = safe_str(r[11]) if len(r) > 11 else ""
        if temporada not in TEMPORADAS_RECENTES:
            continue

        qty = int(r[3]) if (len(r) > 3 and r[3]) else 0
        rb  = float(r[4]) if (len(r) > 4 and r[4]) else 0.0
        rv  = float(r[6]) if (len(r) > 6 and r[6]) else 0.0
        desc = float(r[5]) if (len(r) > 5 and r[5]) else 0.0
        pmv = str(round(rv / qty, 2)) if qty > 0 and rv > 0 else ""

        rows_out.append([
            sku,
            fmt_date(r[0]) if len(r) > 0 else "",
            safe_str(r[9]) if len(r) > 9 else "",
            str(qty),
            safe_float(r[4]),
            safe_float(r[5]),
            pmv,
            safe_str(r[1]) if len(r) > 1 else "",
        ])
        total += 1
        if total % 20_000 == 0:
            print(f"  {total:,} linhas filtradas...", end="\r")

    wb.close()
    print(f"\n  {total:,} vendas filtradas ({skipped:,} ignoradas)")

    if not rows_out:
        print("Nenhuma linha encontrada. Verifique as temporadas em TEMPORADAS_RECENTES.")
        return

    # Escrever arquivos CSV
    for idx in range(0, len(rows_out), CHUNK_SIZE):
        part = idx // CHUNK_SIZE + 1
        path = OUT_DIR / f"import_sales_part{part}.csv"
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(headers)
            w.writerows(rows_out[idx: idx + CHUNK_SIZE])
        n = min(CHUNK_SIZE, len(rows_out) - idx)
        print(f"  ✓ {path.name} ({n:,} linhas)")

    print(f"\nPronto! Importe cada arquivo em: Configurações → Importar Dados → Histórico de Vendas")


if __name__ == "__main__":
    main()
