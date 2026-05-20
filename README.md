# 板書チェック（板書上達支援 MVP）

黒板・ホワイトボードなどの画像を **アップロード** または **カメラで撮影** し、**お手本テキスト**（板書に書いた内容と同じ文字列）と照らし合わせて解析します。OCR は使わず、サーバー側でお手本をチョーク風フォント画像として合成し、写真から抽出した線のマスクとの **形状誤差** からスコアを出します。

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

multipart/form-data で **`file`**（画像）と **`target_text`**（お手本テキスト）が必要です。`target_text` が空の場合は HTTP 400 を返します。

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
- バックエンドに **`BACKEND_CORS_ORIGINS`**（例: `http://localhost:3000`, `http://127.0.0.1:3000`）
- フロントビルド引数 **`NEXT_PUBLIC_API_URL=http://localhost:8000`**（ブラウザがホスト上の API を参照）

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

`/health`、非画像の `/analyze`、`target_text` 空の `/analyze`、`/analyze` への空ファイル・破損画像、参照比較ロジックの単体テストなどを確認します。

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
