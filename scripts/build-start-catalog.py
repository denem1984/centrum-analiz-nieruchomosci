"""Publish compact Start catalogs from the validated M3b export."""

import argparse
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    encode = lambda row: json.dumps(row, ensure_ascii=False, separators=(",", ":"))
    path.write_text("[\n" + ",\n".join(map(encode, value)) + "\n]\n", encoding="utf-8")


def build(source, output):
    index = read(source / "index.json")
    units = index["units"]
    links = index["municipalities"]
    output.mkdir(parents=True, exist_ok=True)
    write(output / "units.json", (
        [code, name, description, bdl, links.get(code)]
        for code, (name, description, bdl) in sorted(units.items())
    ))
    for province in (code for code in sorted(units) if len(code) == 2):
        data = read(source / f"region-{province}.json")
        write(output / f"places-{province}.json", sorted(data["places"]))
        write(output / f"streets-{province}.json", (
            [simc, sorted(streets)] for simc, streets in sorted(data["streets"].items())
        ))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source, args.output)
