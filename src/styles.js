(() => {
  "use strict";

  globalThis.RepoSignalStyles = String.raw`
    :host {
      --rs-canvas: #070b0f;
      --rs-surface: #0b1117;
      --rs-surface-raised: #101820;
      --rs-surface-hover: #141f29;
      --rs-line: #26313b;
      --rs-line-strong: #354451;
      --rs-text: #edf4f1;
      --rs-muted: #8c9aa5;
      --rs-faint: #61707c;
      --rs-signal: #22d3a6;
      --rs-signal-soft: rgba(34, 211, 166, 0.1);
      --rs-danger: #ff7b86;
      all: initial;
      color-scheme: dark;
      display: block !important;
      flex: 0 0 52px;
      width: 100%;
      height: 52px;
      min-width: 0;
      position: relative;
      z-index: 30;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
      font-size: 14px;
      line-height: 1.4;
      text-rendering: optimizeLegibility;
      isolation: isolate;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    button,
    input {
      font: inherit;
    }

    button,
    a {
      -webkit-tap-highlight-color: transparent;
    }

    .repo-signal {
      width: 100%;
      height: 52px;
      display: flex;
      align-items: stretch;
      color: var(--rs-text);
      background: var(--rs-canvas);
      border-top: 1px solid #131b22;
      border-bottom: 1px solid var(--rs-line);
      overflow: visible;
    }

    .rail-viewport {
      min-width: 0;
      flex: 1 1 auto;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-inline: contain;
      scrollbar-color: var(--rs-line-strong) transparent;
      scrollbar-width: thin;
    }

    .rail-viewport::-webkit-scrollbar {
      height: 3px;
    }

    .rail-viewport::-webkit-scrollbar-thumb {
      background: var(--rs-line-strong);
      border-radius: 10px;
    }

    .rail-list {
      min-width: max-content;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0 12px;
      margin: 0;
      list-style: none;
    }

    .rail-item {
      height: 100%;
      display: flex;
      align-items: center;
    }

    .rail-item + .rail-item::before {
      content: "";
      width: 14px;
      height: 1px;
      flex: 0 0 14px;
      background: var(--rs-line-strong);
    }

    .rail-link {
      min-width: 160px;
      max-width: none;
      height: 42px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      color: #c8d2d8;
      border: 1px solid transparent;
      border-radius: 7px;
      text-decoration: none;
      white-space: nowrap;
      transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease;
    }

    .rail-link.is-traveling {
      position: relative;
      z-index: 2;
      will-change: transform;
      pointer-events: none;
    }

    .rail-link::before {
      content: "";
      width: 5px;
      height: 5px;
      flex: 0 0 5px;
      border-radius: 50%;
      background: #52616c;
      box-shadow: 0 0 0 1px #172029;
    }

    .rail-link:hover {
      color: var(--rs-text);
      background: var(--rs-surface-hover);
      border-color: var(--rs-line);
    }

    .rail-link[aria-current="location"] {
      color: var(--rs-signal);
      background: var(--rs-signal-soft);
      border-color: rgba(34, 211, 166, 0.24);
    }

    .rail-link[aria-current="location"]::before {
      background: var(--rs-signal);
      box-shadow: 0 0 0 2px rgba(34, 211, 166, 0.12);
    }

    .rail-path {
      min-width: max-content;
      display: grid;
      grid-template-rows: auto auto;
      gap: 1px;
    }

    .rail-owner {
      display: block;
      color: var(--rs-muted);
      font-size: 10px;
      font-weight: 600;
      line-height: 12px;
      letter-spacing: 0.045em;
      text-transform: uppercase;
    }

    .rail-name {
      display: block;
      font-size: 13px;
      font-weight: 650;
      line-height: 16px;
      letter-spacing: -0.01em;
    }

    .rail-empty {
      height: 100%;
      display: flex;
      align-items: center;
      color: var(--rs-muted);
      font-size: 13px;
    }

    .rail-actions {
      flex: 0 0 auto;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      background: var(--rs-canvas);
      border-left: 1px solid var(--rs-line);
      box-shadow: -10px 0 18px rgba(7, 11, 15, 0.88);
    }

    .action-button,
    .icon-button,
    .favorite-button {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #cbd5db;
      background: var(--rs-surface);
      border: 1px solid var(--rs-line-strong);
      cursor: pointer;
      transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease;
    }

    .action-button {
      height: 32px;
      gap: 7px;
      padding: 0 11px;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 650;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }

    .icon-button {
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 7px;
    }

    .action-button:hover,
    .icon-button:hover,
    .favorite-button:hover {
      color: var(--rs-text);
      background: var(--rs-surface-hover);
      border-color: #465766;
    }

    .action-button[aria-expanded="true"] {
      color: var(--rs-signal);
      background: var(--rs-signal-soft);
      border-color: rgba(34, 211, 166, 0.36);
    }

    .action-button svg,
    .icon-button svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .action-button:focus-visible,
    .icon-button:focus-visible,
    .favorite-button:focus-visible,
    .rail-link:focus-visible,
    .repository-link:focus-visible,
    .search-input:focus-visible {
      outline: 2px solid var(--rs-signal);
      outline-offset: 2px;
    }

    .panel {
      position: fixed;
      top: var(--rs-panel-top, 120px);
      right: var(--rs-panel-right, 12px);
      width: min(680px, calc(100vw - 24px));
      max-height: min(70vh, calc(100vh - var(--rs-panel-top, 120px) - 12px));
      display: flex;
      flex-direction: column;
      color: var(--rs-text);
      background: var(--rs-surface);
      border: 1px solid var(--rs-line-strong);
      border-radius: 11px;
      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.48);
      overflow: hidden;
      z-index: 2147483000;
    }

    .panel[hidden] {
      display: none;
    }

    .panel-header {
      flex: 0 0 auto;
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 11px 14px 10px 16px;
      border-bottom: 1px solid var(--rs-line);
    }

    .panel-heading {
      min-width: 0;
    }

    .panel-kicker {
      display: block;
      margin-bottom: 2px;
      color: var(--rs-signal);
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.16em;
      line-height: 1.2;
      text-transform: uppercase;
    }

    .panel-title {
      margin: 0;
      color: var(--rs-text);
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.015em;
    }

    .panel-tools {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .panel-body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 12px;
    }

    .search-wrap {
      position: relative;
      flex: 0 0 auto;
    }

    .search-icon {
      width: 15px;
      height: 15px;
      position: absolute;
      top: 50%;
      left: 12px;
      color: var(--rs-faint);
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      transform: translateY(-50%);
      pointer-events: none;
    }

    .search-input {
      appearance: none;
      width: 100%;
      height: 38px;
      padding: 0 12px 0 36px;
      color: var(--rs-text);
      caret-color: var(--rs-signal);
      background: #080d12;
      border: 1px solid var(--rs-line-strong);
      border-radius: 7px;
      outline: none;
    }

    .search-input::placeholder {
      color: var(--rs-faint);
      opacity: 1;
    }

    .result-summary {
      flex: 0 0 auto;
      min-height: 29px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 2px 5px;
      color: var(--rs-muted);
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
    }

    .result-hint {
      color: var(--rs-faint);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
      font-size: 11px;
      letter-spacing: 0;
    }

    .repository-grid {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
      margin: 0;
      padding: 0 2px 2px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-color: var(--rs-line-strong) transparent;
      scrollbar-width: thin;
    }

    .repository-card {
      min-width: 0;
      min-height: 60px;
      display: flex;
      align-items: stretch;
      background: #0d141b;
      border: 1px solid var(--rs-line);
      border-radius: 8px;
      overflow: hidden;
      transition: background-color 120ms ease, border-color 120ms ease;
    }

    .repository-card:hover,
    .repository-card:focus-within {
      background: var(--rs-surface-raised);
      border-color: var(--rs-line-strong);
    }

    .repository-card.is-current {
      border-color: rgba(34, 211, 166, 0.42);
      background: rgba(34, 211, 166, 0.055);
    }

    .repository-card.issues-disabled {
      background: #0a1015;
      border-color: #202a32;
    }

    .repository-link {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      padding: 10px 7px 10px 11px;
      color: var(--rs-text);
      text-decoration: none;
    }

    .repository-link.is-disabled {
      color: #95a1aa;
      cursor: default;
    }

    .repository-path {
      min-width: 0;
      display: block;
      overflow: hidden;
      font-size: 13px;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .repository-owner {
      color: var(--rs-muted);
      font-weight: 500;
    }

    .repository-name {
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .repository-meta {
      min-height: 15px;
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--rs-faint);
      font-size: 10px;
      white-space: nowrap;
    }

    .issue-label {
      color: var(--rs-signal);
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      letter-spacing: 0.04em;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      height: 15px;
      padding: 0 5px;
      color: #9cabb5;
      border: 1px solid var(--rs-line-strong);
      border-radius: 999px;
      font-size: 9px;
    }

    .issues-disabled-badge {
      color: #aab5bd;
      background: #151c22;
      border-color: #3a4650;
    }

    .favorite-button {
      width: 39px;
      flex: 0 0 39px;
      align-self: stretch;
      padding: 0;
      color: #687782;
      background: transparent;
      border-width: 0 0 0 1px;
      border-color: var(--rs-line);
      border-radius: 0;
    }

    .favorite-button svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .favorite-button[aria-pressed="true"] {
      color: var(--rs-signal);
    }

    .favorite-button[aria-pressed="true"] svg {
      fill: rgba(34, 211, 166, 0.22);
    }

    .favorite-button:disabled {
      cursor: not-allowed;
      opacity: 0.42;
    }

    .empty-results {
      grid-column: 1 / -1;
      min-height: 112px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--rs-muted);
      background: #090f14;
      border: 1px dashed var(--rs-line-strong);
      border-radius: 8px;
      text-align: center;
    }

    .empty-results strong {
      color: #cbd5db;
      font-size: 13px;
    }

    .empty-results span {
      font-size: 11px;
    }

    .status {
      flex: 0 0 auto;
      min-height: 0;
      margin: 0;
      color: var(--rs-muted);
      font-size: 11px;
    }

    .status:not(:empty) {
      padding: 8px 2px 0;
    }

    .status.is-error {
      color: var(--rs-danger);
    }

    .visually-hidden {
      width: 1px;
      height: 1px;
      position: absolute;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      border: 0;
      white-space: nowrap;
    }

    @media (max-width: 640px) {
      .repository-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .panel {
        width: calc(100vw - 16px);
        right: 8px !important;
      }

      .result-hint {
        display: none;
      }
    }

    @media (max-width: 460px) {
      .rail-actions {
        padding-inline: 7px;
      }

      .action-button {
        width: 38px;
        padding: 0;
      }

      .action-button-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
      }
    }

    @media (forced-colors: active) {
      :host {
        --rs-canvas: Canvas;
        --rs-surface: Canvas;
        --rs-surface-raised: Canvas;
        --rs-surface-hover: Highlight;
        --rs-line: CanvasText;
        --rs-line-strong: CanvasText;
        --rs-text: CanvasText;
        --rs-muted: CanvasText;
        --rs-faint: GrayText;
        --rs-signal: LinkText;
      }

      .rail-link[aria-current="location"],
      .action-button[aria-expanded="true"],
      .repository-card.is-current {
        border-color: Highlight;
      }
    }
  `;
})();
