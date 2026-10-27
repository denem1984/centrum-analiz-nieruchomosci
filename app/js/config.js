export const BACKENDS = Object.freeze({
  RCN: Object.freeze({
    id: "RCN",
    label: "RCN",
    baseUrl: "https://rcn-web-app.onrender.com",
    healthPath: "/",
  }),
  Oferty: Object.freeze({
    id: "Oferty",
    label: "Oferty",
    baseUrl: "https://analizator-cen-ofertowych.onrender.com",
    healthPath: "/health",
  }),
  Dzialki: Object.freeze({
    id: "Dzialki",
    label: "Działki",
    baseUrl: "https://analizator-nieruchomosci.onrender.com",
    healthPath: "/health",
  }),
  Podobne: Object.freeze({
    id: "Podobne",
    label: "Podobne",
    baseUrl: "https://rozklad-nieruchomosci-podobnych2.onrender.com",
    healthPath: "/api/health",
  }),
});

export const BACKEND_IDS = Object.freeze(Object.keys(BACKENDS));
