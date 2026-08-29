import { createFoundryModuleConfig, simpleEditions } from "@dungeons-lab/vite-config";

export default createFoundryModuleConfig({ root: import.meta.url, editions: simpleEditions() });
