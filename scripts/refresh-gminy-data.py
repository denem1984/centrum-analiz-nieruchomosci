"""Build the static Gminy snapshot from anonymous GUS BDL pages and verified M3b inputs."""

import argparse
from collections import deque
from datetime import datetime, timezone
from http.client import HTTPException
import json
import math
from pathlib import Path
from runpy import run_path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

INDICATORS = ("60559", "458603", "634067", "747072", "60530", "1548707", "1728573")
BASE = "https://bdl.stat.gov.pl/api/v1/"
PAGE_SIZE = 100
# GUS permits 100 anonymous requests in a rolling 15-minute window.
WINDOW_LIMIT = 100
WINDOW_SECONDS = 905
# Dz.U. 2025 poz. 1046 i 1571. Zmiany rodzaju gmin od 2026-01-01.
TERC_CHANGES_2026 = {
    "0601053": "0601052", "1412143": "1412142", "1416053": "1416052",
    "1419143": "1419142", "1602023": "1602022", "2404033": "2404032",
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, data):
    pending = path.with_suffix(".part")
    pending.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    pending.replace(path)


class PublicBdl:
    def __init__(self, root, already_sent, cache_only):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.ledger = root / "requests.json"
        now = time.time()
        previous = read_json(self.ledger) if self.ledger.exists() else []
        self.sent = deque(sorted([*previous, *([now] * already_sent)]))
        self.used = 0
        self.cache_only = cache_only

    def request(self, path):
        for attempt in range(4):
            now = time.time()
            while self.sent and self.sent[0] <= now - WINDOW_SECONDS:
                self.sent.popleft()
            if len(self.sent) >= WINDOW_LIMIT:
                wait = self.sent[0] + WINDOW_SECONDS - now + 1
                print(f"BDL: przerwa {math.ceil(wait)} s do odnowienia limitu", flush=True)
                time.sleep(wait)
                while self.sent and self.sent[0] <= time.time() - WINDOW_SECONDS:
                    self.sent.popleft()
            if self.sent:
                time.sleep(max(0, self.sent[-1] + 0.4 - time.time()))
            self.sent.append(time.time())
            write_json(self.ledger, list(self.sent))
            self.used += 1
            if self.used > 290:
                raise ValueError("Limit jednego uruchomienia osiągnięty. Zachowano pobrane strony.")
            try:
                with urlopen(Request(BASE + path, headers={"Accept": "application/json"}), timeout=20) as response:
                    return json.load(response)
            except HTTPError as error:
                if error.code == 429:
                    retry = error.headers.get("Retry-After", "")
                    wait = max(WINDOW_SECONDS, int(retry)) if retry.isdecimal() else WINDOW_SECONDS
                    print(f"BDL: HTTP 429, przerwa {wait} s", flush=True)
                    time.sleep(wait)
                elif 500 <= error.code < 600 and attempt < 3:
                    time.sleep(2 ** attempt)
                else:
                    raise
            except (URLError, TimeoutError, HTTPException, ConnectionError):
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        raise ValueError("BDL: wyczerpano próby pobrania")

    def page(self, identifier, year, page):
        file = self.root / f"{identifier}-{year}-{page}.json"
        if file.exists():
            data = read_json(file)
        else:
            if self.cache_only:
                raise ValueError(f"Brak strony w cache: {file.name}")
            query = urlencode({"year": year, "unit-level": 6, "page-size": PAGE_SIZE, "format": "json", "page": page})
            data = self.request(f"data/by-variable/{identifier}?{query}")
        if str(data.get("variableId")) != identifier or not isinstance(data.get("results"), list):
            raise ValueError(f"Nieprawidłowa odpowiedź dla zmiennej {identifier}, strona {page}")
        if not file.exists():
            write_json(file, data)
        return data


def read_indicator(source, identifier, year):
    first = source.page(identifier, year, 0)
    total = first["totalRecords"]
    pages = math.ceil(total / PAGE_SIZE)
    if pages < 1:
        raise ValueError(f"Brak danych: {identifier} ({year})")
    values = {}
    for index in range(pages):
        data = first if index == 0 else source.page(identifier, year, index)
        rows = data["results"]
        if (data["totalRecords"] != total or data.get("lastUpdate") != first.get("lastUpdate")
                or len(rows) != min(PAGE_SIZE, total - index * PAGE_SIZE)):
            raise ValueError(f"Niespójna paginacja: {identifier}, strona {index}")
        for row in rows:
            key = row["id"]
            if key in values:
                raise ValueError(f"Powtórzenie jednostki {key} przy zmiennej {identifier}")
            matches = [item.get("val") for item in row["values"] if str(item["year"]) == str(year)]
            if len(matches) > 1:
                raise ValueError(f"Powtórzenie roku dla {key} przy zmiennej {identifier}")
            value = matches[0] if matches else None
            values[key] = value if type(value) in (int, float) and math.isfinite(value) else None
        if (index + 1) % 10 == 0 or index + 1 == pages:
            print(f"BDL {identifier}: {index + 1}/{pages} stron", flush=True)
    return values, pages


def historic_bdl_ids(m3b, codes):
    wanted = set(codes)
    found = {}
    for path in sorted(m3b.glob("bdl-units-*.json")):
        for row in read_json(path)["results"]:
            bdl = row["id"]
            terc = bdl[2:4] + bdl[7:]
            if terc not in wanted or row["level"] != 6 or row["kind"] != terc[-1]:
                continue
            if terc in found:
                raise ValueError(f"Kilka identyfikatorów BDL dla historycznego TERC {terc}")
            found[terc] = bdl
    if set(found) != wanted:
        raise ValueError(f"W katalogu BDL brakuje historycznych TERC: {sorted(wanted - found.keys())}")
    return found


def snapshot(source, m3b, year):
    verify = run_path(str(Path(__file__).with_name("verify-location-dictionaries.py")))
    terc = verify["read_terc"](verify["read_catalog"](m3b, "TERC_Urzedowy"))
    matches, summary = verify["read_bdl"](m3b, terc)
    terc_dates = sorted({row["STAN_NA"] for row in terc.values()})
    terc_years = {int(date[:4]) for date in terc_dates}
    if terc_years == {2026} and year == 2025:
        changes = TERC_CHANGES_2026
    elif terc_years == {year}:
        changes = {}
    else:
        raise ValueError(f"Brak potwierdzonego powiązania TERC {terc_dates} z rokiem danych {year}")
    historic = historic_bdl_ids(m3b, changes.values()) if changes else {}
    applied_bdl = set()
    columns, page_totals = [], {}
    for identifier in INDICATORS:
        column, pages = read_indicator(source, identifier, year)
        columns.append(column)
        page_totals[identifier] = pages
    rows = []
    missing = {identifier: 0 for identifier in INDICATORS}
    unmapped = {}
    for code, bdl in sorted(matches.items()):
        reference_code = changes.get(code)
        if reference_code:
            bdl = historic[reference_code]
        if bdl in applied_bdl:
            raise ValueError(f"Identyfikator BDL przypisany powtórnie: {bdl}")
        applied_bdl.add(bdl)
        values = [column.get(bdl) for column in columns]
        for identifier, value in zip(INDICATORS, values):
            if value is None:
                missing[identifier] += 1
        county = terc[code[:4]]["NAZWA"]
        row = [code, bdl, terc[code]["NAZWA"], county, values]
        if reference_code:
            row.append(reference_code)
        rows.append(row)
    for identifier, column in zip(INDICATORS, columns):
        unmapped[identifier] = len(set(column) - applied_bdl)
    complete = sum(None not in row[4] for row in rows)
    if complete < 2400:
        raise ValueError(f"Zbyt mało gmin z kompletem wskaźników: {complete}/{len(rows)}")
    return {
        "version": 1,
        "source": "GUS BDL",
        "year": year,
        "collected": datetime.now(timezone.utc).date().isoformat(),
        "tercDates": terc_dates,
        "tercCodeChanges": changes,
        "indicators": INDICATORS,
        "complete": complete,
        "excluded": len(rows) - complete,
        "missing": missing,
        "unmapped": unmapped,
        "bdlCatalog": summary,
        "pages": page_totals,
    }, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--m3b", type=Path, default=Path(".local/m3b"))
    parser.add_argument("--cache", type=Path, default=Path(".local/m8-bdl"))
    parser.add_argument("--output", type=Path, default=Path("app/data/gminy/bdl.json"))
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--already-sent", type=int, default=0)
    parser.add_argument("--cache-only", action="store_true")
    args = parser.parse_args()
    if not 0 <= args.already_sent <= WINDOW_LIMIT:
        parser.error("--already-sent musi mieścić się w limicie jednego okna")
    args.cache.mkdir(parents=True, exist_ok=True)
    lock = args.cache / "refresh.lock"
    with lock.open("x", encoding="utf-8") as file:
        file.write("Pobieranie wskaźników Gmin.\n")
    try:
        header, rows = snapshot(PublicBdl(args.cache, args.already_sent, args.cache_only), args.m3b, args.year)
    finally:
        lock.unlink()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pending = args.output.with_suffix(".part")
    with pending.open("w", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(header, ensure_ascii=False, separators=(",", ":"))[:-1] + ',\n"rows":[\n')
        file.write(",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows))
        file.write("\n]}\n")
    pending.replace(args.output)
    print(json.dumps(header, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
