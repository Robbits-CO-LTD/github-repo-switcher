import { describe, expect, it, vi } from "vitest";
import { installLocationProbe } from "./helpers/location-probe.js";

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

const CONTENT_IMPORTERS = {
  a: () => import("../src/content.js?router-intercept=a"),
  b: () => import("../src/content.js?router-intercept=b")
};

async function mountExtension(key) {
  history.replaceState({}, "", "/owner/current/issues");
  document.body.replaceChildren(repositoryHeader());
  globalThis.RepoSignalSeed = [
    { nwo: "owner/current", name: "current", owner: "owner", private: false, hasIssues: true },
    { nwo: "owner/alpha", name: "alpha", owner: "owner", private: false, hasIssues: true }
  ];
  globalThis.chrome = {
    runtime: { id: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", getManifest: () => ({}), sendMessage: vi.fn(async () => ({ ok: true })) },
    storage: {
      local: { async get(k) { return { [k]: undefined }; }, async set() {} },
      onChanged: { addListener() {} }
    }
  };
  delete globalThis.__repoSignalContentControllerV1;
  await import("../src/shared.js");
  await import("../src/styles.js");
  await CONTENT_IMPORTERS[key]();
  return await waitFor(() => {
    const host = document.querySelector("[data-repo-signal-host]");
    expect(host).not.toBeNull();
    expect(host.shadowRoot.querySelectorAll(".rail-link").length).toBeGreaterThanOrEqual(2);
    return host;
  });
}

function primaryClick(extra = {}) {
  return new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, button: 0, detail: 1, ...extra });
}

describe("rail links survive GitHub's client-side router", () => {
  it("navigates even when a document-level handler intercepts the click", async () => {
    const host = await mountExtension("a");
    const probe = installLocationProbe();
    let interceptorSaw = 0;
    const interceptor = (event) => { interceptorSaw += 1; event.preventDefault(); };
    document.addEventListener("click", interceptor);
    globalThis.addEventListener("click", interceptor);
    try {
      const railLink = [...host.shadowRoot.querySelectorAll(".rail-link")]
        .find((a) => a.getAttribute("aria-current") !== "location");
      expect(railLink.href).toBe("https://github.com/owner/alpha/issues");

      const event = primaryClick();
      railLink.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(probe.assign).toHaveBeenCalledWith("https://github.com/owner/alpha/issues");
      expect(interceptorSaw).toBe(0);
    } finally {
      document.removeEventListener("click", interceptor);
      globalThis.removeEventListener("click", interceptor);
      probe.restore();
      globalThis.__repoSignalContentControllerV1.destroy();
    }
  });

  it("leaves modified clicks (ctrl/middle) to the browser for new-tab behavior", async () => {
    const host = await mountExtension("b");
    const probe = installLocationProbe();
    try {
      const railLink = [...host.shadowRoot.querySelectorAll(".rail-link")]
        .find((a) => a.getAttribute("aria-current") !== "location");

      const ctrlClick = primaryClick({ ctrlKey: true });
      railLink.dispatchEvent(ctrlClick);
      const middleClick = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, button: 1, detail: 1 });
      railLink.dispatchEvent(middleClick);

      expect(probe.assign).not.toHaveBeenCalled();
      expect(ctrlClick.defaultPrevented).toBe(false);
      expect(middleClick.defaultPrevented).toBe(false);
    } finally {
      probe.restore();
      globalThis.__repoSignalContentControllerV1.destroy();
    }
  });
});
