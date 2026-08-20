import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectPath = process.cwd();
const manifest = JSON.parse(await readFile(resolve(projectPath, "manifest.json"), "utf8"));

describe("Manifest V3 contract", () => {
  it("requests only local storage access", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("loads the generated repository seed before the content script", () => {
    expect(manifest.content_scripts[0].matches).toEqual(["https://github.com/*/*"]);
    expect(manifest.content_scripts[0].js).toEqual([
      "src/repositories.generated.js",
      "src/shared.js",
      "src/styles.js",
      "src/content.js"
    ]);
  });

  it("references files that exist in the unpacked extension", async () => {
    const referencedFiles = [
      manifest.background.service_worker,
      ...manifest.content_scripts[0].js,
      manifest.options_ui.page,
      ...Object.values(manifest.icons)
    ];

    await expect(
      Promise.all(referencedFiles.map((path) => access(resolve(projectPath, path))))
    ).resolves.toBeDefined();
  });
});
