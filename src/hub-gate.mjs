import { L } from "./i18n.mjs";

export const HUB_ID = "dungeons-lab-hub";

const HUB_URL = "https://www.patreon.com/c/Dungeons_LAB";

/**
 * module.json declares the Hub as a hard requirement, but a GM can strip that line by hand and
 * run without it. Everything this module writes lives on the Hub's shared settings surface, so
 * running headless does not degrade - it corrupts. One check, called before anything installs.
 */
export const hubActive = () => game.modules.get(HUB_ID)?.active === true;

/** Full-window notice, GM only: nobody else can act on it. */
export function showHubGate() {
  if (document.getElementById("pe-hub-gate")) return;

  const overlay = document.createElement("div");
  overlay.id = "pe-hub-gate";
  overlay.innerHTML = `
    <div class="pe-hub-gate__card" role="dialog" aria-labelledby="pe-hub-gate-title">
      <h2 id="pe-hub-gate-title">${L("HubGate.Title")}</h2>
      <p>${L("HubGate.Body")}</p>
      <p class="pe-hub-gate__note">${L("HubGate.Note")}</p>
      <div class="pe-hub-gate__actions">
        <button type="button" data-action="modules">${L("HubGate.Manage")}</button>
        <button type="button" class="pe-hub-gate__ghost" data-action="get">${L("HubGate.Get")}</button>
        <button type="button" class="pe-hub-gate__quiet" data-action="close">${L("HubGate.Close")}</button>
      </div>
    </div>`;

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };

  overlay.querySelector("[data-action='modules']").addEventListener("click", () => {
    close();
    new foundry.applications.sidebar.apps.ModuleManagement().render(true);
  });
  overlay.querySelector("[data-action='get']").addEventListener("click", () => {
    window.open(HUB_URL, "_blank", "noopener");
  });
  overlay.querySelector("[data-action='close']").addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  document.body.append(overlay);
}
