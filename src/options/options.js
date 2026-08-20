(() => {
  "use strict";

  const elements = {
    clearAllButton: document.querySelector("#clear-all-button"),
    emptyState: document.querySelector("#empty-state"),
    emptyStateDescription: document.querySelector("#empty-state-description"),
    emptyStateTitle: document.querySelector("#empty-state-title"),
    excludedCount: document.querySelector("#excluded-count"),
    favoriteCount: document.querySelector("#favorite-count"),
    form: document.querySelector("#settings-form"),
    list: document.querySelector("#repository-list"),
    resultCount: document.querySelector("#result-count"),
    saveButton: document.querySelector("#save-button"),
    saveStatus: document.querySelector("#save-status"),
    saveStatusText: document.querySelector("#save-status-text"),
    search: document.querySelector("#repository-search"),
    selectAllButton: document.querySelector("#select-all-button"),
    totalCount: document.querySelector("#total-count")
  };

  const numberFormatter = new Intl.NumberFormat("ja-JP");
  let repositories = [];
  let favoriteKeys = new Set();
  let savedExcludedKeys = new Set();
  let preservedExcludedNwos = [];
  let saving = false;

  function repositoryKey(nwo) {
    return nwo.toLocaleLowerCase("en-US");
  }

  function hasIssues(repository) {
    return repository.hasIssues !== false;
  }

  function formatCount(value) {
    return numberFormatter.format(value);
  }

  function setSaveStatus(message, state = "idle") {
    elements.saveStatus.dataset.state = state;
    elements.saveStatusText.textContent = message;
  }

  function getCurrentExcludedNwos() {
    return repositories
      .filter((repository) => !favoriteKeys.has(repositoryKey(repository.nwo)))
      .map((repository) => repository.nwo);
  }

  function getCurrentExcludedKeys() {
    return new Set(getCurrentExcludedNwos().map(repositoryKey));
  }

  function setsMatch(left, right) {
    return left.size === right.size && [...left].every((value) => right.has(value));
  }

  function isDirty() {
    return !setsMatch(getCurrentExcludedKeys(), savedExcludedKeys);
  }

  function updateSummary() {
    const favoriteCount = repositories.reduce(
      (count, repository) =>
        count + Number(hasIssues(repository) && favoriteKeys.has(repositoryKey(repository.nwo))),
      0
    );

    elements.totalCount.textContent = formatCount(repositories.length);
    elements.favoriteCount.textContent = formatCount(favoriteCount);
    elements.excludedCount.textContent = formatCount(repositories.length - favoriteCount);
  }

  function updateSaveState() {
    updateSummary();

    if (saving) {
      return;
    }

    if (isDirty()) {
      setSaveStatus("未保存の変更があります", "dirty");
    } else {
      setSaveStatus("現在の設定は保存済みです");
    }
  }

  function makeBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = `repository-badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  function createRepositoryItem(repository, index) {
    const issuesAvailable = hasIssues(repository);
    const item = document.createElement("li");
    item.className = "repository-item";

    const row = document.createElement("label");
    row.className = `repository-row${issuesAvailable ? "" : " repository-row-disabled"}`;
    row.htmlFor = `repository-${index}`;

    const checkboxCell = document.createElement("span");
    checkboxCell.className = "checkbox-cell";

    const checkbox = document.createElement("input");
    checkbox.id = `repository-${index}`;
    checkbox.className = "repository-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = issuesAvailable && favoriteKeys.has(repositoryKey(repository.nwo));
    checkbox.disabled = !issuesAvailable;
    checkbox.dataset.nwo = repository.nwo;
    checkbox.setAttribute(
      "aria-label",
      issuesAvailable
        ? `${repository.nwo}をお気に入りに表示`
        : `${repository.nwo}はIssuesが無効のため表示できません`
    );

    const node = document.createElement("span");
    node.className = "repo-node";
    node.setAttribute("aria-hidden", "true");

    const checkboxWord = document.createElement("span");
    checkboxWord.className = "checkbox-word";
    checkboxWord.textContent = issuesAvailable ? "表示" : "不可";
    checkboxWord.setAttribute("aria-hidden", "true");

    checkboxCell.append(checkbox, node, checkboxWord);

    const identity = document.createElement("span");
    identity.className = "repository-identity";

    const name = document.createElement("span");
    name.className = "repository-name";
    name.textContent = repository.name;

    const owner = document.createElement("span");
    owner.className = "repository-owner";
    owner.textContent = repository.nwo;
    identity.append(name, owner);

    const badges = document.createElement("span");
    badges.className = "repository-badges";

    if (repository.private) {
      badges.append(makeBadge("非公開", "repository-badge-private"));
    }

    if (repository.archived) {
      badges.append(makeBadge("アーカイブ", "repository-badge-archived"));
    }

    if (!issuesAvailable) {
      badges.append(makeBadge("Issues無効", "repository-badge-issues-disabled"));
    }

    if (!repository.private && !repository.archived && issuesAvailable) {
      const publicState = document.createElement("span");
      publicState.className = "repository-state-public";
      publicState.textContent = "公開";
      badges.append(publicState);
    }

    row.append(checkboxCell, identity, badges);
    item.append(row);
    return item;
  }

  function getFilteredRepositories() {
    const query = elements.search.value.trim().toLocaleLowerCase("ja-JP");
    if (!query) {
      return repositories;
    }

    return repositories.filter((repository) => repository.nwo.toLocaleLowerCase("ja-JP").includes(query));
  }

  function renderRepositories() {
    const filteredRepositories = getFilteredRepositories();
    const fragment = document.createDocumentFragment();

    filteredRepositories.forEach((repository) => {
      const originalIndex = repositories.indexOf(repository);
      fragment.append(createRepositoryItem(repository, originalIndex));
    });

    elements.list.replaceChildren(fragment);
    elements.list.setAttribute("aria-busy", "false");
    elements.emptyState.hidden = filteredRepositories.length > 0;

    if (repositories.length === 0) {
      elements.emptyStateTitle.textContent = "リポジトリ一覧を読み込めませんでした";
      elements.emptyStateDescription.textContent = "一覧を作り直してから、このページを再読み込みしてください。";
    } else {
      elements.emptyStateTitle.textContent = "該当するリポジトリがありません";
      elements.emptyStateDescription.textContent = "検索する言葉を変えてください。";
    }

    elements.resultCount.textContent = `${formatCount(filteredRepositories.length)} / ${formatCount(repositories.length)}件を表示`;
  }

  function setAllFavorites(favorite) {
    favoriteKeys = favorite
      ? new Set(
          repositories
            .filter(hasIssues)
            .map((repository) => repositoryKey(repository.nwo))
        )
      : new Set();
    renderRepositories();
    updateSaveState();
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (saving) {
      return;
    }

    const api = globalThis.RepoSignal;
    const storage = globalThis.chrome?.storage?.local;
    if (!api?.saveSettings || !storage) {
      setSaveStatus("設定を保存できませんでした。Chromeの拡張機能として開いてください。", "error");
      return;
    }

    saving = true;
    elements.saveButton.disabled = true;
    elements.saveButton.setAttribute("aria-busy", "true");
    elements.saveButton.textContent = "保存中…";
    setSaveStatus("設定を保存しています");

    let savedFavoriteCount = 0;
    let saveSucceeded = false;

    try {
      const currentExcludedNwos = getCurrentExcludedNwos();
      const savedSnapshotKeys = new Set(currentExcludedNwos.map(repositoryKey));
      const excludedNwos = [...preservedExcludedNwos, ...currentExcludedNwos];
      await api.saveSettings({ excludedNwos }, storage);
      savedExcludedKeys = savedSnapshotKeys;
      savedFavoriteCount = repositories.filter(
        (repository) => hasIssues(repository) && !savedExcludedKeys.has(repositoryKey(repository.nwo))
      ).length;
      saveSucceeded = true;
    } catch (error) {
      console.error("Repo Signal settings could not be saved.", error);
      setSaveStatus("設定を保存できませんでした。ページを再読み込みして、もう一度お試しください。", "error");
    } finally {
      saving = false;
      elements.saveButton.disabled = false;
      elements.saveButton.removeAttribute("aria-busy");
      elements.saveButton.textContent = "設定を保存";
      updateSummary();

      if (saveSucceeded) {
        if (isDirty()) {
          setSaveStatus("保存後に変更された内容は、まだ保存されていません", "dirty");
        } else {
          setSaveStatus(`${formatCount(savedFavoriteCount)}件をお気に入りとして保存しました`, "success");
        }
      }
    }
  }

  function attachEvents() {
    elements.search.addEventListener("input", renderRepositories);
    elements.search.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && elements.search.value) {
        elements.search.value = "";
        renderRepositories();
      }
    });

    elements.list.addEventListener("change", (event) => {
      const checkbox = event.target.closest(".repository-checkbox");
      if (!checkbox) {
        return;
      }

      const key = repositoryKey(checkbox.dataset.nwo);
      const repository = repositories.find((candidate) => repositoryKey(candidate.nwo) === key);
      if (!repository || !hasIssues(repository)) {
        checkbox.checked = false;
        return;
      }

      if (checkbox.checked) {
        favoriteKeys.add(key);
      } else {
        favoriteKeys.delete(key);
      }
      updateSaveState();
    });

    elements.selectAllButton.addEventListener("click", () => setAllFavorites(true));
    elements.clearAllButton.addEventListener("click", () => setAllFavorites(false));
    elements.form.addEventListener("submit", saveSettings);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("en-US") === "s") {
        event.preventDefault();
        elements.form.requestSubmit();
      }
    });
  }

  async function initialize() {
    const api = globalThis.RepoSignal;
    if (!api?.getSeedRepositories || !api?.loadSettings) {
      elements.list.setAttribute("aria-busy", "false");
      elements.emptyState.hidden = false;
      elements.emptyStateTitle.textContent = "設定画面を読み込めませんでした";
      elements.emptyStateDescription.textContent = "拡張機能を再読み込みしてから、もう一度開いてください。";
      elements.resultCount.textContent = "一覧を利用できません";
      setSaveStatus("設定画面の読み込みに失敗しました", "error");
      elements.selectAllButton.disabled = true;
      elements.clearAllButton.disabled = true;
      elements.saveButton.disabled = true;
      return;
    }

    repositories = api.getSeedRepositories();
    const repositoryKeys = new Set(repositories.map((repository) => repositoryKey(repository.nwo)));
    const issuesDisabledKeys = new Set(
      repositories
        .filter((repository) => !hasIssues(repository))
        .map((repository) => repositoryKey(repository.nwo))
    );

    try {
      const settings = await api.loadSettings(globalThis.chrome?.storage?.local);
      const excludedKeys = new Set(settings.excludedNwos.map(repositoryKey));
      favoriteKeys = new Set(
        repositories
          .filter(
            (repository) =>
              hasIssues(repository) && !excludedKeys.has(repositoryKey(repository.nwo))
          )
          .map((repository) => repositoryKey(repository.nwo))
      );
      savedExcludedKeys = new Set([
        ...[...excludedKeys].filter((key) => repositoryKeys.has(key)),
        ...issuesDisabledKeys
      ]);
      preservedExcludedNwos = settings.excludedNwos.filter((nwo) => !repositoryKeys.has(repositoryKey(nwo)));
      setSaveStatus("現在の設定は保存済みです");
    } catch (error) {
      console.error("Repo Signal settings could not be loaded.", error);
      favoriteKeys = new Set(
        repositories
          .filter(hasIssues)
          .map((repository) => repositoryKey(repository.nwo))
      );
      savedExcludedKeys = new Set(issuesDisabledKeys);
      setSaveStatus("保存済みの設定を読み込めませんでした。全件をお気に入りとして表示しています。", "error");
    }

    renderRepositories();
    updateSummary();
  }

  attachEvents();
  void initialize();
})();
