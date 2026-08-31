(() => {
  "use strict";

  const INSTANCE_KEY = "__repoSignalContentControllerV1";
  const HOST_ATTRIBUTE = "data-repo-signal-host";
  const HEADER_SELECTOR = "#repository-container-header";
  const PANEL_ID = "repo-signal-repository-panel";
  const RAIL_MOVE_STORAGE_KEY = "repoSignalPendingRailMoveV1";
  const RAIL_MOVE_MAX_AGE_MS = 10_000;
  const RAIL_MOVE_DURATION_MS = 240;
  const RAIL_MOVE_EASING = "cubic-bezier(0.77, 0, 0.175, 1)";

  if (globalThis[INSTANCE_KEY]) {
    globalThis[INSTANCE_KEY].refresh();
    return;
  }

  const api = globalThis.RepoSignal;
  const styles = globalThis.RepoSignalStyles;
  if (!api || typeof styles !== "string") {
    return;
  }

  const state = {
    repositories: [],
    seedRepositories: [],
    discoveredRepositories: [],
    settings: Object.freeze({ excludedNwos: Object.freeze([]) }),
    currentNwo: null,
    host: null,
    shadow: null,
    elements: null,
    panelOpen: false,
    query: "",
    scheduled: false,
    settingsRevision: 0,
    saveQueue: Promise.resolve(),
    discoverySaveQueue: Promise.resolve(),
    pendingLocalWrites: 0,
    deferredStorageRefresh: false,
    observer: null,
    destroyed: false,
    lastUrl: globalThis.location?.href ?? "",
    restoreFocusOnClose: true,
    pendingRailMove: null,
    railMoveAnimation: null
  };

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (typeof text === "string") {
      element.textContent = text;
    }
    return element;
  }

  function createIcon(paths, viewBox = "0 0 24 24") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    for (const definition of paths) {
      const shape = document.createElementNS("http://www.w3.org/2000/svg", definition.tag ?? "path");
      for (const [name, value] of Object.entries(definition.attributes)) {
        shape.setAttribute(name, value);
      }
      svg.append(shape);
    }

    return svg;
  }

  function createGridIcon() {
    return createIcon([
      { tag: "rect", attributes: { x: "4", y: "4", width: "6", height: "6", rx: "1" } },
      { tag: "rect", attributes: { x: "14", y: "4", width: "6", height: "6", rx: "1" } },
      { tag: "rect", attributes: { x: "4", y: "14", width: "6", height: "6", rx: "1" } },
      { tag: "rect", attributes: { x: "14", y: "14", width: "6", height: "6", rx: "1" } }
    ]);
  }

  function createSettingsIcon() {
    return createIcon([
      { tag: "circle", attributes: { cx: "12", cy: "12", r: "3" } },
      {
        attributes: {
          d: "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.13 2.13-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-5.4v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.13-2.13.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-3h.09A1.7 1.7 0 0 0 4.65 9.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.13-2.13.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 9.35 4.7V4h5.3v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.13 2.13-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03H21v3h-.09A1.7 1.7 0 0 0 19.4 15Z"
        }
      }
    ]);
  }

  function createCloseIcon() {
    return createIcon([
      { attributes: { d: "M6 6l12 12M18 6 6 18" } }
    ]);
  }

  function createSearchIcon() {
    return createIcon([
      { tag: "circle", attributes: { cx: "10.5", cy: "10.5", r: "5.5" } },
      { attributes: { d: "m15 15 4 4" } }
    ]);
  }

  function createStarIcon() {
    return createIcon([
      {
        attributes: {
          d: "m12 3 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.8l-5.4 2.83 1.03-6.02-4.37-4.26 6.04-.88L12 3Z"
        }
      }
    ]);
  }

  function findRepositoryNavigation(header) {
    const explicit = header.querySelector(
      ':scope > nav[aria-label="Repository"], :scope > nav[aria-label="リポジトリ"]'
    ) ?? header.querySelector(
      'nav[aria-label="Repository"], nav[aria-label="リポジトリ"]'
    );
    if (explicit) {
      return explicit;
    }

    const currentNwo = api.parseCurrentRepository();
    if (!currentNwo) {
      return null;
    }

    const expectedPaths = [
      `/${currentNwo}/issues`,
      `/${currentNwo}/pulls`,
      `/${currentNwo}/actions`
    ];

    return [...header.querySelectorAll("nav")].find((navigation) => {
      const links = [...navigation.querySelectorAll("a[href]")];
      const matches = expectedPaths.filter((path) =>
        links.some((link) => {
          try {
            return new URL(link.href, globalThis.location?.origin).pathname.startsWith(path);
          } catch {
            return false;
          }
        })
      );
      return matches.length >= 2;
    }) ?? null;
  }

  function findInsertionPoint() {
    for (const header of document.querySelectorAll(HEADER_SELECTOR)) {
      const navigation = findRepositoryNavigation(header);
      if (navigation?.parentNode && header.contains(navigation)) {
        return {
          anchor: navigation,
          parent: navigation.parentNode,
          position: "before"
        };
      }

      if (api.parseCurrentRepository() && header.parentNode) {
        return {
          anchor: header,
          parent: header.parentNode,
          position: "after"
        };
      }
    }
    return null;
  }

  function hostIsPlaced(host, insertionPoint) {
    if (host.parentNode !== insertionPoint.parent) {
      return false;
    }

    return insertionPoint.position === "before"
      ? insertionPoint.anchor.previousElementSibling === host
      : insertionPoint.anchor.nextElementSibling === host;
  }

  function placeHost(host, insertionPoint) {
    const reference = insertionPoint.position === "before"
      ? insertionPoint.anchor
      : insertionPoint.anchor.nextSibling;
    insertionPoint.parent.insertBefore(host, reference);
  }

  function buildHost() {
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTRIBUTE, "");
    host.setAttribute("data-repo-signal-version", "1");

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;

    const shell = createElement("section", "repo-signal");
    shell.setAttribute("aria-label", "お気に入りリポジトリのIssue切り替え");

    const railViewport = createElement("nav", "rail-viewport");
    railViewport.setAttribute("aria-label", "お気に入りリポジトリ");
    const railList = createElement("ol", "rail-list");
    railViewport.append(railList);

    const railActions = createElement("div", "rail-actions");
    const allButton = createElement("button", "action-button");
    allButton.type = "button";
    allButton.setAttribute("aria-haspopup", "dialog");
    allButton.setAttribute("aria-expanded", "false");
    allButton.setAttribute("aria-controls", PANEL_ID);
    allButton.title = "すべてのリポジトリを表示";
    allButton.append(createGridIcon(), createElement("span", "action-button-label", "全リポジトリ"));

    const settingsButton = createElement("button", "icon-button");
    settingsButton.type = "button";
    settingsButton.setAttribute("aria-label", "拡張機能の設定を開く");
    settingsButton.title = "拡張機能の設定";
    settingsButton.append(createSettingsIcon());
    railActions.append(settingsButton, allButton);
    shell.append(railViewport, railActions);

    const panel = createElement("section", "panel");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", `${PANEL_ID}-title`);

    const panelHeader = createElement("header", "panel-header");
    const panelHeading = createElement("div", "panel-heading");
    panelHeading.append(
      createElement("span", "panel-kicker", "Issue切り替え"),
      createElement("h2", "panel-title", "すべてのリポジトリ")
    );
    panelHeading.lastElementChild.id = `${PANEL_ID}-title`;

    const panelTools = createElement("div", "panel-tools");
    const panelSettingsButton = createElement("button", "icon-button");
    panelSettingsButton.type = "button";
    panelSettingsButton.setAttribute("aria-label", "拡張機能の設定を開く");
    panelSettingsButton.title = "拡張機能の設定";
    panelSettingsButton.append(createSettingsIcon());

    const closeButton = createElement("button", "icon-button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "一覧を閉じる");
    closeButton.title = "閉じる";
    closeButton.append(createCloseIcon());
    panelTools.append(panelSettingsButton, closeButton);
    panelHeader.append(panelHeading, panelTools);

    const panelBody = createElement("div", "panel-body");
    const searchWrap = createElement("label", "search-wrap");
    searchWrap.append(createElement("span", "visually-hidden", "リポジトリを検索"));
    const searchIcon = createSearchIcon();
    searchIcon.classList.add("search-icon");
    const searchInput = createElement("input", "search-input");
    searchInput.type = "search";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.placeholder = "owner またはリポジトリ名で検索";
    searchInput.setAttribute("aria-controls", `${PANEL_ID}-results`);
    searchWrap.append(searchIcon, searchInput);

    const resultSummary = createElement("div", "result-summary");
    resultSummary.setAttribute("aria-live", "polite");
    const resultCount = createElement("span", "result-count");
    const resultHint = createElement("span", "result-hint", "★でお気に入りを切り替え");
    resultSummary.append(resultCount, resultHint);

    const repositoryGrid = createElement("div", "repository-grid");
    repositoryGrid.id = `${PANEL_ID}-results`;
    repositoryGrid.setAttribute("role", "list");

    const status = createElement("p", "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    panelBody.append(searchWrap, resultSummary, repositoryGrid, status);
    panel.append(panelHeader, panelBody);
    shadow.append(style, shell, panel);

    state.host = host;
    state.shadow = shadow;
    state.elements = {
      shell,
      railViewport,
      railList,
      allButton,
      settingsButton,
      panel,
      panelSettingsButton,
      closeButton,
      searchInput,
      resultCount,
      repositoryGrid,
      status
    };

    allButton.addEventListener("click", () => setPanelOpen(!state.panelOpen));
    closeButton.addEventListener("click", () => setPanelOpen(false));
    settingsButton.addEventListener("click", openOptionsPage);
    panelSettingsButton.addEventListener("click", openOptionsPage);
    searchInput.addEventListener("input", () => {
      state.query = searchInput.value;
      renderRepositoryGrid();
    });
    searchInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    return host;
  }

  function removeStoredRailMove() {
    try {
      globalThis.sessionStorage?.removeItem(RAIL_MOVE_STORAGE_KEY);
    } catch {
      // A blocked sessionStorage must never interfere with GitHub navigation.
    }
  }

  function normalizeRailMove(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const targetNwo = api.normalizeNwo(value.targetNwo);
    const sourceNwo = api.normalizeNwo(value.sourceNwo);
    const sourceLeft = value.sourceLeft;
    const createdAt = value.createdAt;
    const age = Date.now() - createdAt;
    if (
      !targetNwo ||
      !sourceNwo ||
      targetNwo.toLowerCase() === sourceNwo.toLowerCase() ||
      typeof sourceLeft !== "number" ||
      !Number.isFinite(sourceLeft) ||
      typeof createdAt !== "number" ||
      !Number.isFinite(createdAt) ||
      age < 0 ||
      age > RAIL_MOVE_MAX_AGE_MS
    ) {
      return null;
    }

    return { targetNwo, sourceNwo, sourceLeft, createdAt };
  }

  function readStoredRailMove() {
    try {
      const serialized = globalThis.sessionStorage?.getItem(RAIL_MOVE_STORAGE_KEY);
      if (!serialized) {
        return null;
      }

      const record = normalizeRailMove(JSON.parse(serialized));
      if (!record) {
        removeStoredRailMove();
      }
      return record;
    } catch {
      removeStoredRailMove();
      return null;
    }
  }

  function saveRailMove(record) {
    state.pendingRailMove = record;
    try {
      globalThis.sessionStorage?.setItem(RAIL_MOVE_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // The in-memory record still supports GitHub soft navigation.
    }
  }

  function consumeRailMove(currentNwo) {
    const normalizedCurrent = api.normalizeNwo(currentNwo)?.toLowerCase();
    if (!normalizedCurrent) {
      return null;
    }

    let record = normalizeRailMove(state.pendingRailMove);
    if (state.pendingRailMove && !record) {
      state.pendingRailMove = null;
      removeStoredRailMove();
    }
    record ??= readStoredRailMove();
    if (!record || record.targetNwo.toLowerCase() !== normalizedCurrent) {
      return null;
    }

    state.pendingRailMove = null;
    removeStoredRailMove();
    return record;
  }

  function stopRailMoveAnimation(active = state.railMoveAnimation) {
    if (!active) {
      return;
    }

    if (state.railMoveAnimation === active) {
      state.railMoveAnimation = null;
    }
    active.link?.classList.remove("is-traveling");
    try {
      active.animation?.cancel?.();
    } catch {
      // Cleanup must remain best-effort when the browser rejects cancellation.
    }
  }

  function reducedMotionIsPreferred() {
    try {
      return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    } catch {
      return false;
    }
  }

  function playPendingRailMove() {
    if (!state.elements || !state.host?.isConnected) {
      return;
    }

    const normalizedCurrent = api.normalizeNwo(state.currentNwo)?.toLowerCase();
    const currentLink = [...state.elements.railList.querySelectorAll(".rail-link")]
      .find((link) => link.dataset.repositoryNwo?.toLowerCase() === normalizedCurrent);
    if (!currentLink) {
      return;
    }

    const record = consumeRailMove(state.currentNwo);
    if (!record) {
      return;
    }

    state.elements.railViewport.scrollLeft = 0;
    if (reducedMotionIsPreferred() || typeof currentLink.animate !== "function") {
      return;
    }

    let destinationLeft;
    try {
      destinationLeft = currentLink.getBoundingClientRect().left;
    } catch {
      return;
    }
    const deltaX = record.sourceLeft - destinationLeft;
    if (!Number.isFinite(destinationLeft) || !Number.isFinite(deltaX)) {
      return;
    }

    stopRailMoveAnimation();
    currentLink.classList.add("is-traveling");
    try {
      const animation = currentLink.animate(
        [
          { transform: `translate3d(${deltaX}px, 0, 0)` },
          { transform: "translate3d(0, 0, 0)" }
        ],
        {
          duration: RAIL_MOVE_DURATION_MS,
          easing: RAIL_MOVE_EASING,
          fill: "both"
        }
      );
      const active = { animation, link: currentLink };
      state.railMoveAnimation = active;
      const finalize = () => {
        if (state.railMoveAnimation === active) {
          stopRailMoveAnimation(active);
        }
      };

      if (animation?.finished && typeof animation.finished.then === "function") {
        Promise.resolve(animation.finished).catch(() => undefined).finally(finalize);
      } else if (typeof animation?.addEventListener === "function") {
        animation.addEventListener("finish", finalize, { once: true });
        animation.addEventListener("cancel", finalize, { once: true });
      }
    } catch {
      currentLink.classList.remove("is-traveling");
      state.railMoveAnimation = null;
    }
  }

  function shouldRecordRailMove(event) {
    return (
      event.button === 0 &&
      event.detail > 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.defaultPrevented
    );
  }

  function recordRailMove(event, link, targetNwo) {
    if (!shouldRecordRailMove(event)) {
      return;
    }

    const sourceNwo = api.normalizeNwo(state.currentNwo);
    const normalizedTarget = api.normalizeNwo(targetNwo);
    if (!sourceNwo || !normalizedTarget || sourceNwo.toLowerCase() === normalizedTarget.toLowerCase()) {
      return;
    }

    try {
      const sourceLeft = link.getBoundingClientRect().left;
      if (!Number.isFinite(sourceLeft)) {
        return;
      }
      saveRailMove({
        targetNwo: normalizedTarget,
        sourceNwo,
        sourceLeft,
        createdAt: Date.now()
      });
    } catch {
      // Position capture is optional; the link's default action continues.
    }
  }

  function renderRail() {
    if (!state.elements) {
      return;
    }

    stopRailMoveAnimation();

    const repositories = api.orderRepositoriesForRail(
      state.repositories.filter(repositoryHasIssues),
      state.settings,
      state.currentNwo
    );
    const fragment = document.createDocumentFragment();

    if (repositories.length === 0) {
      const emptyItem = createElement("li", "rail-empty", "Issueが有効なお気に入りはありません。「全リポジトリ」から追加できます。");
      fragment.append(emptyItem);
    }

    for (const repository of repositories) {
      const item = createElement("li", "rail-item");
      const link = createElement("a", "rail-link");
      link.href = api.buildIssuesUrl(repository.nwo);
      link.dataset.repositoryNwo = repository.nwo;
      link.title = `${repository.nwo} のIssuesへ`;
      link.setAttribute("aria-label", `${repository.nwo} のIssue一覧を開く`);
      link.addEventListener("click", (event) => recordRailMove(event, link, repository.nwo));

      if (repository.nwo.toLowerCase() === state.currentNwo?.toLowerCase()) {
        link.setAttribute("aria-current", "location");
      }

      const path = createElement("span", "rail-path");
      path.append(
        createElement("span", "rail-owner", repository.owner),
        createElement("span", "rail-name", repository.name)
      );
      link.append(path);
      item.append(link);
      fragment.append(item);
    }

    state.elements.railList.replaceChildren(fragment);
    playPendingRailMove();
  }

  function repositoryMatchesQuery(repository, query) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return normalizedQuery.split(/\s+/).every((term) =>
      repository.nwo.toLocaleLowerCase().includes(term)
    );
  }

  function repositoryHasIssues(repository) {
    return repository.hasIssues !== false;
  }

  function pageShowsIssuesForRepository(nwo) {
    const issuesPath = `/${nwo}/issues`.toLowerCase();
    if (globalThis.location?.pathname?.toLowerCase().startsWith(issuesPath)) {
      return true;
    }

    return [...document.querySelectorAll("a[href]")].some((link) => {
      try {
        return new URL(link.href, globalThis.location?.origin).pathname
          .toLowerCase()
          .startsWith(issuesPath);
      } catch {
        return false;
      }
    });
  }

  function rememberCurrentRepository() {
    const currentNwo = api.parseCurrentRepository();
    if (!currentNwo) {
      return false;
    }

    const key = currentNwo.toLowerCase();
    if (state.seedRepositories.some((repository) => repository.nwo.toLowerCase() === key)) {
      return false;
    }

    const previous = state.discoveredRepositories.find(
      (repository) => repository.nwo.toLowerCase() === key
    );
    const repository = api.normalizeRepository({
      nwo: currentNwo,
      private: previous?.private,
      archived: previous?.archived,
      hasIssues: previous?.hasIssues || pageShowsIssuesForRepository(currentNwo)
    });
    if (!repository) {
      return false;
    }

    if (
      previous &&
      previous.nwo === repository.nwo &&
      previous.private === repository.private &&
      previous.archived === repository.archived &&
      previous.hasIssues === repository.hasIssues
    ) {
      return false;
    }

    state.discoveredRepositories = api.mergeRepositories(
      state.discoveredRepositories.filter((candidate) => candidate.nwo.toLowerCase() !== key),
      [repository]
    );
    state.repositories = api.mergeRepositories(
      state.discoveredRepositories,
      state.seedRepositories
    );

    const snapshot = state.discoveredRepositories;
    state.discoverySaveQueue = state.discoverySaveQueue
      .catch(() => undefined)
      .then(() => api.saveDiscoveredRepositories(snapshot))
      .catch(() => {
        setStatus("新しいリポジトリを一覧へ保存できませんでした。", true);
      });
    return true;
  }

  function createRepositoryCard(repository) {
    const card = createElement("article", "repository-card");
    card.setAttribute("role", "listitem");

    const isCurrent = repository.nwo.toLowerCase() === state.currentNwo?.toLowerCase();
    if (isCurrent) {
      card.classList.add("is-current");
    }

    const hasIssues = repositoryHasIssues(repository);
    const destination = createElement(hasIssues ? "a" : "div", "repository-link");
    if (hasIssues) {
      destination.href = api.buildIssuesUrl(repository.nwo);
      destination.setAttribute("aria-label", `${repository.nwo} のIssue一覧を開く`);
      if (isCurrent) {
        destination.setAttribute("aria-current", "location");
      }
    } else {
      card.classList.add("issues-disabled");
      destination.classList.add("is-disabled");
      destination.setAttribute("aria-disabled", "true");
    }

    const repositoryPath = createElement("span", "repository-path");
    repositoryPath.append(
      createElement("span", "repository-owner", `${repository.owner}/`),
      createElement("span", "repository-name", repository.name)
    );

    const metadata = createElement("span", "repository-meta");
    if (hasIssues) {
      metadata.append(createElement("span", "issue-label", "Issue一覧 →"));
    } else {
      metadata.append(createElement("span", "badge issues-disabled-badge", "Issues無効"));
    }
    if (repository.private) {
      metadata.append(createElement("span", "badge", "非公開"));
    }
    if (repository.archived) {
      metadata.append(createElement("span", "badge", "アーカイブ"));
    }

    destination.append(repositoryPath, metadata);
    if (hasIssues) {
      destination.addEventListener("click", () => setPanelOpen(false, { restoreFocus: false }));
    }

    const favorite = hasIssues && api.isFavorite(repository.nwo, state.settings);
    const favoriteButton = createElement("button", "favorite-button");
    favoriteButton.type = "button";
    favoriteButton.setAttribute("aria-pressed", String(favorite));
    favoriteButton.dataset.repositoryNwo = repository.nwo;
    favoriteButton.append(createStarIcon());
    if (hasIssues) {
      favoriteButton.setAttribute(
        "aria-label",
        favorite
          ? `${repository.nwo}をお気に入りから外す`
          : `${repository.nwo}をお気に入りに追加する`
      );
      favoriteButton.title = favorite ? "お気に入りから外す" : "お気に入りに追加";
      favoriteButton.addEventListener("click", () => toggleFavorite(repository, !favorite));
    } else {
      favoriteButton.disabled = true;
      favoriteButton.setAttribute("aria-disabled", "true");
      favoriteButton.setAttribute(
        "aria-label",
        `${repository.nwo}はIssuesが無効なためお気に入りにできません`
      );
      favoriteButton.title = "Issuesが無効なためお気に入りにできません";
    }

    card.append(destination, favoriteButton);
    return card;
  }

  function renderRepositoryGrid() {
    if (!state.elements) {
      return;
    }

    const repositories = state.repositories.filter((repository) =>
      repositoryMatchesQuery(repository, state.query)
    );
    const fragment = document.createDocumentFragment();

    for (const repository of repositories) {
      fragment.append(createRepositoryCard(repository));
    }

    if (repositories.length === 0) {
      const empty = createElement("div", "empty-results");
      empty.append(
        createElement("strong", "", state.repositories.length === 0 ? "リポジトリが登録されていません" : "一致するリポジトリがありません"),
        createElement("span", "", state.repositories.length === 0 ? "リポジトリ一覧を再生成してください。" : "検索語を短くしてお試しください。")
      );
      fragment.append(empty);
    }

    state.elements.repositoryGrid.replaceChildren(fragment);
    state.elements.resultCount.textContent = `${repositories.length} / ${state.repositories.length} 件`;
  }

  function render() {
    const focusedRepository = state.shadow?.activeElement?.dataset?.repositoryNwo;
    renderRail();
    if (state.panelOpen) {
      renderRepositoryGrid();
    }

    if (focusedRepository && state.panelOpen) {
      const nextButton = [...state.elements.repositoryGrid.querySelectorAll(".favorite-button")]
        .find((button) => button.dataset.repositoryNwo === focusedRepository);
      nextButton?.focus({ preventScroll: true });
    }
  }

  function setStatus(message, error = false) {
    if (!state.elements) {
      return;
    }
    state.elements.status.textContent = message;
    state.elements.status.classList.toggle("is-error", error);
  }

  function toggleFavorite(repository, favorite) {
    const previousSettings = state.settings;
    const nextSettings = api.withFavorite(state.settings, repository.nwo, favorite);
    const revision = ++state.settingsRevision;
    state.settings = nextSettings;
    state.pendingLocalWrites += 1;
    render();
    setStatus(favorite ? `${repository.name}をお気に入りに追加しました。` : `${repository.name}をお気に入りから外しました。`);

    state.saveQueue = state.saveQueue
      .catch(() => undefined)
      .then(() => api.saveSettings(nextSettings))
      .then((savedSettings) => {
        if (revision === state.settingsRevision) {
          state.settings = savedSettings;
          render();
        }
      })
      .catch(() => {
        if (revision === state.settingsRevision) {
          state.settings = previousSettings;
          render();
          setStatus("お気に入りを保存できませんでした。もう一度お試しください。", true);
        }
      })
      .finally(() => {
        state.pendingLocalWrites = Math.max(0, state.pendingLocalWrites - 1);
        if (state.pendingLocalWrites === 0 && state.deferredStorageRefresh) {
          state.deferredStorageRefresh = false;
          void refreshSettings();
        }
      });
  }

  function positionPanel() {
    if (!state.panelOpen || !state.elements) {
      return;
    }

    const triggerRect = state.elements.allButton.getBoundingClientRect();
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth;
    const top = Math.max(8, Math.round(triggerRect.bottom + 8));
    const right = Math.max(8, Math.round(viewportWidth - triggerRect.right));
    state.elements.panel.style.setProperty("--rs-panel-top", `${top}px`);
    state.elements.panel.style.setProperty("--rs-panel-right", `${right}px`);
  }

  function setPanelOpen(open, options = {}) {
    if (!state.elements || state.panelOpen === open) {
      return;
    }

    state.panelOpen = open;
    state.restoreFocusOnClose = options.restoreFocus !== false;
    state.elements.panel.hidden = !open;
    state.elements.allButton.setAttribute("aria-expanded", String(open));

    if (open) {
      state.query = "";
      state.elements.searchInput.value = "";
      setStatus("");
      renderRepositoryGrid();
      positionPanel();
      globalThis.requestAnimationFrame?.(() => {
        state.elements?.searchInput.focus({ preventScroll: true });
      });
      return;
    }

    if (state.restoreFocusOnClose && state.elements.allButton.isConnected) {
      state.elements.allButton.focus({ preventScroll: true });
    }
  }

  function openOptionsPage() {
    setPanelOpen(false, { restoreFocus: false });
    const reportError = () => {
      setPanelOpen(true);
      setStatus("設定画面を開けませんでした。", true);
    };

    try {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime?.sendMessage) {
        reportError();
        return;
      }

      Promise.resolve(runtime.sendMessage({ type: "repo-signal:open-options" }))
        .then((response) => {
          if (!response?.ok) {
            reportError();
          }
        })
        .catch(reportError);
    } catch {
      reportError();
    }
  }

  function removeDuplicateHosts() {
    for (const host of document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)) {
      if (host !== state.host) {
        host.remove();
      }
    }
  }

  function ensureInjected() {
    state.scheduled = false;
    if (state.destroyed) {
      return;
    }

    const nextUrl = globalThis.location?.href ?? "";
    if (nextUrl !== state.lastUrl) {
      state.lastUrl = nextUrl;
      state.currentNwo = api.parseCurrentRepository();
      setPanelOpen(false, { restoreFocus: false });
      render();
    }

    const insertionPoint = findInsertionPoint();
    if (!insertionPoint) {
      if (state.host?.isConnected) {
        state.host.remove();
      }
      return;
    }

    const repositoryWasDiscovered = rememberCurrentRepository();

    const hostWasCreated = !state.host;
    const host = state.host ?? buildHost();
    removeDuplicateHosts();

    const needsPlacement = !hostIsPlaced(host, insertionPoint);
    if (needsPlacement) {
      placeHost(host, insertionPoint);
    }

    const nextCurrentNwo = api.parseCurrentRepository();
    const currentChanged = nextCurrentNwo?.toLowerCase() !== state.currentNwo?.toLowerCase();
    state.currentNwo = nextCurrentNwo;

    if (hostWasCreated) {
      render();
    } else if (needsPlacement || currentChanged || repositoryWasDiscovered) {
      renderRail();
    }
    positionPanel();
  }

  function scheduleEnsure() {
    if (state.destroyed || state.scheduled) {
      return;
    }
    state.scheduled = true;

    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(ensureInjected);
    } else {
      globalThis.setTimeout(ensureInjected, 0);
    }
  }

  function handleDocumentPointerDown(event) {
    if (!state.panelOpen || !state.elements) {
      return;
    }

    const path = event.composedPath();
    if (!path.includes(state.elements.panel) && !path.includes(state.elements.allButton)) {
      setPanelOpen(false, { restoreFocus: false });
    }
  }

  function handleDocumentKeyDown(event) {
    if (state.panelOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setPanelOpen(false);
    }
  }

  function handleNavigation() {
    setPanelOpen(false, { restoreFocus: false });
    scheduleEnsure();
  }

  async function refreshSettings() {
    const startedRevision = state.settingsRevision;
    try {
      const loadedSettings = await api.loadSettings();
      if (
        state.pendingLocalWrites > 0 ||
        startedRevision !== state.settingsRevision
      ) {
        state.deferredStorageRefresh = true;
        return;
      }

      state.settings = loadedSettings;
      state.settingsRevision += 1;
      render();
    } catch {
      setStatus("お気に入り設定を読み込めませんでした。", true);
    }
  }

  async function refreshDiscoveredRepositories() {
    try {
      state.discoveredRepositories = await api.loadDiscoveredRepositories();
      state.repositories = api.mergeRepositories(
        state.discoveredRepositories,
        state.seedRepositories
      );
      render();
    } catch {
      setStatus("新しいリポジトリの一覧を読み込めませんでした。", true);
    }
  }

  async function initialize() {
    state.seedRepositories = api.getSeedRepositories(globalThis.RepoSignalSeed);
    state.repositories = state.seedRepositories;
    state.currentNwo = api.parseCurrentRepository();

    try {
      state.discoveredRepositories = await api.loadDiscoveredRepositories();
      state.repositories = api.mergeRepositories(
        state.discoveredRepositories,
        state.seedRepositories
      );
    } catch {
      state.discoveredRepositories = [];
    }

    try {
      state.settings = await api.loadSettings();
    } catch {
      state.settings = Object.freeze({ excludedNwos: Object.freeze([]) });
    }

    state.observer = new MutationObserver(scheduleEnsure);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown, true);
    document.addEventListener("turbo:load", handleNavigation);
    document.addEventListener("turbo:render", handleNavigation);
    document.addEventListener("soft-nav:react-done", handleNavigation);
    document.addEventListener("pjax:end", handleNavigation);
    document.addEventListener("github:page-load", handleNavigation);
    globalThis.addEventListener("popstate", handleNavigation);
    globalThis.addEventListener("pageshow", handleNavigation);
    globalThis.addEventListener("resize", positionPanel, { passive: true });
    globalThis.addEventListener("scroll", positionPanel, { passive: true, capture: true });

    globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === "local" && changes?.[api.SETTINGS_KEY]) {
        if (state.pendingLocalWrites > 0) {
          state.deferredStorageRefresh = true;
        } else {
          void refreshSettings();
        }
      } else if (areaName === "local" && changes?.[api.DISCOVERED_REPOSITORIES_KEY]) {
        void refreshDiscoveredRepositories();
      }
    });

    globalThis[INSTANCE_KEY] = Object.freeze({
      refresh: scheduleEnsure,
      destroy() {
        state.destroyed = true;
        stopRailMoveAnimation();
        state.observer?.disconnect();
        state.host?.remove();
      }
    });
    scheduleEnsure();
  }

  initialize().catch(() => {
    if (state.host?.isConnected) {
      state.host.remove();
    }
  });
})();
