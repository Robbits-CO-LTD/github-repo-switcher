const { spawnSync } = require("node:child_process");
const path = require("node:path");

const scripts = {
  build: "build-store-package.ps1",
  verify: "verify-store-package.ps1"
};
const action = process.argv[2];
const scriptName = scripts[action];

if (!scriptName) {
  process.exitCode = 1;
} else {
  const isWindows = process.platform === "win32";
  const executable = isWindows ? "powershell.exe" : "pwsh";
  const argumentsList = [
    "-NoProfile",
    ...(isWindows ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    path.join(__dirname, scriptName),
    ...process.argv.slice(3)
  ];
  const result = spawnSync(executable, argumentsList, {
    stdio: "inherit",
    windowsHide: true
  });

  process.exitCode = result.error || result.signal || typeof result.status !== "number"
    ? 1
    : result.status;
}
