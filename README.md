# Repo Signal

Repo Signal は、お気に入りリポジトリの GitHub Issues を1クリックで切り替える Chrome 拡張です。

GitHub のリポジトリ名とタブの間に、Issue 切替バーを1段追加します。リポジトリ名を押すと、そのリポジトリの Issues 一覧が開きます。

## Chrome に追加する

1. Chrome で `chrome://extensions` を開いてください。
2. 右上の「デベロッパー モード」を有効にしてください。
3. 「パッケージ化されていない拡張機能を読み込む」を押してください。
4. `C:\Users\zooyo\Documents\GitHub\github-repo-switcher` を選んでください。
5. GitHub のリポジトリ画面を再読み込みしてください。

## 使い方

- 上部バーのリポジトリ名を押すと、そのリポジトリの Issues 一覧が開きます。
- 「すべてのリポジトリ」を押すと、全件を検索できます。
- 星ボタンで、常時バーに表示するお気に入りを切り替えられます。
- 設定画面では、複数のお気に入りをまとめて変更できます。
- GitHub 側で Issues が無効なリポジトリは一覧に残りますが、切替先には選べません。

## リポジトリ一覧を更新する

新しいリポジトリを追加した後は、PowerShell で次のコマンドを実行してください。

```powershell
Set-Location C:\Users\zooyo\Documents\GitHub\github-repo-switcher
npm run generate:repositories
```

次に `chrome://extensions` を開き、Repo Signal の再読み込みボタンを押してください。

## プライバシー

- 拡張の実行中は GitHub API を呼び出しません。
- GitHub のトークンを拡張へ保存しません。
- お気に入り設定は、このパソコンの `chrome.storage.local` に保存します。
- リポジトリ一覧は、現在の GitHub CLI 認証を使ってローカルで生成します。
- 生成ファイルは Git の管理対象から除外しています。

## 開発者向け確認

```powershell
npm install
npm run generate:repositories
npm run check
```
