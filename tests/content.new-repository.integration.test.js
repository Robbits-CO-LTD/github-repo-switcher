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

function repositoryHeader(nwo) {
  const header = document.createElement("div");
  header.id = "repository-container-header";
  header.innerHTML = `
    <nav aria-label="Repository">
      <a href="/${nwo}/issues">Issues</a>
      <a href="/${nwo}/pulls">Pull requests</a>
      <a href="/${nwo}/actions">Actions</a>
    </nav>
  `;
  return header;
}

describe("new repository discovery", () => {
  it("includes the current repository when it is newer than the generated seed", async () => {
    history.replaceState({}, "", "/owner/new-repository/issues");
    document.body.replaceChildren(repositoryHeader("owner/new-repository"));

    globalThis.RepoSignalSeed = [
      { nwo: "owner/old-repository", private: false, hasIssues: true }
    ];

    const stored = {};
    globalThis.chrome = {
      runtime: {
        async sendMessage() {
          return { ok: true };
        }
      },
      storage: {
        local: {
          async get(key) {
            return { [key]: stored[key] };
          },
          async set(values) {
            Object.assign(stored, structuredClone(values));
          }
        },
        onChanged: {
          addListener() {}
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

    host.shadowRoot.querySelector('[aria-controls="repo-signal-repository-panel"]').click();
    const search = host.shadowRoot.querySelector("input[type=search]");
    search.value = "new-repository";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    expect(host.shadowRoot.querySelector(".repository-card")?.textContent).toContain(
      "new-repository"
    );
    expect(host.shadowRoot.querySelector(".result-count").textContent).toBe("1 / 2 件");
    await waitFor(() => {
      expect(stored.repoSignalDiscoveredRepositoriesV1).toEqual([
        {
          nwo: "owner/new-repository",
          owner: "owner",
          name: "new-repository",
          private: false,
          archived: false,
          hasIssues: true
        }
      ]);
    });

    globalThis.__repoSignalContentControllerV1.destroy();
  });
});
