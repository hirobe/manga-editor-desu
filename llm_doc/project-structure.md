# プロジェクト構造

## ディレクトリ構成
```
manga-editor-desu/
├── index.html          メインHTML（script/CSS読み込み順が重要）
├── js/
│   ├── core/           基盤（logger, settings, auto-save, compression, font, util）
│   ├── fabric/         fabric.js Canvas管理（fabric-management.js）
│   ├── layer/          レイヤー管理（layer-management.js, blend, floating-window）
│   ├── ui/             UI部品（toast, overlay, control, event-delegator, prompt-manager, folder-picker）
│   ├── sidebar/        サイドバーツール
│   │   ├── pen/        ブラシ（crayon, ink, marker, spray, drip, stroke）
│   │   ├── text/       テキスト（vertical-text, custom effects 10種）
│   │   ├── speechBubble/ 吹き出し
│   │   ├── tone/       トーン（speedline, focusline, snow, noise）
│   │   ├── effect/     エフェクト（c2bw, c2c）
│   │   └── panel/      コマ割り（panel-manager, knife/）
│   ├── ai/             AI生成系（→ ai-system.md参照）
│   ├── db/             永続化（user-font-repository）
│   ├── dashboard/      ダッシュボード（統計、プロンプト頻度）
│   ├── svg/            SVGテンプレート（コマ割り、吹き出し）
│   ├── canvas-manager.js    キャンバスリサイズ・ズーム
│   ├── project-management.js プロジェクト保存/読み込み
│   └── shortcut.js     キーボードショートカット
├── css/
│   ├── root.css        CSS変数（カラー、z-index）
│   ├── layout.css      メインレイアウト
│   ├── layout-layer.css レイヤーパネル
│   ├── components.css  共通コンポーネント
│   ├── form.css        フォーム
│   ├── responsive.css  レスポンシブ
│   └── ui/             機能別CSS
├── html/               HTMLテンプレート
├── llm_doc/            LLM向けドキュメント
├── scripts/            ユーティリティスクリプト（format, translation check）
├── server_fastapi.py   開発用 FastAPI サーバ（uv run, port 8125, uvicorn --reload）
├── 99_server.py        旧 標準ライブラリ製サーバ
└── dev/                launchd エージェント関連（devserver.sh, plist テンプレート）
```

## 開発サーバ (server_fastapi.py)
- PEP 723 inline script metadata で依存解決 → `uv run server_fastapi.py`
- ルート以下を StaticFiles でホスト、`/api/*` で REST API を提供
- 主な API:
  - `GET /api/folders?path=<HOME相対>` — HOME 配下のフォルダ列挙（symlink解決後 HOME 外は 403）
  - `GET /api/files?path=<HOME相対>&pattern=<regex>` — フォルダ内ファイル列挙、正規表現フィルタ可
  - `GET /api/file?path=<HOME相対>` — ファイル本文（FileResponse）
- launchd 経由の常駐起動は `dev/devserver.sh install`

## URL パラメータ / runner との相互リンク（folder-picker.js）
- `?project=<HOME相対パス>` 付きで開くと、`window` の `load` で該当プロジェクトを自動オープンする（canvas 初期化後に動かすため `load` で実行）。
- プロジェクトを開く（フォルダ選択 / URL自動オープン）と、`history.replaceState` で URL を `?project=<パス>` に同期する（`fpSyncProjectUrl`。file:// では失敗しうるため try/catch で保護）。
- Links ドロップダウンの `#openRunnerLink`（`LLM Runner`）は、現在のプロジェクト付きで runner を開く（`/llm/?project=<パス>`、`fpUpdateRunnerLink` が href を更新）。runner 側（`/llm/`）にも逆向きのエディタリンク（`/front/?project=<パス>`）がある。

## 画像選択UIからの画像生成（canvas-object-menu.js）
- 画像オブジェクト右クリック →「入替え」で開く候補画像選択モーダル（`openProjectImageReplacePicker`）に、生成枚数 `<select>`（既定4）と「画像生成」ボタンを追加。
- ボタンは対象パネルのフォルダ（`dirPath` の末尾 `pXXX_panelYY`）とプロジェクト（`dirPath` の `/pages/` より前）を取り出し、runner へ `POST /llm/api/projects/gen-panel?project=<パス>`（body: `{panel, count}`）を投げ、返ってきた `task_id` を受け取る。runner 側が `gen_coma_image.py --only pXXX_panelYY --repeat-per-folder <count>` を非同期キューで実行する。
- 投入後は `GET /llm/api/projects/queues` を3秒間隔でポーリングし（`waitForTask`、最大約20分）、当該タスクが完了したら候補PNG一覧を自動リロードする（`loadList` を初期表示と共用）。モーダルを閉じるとポーリングは停止する（`closed` フラグ）。

## 主要グローバル変数
| 変数 | 説明 |
|------|------|
| `canvas` | fabric.js Canvasインスタンス |
| `stateStack` / `currentStateIndex` | Undo/Redo履歴 |
| `ModeManager` | 操作モード管理（SELECT, FREEHAND, KNIFE, PEN等） |
| `providerRegistry` | AIプロバイダ登録・ロール割り当て |
| `aiTaskMap` | AI生成タスク状態（generation-task-manager.js） |
| `sdQueue` / `comfyuiQueue` / `runpodEndpointQueue` / `falaiQueue` | プロバイダ別TaskQueue |

## Canvas初期化
```javascript
new fabric.Canvas("mangaImageCanvas",{
  enableRetinaScaling:true,
  renderOnAddRemove:false,
  renderer:fabric.isWebglSupported?"webgl":"canvas"
});
```
- 最小サイズ: 600x400
- `blendScale=3`（fabric→HTMLキャンバス変換倍率）

## モジュール間通信
1. **DOM Events** - `addEventListener`/`dispatchEvent`
2. **fabric.js Canvas Events** - `canvas.on('selection:created')`等
3. **EventDelegator** - `data-action`属性によるクリック委譲
4. **グローバル変数** - `canvas`, `stateStack`, `ModeManager`等

## script読み込み順（index.html）
1. サードパーティ（fabric.js, i18next, hotkeys等）
2. core（logger, settings, error handler）
3. fabric管理
4. UI（toast, overlay, mode管理）
5. プロジェクト・キャンバス管理
6. レイヤー
7. サイドバーツール
8. AI系
9. auto-save, compression
10. font, service worker
