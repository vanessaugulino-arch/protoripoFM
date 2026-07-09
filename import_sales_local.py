"""
import_sales_local.py
Importa Vendas_novo.xlsx → Supabase (tabela sales_history)

Como usar:
  1. Coloque este script na mesma pasta que Vendas_novo.xlsx
  2. No terminal: python3 import_sales_local.py
  3. Se interrompido, rode novamente — retoma de onde parou automaticamente.

Requisitos: Python 3.6+  (sem pip, usa apenas stdlib)
"""

import sys, zipfile, re, time, json
import urllib.request, urllib.error
from xml.etree import ElementTree as ET

# ── Configuração ───────────────────────────────────────────────────────────────
XLSX_PATH     = "Vendas_novo.xlsx"          # ajuste o caminho se necessário
TENANT_ID     = "510da940-e4b4-4750-9b46-fe432bf77065"
SB_URL        = "https://tlbfvuqzvpolfrjwiofx.supabase.co"
SB_ANON_KEY   = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYmZ2dXF6"
    "dnBvbGZyandpb2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOj"
    "E3ODE2ODI3OTAsImV4cCI6MjA5NzI1ODc5MH0"
    ".cPrpLkvrkoXfDmKnL3Y4gtvZGFPIdHig-w-gZma3fhA"
)
BATCH_SIZE    = 500          # linhas por chamada RPC (pode aumentar até 2000)
PROGRESS_FILE = "sales_import_progress.json"

# ── XML streaming (rápido, sem openpyxl) ─────────────────────────────────────
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def load_shared_strings(z):
    ss = []
    if "xl/sharedStrings.xml" not in z.namelist():
        return ss
    with z.open("xl/sharedStrings.xml") as f:
        for ev, el in ET.iterparse(f, events=["end"]):
            if el.tag == f"{NS}si":
                ss.append("".join(t.text or "" for t in el.iter(f"{NS}t")))
                el.clear()
    return ss

def stream_data_rows(z, ss, skip=0):
    """Yields (row_cells, 0-based_data_row_index) starting at skip."""
    row_idx = -1   # -1 = ainda no header
    cur = []
    in_row = False
    ctype = cval = None
    with z.open("xl/worksheets/sheet1.xml") as f:
        for ev, el in ET.iterparse(f, events=["start", "end"]):
            tag = el.tag.replace(NS, "")
            if ev == "start" and tag == "row":
                cur = []; in_row = True
            elif ev == "start" and tag == "c" and in_row:
                ctype = el.get("t", "n"); cval = None
            elif ev == "end" and tag == "v" and in_row:
                cval = el.text
            elif ev == "end" and tag == "c" and in_row:
                if ctype == "s" and cval is not None:
                    val = ss[int(cval)] if int(cval) < len(ss) else ""
                elif ctype == "b":
                    val = "TRUE" if cval == "1" else "FALSE"
                else:
                    val = cval
                cur.append(val); ctype = cval = None
            elif ev == "end" and tag == "row" and in_row:
                in_row = False
                if row_idx == -1:          # header → ignora
                    row_idx = 0; el.clear(); continue
                if row_idx < skip:
                    row_idx += 1; el.clear(); continue
                yield cur, row_idx
                row_idx += 1
                el.clear()

# ── Helpers de valor ──────────────────────────────────────────────────────────
def parse_date(v):
    if v is None: return None
    v = str(v).strip()
    if re.match(r"^\d{2}/\d{2}/\d{4}$", v):
        d, m, y = v.split("/"); return f"{y}-{m}-{d}"
    if re.match(r"^\d{4}-\d{2}-\d{2}", v): return v[:10]
    try:
        from datetime import date, timedelta
        return (date(1899, 12, 30) + timedelta(days=int(float(v)))).isoformat()
    except: return None

def sf(v):
    if v is None or str(v).strip() == "": return 0.0
    try: return round(float(str(v).replace(",", ".")), 4)
    except: return 0.0

def si(v):
    try: return int(float(str(v)))
    except: return 0

# Mapeamento de colunas (índice 0-based no Excel):
# 0=Data venda  1=Tipo  2=SKU  3=Quantidade
# 4=Valor Bruto  5=Desconto  6=Valor c/Desconto  7=Imposto  8=Venda Líquida
# 9=Canal  10=Temporada Ativa (→ colecao)  16=Categoria

def row_to_record(r):
    def g(i): return r[i] if i < len(r) else None
    sd  = parse_date(g(0))
    sku = g(2)
    if not sd or not sku: return None
    qty   = si(g(3));  gross = sf(g(4))
    disc  = sf(g(5));  net   = sf(g(6))
    tax   = sf(g(7));  npt   = sf(g(8))
    ch    = g(9);      col   = g(10);  cat = g(16)
    typ   = (g(1) or "venda").lower()
    pr    = round(net / qty, 4) if qty > 0 else None
    return {
        "tenant_id": TENANT_ID, "sku": sku, "sale_date": sd,
        "quantity": qty, "revenue_gross": gross, "revenue_net": net,
        "channel": ch, "discount_value": disc, "price_realized": pr,
        "type": typ, "category": cat, "tax_value": tax,
        "revenue_net_post_tax": npt, "colecao": col, "temporada": None,
    }

# ── Supabase RPC ──────────────────────────────────────────────────────────────
def call_bulk_insert(batch, retry=3):
    url     = f"{SB_URL}/rest/v1/rpc/bulk_insert_sales"
    payload = json.dumps({"rows": batch}).encode("utf-8")
    for attempt in range(1, retry + 1):
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Content-Type",  "application/json")
        req.add_header("Authorization", f"Bearer {SB_ANON_KEY}")
        req.add_header("apikey",        SB_ANON_KEY)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = resp.read().decode("utf-8")
                try: return int(json.loads(body))
                except: return len(batch)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            print(f"  ✗ HTTP {e.code} (tentativa {attempt}/{retry}): {msg[:200]}")
        except Exception as e:
            print(f"  ✗ Erro (tentativa {attempt}/{retry}): {e}")
        if attempt < retry:
            time.sleep(2 * attempt)
    return 0  # all retries failed

# ── Progresso ─────────────────────────────────────────────────────────────────
def load_progress():
    try:
        with open(PROGRESS_FILE) as f: return json.load(f)
    except: return {"next_offset": 0, "total_inserted": 0, "total_skipped": 0}

def save_progress(next_offset, inserted, skipped):
    with open(PROGRESS_FILE, "w") as f:
        json.dump({
            "next_offset": next_offset,
            "total_inserted": inserted,
            "total_skipped": skipped,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }, f, indent=2)

# ── Main ──────────────────────────────────────────────────────────────────────
TOTAL_ROWS = 1_024_757  # total de linhas de dados no arquivo

if __name__ == "__main__":
    prog          = load_progress()
    start_offset  = prog["next_offset"]
    total_inserted = prog["total_inserted"]
    total_skipped  = prog.get("total_skipped", 0)

    print("=" * 60)
    print("  Fashion Mind — Importação de Vendas")
    print("=" * 60)
    print(f"  Arquivo   : {XLSX_PATH}")
    print(f"  Offset    : {start_offset:,}  (retoma de onde parou)")
    print(f"  Importados: {total_inserted:,}")
    print(f"  Batch     : {BATCH_SIZE} linhas/chamada")
    print("=" * 60)
    print()

    if start_offset >= TOTAL_ROWS:
        print("✅ Importação já concluída! Todos os dados estão no Supabase.")
        sys.exit(0)

    t0 = time.time()

    try:
        with zipfile.ZipFile(XLSX_PATH) as z:
            print("Carregando strings compartilhadas...", end=" ", flush=True)
            t1 = time.time()
            ss = load_shared_strings(z)
            print(f"{len(ss):,} strings ({time.time()-t1:.1f}s)")
            print()

            batch = []
            last_idx = start_offset

            for raw, row_idx in stream_data_rows(z, ss, skip=start_offset):
                rec = row_to_record(raw)
                last_idx = row_idx
                if rec:
                    batch.append(rec)
                else:
                    total_skipped += 1

                if len(batch) >= BATCH_SIZE:
                    inserted = call_bulk_insert(batch)
                    total_inserted += inserted
                    batch = []

                    elapsed = time.time() - t0
                    done    = row_idx - start_offset + 1
                    rate    = done / elapsed if elapsed > 0 else 1
                    pct     = (row_idx + 1) / TOTAL_ROWS * 100
                    eta_min = (TOTAL_ROWS - row_idx - 1) / rate / 60
                    print(
                        f"  Linha {row_idx+1:>9,} | {pct:5.1f}% | "
                        f"Inseridos {total_inserted:>9,} | "
                        f"{rate:,.0f} linhas/s | ETA {eta_min:.0f} min"
                    )
                    save_progress(row_idx + 1, total_inserted, total_skipped)

            # último batch parcial
            if batch:
                inserted = call_bulk_insert(batch)
                total_inserted += inserted

    except KeyboardInterrupt:
        print("\n⚠️  Interrompido pelo usuário. Progresso salvo.")
        save_progress(last_idx, total_inserted, total_skipped)
        sys.exit(0)

    elapsed = time.time() - t0
    save_progress(TOTAL_ROWS, total_inserted, total_skipped)

    print()
    print("=" * 60)
    print(f"  ✅  Importação concluída!")
    print(f"  Inseridos : {total_inserted:,}")
    print(f"  Ignorados : {total_skipped:,}  (linhas sem SKU ou data)")
    print(f"  Tempo     : {elapsed/60:.1f} min")
    print("=" * 60)
