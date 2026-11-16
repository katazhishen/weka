// 语音：SILK 解码 + SenseVoice 本地离线转写 + 转写缓存
//
// 数据来源：微信 4.0 把语音存在 media_0.db 的 VoiceInfo.voice_data（BLOB，带 0x02 前缀的 SILK）
// 解码：silk-wasm（纯 WASM）→ PCM 16bit 16kHz
// 识别：sherpa-onnx-node + SenseVoice int8 模型（本地离线，不联网）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'

const require = createRequire(import.meta.url)
const WEKA_ROOT = path.resolve(import.meta.dirname, '..')

export const MODEL_DIR =
  process.env.WEKA_MODEL_DIR || path.join(WEKA_ROOT, 'models', 'sensevoice-int8')
export const MODEL_FILE = path.join(MODEL_DIR, 'model.int8.onnx')
export const TOKENS_FILE = path.join(MODEL_DIR, 'tokens.txt')

const ARCHIVE = path.join(os.homedir(), '.weka', 'archive.db')
const SAMPLE_RATE = 16000

/* ---------------- 转写缓存（落在 weka 自己的 archive.db） ---------------- */
let _cacheDb
function cacheDb() {
  if (_cacheDb) return _cacheDb
  fs.mkdirSync(path.dirname(ARCHIVE), { recursive: true })
  _cacheDb = new DatabaseSync(ARCHIVE)
  _cacheDb.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      account TEXT NOT NULL,
      session TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      duration_ms INTEGER,
      created_at INTEGER,
      PRIMARY KEY (account, session, local_id)
    );
  `)
  return _cacheDb
}

export function getCachedTranscript(account, session, localId) {
  try {
    const row = cacheDb()
      .prepare('SELECT text, duration_ms FROM transcripts WHERE account = ? AND session = ? AND local_id = ?')
      .get(account, session, localId)
    return row ? { text: String(row.text || ''), durationMs: Number(row.duration_ms || 0), cached: true } : null
  } catch {
    return null
  }
}

export function putTranscript(account, session, localId, text, durationMs) {
  try {
    cacheDb()
      .prepare(
        `INSERT INTO transcripts (account, session, local_id, text, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account, session, local_id) DO UPDATE SET text = excluded.text, duration_ms = excluded.duration_ms`
      )
      .run(account, session, localId, String(text || ''), Math.round(durationMs || 0), Date.now())
  } catch {
    /* ignore */
  }
}

export function transcriptStats(account) {
  try {
    const row = cacheDb()
      .prepare('SELECT COUNT(*) AS c FROM transcripts WHERE account = ?')
      .get(account)
    return { count: Number(row?.c ?? 0) }
  } catch {
    return { count: 0 }
  }
}

/** 批量取一批消息的转写（单次 SQL），返回 Map(localId → text) */
export function getTranscriptsFor(account, session, localIds) {
  const map = new Map()
  const ids = (localIds || []).filter((x) => Number.isFinite(Number(x)))
  if (!ids.length) return map
  try {
    const db = cacheDb()
    const placeholders = ids.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT local_id, text FROM transcripts
         WHERE account = ? AND session = ? AND local_id IN (${placeholders})`
      )
      .all(account, session, ...ids.map(Number))
    for (const r of rows) map.set(Number(r.local_id), String(r.text || ''))
  } catch {
    /* ignore */
  }
  return map
}

/** 某个会话已转写的语音条数 */
export function countTranscriptsFor(account, session) {
  try {
    const row = cacheDb()
      .prepare('SELECT COUNT(*) AS c FROM transcripts WHERE account = ? AND session = ?')
      .get(account, session)
    return Number(row?.c ?? 0)
  } catch {
    return 0
  }
}

/** 全文搜索：转写文本（供 /api/search 用） */
export function searchTranscripts(account, keyword, { session = '', limit = 50 } = {}) {
  try {
    const db = cacheDb()
    const like = `%${String(keyword).replace(/[%_]/g, (c) => '\\' + c)}%`
    const rows = session
      ? db
          .prepare(
            `SELECT session, local_id, text FROM transcripts WHERE account = ? AND session = ? AND text LIKE ? ESCAPE '\\' LIMIT ?`
          )
          .all(account, session, like, limit)
      : db
          .prepare(
            `SELECT session, local_id, text FROM transcripts WHERE account = ? AND text LIKE ? ESCAPE '\\' LIMIT ?`
          )
          .all(account, like, limit)
    return rows.map((r) => ({ session: String(r.session), localId: Number(r.local_id), text: String(r.text) }))
  } catch {
    return []
  }
}

/* ---------------- 模型就绪状态 ---------------- */
export function modelStatus() {
  const haveModel = fs.existsSync(MODEL_FILE)
  const haveTokens = fs.existsSync(TOKENS_FILE)
  return {
    dir: MODEL_DIR,
    ready: haveModel && haveTokens,
    modelBytes: haveModel ? fs.statSync(MODEL_FILE).size : 0,
    tokensBytes: haveTokens ? fs.statSync(TOKENS_FILE).size : 0,
  }
}

/* ---------------- SILK → PCM ---------------- */
let _silk
function silk() {
  if (_silk) return _silk
  const p = path.join(WEKA_ROOT, 'vendor', 'silk-wasm', 'lib', 'index.cjs')
  if (!fs.existsSync(p)) throw new Error('缺少 vendor/silk-wasm（SILK 解码器）')
  _silk = require(p)
  return _silk
}

/**
 * 解码微信语音 blob（含 0x02 前缀的 SILK）
 * @returns {Promise<{pcm: Buffer, durationMs: number}>}
 */
export async function decodeSilk(blob, sampleRate = SAMPLE_RATE) {
  const lib = silk()
  const res = await lib.decode(new Uint8Array(blob), sampleRate)
  return { pcm: Buffer.from(res.data), durationMs: Number(res.duration || 0) }
}

/* ---------------- sherpa-onnx 识别器 ---------------- */
let _recognizer = null
function recognizer() {
  if (_recognizer) return _recognizer
  const status = modelStatus()
  if (!status.ready) {
    throw new Error('SenseVoice 模型未就绪：请把 model.int8.onnx 与 tokens.txt 放到 ' + MODEL_DIR)
  }
  const sherpaPath = path.join(WEKA_ROOT, 'vendor', 'sherpa-onnx-node', 'sherpa-onnx.js')
  if (!fs.existsSync(sherpaPath)) throw new Error('缺少 vendor/sherpa-onnx-node')
  const sherpa = require(sherpaPath)
  const numThreads = Math.max(1, Math.floor(os.cpus().length / 2))
  _recognizer = new sherpa.OfflineRecognizer({
    modelConfig: {
      senseVoice: {
        model: MODEL_FILE.replace(/\\/g, '/'),
        language: 'zh',
        useInverseTextNormalization: 1,
      },
      tokens: TOKENS_FILE.replace(/\\/g, '/'),
      numThreads,
      debug: 0,
      provider: 'cpu',
    },
  })
  return _recognizer
}

/** 清掉 SenseVoice 输出里的语言/情绪标记 */
function cleanText(t) {
  return String(t || '')
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** PCM(int16) → Float32 样本 */
function pcmToSamples(pcm) {
  const n = Math.floor(pcm.length / 2)
  const samples = new Float32Array(n)
  for (let i = 0; i < n; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  return samples
}

/**
 * 转写一段语音 blob
 * @returns {Promise<{text: string, durationMs: number, elapsedMs: number}>}
 */
export async function transcribeBlob(blob) {
  const t0 = performance.now()
  const { pcm, durationMs } = await decodeSilk(blob)
  const rec = recognizer()
  const stream = rec.createStream()
  stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: pcmToSamples(pcm) })
  rec.decode(stream)
  const result = rec.getResult(stream)
  if (stream.free) stream.free()
  return { text: cleanText(result?.text), durationMs, elapsedMs: +(performance.now() - t0).toFixed(0) }
}

/* ---------------- 从库里取语音 blob ---------------- */
/**
 * @param {import('./repo.mjs').AccountRepo} repo
 * @param {string} session 会话用户名
 * @param {number} localId 消息 local_id
 * @param {number} createTime 消息 create_time（秒）
 * @param {string} serverId 消息 server_id（更精确，优先用）
 */
export function findVoiceBlob(repo, session, localId, createTime, serverId) {
  const mediaPath = path.join(repo.dbStorage, 'message', 'media_0.db')
  if (!fs.existsSync(mediaPath)) return null
  const db = repo.openSource(mediaPath)
  if (!db) return null
  try {
    const cid = db.prepare('SELECT rowid AS id FROM Name2Id WHERE user_name = ?').get(session)
    const cidNum = cid ? Number(cid.id) : null

    // 1) server_id 精确匹配（最可靠）
    if (serverId) {
      const r = db.prepare('SELECT voice_data FROM VoiceInfo WHERE svr_id = ? LIMIT 1').get(String(serverId))
      if (r?.voice_data) return Buffer.from(r.voice_data)
    }
    // 2) (会话, local_id) 匹配
    if (cidNum !== null) {
      const r = db
        .prepare('SELECT voice_data FROM VoiceInfo WHERE chat_name_id = ? AND local_id = ? LIMIT 1')
        .get(cidNum, localId)
      if (r?.voice_data) return Buffer.from(r.voice_data)
    }
    // 3) create_time 兜底（同秒多条取第一条）
    if (createTime) {
      const r = db
        .prepare('SELECT voice_data FROM VoiceInfo WHERE create_time = ? ORDER BY rowid ASC LIMIT 1')
        .get(createTime)
      if (r?.voice_data) return Buffer.from(r.voice_data)
    }
    return null
  } catch {
    return null
  }
}

/**
 * 转写某条语音消息（带缓存）
 * @returns {Promise<{ok: boolean, text?: string, cached?: boolean, durationMs?: number, elapsedMs?: number, error?: string}>}
 */
export async function transcribeMessage(repo, session, localId, createTime, serverId) {
  const account = repo.myWxid
  const cached = getCachedTranscript(account, session, localId)
  if (cached) return { ok: true, text: cached.text, cached: true, durationMs: cached.durationMs }
  if (!modelStatus().ready) return { ok: false, error: '模型未就绪' }
  const blob = findVoiceBlob(repo, session, localId, createTime, serverId)
  if (!blob) return { ok: false, error: '没有找到该语音的原始数据' }
  try {
    const r = await transcribeBlob(blob)
    putTranscript(account, session, localId, r.text, r.durationMs)
    return { ok: true, text: r.text, cached: false, durationMs: r.durationMs, elapsedMs: r.elapsedMs }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * 批量转写某个会话的语音消息
 * @param {{limit?: number, onProgress?: (done:number, total:number, item:object)=>void}} opts
 */
export async function transcribeSession(repo, session, { limit = 50, onProgress } = {}) {
  const res = repo.listMessages(session, { limit: 500, antiRevoke: false })
  const voices = res.messages.filter((m) => m.type === 34)
  const todo = []
  for (const m of voices) {
    if (getCachedTranscript(repo.myWxid, session, m.localId)) continue
    todo.push(m)
  }
  const target = todo.slice(0, limit)
  let done = 0
  const results = []
  for (const m of target) {
    const r = await transcribeMessage(repo, session, m.localId, Math.round(m.timeMs / 1000), m.serverId)
    done++
    results.push({ localId: m.localId, ok: r.ok, text: r.text || '', error: r.error })
    onProgress?.(done, target.length, { localId: m.localId, ok: r.ok, text: r.text })
  }
  return { total: voices.length, pending: todo.length, processed: results.length, results }
}

