import OpenAI from "openai";
import formidable from "formidable";
import fs from "node:fs";
import os from "node:os";

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

const COACH_PROMPT = `
あなたは世界一厳格な「イギリス英語（RP/Modern Standard British）」の発音矯正コーチです。
【最重要ルール】アメリカ英語の発音（General American）を「誤り」として指摘してください。
特に "Rather", "Can't", "Bath" などの /ɑː/ (TRAP-BATH split) や、語末の R を巻かない Non-rhoticity に厳格になってください。

回答は必ず以下のJSON形式のみで返してください：
{
  "analysis": {
    "britishness_score": number,
    "rhythm_score": number,
    "vowel_score": number,
    "detailed_feedback": "称賛、IPAを用いた精密分析、イントネーション、次へのアドバイスを含む熱血指導（日本語）",
    "ipa_target": "/target_ipa/"
  },
  "next_step": {
    "text": "次への誘い文（日本語）",
    "next_phrase": "次に練習するイギリス英語の例文"
  }
}
`.trim();

// フォーム解析のプロミス化
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ uploadDir: os.tmpdir(), keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // 1. データの受信
    const { fields, files } = await parseForm(req);
    const audioFile = files.audio?.[0] ?? files.audio;
    const targetPhrase = (fields.targetPhrase?.[0] ?? fields.targetPhrase ?? "").trim();

    if (!audioFile || !targetPhrase) {
      return res.status(400).json({ error: "音声ファイルまたはターゲットフレーズが足りません。" });
    }

    // 2. 文字起こし (Whisper)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: TRANSCRIBE_MODEL,
      language: "en",
    });
    const transcript = transcription.text;

    // 3. AI分析 (Chat Completion)
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        { role: "system", content: COACH_PROMPT },
        { 
          role: "user", 
          content: `Target: ${targetPhrase}\nUser Pronunciation: ${transcript}` 
        }
      ],
      response_format: { type: "json_object" }
    });

    // 4. 結果の解析と返却
    const analysis = JSON.parse(completion.choices[0].message.content);
    
    // 一時ファイルの削除
    fs.promises.unlink(audioFile.filepath).catch(() => {});

    return res.status(200).json({
      transcript,
      ...analysis
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ 
      error: "AIコーチが一時的に席を外しています（通信エラー）。",
      detail: error.message 
    });
  }
}import OpenAI from "openai";
import formidable from "formidable";
import fs from "node:fs";
import os from "node:os";

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

const COACH_PROMPT = `
あなたは世界一厳格な「イギリス英語（RP/Modern Standard British）」の発音矯正コーチです。
【最重要ルール】アメリカ英語の発音（General American）を「誤り」として指摘してください。
特に "Rather", "Can't", "Bath" などの /ɑː/ (TRAP-BATH split) や、語末の R を巻かない Non-rhoticity に厳格になってください。

回答は必ず以下のJSON形式のみで返してください：
{
  "analysis": {
    "britishness_score": number,
    "rhythm_score": number,
    "vowel_score": number,
    "detailed_feedback": "称賛、IPAを用いた精密分析、イントネーション、次へのアドバイスを含む熱血指導（日本語）",
    "ipa_target": "/target_ipa/"
  },
  "next_step": {
    "text": "次への誘い文（日本語）",
    "next_phrase": "次に練習するイギリス英語の例文"
  }
}
`.trim();

// フォーム解析のプロミス化
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ uploadDir: os.tmpdir(), keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // 1. データの受信
    const { fields, files } = await parseForm(req);
    const audioFile = files.audio?.[0] ?? files.audio;
    const targetPhrase = (fields.targetPhrase?.[0] ?? fields.targetPhrase ?? "").trim();

    if (!audioFile || !targetPhrase) {
      return res.status(400).json({ error: "音声ファイルまたはターゲットフレーズが足りません。" });
    }

    // 2. 文字起こし (Whisper)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: TRANSCRIBE_MODEL,
      language: "en",
    });
    const transcript = transcription.text;

    // 3. AI分析 (Chat Completion)
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        { role: "system", content: COACH_PROMPT },
        { 
          role: "user", 
          content: `Target: ${targetPhrase}\nUser Pronunciation: ${transcript}` 
        }
      ],
      response_format: { type: "json_object" }
    });

    // 4. 結果の解析と返却
    const analysis = JSON.parse(completion.choices[0].message.content);
    
    // 一時ファイルの削除
    fs.promises.unlink(audioFile.filepath).catch(() => {});

    return res.status(200).json({
      transcript,
      ...analysis
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ 
      error: "AIコーチが一時的に席を外しています（通信エラー）。",
      detail: error.message 
    });
  }
}