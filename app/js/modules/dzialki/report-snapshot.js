const TILE_SELECTOR = "img.leaflet-tile, canvas.leaflet-tile";
const LABEL_SELECTOR = ".dzialki-egib-label-icon span, .leaflet-tooltip, .leaflet-control-scale-line";

function readImage(document, url, signal, crossorigin = false) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const image = document.createElement("img");
    if (crossorigin) image.crossOrigin = "anonymous";
    function finish(error) {
      signal.removeEventListener("abort", abort);
      image.onload = image.onerror = null;
      if (error) { image.removeAttribute("src"); reject(error); }
      else resolve(image);
    }
    const abort = () => finish(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Obraz niedostępny."));
    image.src = url;
  });
}

function position(node, frame) {
  const rect = node.getBoundingClientRect();
  return { x: rect.left - frame.left, y: rect.top - frame.top, width: rect.width, height: rect.height };
}

// Freeze geometry and styles synchronously before any optional tile reads.
function collectMapElements(mapNode, frame) {
  const { defaultView } = mapNode.ownerDocument;
  const items = [];
  const panes = [...mapNode.querySelectorAll(".leaflet-pane:not(.leaflet-map-pane):not(.leaflet-popup-pane)")];
  const z = node => Number(defaultView.getComputedStyle(node).zIndex) || 0;
  panes.sort((a, b) => z(a) - z(b));
  for (const pane of panes) {
    const layers = [...pane.children].sort((a, b) => z(a) - z(b));
    for (const layer of layers) {
      const groupOpacity = Number(defaultView.getComputedStyle(layer).opacity);
      if (!groupOpacity) continue;
      const elements = layer.matches(TILE_SELECTOR + ", svg, " + LABEL_SELECTOR)
        ? [layer] : [...layer.querySelectorAll(TILE_SELECTOR + ", svg, " + LABEL_SELECTOR)];
      for (const node of elements) {
        const bounds = position(node, frame);
        if (bounds.width <= 0 || bounds.height <= 0 || bounds.x >= frame.width || bounds.y >= frame.height
          || bounds.x + bounds.width <= 0 || bounds.y + bounds.height <= 0) continue;
        const computed = defaultView.getComputedStyle(node);
        const opacity = node === layer ? groupOpacity : groupOpacity * Number(computed.opacity);
        if (node.matches(TILE_SELECTOR)) {
          if (!node.classList.contains("leaflet-tile-loaded")) continue;
          items.push({ kind: "tile", node, opacity, bounds, source: node.currentSrc || node.src,
            base: pane.classList.contains("leaflet-tile-pane") });
        } else if (node.localName === "svg") {
          const vector = node.cloneNode(true);
          vector.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          vector.removeAttribute("style");
          items.push({ kind: "svg", opacity, bounds, source: "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(vector)) });
        } else if (node.textContent.trim()) {
          items.push({ kind: "label", bounds, text: node.textContent.trim(), color: computed.color, font: computed.font });
        }
      }
    }
  }
  const scale = mapNode.querySelector(".leaflet-control-scale-line");
  if (scale) {
    const bounds = position(scale, frame);
    items.push({ kind: "scale", bounds, text: scale.textContent });
  }
  return items;
}

export async function captureReportMap(mapNode, signal) {
  const document = mapNode.ownerDocument;
  const frame = mapNode.getBoundingClientRect();
  if (frame.width < 1 || frame.height < 1) throw new Error("Mapa nie jest widoczna.");
  const items = collectMapElements(mapNode, frame);
  const attributions = mapNode.querySelector(".leaflet-control-attribution")?.textContent.trim() ?? "";
  const notices = [];
  const canvas = document.createElement("canvas");
  const ratio = Math.min(2, 2000 / Math.max(frame.width, frame.height));
  canvas.width = Math.ceil(frame.width * ratio);
  canvas.height = Math.ceil(frame.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.fillStyle = document.defaultView.getComputedStyle(mapNode).backgroundColor || "#e5edf0";
  ctx.fillRect(0, 0, frame.width, frame.height);
  const imageSignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  let baseCount = 0;
  let missing = 0;
  for (let i = 0; i < items.length; i += 8) {
    const batch = items.slice(i, i + 8);
    const images = await Promise.all(batch.map(async item => {
      if (item.kind === "label" || item.kind === "scale") return null;
      if (item.kind === "tile" && (!item.source || item.node.crossOrigin === "anonymous" || new URL(item.source).origin === document.location.origin)) return item.node;
      try { return await readImage(document, item.source, imageSignal, item.kind === "tile"); }
      catch { return null; }
    }));
    signal.throwIfAborted();
    for (const [index, item] of batch.entries()) {
      const { x, y, width, height } = item.bounds;
      const image = images[index];
      if (item.kind === "label" || item.kind === "scale") {
        ctx.font = item.font || "12px sans-serif";
        ctx.textBaseline = "top";
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.strokeText(item.text, x, y);
        ctx.fillStyle = item.color || "#172b3a";
        ctx.fillText(item.text, x, y);
        if (item.kind === "scale") {
          ctx.fillRect(x, y + height - 2, width, 2);
          ctx.fillRect(x, y + height - 6, 1, 5);
          ctx.fillRect(x + width - 1, y + height - 6, 1, 5);
        }
      } else if (image) {
        try {
          ctx.globalAlpha = item.opacity;
          ctx.drawImage(image, x, y, width, height);
          if (item.base) baseCount += 1;
        } catch { missing += 1; }
        finally { ctx.globalAlpha = 1; }
      } else missing += 1;
    }
  }
  if (!baseCount) notices.push("Podkład mapy jest niedostępny na zapisanym obrazie.");
  if (missing) notices.push("Niepełny obraz: pominięte elementy mapy: " + missing + ".");
  return { width: canvas.width, height: canvas.height, image: canvas.toDataURL("image/png"), attributions, notices };
}
