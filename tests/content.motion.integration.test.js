import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "repoSignalPendingRailMoveV1";
const originalAnimate = Element.prototype.animate;

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
      <a href="/owner/source/issues">Issues</a>
      <a href="/owner/source/pulls">Pull requests</a>
      <a href="/owner/source/actions">Actions</a>
    </nav>
  `;
  return header;
}

function rectangle(left) {
  return {
    x: left,
    left,
    right: left + 160,
    top: 0,
    bottom: 42,
    width: 160,
    height: 42,
    y: 0,
    toJSON() {
      return this;
    }
  };
}

function installAnimationMock({ throws = false } = {}) {
  const animations = [];
  const animate = vi.fn(function animate(keyframes, options) {
    if (throws) {
      throw new Error("animation unavailable");
    }

    let finish;
    const finished = new Promise((resolve) => {
      finish = resolve;
    });
    const animation = {
      cancel: vi.fn(),
      finished,
      finish
    };
    animations.push(animation);
    return animation;
  });
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animate
  });
  return { animate, animations };
}

async function boot({ path = "/owner/source/issues", reducedMotion = false } = {}) {
  history.replaceState({}, "", path);
  document.body.replaceChildren(repositoryHeader());
  globalThis.RepoSignalSeed = [
    { nwo: "owner/source", name: "source", owner: "owner", private: false, hasIssues: true },
    { nwo: "owner/target", name: "target", owner: "owner", private: false, hasIssues: true }
  ];
  globalThis.matchMedia = vi.fn(() => ({ matches: reducedMotion }));
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

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function getRect() {
    if (this.dataset?.repositoryNwo === "owner/target") {
      return rectangle(this.getAttribute("aria-current") === "location" ? 12 : 420);
    }
    return rectangle(12);
  });

  await import("../src/shared.js");
  await import("../src/styles.js");
  await import("../src/content.js");

  const host = await waitFor(() => {
    const candidate = document.querySelector("[data-repo-signal-host]");
    expect(candidate).not.toBeNull();
    return candidate;
  });
  return { host, shadow: host.shadowRoot };
}

function dispatchRailClick(link, init = {}) {
  let defaultPreventedBeforeHarness;
  link.addEventListener("click", (event) => {
    defaultPreventedBeforeHarness = event.defaultPrevented;
    event.preventDefault();
  }, { once: true });
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail: 1,
    ...init
  });
  link.dispatchEvent(event);
  return { defaultPreventedBeforeHarness, event };
}

async function navigateToTarget() {
  history.pushState({}, "", "/owner/target/issues");
  document.dispatchEvent(new Event("soft-nav:react-done"));
  await waitFor(() => {
    const current = document
      .querySelector("[data-repo-signal-host]")
      ?.shadowRoot.querySelector('.rail-link[aria-current="location"]');
    expect(current?.dataset.repositoryNwo).toBe("owner/target");
  });
}

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  delete globalThis.__repoSignalContentControllerV1;
  delete globalThis.RepoSignal;
  delete globalThis.RepoSignalStyles;
  delete globalThis.RepoSignalSeed;
});

afterEach(() => {
  globalThis.__repoSignalContentControllerV1?.destroy();
  vi.restoreAllMocks();
  if (originalAnimate) {
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      writable: true,
      value: originalAnimate
    });
  } else {
    delete Element.prototype.animate;
  }
  sessionStorage.clear();
  document.body.replaceChildren();
  delete globalThis.__repoSignalContentControllerV1;
  delete globalThis.RepoSignal;
  delete globalThis.RepoSignalStyles;
  delete globalThis.RepoSignalSeed;
  delete globalThis.chrome;
  delete globalThis.matchMedia;
});

describe("Signal Rail repository movement", () => {
  it("keeps the normal click action and moves only the selected repository from its old position", async () => {
    const { animate, animations } = installAnimationMock();
    const { shadow } = await boot();
    const viewport = shadow.querySelector(".rail-viewport");
    const target = shadow.querySelector('[data-repository-nwo="owner/target"]');
    const bubbled = vi.fn();
    shadow.addEventListener("click", bubbled);
    viewport.scrollLeft = 280;

    const { defaultPreventedBeforeHarness, event } = dispatchRailClick(target);
    expect(defaultPreventedBeforeHarness).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toHaveBeenCalledOnce();

    await navigateToTarget();
    await waitFor(() => expect(animate).toHaveBeenCalledOnce());

    expect(viewport.scrollLeft).toBe(0);
    expect(animate).toHaveBeenCalledWith(
      [
        { transform: "translate3d(408px, 0, 0)" },
        { transform: "translate3d(0, 0, 0)" }
      ],
      {
        duration: 240,
        easing: "cubic-bezier(0.77, 0, 0.175, 1)",
        fill: "both"
      }
    );
    const current = shadow.querySelector('.rail-link[aria-current="location"]');
    expect(current.classList.contains("is-traveling")).toBe(true);

    animations[0].finish();
    await waitFor(() => expect(current.classList.contains("is-traveling")).toBe(false));
    expect(animations[0].cancel).toHaveBeenCalledOnce();
  });

  it("restores a pending move from sessionStorage after a full page load", async () => {
    const { animate } = installAnimationMock();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      targetNwo: "owner/target",
      sourceNwo: "owner/source",
      sourceLeft: 360,
      createdAt: Date.now()
    }));

    await boot({ path: "/owner/target/issues" });
    await waitFor(() => expect(animate).toHaveBeenCalledOnce());

    expect(animate.mock.calls[0][0][0]).toEqual({
      transform: "translate3d(348px, 0, 0)"
    });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not record modified, middle, or keyboard-originated clicks", async () => {
    const { animate } = installAnimationMock();
    const { shadow } = await boot();
    const target = shadow.querySelector('[data-repository-nwo="owner/target"]');

    dispatchRailClick(target, { ctrlKey: true });
    dispatchRailClick(target, { button: 1 });
    dispatchRailClick(target, { detail: 0 });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    await navigateToTarget();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(animate).not.toHaveBeenCalled();
  });

  it("scrolls to the start without animating when reduced motion is preferred", async () => {
    const { animate } = installAnimationMock();
    const { shadow } = await boot({ reducedMotion: true });
    const viewport = shadow.querySelector(".rail-viewport");
    viewport.scrollLeft = 220;

    dispatchRailClick(shadow.querySelector('[data-repository-nwo="owner/target"]'));
    await navigateToTarget();

    expect(viewport.scrollLeft).toBe(0);
    expect(animate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("falls back without breaking navigation when storage and animation both throw", async () => {
    const { animate } = installAnimationMock({ throws: true });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    const { shadow } = await boot();
    const viewport = shadow.querySelector(".rail-viewport");
    viewport.scrollLeft = 140;

    const { defaultPreventedBeforeHarness, event } = dispatchRailClick(
      shadow.querySelector('[data-repository-nwo="owner/target"]')
    );
    expect(defaultPreventedBeforeHarness).toBe(false);
    expect(event.defaultPrevented).toBe(true);

    await navigateToTarget();
    await waitFor(() => expect(animate).toHaveBeenCalledOnce());
    const current = shadow.querySelector('.rail-link[aria-current="location"]');
    expect(viewport.scrollLeft).toBe(0);
    expect(current.classList.contains("is-traveling")).toBe(false);
  });

  it("discards expired session records", async () => {
    const { animate } = installAnimationMock();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      targetNwo: "owner/target",
      sourceNwo: "owner/source",
      sourceLeft: 360,
      createdAt: Date.now() - 10_001
    }));

    await boot({ path: "/owner/target/issues" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(animate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores malformed session JSON", async () => {
    const { animate } = installAnimationMock();
    sessionStorage.setItem(STORAGE_KEY, "{not-json");

    await boot({ path: "/owner/target/issues" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(animate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
