(() => {
  "use strict";

  const OPEN_OPTIONS_MESSAGE = "repo-signal:open-options";

  globalThis.chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== OPEN_OPTIONS_MESSAGE) {
      return undefined;
    }

    globalThis.chrome.runtime.openOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));

    return true;
  });
})();
