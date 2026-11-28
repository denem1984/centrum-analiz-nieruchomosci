"""Validate full GUS exports and BDL pages, then build a local review copy."""

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from shutil import copyfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_catalog(root, label):
    files = list((root / label).glob("*.csv"))
    require(len(files) == 1, f"{label}: oczekiwano jednego pliku CSV")
    with files[0].open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source, delimiter=";"))
    require(rows, f"{label}: pusty katalog")
    return rows


def digits(value, size):
    return re.fullmatch(rf"[0-9]{{{size}}}", value) is not None


def municipality(row, kind):
    parts = [row[field] for field in ("WOJ", "POW", "GMI", kind)]
    require(all(digits(code, size) for code, size in zip(parts, (2, 2, 2, 1))),
            f"Nieprawidłowy kod jednostki: {parts}")
    return "".join(parts)


def insert_unique(index, key, row, catalog):
    require(key not in index, f"{catalog}: powtórzony identyfikator {key}")
    index[key] = row


def read_terc(rows):
    index = {}
    for row in rows:
        code = (municipality(row, "RODZ") if row["GMI"] else row["WOJ"] + row["POW"])
        require(digits(code, len(code)) and len(code) in (2, 4, 7) and row["NAZWA"],
                f"TERC: nieprawidłowa jednostka {code}")
        insert_unique(index, code, row, "TERC")
    for code in index:
        parent = code[:2] if len(code) == 4 else code[:4]
        require(len(code) == 2 or parent in index, f"TERC: brak rodzica {code}")
    return index


def link_municipalities(terc):
    urban_by_county = {}
    for code in terc:
        if len(code) == 7 and code[-1] == "1":
            urban_by_county.setdefault(code[:4], []).append(code)
    links = {}
    for code in terc:
        if len(code) != 7:
            continue
        if code[-1] in "45":
            parent = code[:6] + "3"
            require(parent in terc, f"TERC: brak gminy miejsko-wiejskiej {code}")
        elif code[-1] in "89":
            choices = urban_by_county.get(code[:4], [])
            require(len(choices) == 1, f"TERC: niejednoznaczne miasto nadrzędne {code}")
            parent = choices[0]
        else:
            require(code[-1] in "123", f"TERC: nieznany rodzaj jednostki {code}")
            parent = code
        links[code] = parent
    return links


def read_bdl(root, terc):
    pages = sorted(root.glob("bdl-units-*.json"))
    require(pages, "Brak stron katalogu BDL")
    options = {}
    total_counts = set()
    for path in pages:
        page = json.loads(path.read_text(encoding="utf-8-sig"))
        total_counts.add(page["totalRecords"])
        for row in page["results"]:
            require(digits(row["id"], 12), f"BDL: nieprawidłowy identyfikator {row['id']}")
            insert_unique(options, row["id"], row, "BDL")
    require(total_counts == {len(options)}, "BDL: brak pełnego zestawu stron")

    communes = {code for code in terc if len(code) == 7 and code[-1] in "123"}
    matches = {}
    excluded = 0
    different_names = []
    for bdl_id, row in options.items():
        if row["level"] != 6 or row.get("kind") not in {"1", "2", "3"}:
            continue
        require(row["kind"] == bdl_id[-1], f"BDL: niespójny rodzaj {bdl_id}")
        candidate = bdl_id[2:4] + bdl_id[7:]
        if candidate not in communes:
            excluded += 1
            continue
        insert_unique(matches, candidate, bdl_id, "BDL → TERC")
        terc_name = terc[candidate]["NAZWA"]
        if row["name"].casefold() != terc_name.casefold():
            different_names.append({"terc": candidate, "bdl": row["name"], "name": terc_name})
    require(communes == matches.keys(), "BDL: nie wszystkie bieżące gminy mają odpowiednik")
    return matches, {
        "records": len(options), "matched": len(matches), "excluded": excluded,
        "differentNames": sorted(different_names, key=lambda row: row["terc"]),
    }


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def run(root, output, snapshot):
    terc = read_terc(read_catalog(root, "TERC_Urzedowy"))
    municipality_links = link_municipalities(terc)
    simc_rows = read_catalog(root, "SIMC_Urzedowy")
    ulic_rows = read_catalog(root, "ULIC_Urzedowy")
    place_kinds = {row["RM"]: row["NAZWA_RM"] for row in read_catalog(root, "WMRODZ")}
    matches, bdl_summary = read_bdl(root, terc)
    simc = {}
    for row in simc_rows:
        code = municipality(row, "RODZ_GMI")
        require(code in terc and digits(row["SYM"], 7) and row["RM"] in place_kinds
                and row["NAZWA"], f"SIMC: niespójny rekord {row['SYM']}")
        insert_unique(simc, row["SYM"], code, "SIMC")
    for row in simc_rows:
        require(row["SYMPOD"] in simc, f"SIMC: brak miejscowości podstawowej dla {row['SYM']}")

    regions = {code: {"places": [], "streets": {}} for code in terc if len(code) == 2}
    names = Counter()
    for row in simc_rows:
        simc_code = row["SYM"]
        code = simc[simc_code]
        names[code, row["NAZWA"].casefold()] += 1
        regions[code[:2]]["places"].append(
            [simc_code, row["NAZWA"], code, place_kinds[row["RM"]], row["SYMPOD"]]
        )

    street_keys = set()
    for row in ulic_rows:
        simc_code, street_code = row["SYM"], row["SYM_UL"]
        code = municipality(row, "RODZ_GMI")
        require(simc.get(simc_code) == code and digits(street_code, 5) and row["NAZWA_1"],
                f"ULIC: niespójny rekord {simc_code}/{street_code}")
        key = (simc_code, street_code)
        require(key not in street_keys, f"ULIC: powtórzony identyfikator {key}")
        street_keys.add(key)
        name = " ".join(part for part in (row["CECHA"], row["NAZWA_2"], row["NAZWA_1"]) if part)
        regions[code[:2]]["streets"].setdefault(simc_code, []).append([street_code, name])

    summary = {
        "snapshot": snapshot,
        "terc": len(terc), "communes": len(matches), "simc": len(simc), "ulic": len(street_keys),
        "dateFields": {
            "terc": sorted({row["STAN_NA"] for row in terc.values()}),
            "simc": sorted({row["STAN_NA"] for row in simc_rows}),
            "ulic": sorted({row["STAN_NA"] for row in ulic_rows}),
        },
        "urbanRuralParts": sum(len(code) == 7 and code[-1] in "45" for code in terc),
        "citySubunits": sum(len(code) == 7 and code[-1] in "89" for code in terc),
        "sameUnitNames": sum(count > 1 for count in names.values()),
        "bdl": bdl_summary,
    }
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "index.json", {
        "summary": summary,
        "units": {code: [row["NAZWA"], row["NAZWA_DOD"], matches.get(code)]
                  for code, row in terc.items()},
        "municipalities": municipality_links,
    })
    for code, data in regions.items():
        write_json(output / f"region-{code}.json", data)
    copyfile(Path(__file__).with_name("m3b-location-preview.html"), output / "index.html")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--snapshot", required=True, help="Data archiwum źródłowego")
    options = parser.parse_args()
    run(options.source, options.output, options.snapshot)
