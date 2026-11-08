// Tamil note (text or voice) → English translation + reason category, via
// Groq's OpenAI-compatible API over plain fetch. Any failure falls back to the
// keyword classifier and the note goes to the review inbox. A failed AI call
// never loses the supervisor's entry: the entry is committed before this runs.
import { z } from 'zod';
import { config } from '../config.js';
import { CATEGORIES, CATEGORY_DEFINITIONS } from './categories.js';
import { classifyByKeywords, KEYWORD_CONFIDENCE } from './keywordClassifier.js';
import { findNote, saveNoteAiResult } from '../db/queries/notes.js';
import { findMediaBytes } from '../db/queries/media.js';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const TIMEOUT_MS = 20000;
const REVIEW_THRESHOLD = 0.6;
const STUCK_AFTER_MS = 2 * 60 * 1000;

const EXTENSIONS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

async function groqFetch(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${GROQ_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.groq.apiKey}`, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq ${response.status}: ${body.slice(0, 200)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function transcribe(bytes, mime) {
  const form = new FormData();
  const extension = EXTENSIONS[mime.split(';')[0]] ?? 'webm';
  form.append('file', new Blob([bytes], { type: mime }), `note.${extension}`);
  form.append('model', config.groq.sttModel);
  form.append('language', 'ta');
  form.append('response_format', 'json');
  const json = await groqFetch('/audio/transcriptions', { method: 'POST', body: form });
  if (!json.text) throw new Error('Transcription returned no text');
  return json.text.trim();
}

const resultSchema = z.object({
  english_translation: z.string().min(1),
  category: z.enum(CATEGORIES),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

function systemPrompt() {
  const list = CATEGORIES.map((c) => `- ${c}: ${CATEGORY_DEFINITIONS[c]}`).join('\n');
  return `You read short notes written by garment factory floor supervisors in Tamil (often mixed with English words).
Translate the note into plain English and pick the ONE reason category that best explains a production delay.

Categories:
${list}

Reply with ONLY this JSON object and nothing else:
{"english_translation": string, "category": one of the category codes above, "confidence": number between 0 and 1, "reason": short string}

Use "OTHER" with a low confidence (below 0.5) when the note is unclear, is not about a delay, or fits no category.`;
}

async function classify(tamilText) {
  const json = await groqFetch('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.groq.llmModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: tamilText },
      ],
    }),
  });
  const content = json.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = resultSchema.safeParse(JSON.parse(content));
  } catch {
    throw new Error('AI returned invalid JSON');
  }
  if (!parsed.success) throw new Error('AI returned an unexpected result');
  return parsed.data;
}

// The whole flow for one note. Safe to call again (Retry AI).
export async function processNote(noteId) {
  const note = await findNote(noteId);
  if (!note || note.status === 'confirmed') return;
  let transcript = note.transcript_ta;
  try {
    if (!config.groq.apiKey) throw new Error('GROQ_API_KEY is not set');
    if (!note.original_text && note.audio_media_id && !transcript) {
      const media = await findMediaBytes(note.audio_media_id);
      transcript = await transcribe(media.bytes, media.mime);
    }
    const source = note.original_text || transcript;
    if (!source) throw new Error('Nothing to classify');
    const result = await classify(source);
    await saveNoteAiResult(noteId, {
      transcriptTa: transcript,
      translationEn: result.english_translation,
      category: result.category,
      confidence: result.confidence,
      source: 'groq',
      status: result.confidence >= REVIEW_THRESHOLD ? 'suggested' : 'needs_review',
    });
  } catch (error) {
    const { category } = classifyByKeywords(note.original_text || transcript || '');
    await saveNoteAiResult(noteId, {
      transcriptTa: transcript,
      translationEn: null,
      category,
      confidence: KEYWORD_CONFIDENCE,
      source: 'keywords',
      status: 'needs_review',
      error: String(error.message ?? error).slice(0, 500),
    });
  }
}

// Fire and forget after the entry is saved; errors are logged, never thrown.
export function processNoteInBackground(noteId) {
  processNote(noteId).catch((error) => console.error(`AI processing failed for note ${noteId}`, error));
}

// A note still "processing" after 2 minutes is treated as failed (server restart).
export function isStuck(note) {
  return note.status === 'processing' && Date.now() - new Date(note.ai_started_at).getTime() > STUCK_AFTER_MS;
}
