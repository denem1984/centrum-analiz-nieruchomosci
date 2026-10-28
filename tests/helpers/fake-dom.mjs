function datasetKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function matches(element, selector) {
  const dataMatch = selector.match(/^\[data-([a-z-]+)\]$/);
  if (dataMatch) return Object.hasOwn(element.dataset, datasetKey(dataMatch[1]));
  const attrMatch = selector.match(/^\[([a-z-]+)="([^"]+)"\]$/);
  if (attrMatch) return element.attributes.get(attrMatch[1]) === attrMatch[2];
  const tagClassMatch = selector.match(/^([a-z]+)\.([a-z-]+)$/i);
  if (tagClassMatch) {
    return element.tagName === tagClassMatch[1].toLowerCase()
      && element.className.split(/\s+/).includes(tagClassMatch[2]);
  }
  return selector === "*" || (selector.startsWith("#") && element.id === selector.slice(1));
}

export class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toLowerCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = Object.create(null);
    this.listeners = new Map();
    this._textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.id = "";
    this.className = "";
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._textContent = String(value ?? "");
  }

  append(...elements) {
    for (const element of elements) {
      if (!element || typeof element !== "object") continue;
      element.parentElement = this;
      this.children.push(element);
    }
  }

  replaceChildren(...elements) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._textContent = "";
    this.append(...elements);
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === "id") this.id = text;
    if (name === "class") this.className = text;
    if (name.startsWith("data-")) this.dataset[datasetKey(name)] = text;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith("data-")) delete this.dataset[datasetKey(name)];
    if (name === "id") this.id = "";
    if (name === "class") this.className = "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, properties = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }

  click() {
    return this.dispatch("click");
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child, selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

export function createFakeDom() {
  const document = {
    activeElement: null,
    body: null,
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    getElementById(id) {
      if (!document.body) return null;
      const visit = (node) => {
        if (node.id === id) return node;
        for (const child of node.children) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(document.body);
    },
    querySelectorAll(selector) {
      return document.body?.querySelectorAll(selector) ?? [];
    },
  };

  const body = new FakeElement("body", document);
  document.body = body;
  const locationSummary = document.createElement("p");
  locationSummary.id = "location-summary";
  const clearLocation = document.createElement("button");
  clearLocation.id = "clear-location";
  const contextLoadStatus = document.createElement("p");
  contextLoadStatus.id = "context-load-status";
  const moduleNavigation = document.createElement("div");
  moduleNavigation.id = "module-nav";
  const moduleView = document.createElement("main");
  moduleView.id = "module-view";
  body.append(locationSummary, clearLocation, contextLoadStatus, moduleNavigation, moduleView);

  const location = {
    pathname: "/index.html",
    search: "",
    _hash: "",
    get hash() { return this._hash; },
    set hash(value) { this._hash = String(value); },
  };
  const windowListeners = new Map();
  const historyCalls = [];
  const window = {
    location,
    history: {
      replaceState(state, title, url) {
        historyCalls.push({ state, title, url: String(url) });
        const text = String(url);
        const hashIndex = text.indexOf("#");
        location.hash = hashIndex < 0 ? "" : text.slice(hashIndex);
      },
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) ?? [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    dispatch(type, properties = {}) {
      const event = { type, ...properties };
      for (const listener of windowListeners.get(type) ?? []) listener(event);
    },
    listeners: windowListeners,
    historyCalls,
  };

  return { document, window };
}


