import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { gminyModule } from "../app/js/modules/gminy/index.js";

test("Gminy montują filtr, wyszukują gminę i wyświetlają ranking z atrapą DOM", () => {
  const { document } = createFakeDom();
  const create = document.createElement;
  document.createElement = (tag) => {
    const element = create(tag);
    element.classList = { toggle() {} };
    if (tag === "section") {
      Object.defineProperty(element, "innerHTML", {
        set(template) {
          for (const [, kind, name] of template.matchAll(/<([a-z]+)[^<>]*\bdata-part="([A-Za-z]+)"/g)) {
            const child = document.createElement(kind === "section" ? "div" : kind);
            child.dataset.part = name;
            element.append(child);
          }
        },
      });
    }
    return element;
  };
  const view = document.getElementById("module-view");
  const unmount = gminyModule.mount(view, { gminyDemo: true, localPreview: true });
  const part = (name) => view.querySelector(`[data-part="${name}"]`);
  try {
    assert.ok(view.querySelector("[data-gminy]"));
    assert.equal(part("filters").disabled, false);
    assert.match(part("status").textContent, /24 gmin/);
    part("target").value = "Zurawin";
    part("target").dispatch("input");
    assert.equal(part("suggestions").children.length, 1);
    part("profile").value = "dzialki";
    part("scope").value = "country";
    assert.equal(part("form").dispatch("submit").defaultPrevented, true);
    assert.equal(part("targetName").textContent, "Żurawin");
    assert.equal(part("count").textContent, "23");
    assert.equal(part("ranking").children.length, 20);
  } finally {
    unmount();
  }
  assert.equal(view.children.length, 0);
});
