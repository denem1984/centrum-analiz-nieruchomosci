import test from "node:test";
import assert from "node:assert/strict";
import { scanText } from "./check-no-secrets.mjs";

test("detects Supabase secret-key format and accepts shorter near miss", () => {
  const prefix = "sb_secret_";
  assert.ok(scanText(prefix + "a".repeat(20), "fixture").some((hit) => hit.endsWith("Supabase secret key")));
  assert.deepEqual(scanText(prefix + "a".repeat(19), "fixture"), []);
});

test("detects Render API-key format and accepts shorter near miss", () => {
  const prefix = "rnd_";
  assert.ok(scanText(prefix + "B".repeat(20), "fixture").some((hit) => hit.endsWith("Render API key")));
  assert.deepEqual(scanText(prefix + "B".repeat(19), "fixture"), []);
});

test("detects long Base64 and hex values only after infrastructure-related names", () => {
  const base64Like = "CLOUDFLARE_UPLOAD_ID=" + "Q".repeat(40);
  const hexLike = "R2_OBJECT_DIGEST=" + "a".repeat(40);
  assert.ok(scanText(base64Like, "fixture").some((hit) => hit.endsWith("long infrastructure credential")));
  assert.ok(scanText(hexLike, "fixture").some((hit) => hit.endsWith("long infrastructure credential")));
  assert.deepEqual(scanText("UNRELATED_VALUE=" + "Q".repeat(50), "fixture"), []);
  assert.deepEqual(scanText("SUPABASE_DIGEST=" + "a".repeat(39), "fixture"), []);
});
