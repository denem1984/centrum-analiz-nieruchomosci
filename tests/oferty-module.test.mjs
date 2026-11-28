import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { offersModule } from "../app/js/modules/oferty/index.js";

test("Oferty montują formularz i wyniki w powłoce z atrapą DOM", async () => {
  const { document } = createFakeDom();
  const createElement = document.createElement;
  const fields = { location: "Olsztyn", propertyType: "dom", radius: "5", mode: "percent", area: "120", tolerance: "10" };
  document.createElement = (tag) => {
    const element = createElement(tag);
    element.classList = { toggle() {} };
    if (tag === "section") {
      Object.defineProperty(element, "innerHTML", {
        set(template) {
          for (const match of template.matchAll(/<([a-z]+)[^<>]*\bdata-part="([A-Za-z]+)"/g)) {
            const [, kind, name] = match;
            const child = document.createElement(kind === "section" ? "div" : kind);
            child.dataset.part = name;
            child.value = fields[name] ?? "";
            element.append(child);
          }
        },
      });
    }
    return element;
  };
  const view = document.getElementById("module-view");
  const stop = offersModule.mount(view, { ofertyDemo: true });
  try {
    assert.ok(view.querySelector("[data-oferty]"));
    const part = (name) => view.querySelector(`[data-part="${name}"]`);
    part("form").dispatch("submit");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(part("results").hidden, false);
    assert.equal(part("offers").children.length, 5);
    assert.equal(part("sources").children.length, 6);
    assert.match(part("sourceWarning").textContent, /Adresowo/);
    assert.equal(part("export").disabled, true);
  } finally {
    stop();
  }
});
