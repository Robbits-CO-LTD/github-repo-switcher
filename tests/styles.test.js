import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await import("../src/styles.js");
});

describe("repository rail styles", () => {
  it("keeps owner and repository name on two untruncated lines at every width", () => {
    const styles = globalThis.RepoSignalStyles;

    expect(styles).toMatch(/\.rail-path\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto auto;/s);
    expect(styles).not.toMatch(/\.rail-path\s*\{[^}]*text-overflow:\s*ellipsis;/s);
    expect(styles).not.toMatch(/\.result-hint\s*,\s*\.rail-owner\s*\{/s);
    expect(styles).not.toContain("max-width: 170px");
  });
});
