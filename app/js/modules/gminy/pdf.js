import { loadPdfResources } from "../dzialki/report-pdf.js";
import { formatScore, formatValue, INDICATORS, PROFILES, TYPES } from "./model.js";

export function createGminyPdf(JsPDF, font, { analysis, rows, source, year }) {
  if (!rows.length) throw new Error("Zaznacz przynajmniej jedną gminę.");
  const { target, profile, same, scopeLabel, weights } = analysis;
  const doc = new JsPDF({ unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  doc.setProperties({ title: "Porównanie gmin - " + target.name, author: "Centrum Analiz Nieruchomości" });
  doc.addFileToVFS("NotoSans-Regular.ttf", font);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.setFont("NotoSans", "normal");
  const ink = "#173641", accent = "#0a5667", muted = "#4b646d", rule = "#cbdadf";
  const line = (text, x, y, { size = 9, color = ink, align = "left" } = {}) => {
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(text, x, y, { align });
  };
  for (const [index, row] of rows.entries()) {
    if (index) doc.addPage();
    doc.setFillColor("#eaf4f5");
    doc.rect(0, 0, 210, 46, "F");
    line("CENTRUM ANALIZ NIERUCHOMOŚCI", 15, 14, { size: 9, color: accent });
    line("Porównanie gmin", 15, 27, { size: 24 });
    line(source + " · " + year, 195, 40, { size: 10, align: "right", color: muted });
    line("Gmina docelowa · " + target.name + " · " + TYPES[target.kind], 15, 59, { size: 10 });
    line("Porównywana gmina · " + row.name + " · " + TYPES[row.kind], 15, 67, { size: 10 });
    line("Profil · " + PROFILES[profile] + "   |   " + scopeLabel + (same ? " · ten sam typ" : ""), 15, 76, { size: 9, color: muted });
    line("TERC w roku danych " + target.referenceTerc + " / " + row.referenceTerc + "   |   BDL " + target.id + " / " + row.id, 15, 83, { size: 8, color: muted });
    line("Podobieństwo " + formatScore(row.score), 15, 95, { size: 15, color: accent });

    doc.setFillColor("#eaf4f5");
    doc.rect(15, 102, 180, 11, "F");
    line("Wskaźnik", 18, 109, { size: 9, color: accent });
    const headers = [["Docelowa", 123], ["Porównywana", 149], ["Waga", 167], ["Podobieństwo", 192]];
    for (const [title, x] of headers) line(title, x, 109, { size: 8, color: accent, align: "right" });
    for (const [i, indicator] of INDICATORS.entries()) {
      const y = 118 + i * 18;
      line(indicator.title, 18, y, { size: 9 });
      line(indicator.unit.replace(/[–—]/g, "-"), 18, y + 5, { size: 7.6, color: muted });
      const values = [formatValue(target.values[i]), formatValue(row.values[i]), weights[i] + "%", formatScore(row.scores[i])];
      values.forEach((value, column) => line(value, headers[column][1], y + 2, { size: 9, align: "right" }));
      doc.setFontSize(7.5);
      const description = doc.splitTextToSize(indicator.description.replace(/[–—]/g, "-"), 171);
      for (const [j, text] of description.entries()) line(text, 18, y + 9.5 + j * 3, { size: 7.5, color: muted });
      doc.setDrawColor(rule);
      doc.line(15, y + 13.5, 195, y + 13.5);
    }
    line("Wynik porównuje wskaźniki w ramach wybranego zakresu. Ceny nieruchomości wymagają osobnej analizy.", 15, 248, { size: 8, color: muted });
    line("Budownictwo · średnia z trzech lat do " + year + " r. włącznie.", 15, 255, { size: 8, color: muted });
    if (source === "GUS BDL") {
      doc.setFontSize(8);
      doc.setTextColor(accent);
      doc.textWithLink("GUS, Bank Danych Lokalnych (CC BY 4.0) · bdl.stat.gov.pl", 15, 262, { url: "https://bdl.stat.gov.pl/" });
    }
    doc.setDrawColor(rule);
    doc.line(15, 280, 195, 280);
    line("Centrum Analiz Nieruchomości", 15, 286, { size: 8, color: muted });
    line((index + 1) + " / " + rows.length, 195, 286, { size: 8, color: muted, align: "right" });
  }
  return doc;
}

export async function downloadGminyPdf(report, signal) {
  const { JsPDF, font } = await loadPdfResources(signal);
  createGminyPdf(JsPDF, font, report).save("porownanie-gmin-" + report.analysis.target.terc + ".pdf");
}
