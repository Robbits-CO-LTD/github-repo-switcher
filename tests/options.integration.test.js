import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function waitFor(assertion, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

describe("Options page integration", () => {
  it("starts with every repository selected and saves explicit exclusions locally", async () => {
    const html = await readFile(resolve(process.cwd(), "src/options/options.html"), "utf8");
    document.documentElement.innerHTML = html
      .replace(/<!doctype html>/i, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "");

    globalThis.RepoSignalSeed = [
      { nwo: "owner/alpha", name: "alpha", owner: "owner", private: true, archived: false, hasIssues: true },
      { nwo: "owner/beta", name: "beta", owner: "owner", private: false, archived: false, hasIssues: true },
      { nwo: "owner/archive", name: "archive", owner: "owner", private: false, archived: true, hasIssues: false }
    ];

    const stored = {};
    let blockNextSave = false;
    let releaseBlockedSave;
    globalThis.chrome = {
      storage: {
        local: {
          async get(key) {
            return { [key]: stored[key] };
          },
          async set(values) {
            const snapshot = structuredClone(values);
            if (blockNextSave) {
              await new Promise((resolve) => {
                releaseBlockedSave = resolve;
              });
            }
            Object.assign(stored, snapshot);
          }
        }
      }
    };

    await import("../src/shared.js");
    await import("../src/options/options.js");

    await waitFor(() => {
      expect(document.querySelectorAll(".repository-checkbox")).toHaveLength(3);
    });
    const checkboxes = [...document.querySelectorAll(".repository-checkbox")];
    expect(checkboxes.filter((input) => input.checked)).toHaveLength(2);
    expect(checkboxes.filter((input) => input.disabled)).toHaveLength(1);
    expect(document.querySelector("#favorite-count").textContent).toBe("2");
    expect(document.querySelector("#save-status-text").textContent).toBe(
      "現在の設定は保存済みです"
    );

    const search = document.querySelector("#repository-search");
    search.value = "archive";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll(".repository-checkbox")).toHaveLength(1);
    expect(document.querySelector(".repository-badge-archived").textContent).toBe("アーカイブ");
    expect(document.querySelector(".repository-badge-issues-disabled").textContent).toBe("Issues無効");

    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#clear-all-button").click();
    expect(document.querySelector("#favorite-count").textContent).toBe("0");

    document
      .querySelector("#settings-form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(stored.repoSignalSettingsV1.excludedNwos).toEqual([
        "owner/alpha",
        "owner/archive",
        "owner/beta"
      ]);
      expect(document.querySelector("#save-status-text").textContent).toContain(
        "0件をお気に入りとして保存しました"
      );
    });

    document.querySelector("#select-all-button").click();
    blockNextSave = true;
    document
      .querySelector("#settings-form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(document.querySelector("#save-status-text").textContent).toBe("設定を保存しています");
      expect(typeof releaseBlockedSave).toBe("function");
    });

    const alphaCheckbox = [...document.querySelectorAll(".repository-checkbox")].find(
      (checkbox) => checkbox.dataset.nwo === "owner/alpha"
    );
    alphaCheckbox.checked = false;
    alphaCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    blockNextSave = false;
    releaseBlockedSave();

    await waitFor(() => {
      expect(stored.repoSignalSettingsV1.excludedNwos).toEqual(["owner/archive"]);
      expect(document.querySelector("#save-status-text").textContent).toContain("まだ保存されていません");
    });
  });
});
