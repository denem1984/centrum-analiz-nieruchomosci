const pendingLoads = new WeakMap();
const LEAFLET_SCRIPT_URL = new URL(
  "../../../vendor/dzialki/leaflet-1.9.4/leaflet.js",
  import.meta.url,
).href;

export function loadLeaflet(options = {}) {
  const documentRef = options.document ?? globalThis.document;
  const windowRef = options.window ?? globalThis.window ?? globalThis;
  if (windowRef.L?.map) return Promise.resolve(windowRef.L);
  if (!documentRef?.createElement || !documentRef.head?.append) {
    return Promise.reject(new Error("Brak elementu dokumentu do załadowania mapy."));
  }
  if (pendingLoads.has(windowRef)) return pendingLoads.get(windowRef);

  const promise = new Promise((resolve, reject) => {
    const script = documentRef.createElement("script");
    script.src = LEAFLET_SCRIPT_URL;
    script.async = true;
    script.dataset.leafletLocal = "1";
    script.addEventListener("load", () => {
      const leaflet = windowRef.L ?? globalThis.L;
      if (leaflet?.map) resolve(leaflet);
      else reject(new Error("Lokalny skrypt załadował się bez interfejsu Leaflet."));
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error("Nie udało się załadować lokalnej biblioteki Leaflet 1.9.4."));
    }, { once: true });
    documentRef.head.append(script);
  });
  pendingLoads.set(windowRef, promise);
  promise.catch(() => pendingLoads.delete(windowRef));
  return promise;
}

export const leafletScriptUrl = LEAFLET_SCRIPT_URL;