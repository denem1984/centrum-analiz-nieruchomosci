import { getDzialkiState,updateDzialkiState,SELECTION_COLORS } from "./state.js";

export function mountParcelAppearance(container,options={}) {
  const document=options.document??globalThis.document;
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const row=make("label","Kolor konturów działek"),outline=make("input");
  outline.type="color";outline.id="dzialki-outline-color";outline.value=getDzialkiState().appearance.outlineColor;row.htmlFor=outline.id;row.append(outline);container.append(row);
  const palette=make("div");palette.className="dzialki-selection-palette";palette.setAttribute("role","group");palette.setAttribute("aria-label","Kolor zaznaczenia");
  const buttons=[];
  function syncPalette(){for(const button of buttons)button.setAttribute("aria-pressed",String(button.dataset.selectionColor===getDzialkiState().appearance.selectionColor));}
  for(const [color,label]of SELECTION_COLORS){
    const button=make("button");button.type="button";button.dataset.selectionColor=color;button.setAttribute("aria-label",label);button.title=label;
    const swatch=make("span");swatch.style.backgroundColor=color;swatch.setAttribute("aria-hidden","true");button.append(swatch);palette.append(button);buttons.push(button);
    button.addEventListener("click",()=>{updateDzialkiState({appearance:{selectionColor:color}});syncPalette();options.onAppearance?.();});
  }
  syncPalette();container.append(make("p","Kolor zaznaczenia"),palette);
  outline.addEventListener("input",()=>{updateDzialkiState({appearance:{outlineColor:outline.value}});options.onAppearance?.();});
  const clear=make("button","Wyczyść zaznaczenie");clear.type="button";clear.id="dzialki-clear-selection";
  const status=make("p");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  clear.addEventListener("click",()=>{options.onClear?.();status.textContent="Zaznaczenie wyczyszczone.";});
  container.append(clear,status);
}
