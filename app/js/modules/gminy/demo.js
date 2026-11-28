import { INDICATORS } from "./model.js";

const names = [
  "Przykładowo", "Testowo", "Żurawin", "Różanowo", "Łączki", "Świerczyny",
  "Modrzewie", "Wrzosowo", "Słonecznik", "Wielkokąty", "Dolne Wzgórze", "Wysokie Wzgórze",
  "Mosteczki", "Dębnik", "Jasne Brzegi", "Sosnowa Dolina", "Cicha Dolina", "Zielone Wzgórza",
  "Figliki", "Różane Pole", "Brzeźnica Testowa", "Dąbków", "Bukówka", "Żółte Pola",
];

export const demoMunicipalities = {
  version: 1, year: 2025, source: "Dane przykładowe", indicators: INDICATORS.map(({ id }) => id),
  complete: names.length, excluded: 0,
  rows: names.map((name, index) => {
    const region = index < 16 ? "28" : "14";
    const county = index < 8 ? "01" : "02";
    const tail = String(index + 1).padStart(2, "0") + (index % 3 + 1);
    const terc = region + county + tail;
    return [terc, "01" + region + "000" + county + tail, name, "Powiat przykładowy " + county, [
      95 + index * 12, index % 9 / 2 - 3, 25 + index % 7, 1 + (index * 3 % 14) / 3,
      975 + index * 23, 5 + (index * 4 % 15) / 2, 9 + index * 11 % 13,
    ]];
  }),
};
