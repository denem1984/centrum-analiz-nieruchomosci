export function mapPopupOptions(map) {
  const size = map.getSize();
  return {
    maxWidth: Math.min(380, Math.max(80, size.x - 64)),
    minWidth: 80,
    maxHeight: Math.min(420, Math.max(36, size.y - 92)),
    autoPanPadding: [12, 12],
  };
}

export function fitOpenMapPopup(map) {
  let active;
  map.on("popupopen", ({ popup }) => { active = popup; });
  map.on("popupclose", ({ popup }) => { if (active === popup) active = null; });
  map.on("resize", () => {
    if (!active) return;
    Object.assign(active.options, mapPopupOptions(map));
    active.update();
  });
}
