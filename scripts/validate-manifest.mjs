import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const requiredScripts = [
  "src/repositories.generated.js",
  "src/shared.js",
  "src/styles.js",
  "src/content.js"
];

if (manifest.manifest_version !== 3) {
  throw new Error("manifest_version must be 3");
}

if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage"])) {
  throw new Error("Only the storage permission is allowed");
}

if (manifest.host_permissions) {
  throw new Error("host_permissions must not be declared");
}

const scripts = manifest.content_scripts?.[0]?.js;
if (JSON.stringify(scripts) !== JSON.stringify(requiredScripts)) {
  throw new Error("Content script order is invalid");
}

console.log("Manifest validation passed.");

