import { buildIdentity } from "virtual:dungeons-lab/build-identity";

export function registerDevTools() {
  const dirty = buildIdentity.dirty ? ", dirty" : "";
  console.info(
    `[Dungeons Lab] ${buildIdentity.moduleId ?? "module"} v${buildIdentity.version} (${buildIdentity.sha}${dirty}) built ${buildIdentity.builtAt}`,
  );
}
