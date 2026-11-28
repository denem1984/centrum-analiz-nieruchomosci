import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { similarModule } from "../app/js/modules/podobne/index.js";

test("Podobne montuje formularze z atrapą DOM, obsługuje błąd mapy i sprząta widok", async () => {
  const { document } = createFakeDom();
  const create = document.createElement;
  document.createElement = (tag) => {
    const element = create(tag);
    element.classList = { toggle() {} };
    if (tag === "section" || tag === "article") {
      Object.defineProperty(element, "innerHTML", {
        set(template) {
          for (const [, node, key, name] of template.matchAll(/<([a-z]+)[^<>]*\bdata-(part|field)="([A-Za-z]+)"/g)) {
            const child = document.createElement(node);
            child.dataset[key] = name;
            element.append(child);
          }
        },
      });
    }
    return element;
  };
  const view = document.getElementById("module-view");
  const unmount = similarModule.mount(view, { podobneDemo: true, localPreview: true });
  try {
    assert.ok(view.querySelector("[data-podobne]"));
    assert.equal(view.querySelector('[data-part="subject"]').children.length, 1);
    assert.equal(view.querySelector('[data-part="comparisons"]').children.length, 3);
    assert.equal(view.querySelector('[data-part="demo"]').hidden, false);
    document.head.querySelector("script").dispatch("error");
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(view.querySelector('[data-part="mapStatus"]').textContent, /Leaflet/);
    const form = view.querySelector('[data-field="form"]');
    assert.equal(form.dispatch("submit").defaultPrevented, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(view.querySelector('[data-field="status"]').textContent, /Wpisz miejscowość/);
  } finally {
    unmount();
  }
  assert.equal(view.children.length, 0);
});
