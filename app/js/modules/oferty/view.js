import { PROPERTY_TYPES, RADII, TOLERANCES } from "./client.js";

export const columns = [
  ["type", "Typ"], ["location", "Lokalizacja / adres"], ["source", "Źródło"],
  ["url", "Ogłoszenie"], ["price", "Cena"], ["area", "Powierzchnia"], ["priceM2", "Cena/m²"],
];

const header = columns.map(([key, title]) =>
  `<th scope="col" aria-sort="none"><button type="button" data-offerty-sort="${key}">${title}</button></th>`
).join("");
const selectedHeader = columns.map(([, title]) => `<th scope="col">${title}</th>`).join("");

export const offersView = `
  <section class="oferty-card" aria-labelledby="oferty-title">
    <h2 id="oferty-title">Wyszukiwanie ofert</h2>
    <p data-part="demo" class="oferty-notice" hidden>Dane przykładowe. Wyniki i adresy ogłoszeń służą do testowania interfejsu.</p>
    <form data-part="form" novalidate>
      <fieldset data-part="searchFields" class="oferty-fields">
        <div class="oferty-field oferty-location">
          <label for="oferty-location">Miejscowość</label>
          <input data-part="location" id="oferty-location" autocomplete="off" placeholder="np. Olsztyn"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="oferty-suggestions">
          <ul data-part="suggestions" id="oferty-suggestions" class="oferty-suggestions" role="listbox" aria-label="Miejscowości" hidden></ul>
          <p data-part="locationStatus" class="oferty-help" role="status">Wybierz podpowiedź TERYT lub wpisz pełną nazwę.</p>
        </div>
        <div class="oferty-field">
          <label for="oferty-type">Rodzaj nieruchomości</label>
          <select data-part="propertyType" id="oferty-type">${PROPERTY_TYPES.map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select>
        </div>
        <div class="oferty-field">
          <label for="oferty-radius">Promień</label>
          <select data-part="radius" id="oferty-radius">${RADII.map((km) => `<option value="${km}">${km} km</option>`).join("")}</select>
        </div>
        <div class="oferty-field">
          <label for="oferty-filter">Filtr powierzchni</label>
          <select data-part="mode" id="oferty-filter">
            <option value="none">Bez filtra powierzchni</option>
            <option value="percent" selected>Powierzchnia z tolerancją</option>
            <option value="range">Zakres powierzchni</option>
          </select>
        </div>
        <div data-part="percentFields" class="oferty-subfields">
          <div class="oferty-field">
            <label for="oferty-area">Powierzchnia (m²)</label>
            <input data-part="area" id="oferty-area" type="number" value="62" min="0.01" step="0.01">
          </div>
          <div class="oferty-field">
            <label for="oferty-tolerance">Tolerancja</label>
            <select data-part="tolerance" id="oferty-tolerance">${TOLERANCES.map((v) => `<option value="${v}"${v === 20 ? " selected" : ""}>±${v}%</option>`).join("")}</select>
          </div>
        </div>
        <div data-part="rangeFields" class="oferty-subfields" hidden>
          <div class="oferty-field">
            <label for="oferty-min">Od (m²)</label>
            <input data-part="min" id="oferty-min" type="number" min="0.01" step="0.01">
          </div>
          <div class="oferty-field">
            <label for="oferty-max">Do (m²)</label>
            <input data-part="max" id="oferty-max" type="number" min="0.01" step="0.01">
          </div>
        </div>
      </fieldset>
      <div class="oferty-actions">
        <button type="submit" data-part="submit" class="oferty-primary">Szukaj ofert</button>
        <button type="button" data-part="cancel" hidden>Anuluj oczekiwanie</button>
        <p data-part="status" role="status"></p>
      </div>
    </form>
  </section>
  <div class="oferty-results" data-part="results" hidden>
    <section class="oferty-card" aria-labelledby="oferty-results-title">
      <h2 id="oferty-results-title">Wynik wyszukiwania</h2>
      <p data-part="query"></p>
      <p data-part="sourceWarning" class="oferty-notice" role="status" hidden></p>
      <p data-part="scopeWarning" class="oferty-notice" role="status" hidden></p>
      <dl class="oferty-counts">
        <div><dt>Po filtrze powierzchni</dt><dd data-part="filtered"></dd></div>
        <div><dt>Usunięte duplikaty</dt><dd data-part="duplicates"></dd></div>
        <div><dt>Przyjęte do analizy</dt><dd data-part="accepted"></dd></div>
      </dl>
      <p data-part="rangeSummary"></p>
    </section>
    <details data-part="sourceDetails" class="oferty-card">
      <summary>Wyniki według źródła</summary>
      <ul data-part="sources" class="oferty-source-list"></ul>
    </details>
    <section class="oferty-card" aria-labelledby="oferty-table-title">
      <div class="oferty-heading"><h2 id="oferty-table-title">Oferty</h2><span data-part="offerCount"></span></div>
      <p data-part="empty" hidden></p>
      <div class="oferty-table-wrap" data-part="tableWrap" tabindex="0" role="region" aria-label="Tabela znalezionych ofert">
        <table>
          <thead><tr><th scope="col">Wybierz</th><th scope="col">Lp.</th>${header}</tr></thead>
          <tbody data-part="offers"></tbody>
        </table>
      </div>
    </section>
    <section class="oferty-card" aria-labelledby="oferty-selection-title">
      <div class="oferty-heading">
        <h2 id="oferty-selection-title">Wybrane oferty</h2>
        <button type="button" data-part="export" disabled>Eksport XLSX</button>
      </div>
      <p data-part="selectedCount" role="status">Zaznacz ofertę w tabeli, aby ją porównać.</p>
      <div class="oferty-table-wrap" data-part="selectedWrap" tabindex="0" role="region" aria-label="Tabela wybranych ofert" hidden>
        <table><thead><tr><th scope="col">Wybierz</th><th scope="col">Lp.</th>${selectedHeader}</tr></thead><tbody data-part="selected"></tbody></table>
      </div>
      <p data-part="exportStatus" role="status"></p>
      <div class="oferty-comparison">
        <div>
          <h3>Analizowana nieruchomość</h3>
          <div class="oferty-subfields">
            <div class="oferty-field"><label for="oferty-my-price">Cena (zł)</label><input id="oferty-my-price" data-part="myPrice" type="number" min="0.01" step="0.01"></div>
            <div class="oferty-field"><label for="oferty-my-area">Powierzchnia (m²)</label><input id="oferty-my-area" data-part="myArea" type="number" min="0.01" step="0.01"></div>
          </div>
        </div>
        <div>
          <h3>Porównanie cen za m²</h3>
          <dl class="oferty-comparison-stats" aria-live="polite">
            <dt>Średnia wybranych ofert</dt><dd data-part="mean"></dd>
            <dt>Cena analizowanej nieruchomości</dt><dd data-part="rate"></dd>
            <dt>Odchylenie od średniej</dt><dd data-part="difference"></dd>
          </dl>
        </div>
      </div>
    </section>
  </div>`;
