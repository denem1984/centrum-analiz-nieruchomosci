export function terc7ToTeryt(value) {
  return typeof value === "string" && /^\d{7}$/.test(value)
    ? value.slice(0, 6)
    : null;
}

export function deriveCommuneFromUnitId(parcelId, communes = []) {
  if (typeof parcelId !== "string") return null;
  const match = parcelId.match(/^(\d{6})_([0-9])\./);
  if (!match) return null;
  const [, prefix, rawKind] = match;
  const unitKind = Number(rawKind);
  let kind;
  let inferred = false;
  if ([1, 2, 3].includes(unitKind)) {
    kind = unitKind;
  } else if ([4, 5].includes(unitKind)) {
    // TERYT defines urban/rural parts as the urban-rural commune (kind 3).
    // Keep this mapping marked as a hypothesis until checked against full TERC in M3b.
    kind = 3;
    inferred = true;
  } else {
    return null;
  }
  const code = prefix + String(kind);
  const fromPrg = communes.find((item) => item?.code === code && typeof item.name === "string");
  if (!fromPrg?.name?.trim()) return null;
  return { code, name: fromPrg.name, kind, inferred };
}
