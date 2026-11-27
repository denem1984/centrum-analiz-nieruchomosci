import { attachTileRetry } from "./tile-retry.js";
import { countVisibleKiegTiles } from "./egib-layers.js";

export function mountRasterMonitor(map, layer, status, retryButton, options = {}) {
  const setTimer = options.setTimeoutFn ?? setTimeout, clearTimer = options.clearTimeoutFn ?? clearTimeout;
  const now = options.nowFn ?? Date.now;
  let timer = null, started = now(), disposed = false, controller = null;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  function update() {
    clear();
    if (disposed || !map.hasLayer(layer)) return;
    const stats = countVisibleKiegTiles([layer],map);
    const complete = stats.total > 0 && stats.missing === 0;
    const exhausted = now() - started >= 40000;
    status.dataset.state = complete ? "complete" : exhausted ? "incomplete" : "loading";
    status.dataset.loaded = String(stats.loaded);
    status.dataset.total = String(stats.total);
    status.textContent = (complete ? "Kafelki wczytane: " : exhausted ? "Niepełne wczytanie: " : "Wczytywanie: ") + stats.loaded + "/" + stats.total;
    retryButton.hidden = complete || !exhausted;
    if (!complete && !exhausted) timer = setTimer(() => {
      timer = null;
      controller?.retryIncompleteVisible();
      update();
    }, Math.min(3000,Math.max(0,40000 - (now() - started))));
  }
  const start = (event) => { if (event.tile?.dataset) event.tile.dataset.thematicPending = "true"; };
  const finish = (event) => { if (event.tile?.dataset) event.tile.dataset.thematicPending = "false"; update(); };
  const reset = () => { started = now(); update(); };
  layer.on("tileloadstart",start);
  for (const name of ["tileload","tileerror","tileunload"]) layer.on(name,finish);
  controller = attachTileRetry(layer, {
    setTimeoutImpl:setTimer,clearTimeoutImpl:clearTimer,
    isVisible:(event) => map.hasLayer(layer) && event.tile?.dataset?.thematicPending !== "true",
  });
  map.on("moveend",reset);
  map.on("zoomend",reset);
  map.addLayer(layer);
  update();
  return {
    retry() { started = now(); if (!controller.retryVisible()) layer.redraw(); update(); },
    cleanup() {
      if (disposed) return;
      disposed = true;
      clear(); controller.cancel();
      layer.off("tileloadstart",start);
      for (const name of ["tileload","tileerror","tileunload"]) layer.off(name,finish);
      map.off("moveend",reset); map.off("zoomend",reset);
      if (map.hasLayer(layer)) map.removeLayer(layer);
    },
  };
}
