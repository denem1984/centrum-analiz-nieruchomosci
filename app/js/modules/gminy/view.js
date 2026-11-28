import { INDICATORS, PROFILES } from "./model.js";

export const gminyView = `
  <header class="gminy-heading">
    <div>
      <h2>Podobieństwo gmin</h2>
      <p>Znajdź gminy o zbliżonych wskaźnikach demograficznych i gospodarczych.</p>
    </div>
    <a data-part="previewLink" hidden></a>
  </header>
  <p class="gminy-demo" data-part="demo" hidden>Dane przykładowe. Nazwy i wartości służą do sprawdzenia rankingu i PDF.</p>
  <div class="gminy-layout">
    <section class="gminy-card" aria-labelledby="gminy-filters-title">
      <h3 id="gminy-filters-title">Parametry analizy</h3>
      <form data-part="form" novalidate>
        <fieldset class="gminy-filters" data-part="filters" disabled>
          <div class="gminy-search">
            <label for="gminy-target">Gmina docelowa</label>
            <input id="gminy-target" data-part="target" placeholder="np. Olsztyn, powiat lub TERC" autocomplete="off"
              role="combobox" aria-controls="gminy-suggestions" aria-expanded="false" aria-autocomplete="list">
            <ul id="gminy-suggestions" data-part="suggestions" role="listbox" aria-label="Gminy" hidden></ul>
            <p class="gminy-caption" data-part="targetHelp"></p>
          </div>
          <label for="gminy-scope">Zakres porównania</label>
          <select id="gminy-scope" data-part="scope">
            <option value="country">Cały kraj</option>
            <option value="voivodeship">Województwo gminy docelowej</option>
          </select>
          <label for="gminy-profile">Profil nieruchomości</label>
          <select id="gminy-profile" data-part="profile">
            ${Object.entries(PROFILES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
          <label class="gminy-check"><input type="checkbox" data-part="same"> Porównuj tylko gminy tego samego typu</label>
          <button class="gminy-primary" type="submit">Oblicz podobieństwo</button>
        </fieldset>
      </form>
      <p data-part="status" class="gminy-status" role="status">Wczytywanie danych…</p>
      <button type="button" data-part="retry" hidden>Ponów wczytywanie</button>
      <p data-part="dataYear" class="gminy-caption" hidden></p>
    </section>
    <div class="gminy-output">
      <section class="gminy-card" aria-labelledby="gminy-ranking-title">
        <div class="gminy-actions"><h3 id="gminy-ranking-title">Ranking podobieństwa</h3><p data-part="activeProfile" class="gminy-caption"></p></div>
        <dl class="gminy-stats" data-part="stats" hidden>
          <div><dt>Gmina docelowa</dt><dd data-part="targetName"></dd></div>
          <div><dt>Porównane gminy</dt><dd data-part="count"></dd></div>
          <div><dt>Typ w roku danych</dt><dd data-part="type"></dd></div>
        </dl>
        <p class="gminy-placeholder" data-part="empty">Wybierz gminę i uruchom analizę.</p>
        <div data-part="results" hidden>
          <div class="gminy-table" tabindex="0" role="region" aria-label="Ranking, 20 najlepszych gmin">
            <table>
              <thead><tr><th scope="col">Wybierz</th><th scope="col">Lp.</th><th scope="col">Gmina</th>
                <th scope="col">Typ</th><th scope="col">Podobieństwo</th></tr></thead>
              <tbody data-part="ranking"></tbody>
            </table>
          </div>
          <div class="gminy-actions gminy-rank-actions">
            <p data-part="selected" class="gminy-caption" role="status">Zaznacz gminy do porównania.</p>
            <div><button type="button" data-part="compare" disabled>Porównaj zaznaczone</button>
            <button type="button" data-part="export" disabled>Pobierz PDF</button></div>
          </div>
        </div>
        <p class="gminy-caption">Wynik 0–100% opisuje podobieństwo wskaźników GUS. Demografia stanowi 50% wyniku. Ranking obejmuje gminy z kompletem siedmiu wskaźników.</p>
      </section>
      <section class="gminy-card" aria-labelledby="gminy-detail-title" data-part="comparison" hidden>
        <h3 id="gminy-detail-title">Porównanie wybranych gmin</h3>
        <div class="gminy-details" data-part="details"></div>
        <p data-part="exportStatus" class="gminy-caption" role="status"></p>
      </section>
      <section class="gminy-card" aria-labelledby="gminy-indicators-title">
        <h3 id="gminy-indicators-title">Jak rozumieć wskaźniki?</h3>
        <div class="gminy-guide">${INDICATORS.map(({ id, title, description, market }) => `
          <details><summary>${title}</summary><p>${description}</p><p><strong>Znaczenie dla nieruchomości.</strong> ${market}</p>
            <a href="https://bdl.stat.gov.pl/api/v1/variables/${id}?format=json" target="_blank" rel="noopener noreferrer">Metadane GUS BDL</a></details>`).join("")}</div>
      </section>
    </div>
  </div>
`;
