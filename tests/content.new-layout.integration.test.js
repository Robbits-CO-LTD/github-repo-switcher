import { describe, expect, it, vi } from "vitest";

async function waitFor(assertion, timeoutMs = 500) {
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

function loggedInRepositoryLayout() {
  const fragment = document.createDocumentFragment();
  const globalHeader = document.createElement("header");
  globalHeader.setAttribute("aria-label", "Global navigation menu");
  globalHeader.innerHTML = `
    <nav aria-label="Repository">
      <a href="/owner/current/issues">Issues</a>
      <a href="/owner/current/pulls">Pull requests</a>
      <a href="/owner/current/actions">Actions</a>
    </nav>
  `;

  const main = document.createElement("main");
  main.innerHTML = `
    <div id="repository-container-header"></div>
    <turbo-frame id="repo-content-turbo-frame"><div>Repository content</div></turbo-frame>
  `;

  fragment.append(globalHeader, main);
  return { fragment, main };
}

describe("GitHub logged-in repository layout", () => {
  it("mounts after the empty repository header anchor", async () => {
    history.replaceState({}, "", "/owner/current/issues");
    const { fragment, main } = loggedInRepositoryLayout();
    document.body.replaceChildren(fragment);

    globalThis.RepoSignalSeed = [
      { nwo: "owner/current", name: "current", owner: "owner", private: true, hasIssues: true }
    ];

    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({ ok: true }))
      },
      storage: {
        local: {
          async get(key) {
            return { [key]: undefined };
          },
          async set() {}
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

    expect(main.children[0].id).toBe("repository-container-header");
    expect(main.children[1]).toBe(host);
    expect(main.children[2].id).toBe("repo-content-turbo-frame");

    globalThis.__repoSignalContentControllerV1.destroy();
  });
});
