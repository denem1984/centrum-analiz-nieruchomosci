const POLISH_LETTERS = Object.freeze({
  "ą": "a",
  "ć": "c",
  "ę": "e",
  "ł": "l",
  "ń": "n",
  "ó": "o",
  "ś": "s",
  "ź": "z",
  "ż": "z",
});

export function normalizeQuery(query) {
  if (typeof query !== "string") return "";
  return query
    .toLocaleLowerCase("pl")
    .replace(/[ąćęłńóśźż]/g, (letter) => POLISH_LETTERS[letter])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

