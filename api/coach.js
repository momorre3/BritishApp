import OpenAI from "openai";
import formidable from "formidable";
import fs from "node:fs";
import os from "node:os";

// --- Vercel専用設定: ボディ解析を無効化（ファイルアップロードに必須） ---
export const config = {
  api: {
    bodyParser: false,
  },
};

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

const COACH_PROMPT = `
あなたは世界一厳格な「イギリス英語（RP）」の矯正コーチです。必ずJSON形式で回答してください。
内容には以下の項目を含めてください：
1. analysis: { britishness_score, rhythm_score, vowel_score, detailed_feedback, ipa_target }
2. next_step: { text, next_phrase }
※詳細なフィードバックは熱血な日本語で、IPA記号を必ず含めてください。
`.trim();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // 1. フォームデータの解析
    const data = await new Promise((resolve, reject) => {
      const form = formidable({ uploadDir: os.tmpdir(), keepExtensions: true });
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const audioFile = data.files.audio?.[0] || data.files.audio;
    const targetPhrase = (data.fields.targetPhrase?.[0] || data.fields.targetPhrase || "").trim();

    if (!audioFile || !targetPhrase) {
      return res.status(400).json({ error: "Missing audio or phrase." });
    }

    // 2. Whisperで文字起こし
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: TRANSCRIBE_MODEL,
      language: "en",
    });

    // 3. GPTで分析
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        { role: "system", content: COACH_PROMPT },
        { role: "user", content: `Target: ${targetPhrase}\nUser: ${transcription.text}` }
      ],
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    // 一時ファイルの削除
    fs.promises.unlink(audioFile.filepath).catch(() => {});

    // 成功レスポンス
    return res.status(200).json({
      transcript: transcription.text,
      ...analysis
    });

  } catch (error) {
    console.error("Vercel Function Error:", error);
    return res.status(500).json({ 
      error: "AIコーチが通信エラーを起こしました。",
      detail: error.message 
    });
  }
}