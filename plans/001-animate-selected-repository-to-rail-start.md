# 001 — 選択したリポジトリを押下位置から左端へ移動する

- **Status**: IMPLEMENTED — browser verification pending
- **Commit**: unborn-no-commit
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Spatial continuity
- **Estimated scope**: 4 files, about 120 lines including tests

## Problem

Signal Rail のリポジトリをクリックすると、遷移先ではその項目が現在地として先頭へ並び替わる。しかし、旧位置を保存せずレール全体を即時置換するため、ユーザーには押した項目が消えて別の項目が左端に現れたように見える。

```js
// src/shared.js:174-188 — current
function orderRepositoriesForRail(repositories, settings, currentNwo) {
  const normalizedCurrent = normalizeNwo(currentNwo)?.toLowerCase();
  const favoriteRepositories = repositories.filter(
    (repository) => repository.hasIssues && isFavorite(repository.nwo, settings)
  );

  return favoriteRepositories.sort((left, right) => {
    const leftCurrent = left.nwo.toLowerCase() === normalizedCurrent;
    const rightCurrent = right.nwo.toLowerCase() === normalizedCurrent;
    if (leftCurrent !== rightCurrent) {
      return leftCurrent ? -1 : 1;
    }

    return left.nwo.localeCompare(right.nwo, undefined, { sensitivity: "base" });
  });
}
```

```js
// src/content.js:326-347 — current
for (const repository of repositories) {
  const item = createElement("li", "rail-item");
  const link = createElement("a", "rail-link");
  link.href = api.buildIssuesUrl(repository.nwo);
  // ...
  item.append(link);
  fragment.append(item);
}

state.elements.railList.replaceChildren(fragment);
```

```css
/* src/styles.js:107-122 — current */
.rail-link {
  /* ... */
  transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease;
}
```

GitHub の soft navigation は `src/content.js:673-676,713-719` ですでに検知している。フルページ遷移では旧 document が破棄されるため、旧位置の引き継ぎにはタブ単位の `sessionStorage` も必要になる。

## Target

通常の左クリックで別リポジトリを開いた場合だけ、遷移先の現在項目を旧クリック位置からレール左端へ移動する。

```js
currentLink.animate(
  [
    { transform: `translate3d(${deltaX}px, 0, 0)` },
    { transform: "translate3d(0, 0, 0)" }
  ],
  {
    duration: 240,
    easing: "cubic-bezier(0.77, 0, 0.175, 1)",
    fill: "both"
  }
);
```

- クリック時は `targetNwo`, `sourceNwo`, `sourceLeft`, `createdAt` を記録する。
- soft navigation 用に `state.pendingRailMove`、フルページ遷移用に `sessionStorage` を使う。
- 記録の有効期限は10秒。期限切れ・JSON不正・保存失敗は無視する。
- `railViewport.scrollLeft = 0` を設定してから遷移先の左位置を測り、`deltaX = sourceLeft - destinationLeft` とする。
- 移動は `transform` のみ、240ms、`cubic-bezier(0.77, 0, 0.175, 1)`、選択項目だけを対象にする。
- GitHub の通常遷移を壊さない。`preventDefault()`, `stopPropagation()`, `location.href` 代入、アニメーション完了待ちは行わない。
- 対象は `event.button === 0`, `event.detail > 0`, 修飾キーなし、`defaultPrevented === false` の通常ポインタークリックだけ。Ctrl/Meta/Shift/Altクリック、中央クリック、キーボード操作では位置アニメーションを記録しない。
- `matchMedia("(prefers-reduced-motion: reduce)").matches` の場合は並べ替えと左端へのスクロールだけ行い、位置移動は行わない。
- `Element.animate` 未対応、座標不正、要素なし、保存例外では即時表示へ安全にフォールバックする。

## Repo conventions to follow

- 外部依存を追加せず、既存と同じ素のJavaScript、Shadow DOM、Web Animations APIで実装する。
- 既存の短い色変化は `src/styles.js:121` の120ms `ease`。今回の画面内移動だけ、監査基準どおり強い `ease-in-out` を使う。
- 既存の動きを減らす設定は `src/styles.js:627-633`。CSS規則に加え、WAAPIの実行前にJavaScriptでも同じ設定を判定する。
- 既存の統合テストは Vitest + jsdom の `tests/content.integration.test.js`。新しい挙動は独立した `tests/content.motion.integration.test.js` で検証し、既存の単一インスタンス状態と干渉させない。

## Steps

1. `tasks/todo.md` に「レール選択の移動アニメーション」の計画、進捗、実ブラウザ確認待ちを追記する。
2. `src/content.js` の定数・stateへ、sessionStorageキー、10秒の期限、`pendingRailMove`、実行中Animationを追加する。
3. `buildHost()` の `state.elements` に既存の `railViewport` を加える。
4. `renderRail()` で各リンクに `data-repository-nwo` と通常ポインタークリック用の記録リスナーを付ける。イベントの既定動作は変更しない。
5. 記録の保存・読取・期限検査・消費を行う小さな関数を `src/content.js` に追加する。sessionStorage操作とJSON解析はすべて `try/catch` で囲む。
6. `renderRail()` が新しい一覧を挿入した直後に、現在NWOと一致する保留記録があれば消費する。`railViewport.scrollLeft = 0` の後に新しい現在リンクを測定し、旧位置との差をWAAPIで240ms移動する。
7. 開始前に古いAnimationを取消し、実行中リンクへ `.is-traveling` を付ける。完了・取消・例外時にはAnimationを取消してclassを必ず外す。`destroy()`でも実行中Animationを取消す。
8. `src/styles.js` に `.rail-link.is-traveling { position: relative; z-index: 2; will-change: transform; pointer-events: none; }` を加える。恒常的な `will-change` は付けない。
9. `tests/content.motion.integration.test.js` を追加し、通常クリック→soft navigationで `deltaX → 0`, 240ms, 指定easing、左端スクロール、既定動作維持を検証する。さらにsessionStorageからの復元、修飾クリック、`detail: 0`、reduced motion、保存/animate例外の安全なフォールバックを検証する。

## Boundaries

- `src/shared.js` の現在地を先頭にする並び順は変更しない。
- `repository-link`（全リポジトリパネル）の遷移にはアニメーションを追加しない。
- GitHubのリンク遷移を横取り・遅延しない。
- View Transitions APIや外部ライブラリを追加しない。
- 色、2行表示、バーの52px高、レール項目の幅は変更しない。
- 10秒を超えた記録は使用しない。
- 計画時点のコードと一致しない場合は、推測で広げず停止して報告する。

## Verification

- **Mechanical**: `npm run check` が全件成功する。`node --check src/content.js` と `node --check src/styles.js` が成功する。
- **Feel check**: 普段使いのChromeで右側のリポジトリを通常クリックし、遷移後の現在項目がクリック位置から左端へ240msで滑ることを確認する。Chrome DevToolsのAnimationsで10%再生し、移動対象が選択項目だけで、開始位置と終了位置が一致することを確認する。
- **Interaction check**: Ctrlクリックは新規タブを通常どおり開き、Enterキー操作は遅延せず、どちらも位置移動を付けない。
- **Reduced motion check**: DevToolsのRenderingで `prefers-reduced-motion: reduce` を有効にし、現在項目は先頭へ並ぶが位置移動しないことを確認する。
- **Done when**: 通常クリックの瞬間移動が消え、soft navigationとフルページ遷移の両方で可能な限り旧位置から左端への動きが再現され、修飾クリック・キーボード・動きを減らす設定を壊さない。
