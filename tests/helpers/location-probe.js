import { vi } from "vitest";

/**
 * jsdom exposes `location.assign` as a read-only, non-configurable property, so it can
 * neither be spied on nor proxied (a Proxy would violate the invariant). This installs a
 * plain stand-in that forwards the fields the content script reads and records the
 * navigation instead of performing it.
 */
export function installLocationProbe() {
  const original = globalThis.location;
  const assign = vi.fn();
  const fake = {
    assign,
    get href() { return original.href; },
    get pathname() { return original.pathname; },
    get origin() { return original.origin; },
    get search() { return original.search; },
    get hash() { return original.hash; }
  };
  Object.defineProperty(globalThis, "location", { configurable: true, value: fake });

  return {
    assign,
    restore() {
      Object.defineProperty(globalThis, "location", { configurable: true, value: original });
    }
  };
}
