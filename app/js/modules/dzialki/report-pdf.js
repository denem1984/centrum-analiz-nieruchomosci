const VENDOR = new URL("../../../vendor/dzialki/pdf/", import.meta.url);
const JSPDF_INTEGRITY = "sha256-5lUfzcMvCdaFOyxRJtGNAdlEfg2mGKQaEevu4PbCDVQ=";
const FONT_INTEGRITY = "sha256-9fVSyMXtth/m77gkuvTU3kexqGiatJJf9D971qTr7OU=";
const FONT_FILE = "NotoSans-Regular.ttf";
let libraryTask;
let fontTask;

function loadLibrary() {
  libraryTask ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("jspdf.umd.min.js", VENDOR).href;
    script.integrity = JSPDF_INTEGRITY;
    script.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("Brak generatora PDF."));
    script.onerror = () => { script.remove(); reject(new Error("Nie udało się wczytać generatora PDF.")); };
    document.head.append(script);
  }).catch(error => { libraryTask = undefined; throw error; });
  return libraryTask;
}

function loadFont() {
  fontTask ??= fetch(new URL(FONT_FILE, VENDOR), { integrity: FONT_INTEGRITY, signal: AbortSignal.timeout(10000) })
    .then(async response => {
      if (!response.ok) throw new Error("Nie udało się wczytać czcionki.");
      const data = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
      return btoa(binary);
    }).catch(error => { fontTask = undefined; throw error; });
  return fontTask;
}

export function createParcelPdf(JsPDF, font, parcels, snapshots, date = new Date()) {
  if (!parcels.length && !snapshots.length) throw new Error("Raport jest pusty.");
  const doc = new JsPDF({ unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  doc.setProperties({ title: "Raport o nieruchomości", author: "Centrum Analiz Nieruchomości" });
  doc.addFileToVFS(FONT_FILE, font);
  doc.addFont(FONT_FILE, "NotoSans", "normal");
  doc.setFont("NotoSans", "normal");
  const margin = 16, width = 178, bottom = 278;
  let y = 16;
  const dateLabel = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeStyle: "short" }).format(date);
  function nextPage() { doc.addPage(); y = 16; }
  function ensureSpace(height) { if (y + height > bottom) nextPage(); }
  function paragraph(value, { size = 10, color = "#172b3a", indent = 0, swatch = null } = {}) {
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(String(value).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").replace(/[–—]/g, "-"), width - indent);
    const lineHeight = size * 0.46;
    for (const [index, line] of lines.entries()) {
      ensureSpace(lineHeight);
      if (swatch && index === 0) { doc.setFillColor(swatch); doc.rect(margin, y + 0.5, 3, 3, "F"); }
      doc.text(line, margin + indent, y, { baseline: "top" });
      y += lineHeight;
    }
    y += 1.4;
  }
  function title(label) {
    ensureSpace(16);
    paragraph(label, { size: 15, color: "#084b5b" });
  }
  function legendBlock(legend) {
    doc.setFontSize(9);
    const lines = legend.rows.reduce((count, [swatch, label]) =>
      count + doc.splitTextToSize(label, width - (swatch ? 6 : 0)).length, 0);
    ensureSpace(Math.min(95, 9 + lines * 4.14 + legend.rows.length * 1.4));
    title(legend.label);
    for (const [swatch, label] of legend.rows) paragraph(label, { size: 9, indent: swatch ? 6 : 0, swatch });
  }
  function header() {
    paragraph("CENTRUM ANALIZ NIERUCHOMOŚCI", { size: 9, color: "#0b6378" });
    paragraph("Raport o nieruchomości", { size: 23 });
    paragraph(dateLabel, { size: 9, color: "#4c606c" });
    doc.setDrawColor("#cbd7dd");
    doc.line(margin, y + 2, margin + width, y + 2);
    y += 9;
  }
  header();
  if (parcels.length) {
    title("Działki");
    for (const parcel of parcels) {
      ensureSpace(40);
      paragraph(parcel.id, { size: 13, color: "#084b5b" });
      for (const [label, value] of parcel.fields) paragraph(label + ": " + (value || "Brak danych"));
      y += 5;
    }
  }
  for (const [index, map] of snapshots.entries()) {
    if (parcels.length || index > 0) nextPage();
    title("Widok mapy " + (index + 1));
    paragraph("Włączone warstwy: " + map.layers.join(", "), { size: 9 });
    for (const notice of map.notices) paragraph(notice, { size: 9, color: "#8a4b08" });
    const scale = Math.min(width / map.width, 131 / map.height);
    const imageWidth = map.width * scale, imageHeight = map.height * scale;
    ensureSpace(imageHeight + 12);
    doc.addImage(map.image, "PNG", margin + (width - imageWidth) / 2, y, imageWidth, imageHeight);
    y += imageHeight + 3;
    if (map.attributions) paragraph(map.attributions, { size: 8, color: "#4c606c" });
    y += 4;
    for (const legend of map.legends) legendBlock(legend);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor("#cbd7dd");
    doc.line(margin, 282, margin + width, 282);
    doc.setTextColor("#4c606c");
    doc.setFontSize(8);
    doc.text("Centrum Analiz Nieruchomości", margin, 287);
    doc.text(page + " / " + pages, margin + width, 287, { align: "right" });
  }
  return doc;
}

export async function downloadParcelPdf(parcels, snapshots, signal) {
  const [JsPDF, font] = await Promise.all([loadLibrary(), loadFont()]);
  signal.throwIfAborted();
  const doc = createParcelPdf(JsPDF, font, parcels, snapshots);
  doc.save("raport-nieruchomosc-" + new Date().toISOString().slice(0, 10) + ".pdf");
}
