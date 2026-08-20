(() => {
  "use strict";

  const SETTINGS_KEY = "repoSignalSettingsV1";
  const NWO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const RESERVED_OWNERS = new Set([
    "about",
    "account",
    "apps",
    "collections",
    "contact",
    "customer-stories",
    "enterprise",
    "events",
    "explore",
    "features",
    "issues",
    "login",
    "marketplace",
    "new",
    "notifications",
    "organizations",
    "orgs",
    "pricing",
    "pulls",
    "search",
    "security",
    "settings",
    "signup",
    "site",
    "sponsors",
    "topics",
    "trending"
  ]);

  function normalizeNwo(value) {
    if (typeof value !== "string") {
      return null;
    }

    const candidate = value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/^\/+|\/+$/g, "");
    if (!NWO_PATTERN.test(candidate)) {
      return null;
    }

    const [owner] = candidate.split("/");
    if (RESERVED_OWNERS.has(owner.toLowerCase())) {
      return null;
    }

    return candidate;
  }

  function normalizeRepository(value) {
    const nwo = normalizeNwo(value?.nwo);
    if (!nwo) {
      return null;
    }

    const [owner, name] = nwo.split("/");
    return Object.freeze({
      nwo,
      owner,
      name,
      private: Boolean(value?.private),
      archived: Boolean(value?.archived),
      hasIssues: value?.hasIssues !== false
    });
  }

  function uniqueNwos(values) {
    const seen = new Set();
    const result = [];

    for (const value of Array.isArray(values) ? values : []) {
      const nwo = normalizeNwo(value);
      if (!nwo) {
        continue;
      }

      const key = nwo.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(nwo);
      }
    }

    return result;
  }

  function getSeedRepositories(seed = globalThis.RepoSignalSeed) {
    const byNwo = new Map();

    for (const value of Array.isArray(seed) ? seed : []) {
      const repository = normalizeRepository(value);
      if (repository) {
        byNwo.set(repository.nwo.toLowerCase(), repository);
      }
    }

    return [...byNwo.values()].sort((left, right) =>
      left.nwo.localeCompare(right.nwo, undefined, { sensitivity: "base" })
    );
  }

  function sanitizeSettings(value) {
    return Object.freeze({
      excludedNwos: Object.freeze(uniqueNwos(value?.excludedNwos))
    });
  }

  async function loadSettings(storageArea = globalThis.chrome?.storage?.local) {
    if (!storageArea?.get) {
      return sanitizeSettings();
    }

    const stored = await storageArea.get(SETTINGS_KEY);
    return sanitizeSettings(stored?.[SETTINGS_KEY]);
  }

  async function saveSettings(settings, storageArea = globalThis.chrome?.storage?.local) {
    if (!storageArea?.set) {
      throw new Error("設定を保存できませんでした。Chromeの拡張機能として開いてください。");
    }

    const sanitized = sanitizeSettings(settings);
    await storageArea.set({ [SETTINGS_KEY]: sanitized });
    return sanitized;
  }

  function isFavorite(nwo, settings) {
    const normalized = normalizeNwo(nwo);
    if (!normalized) {
      return false;
    }

    const excluded = new Set(sanitizeSettings(settings).excludedNwos.map((value) => value.toLowerCase()));
    return !excluded.has(normalized.toLowerCase());
  }

  function withFavorite(settings, nwo, favorite) {
    const normalized = normalizeNwo(nwo);
    if (!normalized) {
      return sanitizeSettings(settings);
    }

    const excluded = new Map(
      sanitizeSettings(settings).excludedNwos.map((value) => [value.toLowerCase(), value])
    );

    if (favorite) {
      excluded.delete(normalized.toLowerCase());
    } else {
      excluded.set(normalized.toLowerCase(), normalized);
    }

    return sanitizeSettings({ excludedNwos: [...excluded.values()] });
  }

  function parseCurrentRepository(pathname = globalThis.location?.pathname) {
    if (typeof pathname !== "string") {
      return null;
    }

    const segments = pathname.split("/").filter(Boolean).slice(0, 2);
    return segments.length === 2 ? normalizeNwo(segments.join("/")) : null;
  }

  function buildIssuesUrl(nwo) {
    const normalized = normalizeNwo(nwo);
    return normalized ? `https://github.com/${normalized}/issues` : null;
  }

  function orderRepositoriesForRail(repositories, settings, currentNwo) {
    const normalizedCurrent = normalizeNwo(currentNwo)?.toLowerCase();
    const favoriteRepositories = repositories.filter(
      (repository) => repository.hasIssues && isFavorite(repository.nwo, settings)
    );

    return favoriteRepositories.sort((left, right) => {
      const leftCurrent = left.nwo.toLowerCase() === normalizedCurrent;
      const rightCurrent = right.nwo.toLowerCase() === normalizedCurrent;
      if (leftCurrent !== rightCurrent) {
        return leftCurrent ? -1 : 1;
      }

      return left.nwo.localeCompare(right.nwo, undefined, { sensitivity: "base" });
    });
  }

  globalThis.RepoSignal = Object.freeze({
    SETTINGS_KEY,
    buildIssuesUrl,
    getSeedRepositories,
    isFavorite,
    loadSettings,
    normalizeNwo,
    normalizeRepository,
    orderRepositoriesForRail,
    parseCurrentRepository,
    sanitizeSettings,
    saveSettings,
    uniqueNwos,
    withFavorite
  });
})();
