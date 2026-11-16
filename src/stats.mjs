// 统计分析：单聊/群聊分析、年度报告、数据盘点
import path from 'node:path'
import fs from 'node:fs'
import { messageTableName } from './repo.mjs'
import { countTranscriptsFor } from './voice.mjs'

const TYPE_NAME = {
  1: '文本',
  3: '图片',
  34: '语音',
  42: '名片',
  43: '视频',
  47: '表情',
  48: '位置',
  49: '链接/卡片',
  50: '通话',
  10000: '系统',
}

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`

/** 单个会话的统计（单聊/群聊通用） */
export function sessionAnalytics(repo, username) {
  const table = messageTableName(username)
  const dbFile = repo.tableIndex.get(table.toLowerCase())
  if (!dbFile) return { ok: false, error: '没有找到该会话的消息表', table }
  const db = repo.openSource(dbFile)
  if (!db) return { ok: false, error: '消息库打开失败', table }

  const base = db
    .prepare(
      `SELECT COUNT(*) AS total, MIN(create_time) AS first, MAX(create_time) AS last,
              COUNT(DISTINCT real_sender_id) AS senders
       FROM ${table}`
    )
    .get()
  const total = Number(base?.total ?? 0)
  if (!total) return { ok: true, table, total: 0, username, displayName: repo.displayName(username) }

  const byHour = new Array(24).fill(0)
  for (const r of db
    .prepare(
      `SELECT CAST(strftime('%H', create_time, 'unixepoch', 'localtime') AS INTEGER) AS h, COUNT(*) AS c
       FROM ${table} GROUP BY h`
    )
    .all()) {
    const h = Number(r.h)
    if (h >= 0 && h < 24) byHour[h] = Number(r.c)
  }

  const byWeekday = new Array(7).fill(0)
  for (const r of db
    .prepare(
      `SELECT CAST(strftime('%w', create_time, 'unixepoch', 'localtime') AS INTEGER) AS w, COUNT(*) AS c
       FROM ${table} GROUP BY w`
    )
    .all()) {
    byWeekday[Number(r.w)] = Number(r.c)
  }

  const byMonth = []
  for (const r of db
    .prepare(
      `SELECT strftime('%Y-%m', create_time, 'unixepoch', 'localtime') AS m, COUNT(*) AS c
       FROM ${table} GROUP BY m ORDER BY m`
    )
    .all()) {
    byMonth.push({ month: String(r.m), count: Number(r.c) })
  }

  const typeRaw = db
    .prepare(
      `SELECT (local_type & 4294967295) AS t, COUNT(*) AS c FROM ${table} GROUP BY t ORDER BY c DESC`
    )
    .all()
  const byType = typeRaw.map((r) => ({
    type: Number(r.t),
    name: TYPE_NAME[Number(r.t)] || `类型 ${Number(r.t)}`,
    count: Number(r.c),
  }))

  const senderRows = db
    .prepare(
      `SELECT real_sender_id AS sid, COUNT(*) AS c FROM ${table} GROUP BY sid ORDER BY c DESC LIMIT 15`
    )
    .all()
  const nameMap = repo.nameMapFor(dbFile, db)
  const topSenders = senderRows.map((r) => {
    const user = nameMap.get(Number(r.sid)) || ''
    return {
      username: user,
      name: user === repo.myWxidShort || user === repo.myWxid ? '我' : repo.displayName(user) || user,
      count: Number(r.c),
      isMine: user === repo.myWxidShort || user === repo.myWxid,
    }
  })

  const firstTs = Number(base?.first ?? 0)
  const lastTs = Number(base?.last ?? 0)
  const days = Math.max(1, Math.round((lastTs - firstTs) / 86400) + 1)

  // 发送 / 接收拆分（用于环形图）
  let sent = 0
  try {
    const myId = db.prepare('SELECT rowid AS id FROM Name2Id WHERE user_name = ?').get(repo.myWxidShort)
    if (myId) {
      sent = Number(db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE real_sender_id = ?`).get(Number(myId.id)).c)
    }
  } catch {
    /* ignore */
  }
  if (!sent) sent = topSenders.filter((x) => x.isMine).reduce((s, x) => s + x.count, 0)

  const voiceCount = Number(byType.find((x) => x.type === 34)?.count ?? 0)
  const voiceTranscribed = countTranscriptsFor(repo.myWxid, username)

  return {
    ok: true,
    table,
    username,
    displayName: repo.displayName(username),
    isGroup: username.endsWith('@chatroom'),
    voiceCount,
    voiceTranscribed,
    total,
    sent,
    received: Math.max(0, total - sent),
    firstMs: firstTs * 1000,
    lastMs: lastTs * 1000,
    days,
    activeDays: new Set(byMonth.map((m) => m.month)).size,
    perDay: +(total / days).toFixed(1),
    senders: Number(base?.senders ?? 0),
    byHour,
    byWeekday,
    byMonth,
    byType,
    topSenders,
    peakHour: byHour.indexOf(Math.max(...byHour)),
  }
}

/**
 * 年度报告：遍历所有会话的消息表做聚合
 * @param {import('./repo.mjs').AccountRepo} repo
 */
export function annualReport(repo, year) {
  const start = Math.floor(new Date(`${year}-01-01T00:00:00`).getTime() / 1000)
  const end = Math.floor(new Date(`${year + 1}-01-01T00:00:00`).getTime() / 1000)

  const sessions = repo.listSessions({ limit: 2000 })
  const index = repo.tableIndex
  const byMonth = new Array(12).fill(0)
  const byHour = new Array(24).fill(0)
  const perSession = []
  let total = 0
  let textCount = 0
  let imageCount = 0
  let voiceCount = 0
  let scanned = 0

  for (const s of sessions) {
    const table = messageTableName(s.username)
    const dbFile = index.get(table.toLowerCase())
    if (!dbFile) continue
    const db = repo.openSource(dbFile)
    if (!db) continue
    scanned++
    try {
      const rows = db
        .prepare(
          `SELECT strftime('%m', create_time, 'unixepoch', 'localtime') AS m,
                  CAST(strftime('%H', create_time, 'unixepoch', 'localtime') AS INTEGER) AS h,
                  (local_type & 4294967295) AS t, COUNT(*) AS c
           FROM ${table}
           WHERE create_time >= ? AND create_time < ?
           GROUP BY m, h, t`
        )
        .all(start, end)
      let sessTotal = 0
      for (const r of rows) {
        const monthIdx = Number(r.m) - 1
        const h = Number(r.h)
        const c = Number(r.c)
        sessTotal += c
        if (monthIdx >= 0 && monthIdx < 12) byMonth[monthIdx] += c
        if (h >= 0 && h < 24) byHour[h] += c
        const t = Number(r.t)
        if (t === 1) textCount += c
        else if (t === 3) imageCount += c
        else if (t === 34) voiceCount += c
      }
      if (sessTotal > 0) {
        total += sessTotal
        perSession.push({
          username: s.username,
          name: s.name,
          isGroup: s.isGroup,
          count: sessTotal,
        })
      }
    } catch {
      /* 单表异常跳过 */
    }
  }

  perSession.sort((a, b) => b.count - a.count)
  const topChats = perSession.slice(0, 10)
  const topPeople = perSession.filter((x) => !x.isGroup).slice(0, 5)
  const topGroups = perSession.filter((x) => x.isGroup).slice(0, 5)

  return {
    year,
    total,
    textCount,
    imageCount,
    voiceCount,
    scannedSessions: scanned,
    activeSessions: perSession.length,
    byMonth,
    byHour,
    topChats,
    topPeople,
    topGroups,
    peakHour: byHour.indexOf(Math.max(...byHour, 0)),
    peakMonth: byMonth.indexOf(Math.max(...byMonth, 0)) + 1,
    availableYears: repo.availableYears(),
  }
}

/** 数据盘点：各库大小、表数、缓存占用 */
export function dataInventory(repo) {
  const storage = repo.dbStorage
  const dbs = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.name.endsWith('.db')) {
        const st = fs.statSync(full)
        const wal = full + '-wal'
        dbs.push({
          name: ent.name,
          group: path.basename(dir),
          source: full,
          sizeBytes: st.size,
          walBytes: fs.existsSync(wal) ? fs.statSync(wal).size : 0,
          mtimeMs: st.mtimeMs,
        })
      }
    }
  }
  walk(storage)

  // 解密缓存占用
  const cacheRoot = repo.cache?.root
  let cacheBytes = 0
  let cacheFiles = 0
  if (cacheRoot && fs.existsSync(cacheRoot)) {
    const w = (d) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, ent.name)
        if (ent.isDirectory()) w(full)
        else {
          cacheFiles++
          cacheBytes += fs.statSync(full).size
        }
      }
    }
    w(cacheRoot)
  }

  dbs.sort((a, b) => b.sizeBytes - a.sizeBytes)
  return {
    dbStorage: storage,
    dbs,
    totalSourceBytes: dbs.reduce((s, d) => s + d.sizeBytes, 0),
    totalWalBytes: dbs.reduce((s, d) => s + d.walBytes, 0),
    cacheBytes,
    cacheFiles,
    cacheRoot,
    createdAt: new Date().toISOString(),
  }
}
