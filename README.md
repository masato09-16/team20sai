# 板書チェック（板書上達支援 MVP）

黒板画像を **アップロード** または **カメラで撮影** して解析します。解析は OCR で画像内文字を推定しつつ、主評価は **可読性・行の整い・文字サイズの安定・字間行間・線の安定感** で行います。
お手本テキストは練習用プレビュー専用で、解析スコア計算には使いません。

## 構成

| 層       | 技術スタック                                      |
|---------|--------------------------------------------------|
| フロント | Next.js（App Router）, TypeScript, Tailwind CSS |
| API     | FastAPI, Python 3.11, OpenCV                     |
| ローカル検証 | **Docker Compose（開発・動作確認専用）**    |

本番環境では **Docker に依存しない** 運用を想定しています。例として次のような分離構成がとりやすいです。

- **フロント**: Vercel や静的ホスティング、任意の Node ホストに Next.js をデプロイ
- **API**: VPS・Cloud Run・レンサバ等で `uvicorn` により FastAPI を常駐

フロントは環境変数 **`NEXT_PUBLIC_API_URL`** で API の公開 URL を指します。

### チョーク体フォント（任意）

お手本テキストの描画に **TTF/OTF 等のチョーク体フォント**を使う場合は、ライセンスのあるファイルを手元で用意し、バックエンドの環境変数 **`CHALK_FONT_PATH`** にそのパスを設定してください（リポジトリにはフォントを同梱していません）。詳細は `backend/assets/fonts/README.md` を参照してください。未設定時は Pillow の開発用フォントにフォールバックし、API の `notes` にその旨が含まれます。
`Chalk-JP.otf` を使う場合は、**各環境で `backend/assets/fonts/Chalk-JP.otf` を配置**してください（Git 管理対象外）。

### `/analyze` の入力

multipart/form-data で **`file`**（画像）のみ必須です。`target_text` は解析に使いません。
解析前に入力ゲートと台形補正を共通前処理として実施したあと、OCR 文字列を補助情報として使い、主評価は可読性・行の整い・文字サイズの安定・字間行間・線の安定感で算出します。`visibility`（撮影品質）と参照マスクとの形状照合は参考情報として扱います。
OCR 結果を修正して再解析する場合は、任意の **`corrected_text`** を送ると OCR をスキップし、その文字列を解析文字列として使います。

### `/reference-preview` の入力

JSON で **`target_text`** を受け取り、練習用の黒板プレビュー PNG を返します。こちらは解析とは独立した機能です。

---

## AIでコード生成するときの共通ルール

この README を仕様の正とします。Cursor、Codex、ChatGPT、Claude などの AI でコード生成する場合も、最初にこの README、該当コード、既存テストを読み、実装計画を提示してから変更してください。評価ロジックや API 契約を変更する場合は、バックエンド、フロントエンド、テスト、README を同じ方針で更新します。

### 評価方針

本アプリの評価基準は **「人が見て読みやすく、整っていて、黒板文字として伝わりやすいか」** です。チョーク体フォント、OCR 結果、参照マスクとの一致は補助情報であり、総合点の主基準にしません。

- 高評価にすべき文字: 読みやすい、行が揃っている、文字サイズが安定している、字間と行間が自然、線が安定している、黒板上で伝わりやすい。
- 低評価にすべき文字: 判読しづらい、行が大きく傾く、文字サイズが極端にばらつく、字間や行間が詰まりすぎるまたは空きすぎる、線が途切れるまたは薄すぎる。
- 撮影品質の問題: ピンぼけ、暗すぎる、遠すぎる、斜め撮影、黒板外の写り込みは `visibility` やメッセージで扱い、手書き文字そのものの評価と混ぜすぎない。

### API 契約

- `/analyze` は multipart/form-data の **`file`** が必須です。
- `/analyze` の **`target_text` は解析スコアに使いません**。過去実装や他 AI の生成コードで `target_text` を採点に混ぜないでください。
- OCR の認識結果が間違っている場合は、`corrected_text` を送ると OCR をスキップし、その文字列を解析文字列として使います。
- `/reference-preview` は `target_text` から練習用の黒板プレビュー PNG を作る独立機能です。採点 API ではありません。
- API レスポンスを変更する場合は、`backend/app/schemas.py`、`frontend/lib/api/schemas.ts`、表示 UI、バックエンドテスト、README を同時に更新してください。

### スコア項目の意味

スコアは原則 `0.0` から `1.0` の範囲で返し、画面ではパーセントや点数に変換して表示します。

- `score`: 総合評価。主に可読性、行の整い、文字サイズ、字間行間、線の安定感から算出します。
- `readability`: 人が読めるか、文字線が判読しやすいか。
- `line_alignment`: 行の基準線が揃っているか。
- `spacing_balance`: 字間と行間が自然で、詰まりすぎや空きすぎがないか。
- `stroke_quality`: チョーク線の途切れ、薄さ、ぶれ、線幅の安定感。
- `size_consistency`: 文字サイズが行内や行間で安定しているか。
- `visibility`: 写真として解析しやすいか。コントラスト、明るさ、ぼけ、黒板領域の写り方を反映します。
- `horizontalness`、`spacing_uniformity`: 既存 UI や詳細表示との互換項目です。改名や削除をする場合は API、UI、テストを一緒に直してください。
- `reference_comparison`: 参照マスクとの形状比較です。チョーク体フォントとの差分が大きくても、人間から見て読みやすい字なら総合点が過度に下がらないようにしてください。

### 実装ガードレール

- 総合点を OCR 信頼度、チョーク体フォント一致、参照マスク一致だけで決めないでください。
- OCR は文字起こし補助です。OCR 誤認識を理由に、読みやすい手書き文字の評価が大きく下がる設計にしないでください。
- 入力ゲート、台形補正、文字線抽出、レイアウト評価、OCR 修正再解析の責務を混ぜすぎないでください。
- メトリクスを変えたら、上手な黒板文字、崩れた文字、OCR 修正ありのケースをテストに追加または更新してください。
- Docker Compose はローカル開発と統合確認用です。本番前提の設定を Compose にだけ閉じ込めないでください。
- OCR 依存は `backend/requirements-ocr.txt` に分離してください。通常起動に不要な重い依存を `requirements.txt` に混ぜないでください。

### 変更後の確認コマンド

```bash
cd backend
pytest

cd ../frontend
npm run lint
npm run build
```

README だけの変更ではフルテストが必須ではありませんが、仕様に関わるコードを変更した場合は上記を確認してください。

### AI に渡す固定プロンプト

```text
このリポジトリでは README を仕様の正としてください。
最初に README、該当するバックエンド/フロントエンドコード、既存テストを読んでください。
実装前に、変更するファイル、評価ロジック、API 影響、テスト方針を含む実装計画を提示し、承認後に実装してください。

評価方針は「人が見て読みやすく、整っていて、黒板文字として伝わりやすいか」です。
チョーク体フォント、OCR 結果、参照マスクとの一致は補助情報であり、総合点の主基準にしないでください。

/analyze は file が必須で、corrected_text が指定された場合は OCR をスキップしてその文字列で再解析します。
/analyze の target_text は解析スコアに使わないでください。
/reference-preview は target_text から練習用プレビューを作る独立機能です。

API レスポンスを変える場合は backend/app/schemas.py、frontend/lib/api/schemas.ts、UI、テスト、README を同時に更新してください。
メトリクスを変える場合は、上手な黒板文字、崩れた文字、OCR 修正ありのケースをテストしてください。
既存の未関係な変更を戻さず、必要最小限の差分にしてください。
```

---

## ローカル開発と本番公開の考え方

| 環境           | 目的                     | 主な手段 |
|----------------|--------------------------|----------|
| **ローカル開発** | 手元ですぐ試す・API をデバッグする | Docker Compose、または Python venv + `npm run dev` |
| **本番公開**    | 不特定ユーザー向けに安定提供    | Docker 不使用で、ホスティング各社の標準デプロイ（環境変数で URL 連携） |

- **Docker / Docker Compose** はローカルの **開発・統合動作確認** 用であり、本番で Compose を動かす前提ではありません。
- API の実 URL はコードに書かず、**環境変数** で渡してください。

---

## Docker Compose で起動する（開発・動作確認用）

事前に **Docker Desktop** を起動してください。

```bash
docker compose up --build -d
```

| 確認内容 | URL |
|-----------|-----|
| フロント     | http://localhost:3000 |
| バックエンド | http://localhost:8000/health （`{"status":"ok",...}` が返れば OK） |

停止:

```bash
docker compose down
```

ログ確認（バックエンドのトラブルシュートなど）:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Compose では次を設定済みです。

- バックエンドに **`CHALK_FONT_PATH=/fonts/Chalk-JP.otf`**（`./backend/assets/fonts` を `/fonts` にマウント）
- バックエンドに **OCR 依存関係（`requirements-ocr.txt`）** をインストール
- EasyOCR のモデル保存先として **`/root/.EasyOCR`** を使い、named volume **`easyocr-cache`** にキャッシュ
- バックエンドに **`BACKEND_CORS_ORIGINS`**（例: `http://localhost:3000`, `http://127.0.0.1:3000`）
- フロントビルド引数 **`NEXT_PUBLIC_API_URL=http://localhost:8000`**（ブラウザがホスト上の API を参照）

初回 OCR 実行時は EasyOCR のモデル取得が走ることがあります。ネットワーク制限がある環境では、事前にモデルを用意するか、モデル取得が可能な状態で一度実行してください。

---

## Docker を使わないローカル開発

### バックエンド

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt

# OCR 解析を有効にする場合（任意）
# pip install -r requirements-ocr.txt

# チョーク体フォント（任意）
# set CHALK_FONT_PATH=C:\Users\masat\team20sai\backend\assets\fonts\Chalk-JP.otf

# （任意）CORS を開発用ブラウザ origin に限定する場合
# set BACKEND_CORS_ORIGINS=http://localhost:3000  （複数はカンマ区切り）
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

ヘルスチェック: http://127.0.0.1:8000/health  

### フロントエンド

```bash
cd frontend
npm install
```

`frontend/.env.example` を `.env.local` にコピーし、ローカル API に合わせます。

```bash
# frontend/.env.local の例
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

```bash
npm run dev
```

ブラウザ: http://localhost:3000（既定ポート）。

品質チェック:

```bash
npm run lint   # ESLint CLI
npm run build
```

---

## 本番公開時に使う環境変数

### フロント（Next.js）

| 変数 | 必須 | 説明 |
|------|------|------|
| `NEXT_PUBLIC_API_URL` | **推奨** | ブラウザが呼び出す API のベース URL（末尾スラッシュなし）。**ビルド時**に静的に埋め込まれます（Vercel では Project Settings の Environment Variables に設定）。 |

`NEXT_PUBLIC_API_URL` の未設定フォールバック（`http://127.0.0.1:8000`）は **開発時のみ** 利用されます。**本番環境で未設定の場合はエラーとして検出** されるため、必ず API の公開 URL を設定してください。

### バックエンド（FastAPI）

| 変数 | 必須 | 説明 |
|------|------|------|
| `BACKEND_CORS_ORIGINS` | **推奨** | アクセスを許可するブラウザの **Origin** をカンマ区切り（例: `https://my-app.vercel.app,https://www.example.com`）。 |
| `CHALK_FONT_PATH` | 任意 | お手本描画に使う **TTF/OTF** のパス。未設定時は開発用フォントで描画し、`notes` に記載。 |

- **設定あり**: 指定したオリジンのみ許可、`allow_credentials=true` と組み合わせ可能です。
- **未設定または空**: 開発のため **全オリジン許可相当** に近くなります（実装上 `allow_credentials` は無効）。**本番では必ず自分のフロントのオリジンを列挙してください。**

`.env.example`（リポジトリルートおよび `frontend/` / `backend/`）も参照してください。

---

## テスト（バックエンド）

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

`/health`、非画像の `/analyze`、OCR 未設定時の `/analyze`、`/analyze` への空ファイル・破損画像、文字線抽出・レイアウト評価・参照比較ロジックの単体テストなどを確認します。

## OCR について（任意）

- 通常セットアップは `pip install -r requirements.txt` です。
- OCR 解析を使う場合は `pip install -r requirements-ocr.txt` を追加で実行してください。
- Docker Compose では `requirements-ocr.txt` までインストールするため、コンテナ内でも OCR 解析を利用できます。
- OCR は optional 機能です。OCR 未導入でも API 起動、`/reference-preview`、`corrected_text` 指定の `/analyze` は利用できます。
- `/analyze` は通常 OCR モードです。`corrected_text` 指定時は手動修正モードで再解析します。
- OCR 未導入・初期化失敗時は 422 が返ります。
- OCR 実行中エラー、認識文字なし、信頼度が極端に低い場合も 422 を返し、ユーザー向けメッセージを返します。
- 初回 OCR 実行時はモデル取得が走る可能性があります。オフライン/制限環境では事前モデル配置やネットワーク許可が必要です。
- OCR 実装は lazy import + 分離構造で、将来的なエンジン差し替えを想定しています。

---

## よくあるトラブル

| 現象 | 対処 |
|------|------|
| `docker compose` が接続エラー | Docker Desktop が起動しているか確認。Windows では WSL バックエンドの有効化も確認してください。 |
| ポート競合 (`3000` / `8000`) | 他のアプリが使用中です。Compose のポートマッピングを変更するか、該当プロセスを停止してください。 |
| カメラが使えない | `https://` または localhost 由来の許可。**ファイルを選ぶ**でも解析できます。ブラウザのサイト権限を確認してください。 |
| フロントから API に届かない | `NEXT_PUBLIC_API_URL` とバックエンドの起動を確認。**ブラウザのコンソール**で CORS エラーになっていないか、`BACKEND_CORS_ORIGINS` にフロントの Origin が含まれているか確認してください。 |
| **`libGL.so.1` のような OpenCV の共有ライブラリエラー** | コンテナまたは OS に OpenGL／GL を提供するパッケージが必要です。本リポジトリの **`backend/Dockerfile` には `libgl1` を含めています**。ベアメタルの Linux で同様なら、`libgl1` などのインストールを検討してください。 |
| 権限不足（ファイルマウント等） | プロジェクトを書き込み可能な場所に置く、`docker compose` は管理者が不要な範囲で実行してください。 |

---

## リポジトリ構成（概要）

```
backend/          FastAPI・Dockerfile・tests・assets/fonts/（フォント配置用）
frontend/         Next.js・Dockerfile・.env.example
docker-compose.yml  ローカル開発用コンテナ構成
.env.example       全体メモ・参照用
```

---

## ライセンス・チーム

チーム開発用リポジトリ（春学期アプリ開発）です。
