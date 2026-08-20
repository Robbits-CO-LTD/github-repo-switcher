import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await import("../src/shared.js");
});

describe("RepoSignal shared contract", () => {
  it("normalizes repository identifiers and rejects non-repository routes", () => {
    const { normalizeNwo } = globalThis.RepoSignal;

    expect(normalizeNwo(" https://github.com/Robbits-CO-LTD/example/ ")).toBe(
      "Robbits-CO-LTD/example"
    );
    expect(normalizeNwo("settings/profile")).toBeNull();
    expect(normalizeNwo("owner/repo/issues")).toBeNull();
    expect(normalizeNwo("owner only")).toBeNull();
  });

  it("builds a direct Issues URL", () => {
    const { buildIssuesUrl } = globalThis.RepoSignal;

    expect(buildIssuesUrl("Robbits-CO-LTD/example-repository")).toBe(
      "https://github.com/Robbits-CO-LTD/example-repository/issues"
    );
    expect(buildIssuesUrl("invalid")).toBeNull();
  });

  it("finds the repository while viewing its issue list or an individual issue", () => {
    const { parseCurrentRepository } = globalThis.RepoSignal;

    expect(parseCurrentRepository("/owner/repository/issues")).toBe("owner/repository");
    expect(parseCurrentRepository("/owner/repository/issues/42")).toBe("owner/repository");
    expect(parseCurrentRepository("/issues")).toBeNull();
  });

  it("deduplicates and sorts generated repositories", () => {
    const { getSeedRepositories } = globalThis.RepoSignal;
    const repositories = getSeedRepositories([
      { nwo: "z-owner/repo", private: true, hasIssues: true },
      { nwo: "A-owner/repo", archived: true, hasIssues: false },
      { nwo: "Z-owner/repo", private: false, hasIssues: true }
    ]);

    expect(repositories.map((repository) => repository.nwo)).toEqual([
      "A-owner/repo",
      "Z-owner/repo"
    ]);
    expect(repositories[1].private).toBe(false);
    expect(repositories[0].hasIssues).toBe(false);
  });

  it("treats every generated repository as a favorite until explicitly excluded", () => {
    const { isFavorite, withFavorite } = globalThis.RepoSignal;
    const initial = { excludedNwos: [] };
    const excluded = withFavorite(initial, "owner/repository", false);

    expect(isFavorite("owner/repository", initial)).toBe(true);
    expect(isFavorite("owner/repository", excluded)).toBe(false);
    expect(isFavorite("owner/repository", withFavorite(excluded, "OWNER/REPOSITORY", true))).toBe(
      true
    );
  });

  it("places the current favorite repository first in the rail", () => {
    const { getSeedRepositories, orderRepositoriesForRail } = globalThis.RepoSignal;
    const repositories = getSeedRepositories([
      { nwo: "owner/alpha" },
      { nwo: "owner/beta", hasIssues: false },
      { nwo: "owner/gamma" }
    ]);

    expect(
      orderRepositoriesForRail(repositories, { excludedNwos: ["owner/alpha"] }, "owner/gamma").map(
        (repository) => repository.nwo
      )
    ).toEqual(["owner/gamma"]);
  });

  it("round-trips local settings through a storage-compatible adapter", async () => {
    const { SETTINGS_KEY, loadSettings, saveSettings } = globalThis.RepoSignal;
    const state = {};
    const storage = {
      async get(key) {
        return { [key]: state[key] };
      },
      async set(values) {
        Object.assign(state, values);
      }
    };

    await saveSettings({ excludedNwos: ["owner/repository", "OWNER/REPOSITORY"] }, storage);
    const loaded = await loadSettings(storage);

    expect(state[SETTINGS_KEY].excludedNwos).toEqual(["owner/repository"]);
    expect(loaded.excludedNwos).toEqual(["owner/repository"]);
  });
});
