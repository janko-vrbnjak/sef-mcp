import { readFileSync } from "node:fs";

/**
 * Server version from the package.json next to dist/ (present in the npm package and in the .mcpb
 * bundle). Reported in `initialize` and by sef_check_setup, so the skills can tell users when their
 * extension is older than the skills expect — without any network call.
 */
export const SERVER_VERSION: string = (() => {
  try {
    return (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
})();
