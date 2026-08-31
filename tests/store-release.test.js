import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const projectPath = process.cwd();
const safeSeed = "globalThis.RepoSignalSeed = Object.freeze([]);\n";
const packageSources = [
  "manifest.json",
  "icons/repo-signal-16.png",
  "icons/repo-signal-32.png",
  "icons/repo-signal-48.png",
  "icons/repo-signal-128.png",
  "src/background.js",
  "src/shared.js",
  "src/styles.js",
  "src/content.js",
  "src/options/options.html",
  "src/options/options.css",
  "src/options/options.js"
];

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  typeBuffer.copy(header, 4);

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([header, data, checksum]);
}

function makePng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const rowLength = width * 4 + 1;
  const pixels = Buffer.alloc(rowLength * height);
  for (let row = 0; row < height; row += 1) {
    pixels[row * rowLength] = 0;
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

async function copyPackageSources(destinationRoot) {
  await Promise.all(
    packageSources.map(async (source) => {
      const destination = join(destinationRoot, source);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(projectPath, source), destination);
    })
  );
}

async function createStoreAssets(destinationRoot) {
  const assetsPath = join(destinationRoot, "store", "assets");
  await mkdir(assetsPath, { recursive: true });
  await Promise.all([
    writeFile(join(assetsPath, "screenshot-01-1280x800-clean.png"), makePng(1280, 800)),
    writeFile(join(assetsPath, "promo-small.png"), makePng(440, 280))
  ]);
}

function runStoreScript(action, argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [resolve(projectPath, "scripts", "run-store-script.cjs"), action, ...argumentsList],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

describe("Chrome Web Store release package", () => {
  it("documents the required privacy and listing disclosures", async () => {
    const [privacy, listing] = await Promise.all([
      readFile(resolve(projectPath, "PRIVACY.md"), "utf8"),
      readFile(resolve(projectPath, "store", "listing-ja.md"), "utf8")
    ]);

    expect(privacy).toContain("2026-08-31");
    expect(privacy).toContain("chrome.storage.local");
    expect(privacy).toContain("sessionStorage");
    expect(privacy).toContain("10秒");
    expect(privacy).toContain("GitHub API");
    expect(privacy).toContain("Chrome Web Store User Data Policy");
    expect(privacy).toContain("Limited Use");
    expect(privacy).toContain("保存期間と削除");
    expect(privacy).toContain("https://robbits.co.jp/privacy/");

    expect(listing).toContain("単一の目的");
    expect(listing).toContain("chrome.storage.local");
    expect(listing).toContain("sessionStorage");
    expect(listing).toContain("外部送信");
    expect(listing).toContain("Chrome Web Store User Data Policy");
    expect(listing).toContain("Limited Use");
    expect(listing).toContain("`storage` 権限の理由");
    expect(listing).toContain("`https://github.com/*/*` へのアクセス理由");
    expect(listing).toContain("審査担当者向けの確認手順");
    expect(listing).toContain("拡張機能をアンインストール");
    expect(listing).toContain("https://github.com/Robbits-CO-LTD/github-repo-switcher/blob/main/PRIVACY.md");
    expect(listing).toContain("https://robbits.co.jp/privacy/");
  });

  it("builds and verifies an isolated package without copying a private seed", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "repo-signal-store-release-"));
    const packagePath = join(temporaryRoot, "repo-signal-0.1.0.zip");
    const sensitiveSeed = "SENSITIVE-SEED-SENTINEL/owner-private";

    try {
      await copyPackageSources(temporaryRoot);
      await createStoreAssets(temporaryRoot);
      await writeFile(
        join(temporaryRoot, "src", "repositories.generated.js"),
        `${sensitiveSeed}\n`,
        "utf8"
      );

      const build = await runStoreScript(
        "build",
        ["-ProjectRoot", temporaryRoot, "-OutputPath", packagePath]
      );
      expect(build.code).toBe(0);
      await expect(access(packagePath)).resolves.toBeUndefined();
      expect(basename(packagePath)).toBe("repo-signal-0.1.0.zip");

      const verify = await runStoreScript(
        "verify",
        ["-ProjectRoot", temporaryRoot, "-PackagePath", packagePath]
      );
      expect(verify.code).toBe(0);
      expect(verify.stdout).toContain("PASS");
      expect(`${build.stdout}${build.stderr}${verify.stdout}${verify.stderr}`).not.toContain(sensitiveSeed);

      const sourceContentPath = join(temporaryRoot, "src", "content.js");
      const sourceManifestPath = join(temporaryRoot, "manifest.json");
      const originalContent = await readFile(sourceContentPath);
      const originalManifest = await readFile(sourceManifestPath);
      const secretPackageRoot = join(temporaryRoot, "secret-package-test");
      const secretPackagePath = join(secretPackageRoot, "repo-signal-0.1.0.zip");
      try {
        await mkdir(secretPackageRoot);
        await writeFile(
          sourceContentPath,
          Buffer.concat([
            originalContent,
            Buffer.from('\nconst testOnlyCredential = { "password": "not-a-real-secret" };\n', "utf8")
          ])
        );
        const secretBuild = await runStoreScript(
          "build",
          ["-ProjectRoot", temporaryRoot, "-OutputPath", secretPackagePath]
        );
        expect(secretBuild.code).toBe(0);
        const secretVerify = await runStoreScript(
          "verify",
          ["-ProjectRoot", temporaryRoot, "-PackagePath", secretPackagePath]
        );
        expect(secretVerify.code).not.toBe(0);
        expect(secretVerify.stderr).toContain("prohibited secret marker");
        expect(secretVerify.stderr).not.toContain("not-a-real-secret");
      } finally {
        await writeFile(sourceContentPath, originalContent);
        await rm(secretPackageRoot, { force: true, recursive: true });
      }

      const packageBeforeReplacementFailures = await readFile(packagePath);
      try {
        await writeFile(
          sourceContentPath,
          Buffer.concat([originalContent, Buffer.from("\n// replacement-failure-test\n", "utf8")])
        );
        const recoveredReplacement = await runStoreScript(
          "build",
          [
            "-ProjectRoot", temporaryRoot,
            "-OutputPath", packagePath,
            "-FailureInjection", "AfterReplace"
          ]
        );
        expect(recoveredReplacement.code).not.toBe(0);
        expect(await readFile(packagePath)).toEqual(packageBeforeReplacementFailures);

        const retainedBackupResult = await runStoreScript(
          "build",
          [
            "-ProjectRoot", temporaryRoot,
            "-OutputPath", packagePath,
            "-FailureInjection", "OutputChangedBeforeRecovery"
          ]
        );
        expect(retainedBackupResult.code).not.toBe(0);
        expect(retainedBackupResult.stderr).toContain("backup retained");
        const retainedBackups = (await readdir(temporaryRoot))
          .filter((name) => name.startsWith(".repo-signal-store-") && name.endsWith(".bak"));
        expect(retainedBackups).toHaveLength(1);
        const retainedBackupPath = join(temporaryRoot, retainedBackups[0]);
        expect(await readFile(retainedBackupPath)).toEqual(packageBeforeReplacementFailures);
        expect(await readFile(packagePath, "utf8")).toBe("simulated-concurrent-output");
        await copyFile(retainedBackupPath, packagePath);
        await rm(retainedBackupPath);
      } finally {
        await writeFile(sourceContentPath, originalContent);
      }

      const promoPath = join(temporaryRoot, "store", "assets", "promo-small.png");
      const originalPromo = await readFile(promoPath);
      try {
        await writeFile(promoPath, originalPromo.subarray(0, 24));
        const truncatedPromo = await runStoreScript(
          "verify",
          ["-ProjectRoot", temporaryRoot, "-PackagePath", packagePath]
        );
        expect(truncatedPromo.code).not.toBe(0);
        expect(truncatedPromo.stderr).toContain("promo-small.png");

        const corruptedPromo = Buffer.from(originalPromo);
        const idatTypeOffset = corruptedPromo.indexOf(Buffer.from("IDAT", "ascii"));
        expect(idatTypeOffset).toBeGreaterThan(0);
        corruptedPromo[idatTypeOffset + 4] ^= 1;
        await writeFile(promoPath, corruptedPromo);
        const corruptedPromoResult = await runStoreScript(
          "verify",
          ["-ProjectRoot", temporaryRoot, "-PackagePath", packagePath]
        );
        expect(corruptedPromoResult.code).not.toBe(0);
        expect(corruptedPromoResult.stderr).toContain("Invalid PNG checksum");

        await writeFile(promoPath, makePng(441, 280));
        const invalidDimensions = await runStoreScript(
          "verify",
          ["-ProjectRoot", temporaryRoot, "-PackagePath", packagePath]
        );
        expect(invalidDimensions.code).not.toBe(0);
        expect(invalidDimensions.stderr).toContain("Invalid PNG dimensions");
      } finally {
        await writeFile(promoPath, originalPromo);
      }

      try {
        const contentMarker = "SOURCE-CONTENT-MISMATCH";
        await writeFile(
          sourceContentPath,
          Buffer.concat([originalContent, Buffer.from(`\n// ${contentMarker}\n`, "utf8")])
        );
        const mismatchedContent = await runStoreScript(
          "verify",
          ["-ProjectRoot", temporaryRoot, "-PackagePath", packagePath]
        );
        expect(mismatchedContent.code).not.toBe(0);
        expect(mismatchedContent.stderr).toContain("src/content.js");
        expect(`${mismatchedContent.stdout}${mismatchedContent.stderr}`).not.toContain(contentMarker);

        await writeFile(sourceContentPath, originalContent);
        const sourceManifest = JSON.parse(originalManifest.toString("utf8"));
        const manifestMarker = "Unexpected Extension";
        await writeFile(
          sourceManifestPath,
          `${JSON.stringify({ ...sourceManifest, name: manifestMarker }, null, 2)}\n`,
          "utf8"
        );
        const mismatchedName = await runStoreScript(
          "verify",
          ["-ProjectRoot", temporaryRoot, "-PackagePath", packagePath]
        );
        expect(mismatchedName.code).not.toBe(0);
        expect(mismatchedName.stderr).toContain("manifest.json");
        expect(`${mismatchedName.stdout}${mismatchedName.stderr}`).not.toContain(manifestMarker);

        await writeFile(sourceManifestPath, originalManifest);
        const packageBeforeFailedBuild = await readFile(packagePath);
        await rm(sourceContentPath);
        const failedBuild = await runStoreScript(
          "build",
          ["-ProjectRoot", temporaryRoot, "-OutputPath", packagePath]
        );
        expect(failedBuild.code).not.toBe(0);
        expect(await readFile(packagePath)).toEqual(packageBeforeFailedBuild);
      } finally {
        await writeFile(sourceContentPath, originalContent);
        await writeFile(sourceManifestPath, originalManifest);
      }

      const packagedSeed = await readFile(join(temporaryRoot, "src", "repositories.generated.js"), "utf8");
      expect(packagedSeed).not.toBe(safeSeed);
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  }, 15_000);
});
