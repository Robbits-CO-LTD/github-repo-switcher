import { describe, expect, it, vi } from "vitest";

describe("extension background messaging", () => {
  it("opens the options page for a Repo Signal request", async () => {
    let messageListener;
    const openOptionsPage = vi.fn(async () => undefined);

    globalThis.chrome = {
      runtime: {
        openOptionsPage,
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          }
        }
      }
    };

    await import("../src/background.js");

    const sendResponse = vi.fn();
    expect(messageListener({ type: "repo-signal:open-options" }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
    expect(openOptionsPage).toHaveBeenCalledOnce();
    expect(messageListener({ type: "unrelated" }, {}, sendResponse)).toBeUndefined();
  });
});
