# BritishApp（押してる間だけ録音 → Whisper → 英語コーチ）

## 1) 事前準備（OpenAI APIキー）

- OpenAIのAPIキーを作成します: [API Keys](https://platform.openai.com/api-keys)
- このフォルダに `.env` を作り、下のように書きます（`.env.example` をコピーしてOK）

```bash
OPENAI_API_KEY=sk-...
```

## 2) 起動方法（Windows / PowerShell）

このプロジェクトのフォルダ（`test.html` と `server.js` がある場所）で実行します。

```bash
npm install
npm run dev
```

起動したらブラウザで次を開きます（**マイクのために file:// ではなく localhost で開く**）:

- `http://localhost:3000/test.html`

## 3) 使い方

- 赤い録音ボタンを**押している間だけ録音**します
- 離すと録音が止まり、音声がサーバーへ送られます
- サーバー側で文字起こし→「イギリス英語コーチ」分析→結果が返り、
  - **スコア欄（Rhythm/Vowel/British）**
  - **文字起こし欄**
  - **フィードバック欄**
  - **Focus Drill（部分練習）**
  が自動更新されます

## 4) よくあるエラー

- **マイクが動かない**
  - `http://localhost:3000/test.html` で開いているか確認（`file://` だと動かないことがあります）
  - ブラウザのサイト権限でマイクを「許可」にする
- **文字起こしが失敗する**
  - `.env` の `OPENAI_API_KEY` が正しいか確認
  - `OPENAI_TRANSCRIBE_MODEL=whisper-1` に変更して再起動してみる

## 5) Vercel にデプロイする場合

- リポジトリを GitHub に push したあと、Vercel で「New Project」→ リポジトリを選択 → Deploy
- **環境変数**を必ず設定: Vercel の Project → Settings → Environment Variables で `OPENAI_API_KEY` を追加
- トップURL（`https://あなたのプロジェクト.vercel.app/`）で開くと **test.html の内容が表示**されます（`vercel.json` で `/` を `/test.html` にリライトしています）
- 録音は **約4MBまで**（Vercel の制限）。長い録音は短く区切ってください

**404 NOT_FOUND が出ていた場合**  
上記の `vercel.json` と `api/coach.js` を追加したうえで、もう一度デプロイ（push または Vercel の Redeploy）してください。
