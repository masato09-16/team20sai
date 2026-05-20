# チョーク体フォント（ユーザー配置）

ライセンスの都合で、**フォントファイルはリポジトリに同梱していません**。
`Chalk-JP.otf` を利用する場合も、**各環境で `backend/assets/fonts/Chalk-JP.otf` を配置**してください（Git 管理対象外）。

お手本テキストをチョーク風にレンダリングするには、手元で入手したフォント（例: `.ttf` / `.otf`）をこのディレクトリに置き、環境変数 **`CHALK_FONT_PATH`** にその絶対パスまたはコンテナ内パスを指定してください。

例（ローカル）:

```bash
set CHALK_FONT_PATH=C:\Users\masat\team20sai\backend\assets\fonts\Chalk-JP.otf
```

`CHALK_FONT_PATH` が未設定、またはファイルが存在しない場合は **Pillow のビルトインフォント**にフォールバックし、レスポンスの `notes` に「チョーク体フォント未設定」と表示されます（形状比較の参考値として利用してください）。

`docker-compose.yml` では `CHALK_FONT_PATH=/fonts/Chalk-JP.otf` を既定で設定しています（`./backend/assets/fonts` を `/fonts` にマウント）。
