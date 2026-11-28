export const similarView = `
  <header class="similar-header">
    <div><h2>Nieruchomości podobne</h2><p>Porównaj położenie nieruchomości i odległości w linii prostej.</p></div>
    <a data-part="previewLink" hidden></a>
  </header>
  <div class="similar-demo" data-part="demo" hidden>
    <span>Dane i podkład przykładowe</span>
    <button type="button" data-part="example">Wczytaj przykład</button>
  </div>
  <div class="similar-layout">
    <aside class="similar-panel" aria-label="Lista nieruchomości" tabindex="0" data-part="panel">
      <div data-part="subject"></div>
      <section aria-labelledby="similar-properties">
        <div class="similar-section-heading"><h3 id="similar-properties">Nieruchomości porównawcze</h3>
          <button type="button" data-part="add">Dodaj nieruchomość</button></div>
        <div data-part="comparisons"></div>
      </section>
    </aside>
    <section class="similar-map-card" aria-label="Mapa nieruchomości">
      <div class="similar-toolbar">
        <div class="similar-basemaps" role="group" aria-label="Podkład mapy">
          <button type="button" data-part="street" aria-pressed="true">Mapa</button>
          <button type="button" data-part="satellite" aria-pressed="false">Satelita</button>
        </div>
        <button type="button" data-part="fit" disabled>Pokaż wszystkie</button>
      </div>
      <div class="similar-map" data-part="map" role="region" aria-label="Położenie nieruchomości"></div>
      <p class="similar-map-message" data-part="mapStatus" role="status">Ładowanie mapy…</p>
      <fieldset class="similar-display">
        <legend>Na mapie</legend>
        <label><input type="checkbox" data-part="lines"> Linie i odległości</label>
        <label><input type="checkbox" data-part="labels"> Adres lub działka</label>
        <label><input type="checkbox" data-part="price"> Cena</label>
        <label><input type="checkbox" data-part="date"> Data transakcji</label>
      </fieldset>
      <p class="similar-data-credit" data-part="credit">Lokalizacja adresów i działek: GUGiK (UUG, ULDK)</p>
    </section>
  </div>
`;

export function propertyView(key, isSubject) {
  const id = "similar-" + key;
  return `
    <div class="similar-item-head">
      <h3 data-field="title">${isSubject ? "Nieruchomość analizowana" : "Nieruchomość porównawcza"}</h3>
      ${isSubject ? "" : '<button type="button" data-field="remove" class="similar-remove">Usuń</button>'}
    </div>
    <form data-field="form" novalidate>
      <label for="${id}-type">Lokalizacja</label>
      <select id="${id}-type" data-field="type"><option value="address">Adres</option><option value="parcel">Działka</option></select>
      <div data-field="addressFields" class="similar-fields">
        <label for="${id}-address">Adres</label>
        <input id="${id}-address" data-field="address" placeholder="Miejscowość, ulica i numer" autocomplete="off">
      </div>
      <div data-field="parcelFields" class="similar-fields" hidden>
        <label for="${id}-county">Powiat</label><select id="${id}-county" data-field="county"></select>
        <label for="${id}-commune">Gmina</label><select id="${id}-commune" data-field="commune" disabled></select>
        <label for="${id}-region">Obręb</label><select id="${id}-region" data-field="region" disabled></select>
        <label for="${id}-number">Numer działki</label><input id="${id}-number" data-field="number" placeholder="np. 12/3">
      </div>
      ${isSubject ? "" : `
        <div class="similar-metadata">
          <div><label for="${id}-price">Cena (zł)</label><input id="${id}-price" data-field="price" inputmode="decimal"></div>
          <div><label for="${id}-date">Data transakcji</label><input id="${id}-date" data-field="date" type="date"></div>
        </div>
        <p class="similar-distance" data-field="distance">Odległość: —</p>`}
      <div class="similar-locate">
        <button type="submit" data-field="locate">Lokalizuj</button>
        <button type="button" data-field="retry" hidden>Ponów pobieranie listy</button>
      </div>
      <p data-field="status" class="similar-status" role="status"></p>
      <ul data-field="candidates" class="similar-candidates" hidden></ul>
    </form>`;
}
