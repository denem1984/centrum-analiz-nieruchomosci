const scriptUrl = new URL("../../../vendor/oferty/sheetjs-0.20.3/xlsx.mini.min.js", import.meta.url);
const integrity = "sha256-DLNT+DDXKIOFSSyD0newWN3qxmTKUc8Tk6of0+K3CTk=";
const loading = new WeakMap();

function loadXlsx(document) {
  const existing = document.defaultView.XLSX;
  if (existing?.version === "0.20.3") return Promise.resolve(existing);
  if (loading.has(document)) return loading.get(document);
  const task = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl.href;
    script.integrity = integrity;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      const api = document.defaultView.XLSX;
      if (api?.version === "0.20.3") resolve(api);
      else reject(new Error("Nie udało się uruchomić biblioteki XLSX."));
    }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error("Nie udało się wczytać biblioteki XLSX."));
    }, { once: true });
    document.head.append(script);
  }).catch((error) => {
    loading.delete(document);
    throw error;
  });
  loading.set(document, task);
  return task;
}

export function offersWorkbook(xlsx, offers) {
  const headers = ["LP", "Typ", "Adres", "Źródło", "URL", "Cena", "Powierzchnia (m²)", "Cena/m²"];
  const rows = offers.map(({ type, location, source, url, price, area, priceM2 }, index) =>
    [index + 1, type, location, source, url, price, area, priceM2]);
  const sheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = [7, 24, 42, 22, 70, 16, 20, 16].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  for (let row = 1; row <= rows.length; row += 1) {
    for (const [column, format] of [[5, "#,##0.00"], [6, "0.00"], [7, "#,##0.00"]]) {
      const cell = sheet[xlsx.utils.encode_cell({ r: row, c: column })];
      if (cell?.t === "n") cell.z = format;
    }
  }
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, "Wybrane oferty");
  return book;
}

export async function exportOffers(document, offers, location, signal) {
  const xlsx = await loadXlsx(document);
  signal.throwIfAborted();
  const place = String(location).trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "analiza";
  xlsx.writeFile(offersWorkbook(xlsx, offers), `wybrane_oferty_${place}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
