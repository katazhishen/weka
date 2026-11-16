// 防撤回：基于"快照差分"的自建归档
// 思路：微信撤回消息是从 Msg 表里删除行；weka 每次读取会话时把当前消息快照存入自己的归档库，
//      下次读取时若某条曾经存在的消息在当前窗口内消失，就判定为撤回，保留原文并可回显。
//      （不改动微信自己的数据库，纯本地旁路归档）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'

const ARCHIVE = path.join(os.homedir(), '.weka', 'archive.db')

let db
function conn() {
  if (db) return db
  fs.mkdirSync(path.dirname(ARCHIVE), { recursive: true })
  db = new DatabaseSync(ARCHIVE)
  db.exec(`
    CREATE TABLE IF NOT EXISTS msg_archive (
      account TEXT NOT NULL,
      session TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      sort_seq INTEGER,
      create_time INTEGER,
      local_type INTEGER,
      sender TEXT,
      content TEXT,
      first_seen INTEGER,
      last_seen INTEGER,
      recalled_at INTEGER,
      PRIMARY KEY (account, session, local_id)
    );
    CREATE INDEX IF NOT EXISTS idx_archive_session ON msg_archive(account, session, recalled_at);
  `)
  return db
}

const now = () => Date.now()

/**
 * 观察一次会话（把当前窗口内的消息快照进归档，并检测消失的消息）
 * @param {string} account
 * @param {string} session
 * @param {Array<{localId:number,sortSeq:number,timeMs:number,type:number,sender:string,text:string,label:string}>} messages 窗口内消息（时间正序）
 * @returns {{newRecalled:number}}
 */
export function observe(account, session, messages) {
  if (!messages?.length) return { newRecalled: 0 }
  const d = conn()
  const t = now()
  const windowMin = Math.min(...messages.map((m) => m.sortSeq || 0))
  const windowMax = Math.max(...messages.map((m) => m.sortSeq || 0))

  const upsert = d.prepare(`
    INSERT INTO msg_archive (account, session, local_id, sort_seq, create_time, local_type, sender, content, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account, session, local_id) DO UPDATE SET
      last_seen = excluded.last_seen,
      content = CASE WHEN excluded.content <> '' THEN excluded.content ELSE msg_archive.content END
  `)
  const liveIds = new Set()
  for (const m of messages) {
    liveIds.add(m.localId)
    const text = m.text || ''
    const stored = m.label ? `${m.label} ${text}`.trim() : text
    upsert.run(account, session, m.localId, m.sortSeq || 0, Math.round((m.timeMs || 0) / 1000), m.type || 0, m.sender || '', stored, t, t)
  }

  // 窗口内曾经出现、现在消失 → 判定撤回
  const candidates = d
    .prepare(
      `SELECT local_id FROM msg_archive
       WHERE account = ? AND session = ? AND recalled_at IS NULL
         AND sort_seq >= ? AND sort_seq <= ?
         AND last_seen < ?`
    )
    .all(account, session, windowMin, windowMax, t)
  let newRecalled = 0
  const mark = d.prepare(
    'UPDATE msg_archive SET recalled_at = ? WHERE account = ? AND session = ? AND local_id = ?'
  )
  for (const row of candidates) {
    if (liveIds.has(Number(row.local_id))) continue
    mark.run(t, account, session, Number(row.local_id))
    newRecalled++
  }
  return { newRecalled }
}

/** 已撤回（被删掉）的消息 */
export function listRecalled(account, session, { limit = 200 } = {}) {
  const d = conn()
  const rows = d
    .prepare(
      `SELECT local_id, sort_seq, create_time, local_type, sender, content, recalled_at
       FROM msg_archive
       WHERE account = ? AND session = ? AND recalled_at IS NOT NULL
       ORDER BY sort_seq DESC LIMIT ?`
    )
    .all(account, session, limit)
  return rows.map((r) => ({
    localId: Number(r.local_id),
    sortSeq: Number(r.sort_seq),
    timeMs: Number(r.create_time) * 1000,
    type: Number(r.local_type),
    sender: String(r.sender || ''),
    text: String(r.content || ''),
    recalledAt: Number(r.recalled_at),
  }))
}

/** 归档统计 */
export function archiveStats(account) {
  const d = conn()
  const total = d.prepare('SELECT COUNT(*) AS c FROM msg_archive WHERE account = ?').get(account)
  const recalled = d
    .prepare('SELECT COUNT(*) AS c FROM msg_archive WHERE account = ? AND recalled_at IS NOT NULL')
    .get(account)
  return { total: Number(total?.c ?? 0), recalled: Number(recalled?.c ?? 0) }
}

/** 从 WeFlow 留下的防撤回缓存表里读（如果之前抓到了） */
export function readWeFlowCache(repo, username, tableName, decodeFn) {
  const out = []
  try {
    const dbFile = repo.tableIndex.get(tableName.toLowerCase())
    if (!dbFile) return out
    const db = repo.openSource(dbFile)
    if (!db) return out
    const exists = db
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='_weflow_anti_revoke_deleted_cache'")
      .get()
    if (!Number(exists?.c ?? 0)) return out
    const rows = db
      .prepare(
        `SELECT local_id, local_type, sort_seq, real_sender_id, create_time, message_content,
                WCDB_CT_message_content AS ct, deleted_at
         FROM _weflow_anti_revoke_deleted_cache WHERE tbl = ? ORDER BY sort_seq DESC LIMIT 200`
      )
      .all(tableName)
    for (const r of rows) {
      out.push({
        localId: Number(r.local_id),
        sortSeq: Number(r.sort_seq),
        timeMs: Number(r.create_time) * 1000,
        type: Number(r.local_type) & 0xffffffff,
        senderId: Number(r.real_sender_id),
        text: decodeFn(r.message_content, r.ct).slice(0, 2000),
        recalledAt: Number(r.deleted_at) * 1000,
        source: 'weflow',
      })
    }
  } catch {
    /* ignore */
  }
  return out
}

export const archivePath = ARCHIVE
