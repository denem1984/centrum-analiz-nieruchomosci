import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const vendor = join(repoRoot, "app", "vendor", "dzialki", "leaflet-1.9.4");
const digest = (bytes, encoding = "base64") => createHash("sha256").update(bytes).digest(encoding);

test("lokalne pliki Leaflet 1.9.4 zachowują zatwierdzone skróty i licencję", async () => {
  const js = await readFile(join(vendor, "leaflet.js"));
  const css = await readFile(join(vendor, "leaflet.css"));
  const license = await readFile(join(vendor, "LICENSE"), "utf8");
  assert.equal(digest(js), "20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=");
  assert.equal(digest(css), "p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=");
  assert.match(license, /BSD 2-Clause License/);
  assert.match(license, /Volodymyr Agafonkin/);
  assert.match(license, /CloudMade/);

  const expectedImages = {
    "layers.png": "1dbbe9d028e292f36fcba8f8b3a28d5e8932754fc2215b9ac69e4cdecf5107c6",
    "layers-2x.png": "066daca850d8ffbef007af00b06eac0015728dee279c51f3cb6c716df7c42edf",
    "marker-icon.png": "574c3a5cca85f4114085b6841596d62f00d7c892c7b03f28cbfa301deb1dc437",
    "marker-icon-2x.png": "00179c4c1ee830d3a108412ae0d294f55776cfeb085c60129a39aa6fc4ae2528",
    "marker-shadow.png": "264f5c640339f042dd729062cfc04c17f8ea0f29882b538e3848ed8f10edb4da",
  };
  for (const [name, expected] of Object.entries(expectedImages)) {
    const bytes = await readFile(join(vendor, "images", name));
    assert.equal(digest(bytes, "hex"), expected, name);
  }
});