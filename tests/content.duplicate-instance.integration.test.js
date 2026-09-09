import { describe, expect, it, vi } from "vitest";

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

function repositoryHeader() {
  const header = document.createElement("div");
  header.id = "repository-container-header";
  header.innerHTML = `
    <nav aria-label="Repository">
      <a href="/owner/current/issues">Issues</a>
      <a href="/owner/current/pulls">Pull requests</a>
      <a href="/owner/current/actions">Actions</a>
    </nav>
  `;
  return header;
}

function fakeChrome({ id, fromStore }) {
  const stored = {};
  return {
    runtime: {
      id,
      getManifest: () => (fromStore
        ? { update_url: "https://clients2.google.com/service/update2/crx" }
        : {}),
      sendMessage: vi.fn(async () => ({ ok: true }))
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: stored[key] };
        },
        async set(values) {
          Object.assign(stored, values);
        }
      },
      onChanged: {
        addListener() {}
      }
    }
  };
}

async function countHostChurn(durationMs) {
  let added = 0;
  let removed = 0;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && node.hasAttribute("data-repo-signal-host")) {
          added += 1;
        }
      }
      for (const node of mutation.removedNodes) {
        if (node.nodeType === 1 && node.hasAttribute("data-repo-signal-host")) {
          removed += 1;
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  observer.disconnect();
  return { added, removed };
}

// Each Chrome extension runs its content scripts in its own isolated world, so two
// installs never share the globalThis guard. The tests emulate a second world by
// clearing the guard and importing the script again under a different module URL.
async function startInstance(chrome, importContentScript) {
  delete globalThis.__repoSignalContentControllerV1;
  globalThis.chrome = chrome;
  await importContentScript();
  return globalThis.__repoSignalContentControllerV1;
}

function mountPage() {
  history.replaceState({}, "", "/owner/current/issues");
  document.body.replaceChildren(repositoryHeader());
  globalThis.RepoSignalSeed = [
    { nwo: "owner/current", name: "current", owner: "owner", private: false, hasIssues: true },
    { nwo: "owner/alpha", name: "alpha", owner: "owner", private: false, hasIssues: true }
  ];
}

describe("two Repo Signal installs on the same page", () => {
  it("lets the unpacked build own the page and keeps the store build out without churn", async () => {
    mountPage();
    await import("../src/shared.js");
    await import("../src/styles.js");

    const storeBuild = await startInstance(
      fakeChrome({ id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", fromStore: true }),
      () => import("../src/content.js")
    );
    await waitFor(() => {
      expect(document.querySelectorAll("[data-repo-signal-host]")).toHaveLength(1);
    });

    const unpackedBuild = await startInstance(
      fakeChrome({ id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", fromStore: false }),
      () => import("../src/content.js?instance=unpacked")
    );
    expect(unpackedBuild).not.toBe(storeBuild);

    await waitFor(() => {
      const hosts = document.querySelectorAll("[data-repo-signal-host]");
      expect(hosts).toHaveLength(1);
      expect(hosts[0].getAttribute("data-repo-signal-owner")).toBe(
        "0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      );
    });
    expect(await countHostChurn(300)).toEqual({ added: 0, removed: 0 });

    const host = document.querySelector("[data-repo-signal-host]");
    const navigation = document.querySelector('nav[aria-label="Repository"]');
    expect(navigation.previousElementSibling).toBe(host);
    expect(host.shadowRoot.querySelectorAll(".rail-link")).toHaveLength(2);

    // Trigger the losing instance again: it must stay out instead of re-inserting.
    storeBuild.refresh();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelectorAll("[data-repo-signal-host]")).toHaveLength(1);
    expect(document.querySelector("[data-repo-signal-host]")).toBe(host);

    storeBuild.destroy();
    unpackedBuild.destroy();
  });

  it("still replaces a rail left behind by an older build that carries no owner key", async () => {
    mountPage();
    await import("../src/shared.js");
    await import("../src/styles.js");

    const legacyHost = document.createElement("div");
    legacyHost.setAttribute("data-repo-signal-host", "");
    legacyHost.setAttribute("data-repo-signal-version", "1");
    document.body.prepend(legacyHost);

    const currentBuild = await startInstance(
      fakeChrome({ id: "cccccccccccccccccccccccccccccccc", fromStore: true }),
      () => import("../src/content.js?instance=current")
    );

    await waitFor(() => {
      const hosts = document.querySelectorAll("[data-repo-signal-host]");
      expect(hosts).toHaveLength(1);
      expect(hosts[0]).not.toBe(legacyHost);
      expect(hosts[0].getAttribute("data-repo-signal-owner")).toBe(
        "1:cccccccccccccccccccccccccccccccc"
      );
    });
    expect(legacyHost.isConnected).toBe(false);

    currentBuild.destroy();
  });
});
