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
    <div data-repository-title>owner/current</div>
    <div id="responsive-meta-container"></div>
    <nav aria-label="Repository">
      <a href="/owner/current/issues">Issues</a>
      <a href="/owner/current/pulls">Pull requests</a>
      <a href="/owner/current/actions">Actions</a>
    </nav>
  `;
  return header;
}

describe("GitHub content integration", () => {
  it("mounts before Repository navigation and keeps every switch target on /issues", async () => {
    history.replaceState({}, "", "/owner/current/issues/42");
    document.body.replaceChildren(repositoryHeader());

    globalThis.RepoSignalSeed = [
      { nwo: "owner/current", name: "current", owner: "owner", private: true, hasIssues: true },
      { nwo: "owner/alpha", name: "alpha", owner: "owner", private: false, hasIssues: true },
      { nwo: "owner/beta", name: "beta", owner: "owner", private: false, hasIssues: true },
      { nwo: "owner/gamma", name: "gamma", owner: "owner", private: false, hasIssues: true },
      { nwo: "owner/disabled", name: "disabled", owner: "owner", private: false, hasIssues: false }
    ];

    const stored = {};
    const changeListeners = [];
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({ ok: true }))
      },
      storage: {
        local: {
          async get(key) {
            return { [key]: stored[key] };
          },
          async set(values) {
            await new Promise((resolve) => setTimeout(resolve, 15));
            for (const [key, value] of Object.entries(values)) {
              const oldValue = stored[key];
              stored[key] = value;
              for (const listener of changeListeners) {
                listener({ [key]: { oldValue, newValue: value } }, "local");
              }
            }
          }
        },
        onChanged: {
          addListener(listener) {
            changeListeners.push(listener);
          }
        }
      }
    };

    await import("../src/shared.js");
    await import("../src/styles.js");
    await import("../src/content.js");

    const host = await waitFor(() => {
      const candidate = document.querySelector("[data-repo-signal-host]");
      expect(candidate).not.toBeNull();
      return candidate;
    });
    const navigation = document.querySelector('nav[aria-label="Repository"]');

    expect(navigation.previousElementSibling).toBe(host);
    expect(document.querySelectorAll("[data-repo-signal-host]")).toHaveLength(1);

    const links = [...host.shadowRoot.querySelectorAll("a[href]")];
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.href)).toEqual([
      "https://github.com/owner/current/issues",
      "https://github.com/owner/alpha/issues",
      "https://github.com/owner/beta/issues",
      "https://github.com/owner/gamma/issues"
    ]);
    expect(host.shadowRoot.querySelector('[aria-current="location"]')?.href).toBe(
      "https://github.com/owner/current/issues"
    );
    const currentPath = host.shadowRoot.querySelector('.rail-link[aria-current="location"] .rail-path');
    expect(currentPath.querySelector(".rail-owner").textContent).toBe("owner");
    expect(currentPath.querySelector(".rail-name").textContent).toBe("current");

    const allButton = host.shadowRoot.querySelector('[aria-controls="repo-signal-repository-panel"]');
    allButton.click();
    const panel = host.shadowRoot.querySelector("#repo-signal-repository-panel");
    expect(panel.hidden).toBe(false);
    expect(host.shadowRoot.querySelector("input[type=search]")).not.toBeNull();
    expect(host.shadowRoot.querySelector('.repository-link[aria-disabled="true"]')).not.toBeNull();
    expect(host.shadowRoot.querySelector('.favorite-button:disabled')).not.toBeNull();

    host.shadowRoot.querySelector('[aria-label="拡張機能の設定を開く"]').click();
    await waitFor(() => {
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "repo-signal:open-options"
      });
    });
    allButton.click();

    const clickFavorite = (nwo) => {
      const button = host.shadowRoot.querySelector(
        `[aria-label="${nwo}をお気に入りから外す"]`
      );
      expect(button).not.toBeNull();
      button.focus();
      button.click();
      expect(host.shadowRoot.activeElement?.dataset.repositoryNwo).toBe(nwo);
    };

    clickFavorite("owner/alpha");
    clickFavorite("owner/beta");
    await new Promise((resolve) => setTimeout(resolve, 20));
    clickFavorite("owner/gamma");

    await waitFor(() => {
      expect(stored.repoSignalSettingsV1.excludedNwos).toEqual([
        "owner/alpha",
        "owner/beta",
        "owner/gamma"
      ]);
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hidden).toBe(true);

    const replacementHeader = repositoryHeader();
    document.querySelector("#repository-container-header").replaceWith(replacementHeader);

    await waitFor(() => {
      expect(replacementHeader.querySelector("[data-repo-signal-host]")).toBe(host);
      expect(document.querySelectorAll("[data-repo-signal-host]")).toHaveLength(1);
    });

    globalThis.__repoSignalContentControllerV1.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
