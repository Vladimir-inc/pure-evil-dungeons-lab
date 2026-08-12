import { L } from "../i18n.mjs";
import { isArmed, readCharacter } from "../core/control-table.mjs";
import { controlTable, faceValuesFor } from "../dice/store.mjs";
import PureEvilApp from "./pure-evil-app.mjs";

const CLASS = "pe-launcher";

/** Is anyone at this table currently being cheated? Drives the ember glow on the button. */
function anyArmed() {
  const table = controlTable();
  return Object.keys(table).some((actorId) => isArmed(readCharacter(table, actorId), faceValuesFor));
}

/**
 * The demon lives in #chat-controls, next to the message-mode and GM buttons. Foundry MOVES that
 * element between the notification area and the chat form rather than re-rendering it, so a
 * button appended once survives; the renderChatInput hook is only there to catch the first paint
 * and any popout.
 */
export function installLauncher(controls) {
  if (!game.user.isGM) return;
  const root = controls ?? document.querySelector("#chat-controls");
  if (!root || root.querySelector(`.${CLASS}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `ui-control icon fa-solid fa-face-angry-horns ${CLASS}`;
  button.dataset.tooltip = "";
  button.setAttribute("aria-label", L("Launcher.Tooltip"));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    PureEvilApp.open();
  });
  root.appendChild(button);
  refreshLauncher();
}

export function refreshLauncher() {
  if (!game.user?.isGM) return;
  const armed = anyArmed();
  for (const button of document.querySelectorAll(`.${CLASS}`)) button.classList.toggle("pe-armed", armed);
}
