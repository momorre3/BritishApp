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

