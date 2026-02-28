import OpenAI from "openai";
import formidable from "formidable";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

const COACH_PROMPT = `
あなたは世界一厳格な「イギリス英語（RP/Modern Standard British）」の発音矯正コーチです。【最重要ルール】アメリカ英語の発音（General American）を「誤り」として指摘してください。特に以下の「TRAP-BATH split」に厳格になってください："Rather", "Can't", "Bath", "Fast", "Dance" などの A は、アメリカ式の /æ/ ではなく、必ずイギリス式の長い /ɑː/ (Open back unrounded vowel) で判定すること。語末の R (rhoticity) を巻いて発音したら、即座に「アメリカ人っぽいので、Rを消して母音を伸ばしてください」と指摘してください。"Water" や "Better" の T が、アメリカ式の弾き音（フラップT /d/ のような音）になったら厳しく注意し、クリアな /t/ またはイギリス特有の声門閉鎖音（Glottal stop）を推奨してください。【フィードバック形式】Britishness Score: 完璧なRPなら100点。アメリカっぽさが混じると大幅減点。Point: 「イギリス英語ではこう発音します」という対比を必ず入れてください。例：「Rather は /æ/ ではなく /ɑː/ です。ロンドンの地下鉄のアナウンスを思い出して！」

入力は targetPhrase（お手本）と transcript（ユーザーが実際に言った内容の文字起こし）です。

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

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const uploadDir = os.tmpdir();
    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 4 * 1024 * 1024,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  if (!openai) {
    return jsonError(res, 500, "OPENAI_API_KEY が未設定です。Vercelの環境変数を設定してください。");
  }

  let fields;
  let files;
  try {
    const parsed = await parseForm(req);
    fields = parsed.fields;
    files = parsed.files;
  } catch (e) {
    console.error(e);
    return jsonError(res, 400, "フォームの解析に失敗しました。");
  }

  const audioFile = files.audio?.[0] ?? files.audio;
  if (!audioFile?.filepath) {
    return jsonError(res, 400, "audio ファイルが見つかりません。");
  }

  const targetPhrase = (fields.targetPhrase?.[0] ?? fields.targetPhrase ?? "").trim();
  if (!targetPhrase) {
    return jsonError(res, 400, "targetPhrase が空です。");
  }

  const tmpPath = audioFile.filepath;
  let transcript = "";
  try {
    const t = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: TRANSCRIBE_MODEL,
      language: "en",
      response_format: "json",
    });
    transcript = String(t?.text ?? "").trim();
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

    analysisText = String(r?.output_text ?? "").trim();
    const parsed = safeJsonParse(analysisText);
    if (!parsed.ok) {
      return jsonError(res, 500, "分析JSONの解析に失敗しました。", { raw: analysisText });
    }

    return res.status(200).json({
      transcript,
      ...(parsed.value || {}),
    });
  } catch (e) {
    console.error(e);
    return jsonError(res, 500, "AI分析に失敗しました。", { raw: analysisText });
  }
}
