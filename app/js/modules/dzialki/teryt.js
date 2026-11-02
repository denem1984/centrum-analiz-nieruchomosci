export function terc7ToTeryt(value) {
  return typeof value === "string" && /^\d{7}$/.test(value)
    ? value.slice(0, 6)
    : null;
}
