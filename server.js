import "dotenv/config";
import express from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.static(process.cwd(), { extensions: ["html"] }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

const COACH_PROMPT = `
あなたは「イギリス英語（RP寄り）発音コーチ」です。入力は targetPhrase（お手本）と transcript（ユーザーが実際に言った内容の文字起こし）です。

目的:
- ユーザーが targetPhrase を「イギリス英語らしく」言えるように、短く具体的に指導する。
- 初心者向けに、やることを1〜2個に絞る。
- 必ず「部分練習モード（partial practice）」として、練習すべき短い区間（3〜6語）を1つ選び、IPAとコツを出す。

評価観点:
- rhythm: 文章全体のリズム/強弱/繋げ方（linking, reduction）
- vowel: 母音の質（長短、/ɒ ɑː ʌ ɜː ə/ など）
- british: イギリス英語らしさ（非rhotic、Tの扱い、弱形、linking-r 等）

制約:
- 出力は必ず「JSONオブジェクトのみ」。前後に説明文を付けない。
- フィードバックは日本語。ただし IPA や音素はそのまま。
- transcript が空/意味不明/英語でない場合は、録り直しを促しつつ、推定でアドバイスしない（推測しない）。

JSONの形（キーは必ずこのまま）:
{
  "scores": { "rhythm": number, "vowel": number, "british": number },
  "strengths": string,
  "one_focus": string,
  "mouth_tip": string,
  "rhythm_tip": string,
  "vowel_tip": string,
  "british_tip": string,
  "action_items": string[],
  "drill": { "title": string, "ipa": string, "tip": string }
}

drillのルール:
- title: 例 "Partial practice: linking-r" のように短く
- ipa: 練習区間のIPA（スラッシュは不要。例: "ˈrɑːðər həv"）
- tip: その区間をどう言うか（口/舌/息/繋げ）を1〜2文で
`.trim();

function jsonError(res, status, message, extra = {}) {
  res.status(status).json({ error: message, ...extra });
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

app.post("/api/coach", upload.single("audio"), async (req, res) => {
  if (!openai) return jsonError(res, 500, "OPENAI_API_KEY が未設定です。.env を作成してください。");

  if (!req.file) return jsonError(res, 400, "audio ファイルが見つかりません。");

  const targetPhrase = String(req.body?.targetPhrase || "").trim();
  if (!targetPhrase) return jsonError(res, 400, "targetPhrase が空です。");

  const original = req.file.originalname || "recording.webm";
  const ext = path.extname(original) || ".webm";
  const tmpPath = path.join(os.tmpdir(), `britishapp-${randomUUID()}${ext}`);

  let transcript = "";
  try {
    await fs.promises.writeFile(tmpPath, req.file.buffer);

    const t = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: TRANSCRIBE_MODEL,
      language: "en",
      response_format: "json",
    });
    transcript = String(t?.text || "").trim();
  } catch (e) {
    console.error(e);
    const detail = e?.message || e?.error?.message || String(e);
    const hint = TRANSCRIBE_MODEL !== "whisper-1"
      ? "OPENAI_TRANSCRIBE_MODEL=whisper-1 を試してください。"
      : "APIキー・音声形式・ネットワークを確認してください。";
    return jsonError(res, 500, "文字起こしに失敗しました。", { detail, hint });
  } finally {
    fs.promises.unlink(tmpPath).catch(() => {});
  }

  // 文字起こしが空でも、分析プロンプト側で録り直し案内を返す
  let analysisText = "";
  try {
    const r = await openai.responses.create({
      model: ANALYSIS_MODEL,
      input: [
        { role: "system", content: COACH_PROMPT },
        {
          role: "user",
          content: [
            `targetPhrase: ${targetPhrase}`,
            `transcript: ${transcript || "(empty)"}`,
            "",
            "上の情報だけで、指定JSONを返してください。",
          ].join("\n"),
        },
      ],
      text: { format: { type: "json_object" } },
    });

    analysisText = String(r?.output_text || "").trim();
    const parsed = safeJsonParse(analysisText);
    if (!parsed.ok) {
      return jsonError(res, 500, "分析JSONの解析に失敗しました。", { raw: analysisText });
    }

    return res.json({
      transcript,
      ...(parsed.value || {}),
    });
  } catch (e) {
    console.error(e);
    return jsonError(res, 500, "AI分析に失敗しました。", { raw: analysisText });
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/test.html`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\nポート ${PORT} は既に使用中です。`);
    console.error(`対処1: 別ポートで起動 → PowerShellで: $env:PORT=3001; npm run dev`);
    console.error(`対処2: 3000番を使っているプロセスを終了（netstat/taskkill）`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

