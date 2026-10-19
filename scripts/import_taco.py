#!/usr/bin/env python3
"""
Importa a TACO (Tabela Brasileira de Composição de Alimentos, 4ª edição revisada
e ampliada, NEPA/UNICAMP, 2011) a partir da planilha oficial e gera:

  - src/data/reference/taco.json      (base embarcada no app, funciona offline)
  - supabase/seed/reference_foods_taco.sql (mesma base para o backend / IA)

Licença da fonte: "É permitida a reprodução parcial ou total desta obra, desde
que citada a fonte." A citação é exibida no app (tela Fontes de dados).

Regras de conversão (nunca substituir ausência por zero):
  - "NA" (não aplicável), "*" (em análise), vazio ou valores ilegíveis -> null
  - "Tr" (traço) -> 0 e o nutriente é listado em "trace"

Uso:
  pip install xlrd==2.*
  python3 scripts/import_taco.py caminho/para/Taco_4a_edicao_2011.xls

Planilha oficial: https://www.nepa.unicamp.br/taco/ (arquivo "Taco_4a_edicao_2011.xls").
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

import xlrd

ROOT = Path(__file__).resolve().parent.parent

# coluna da planilha "CMVCol taco3" -> (chave do app, casas decimais)
MAIN_COLUMNS = {
    2: ("water_g", 1),
    3: ("energy_kcal", 0),
    5: ("protein_g", 1),
    6: ("fat_g", 1),
    7: ("cholesterol_mg", 0),
    8: ("carbs_g", 1),
    9: ("fiber_g", 1),
    11: ("calcium_mg", 0),
    12: ("magnesium_mg", 0),
    16: ("iron_mg", 1),
    17: ("sodium_mg", 0),
    18: ("potassium_mg", 0),
    20: ("zinc_mg", 1),
    28: ("vitamin_c_mg", 1),
}
# planilha "AGtaco3" (ácidos graxos)
FAT_COLUMNS = {
    2: ("saturated_fat_g", 1),
    3: ("monounsaturated_fat_g", 1),
    4: ("polyunsaturated_fat_g", 1),
}
TRANS_COLUMNS = (23, 24)

PREPARATION_PATTERNS = [
    ("frito", r"\bfrit[oa]s?\b"),
    ("assado", r"\bassad[oa]s?\b"),
    ("grelhado", r"\bgrelhad[oa]s?\b"),
    ("cozido", r"\bcozid[oa]s?\b"),
    ("refogado", r"\brefogad[oa]s?\b"),
    ("cru", r"\bcru[as]?\b"),
]

LIQUID_CATEGORIES = {"Bebidas (alcoólicas e não alcoólicas)"}
LIQUID_HINTS = re.compile(r"\b(leite, de vaca, (integral|desnatado|semidesnatado)(?!, pó)|suco|refrigerante|café, infusão|chá|bebida|cerveja|água de coco|caldo(?!.*tablete))", re.I)


def parse_cell(raw, decimals, issues, ctx):
    """Retorna (valor, is_trace)."""
    if isinstance(raw, float):
        return round(raw, decimals) if decimals else round(raw), False
    text = str(raw).strip()
    if text in ("", "NA", "*"):
        return None, False
    if text == "Tr":
        return 0, True
    issues.append(f"{ctx}: valor ilegível {text!r} tratado como não informado")
    return None, False


def preparation_state(name):
    lowered = name.lower()
    for state, pattern in PREPARATION_PATTERNS:
        if re.search(pattern, lowered):
            return state
    return None


def main(xls_path):
    book = xlrd.open_workbook(xls_path)
    main_sheet = book.sheet_by_index(0)
    fat_sheet = book.sheet_by_index(1)
    issues = []

    fats = {}
    for r in range(3, fat_sheet.nrows):
        num = fat_sheet.cell_value(r, 0)
        if not isinstance(num, float):
            continue
        values, traces = {}, []
        for col, (key, dec) in FAT_COLUMNS.items():
            v, tr = parse_cell(fat_sheet.cell_value(r, col), dec, issues, f"AG#{int(num)}:{key}")
            values[key] = v
            if tr:
                traces.append(key)
        trans_parts = [parse_cell(fat_sheet.cell_value(r, c), 2, issues, f"AG#{int(num)}:trans") for c in TRANS_COLUMNS]
        numeric = [v for v, _ in trans_parts if v is not None]
        values["trans_fat_g"] = round(sum(numeric), 2) if numeric else None
        if numeric and all(tr for v, tr in trans_parts if v is not None):
            traces.append("trans_fat_g")
        fats[int(num)] = (values, traces)

    foods = []
    category = None
    for r in range(3, main_sheet.nrows):
        first = main_sheet.cell_value(r, 0)
        name = str(main_sheet.cell_value(r, 1)).strip()
        if not isinstance(first, float):
            text = str(first).strip()
            if text and text not in ("Número do", "Alimento"):
                category = text
            continue
        num = int(first)
        nutrients, traces = {}, []
        for col, (key, dec) in MAIN_COLUMNS.items():
            v, tr = parse_cell(main_sheet.cell_value(r, col), dec, issues, f"#{num}:{key}")
            nutrients[key] = v
            if tr:
                traces.append(key)
        if num in fats:
            fat_values, fat_traces = fats[num]
            nutrients.update(fat_values)
            traces.extend(fat_traces)
        unit = "ml" if (category in LIQUID_CATEGORIES or LIQUID_HINTS.search(name)) else "g"
        foods.append({
            "id": f"taco:{num}",
            "name": re.sub(r"\s+", " ", name),
            "category": category,
            "preparation_state": preparation_state(name),
            "base_unit": unit,
            "per100": nutrients,
            "trace": sorted(set(traces)),
        })

    meta = {
        "source": "TACO",
        "title": "Tabela Brasileira de Composição de Alimentos – TACO, 4ª ed. revisada e ampliada",
        "publisher": "NEPA/UNICAMP",
        "year": 2011,
        "license": "É permitida a reprodução parcial ou total desta obra, desde que citada a fonte.",
        "imported_at": date.today().isoformat(),
        "notes": [
            "Valores por 100 g da parte comestível (bebidas: tratadas como 100 ml, densidade ~1 assumida).",
            "null = não informado/não aplicável na tabela; 'trace' = traços (Tr).",
        ],
        "issues": issues,
    }
    out_json = ROOT / "src" / "data" / "reference" / "taco.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps({"meta": meta, "foods": foods}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    out_sql = ROOT / "supabase" / "seed" / "reference_foods_taco.sql"
    out_sql.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "-- Gerado por scripts/import_taco.py. Não editar manualmente.",
        "-- Fonte: TACO 4ª ed. (NEPA/UNICAMP, 2011). Reprodução permitida com citação da fonte.",
        "insert into public.reference_foods (id, source, name, category, preparation_state, base_unit, per100, trace_nutrients, verification, verified_at) values",
    ]
    rows = []
    for f in foods:
        def q(s):
            return "null" if s is None else "'" + str(s).replace("'", "''") + "'"
        rows.append(
            f"({q(f['id'])}, 'taco', {q(f['name'])}, {q(f['category'])}, {q(f['preparation_state'])}, {q(f['base_unit'])}, "
            f"{q(json.dumps(f['per100'], ensure_ascii=False))}::jsonb, array[{', '.join(q(t) for t in f['trace'])}]::text[], 'reported', {q(meta['imported_at'])})"
        )
    lines.append(",\n".join(rows))
    lines.append("on conflict (id) do update set name = excluded.name, category = excluded.category, preparation_state = excluded.preparation_state, base_unit = excluded.base_unit, per100 = excluded.per100, trace_nutrients = excluded.trace_nutrients, verified_at = excluded.verified_at;")
    out_sql.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"{len(foods)} alimentos exportados; {len(issues)} avisos")
    for issue in issues:
        print("  -", issue)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
