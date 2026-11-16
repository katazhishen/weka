// 数据访问层：账号 → 会话 → 消息
// 特性：库文件变化时自动重新解密并重开连接（微信在运行时库文件会持续变动）
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { DbCache } from './cache.mjs'
import { parseKey } from './sqlcipher.mjs'
import { decodeColumn, renderMessage, splitType } from './content.mjs'
import { parseImageKeys, detectImageExt } from './media.mjs'
import { observe as archiveObserve, listRecalled, readWeFlowCache } from './antirevoke.mjs'
import { getTranscriptsFor } from './voice.mjs'

const num = (v) => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0))

/** 微信 4.0：每个会话的消息存放在 Msg_<md5(username)> 表里 */
export function messageTableName(username) {
  return 'Msg_' + crypto.createHash('md5').update(username).digest('hex')
}

export class AccountRepo {
  /**
   * @param {{wxid:string, dbPath:string, key:string}} account
   * @param {{cacheDir:string}} opts
   */
  constructor(account, opts = {}) {
    this.account = account
    this.keyBuf = parseKey(account.key)
    this.cache = new DbCache(opts.cacheDir)
    this.accountDir = path.join(account.dbPath, account.wxid)
    this.dbStorage = path.join(this.accountDir, 'db_storage')

    this._dbs = new Map() // 源文件路径 → { db, fp }
    this._tableIndex = null // 小写表名 → 消息库路径
    this._tableIndexAt = 0
    this._nameMapCache = new Map() // 库路径 → Map(real_sender_id → username)
    this._contactMap = null
    this._contactMapAt = 0
    this._stats = { decrypted: 0, decryptMs: 0, cacheHits: 0, reopens: 0 }
    this.lastError = null

    // 账号目录名带 "wxid_xxx_2937" 这样的后缀，真实 wxid 没有
    this.myWxid = String(account.wxid || '')
    this.myWxidShort = this.myWxid.replace(/_[0-9a-f]{4}$/i, '')
    // 图片 DAT 解密密钥
    this.imageKeys = parseImageKeys(account)
  }

  get exists() {
    return fs.existsSync(this.dbStorage)
  }

  /** 打开（必要时重新解密并重开）某个源库，源文件变了会自动换到新缓存 */
  #open(sourcePath) {
    let fp = null
    try {
      fp = this.cache.fingerprint(sourcePath)
    } catch {
      return null
    }
    const cached = this._dbs.get(sourcePath)
    if (cached && cached.fp.mtimeMs === fp.mtimeMs && cached.fp.size === fp.size) {
      return cached.db
    }
    if (cached) {
      try {
        cached.db.close()
      } catch {
        /* ignore */
      }
      this._dbs.delete(sourcePath)
      this._stats.reopens++
      // 消息库变了，表索引需要重建
      if (/[\\/]message[\\/]/.test(sourcePath)) this._tableIndex = null
    }
    const res = this.cache.ensure(sourcePath, this.keyBuf)
    if (res.hit) this._stats.cacheHits++
    else {
      this._stats.decrypted++
      this._stats.decryptMs += res.decryptMs
    }
    const db = new DatabaseSync(res.path, { readOnly: true, readBigInts: true })
    this._dbs.set(sourcePath, { db, fp: { mtimeMs: res.mtimeMs, size: res.size }, cachePath: res.path })
    return db
  }

  // ---------- 各库 ----------
  get sessionDb() {
    return this.#open(path.join(this.dbStorage, 'session', 'session.db'))
  }

  get contactDb() {
    const p = path.join(this.dbStorage, 'contact', 'contact.db')
    return fs.existsSync(p) ? this.#open(p) : null
  }

  /** 扫描所有消息库，建立 "小写表名 → 库文件路径" 索引（30 秒内复用） */
  get tableIndex() {
    if (this._tableIndex && Date.now() - this._tableIndexAt < 30_000) return this._tableIndex
    const index = new Map()
    const msgDir = path.join(this.dbStorage, 'message')
    if (fs.existsSync(msgDir)) {
      for (const f of fs.readdirSync(msgDir)) {
        if (!/^(message|biz_message)_\d+\.db$/.test(f)) continue
        const full = path.join(msgDir, f)
        const db = this.#open(full)
        if (!db) continue
        try {
          for (const r of db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg_%'")
            .all()) {
            index.set(String(r.name).toLowerCase(), full)
          }
        } catch {
          /* 单个库异常不影响整体 */
        }
      }
    }
    this._tableIndex = index
    this._tableIndexAt = Date.now()
    return index
  }

  // ---------- 联系人 ----------
  get contactMap() {
    if (this._contactMap && Date.now() - this._contactMapAt < 30_000) return this._contactMap
    const map = new Map()
    const db = this.contactDb
    if (db) {
      try {
        for (const r of db
          .prepare('SELECT username, remark, nick_name, alias FROM contact WHERE username IS NOT NULL')
          .all()) {
          map.set(String(r.username), {
            remark: r.remark ? String(r.remark) : '',
            nick: r.nick_name ? String(r.nick_name) : '',
            alias: r.alias ? String(r.alias) : '',
          })
        }
      } catch (e) {
        this.lastError = e?.message || String(e)
      }
    }
    this._contactMap = map
    this._contactMapAt = Date.now()
    return map
  }

  displayName(username) {
    const c = this.contactMap.get(username)
    if (c) return c.remark || c.nick || c.alias || username
    return username
  }

  /** 某个消息库里的 发言人 id → wxid */
  #nameMap(dbFile, db) {
    const key = dbFile + '|' + (this._dbs.get(dbFile)?.fp.mtimeMs ?? 0)
    if (this._nameMapCache.has(key)) return this._nameMapCache.get(key)
    const map = new Map()
    try {
      for (const r of db.prepare('SELECT rowid AS id, user_name FROM Name2Id').all()) {
        map.set(num(r.id), String(r.user_name))
      }
    } catch {
      /* 结构差异时忽略 */
    }
    this._nameMapCache.set(key, map)
    return map
  }

  // ---------- 会话 ----------
  listSessions({ limit = 100, offset = 0, keyword = '' } = {}) {
    const db = this.sessionDb
    if (!db) return []
    const rows = db
      .prepare(
        `SELECT username, type, unread_count, summary, draft, is_hidden,
                last_timestamp, sort_timestamp, last_msg_type, last_msg_sender, last_sender_display_name
         FROM SessionTable
         WHERE COALESCE(is_hidden, 0) = 0
         ORDER BY COALESCE(sort_timestamp, last_timestamp) DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(2000, limit + offset)))

    const items = []
    for (const r of rows) {
      const username = String(r.username)
      const name = this.displayName(username)
      const summary = r.summary ? String(r.summary) : ''
      if (keyword) {
        const hay = (username + ' ' + name + ' ' + summary).toLowerCase()
        if (!hay.includes(keyword.toLowerCase())) continue
      }
      items.push({
        username,
        name,
        isGroup: username.endsWith('@chatroom'),
        unread: num(r.unread_count),
        summary,
        draft: r.draft ? String(r.draft) : '',
        timeMs: num(r.last_timestamp) * 1000,
        sortTs: num(r.sort_timestamp ?? r.last_timestamp),
        lastMsgType: num(r.last_msg_type),
        lastSender: r.last_msg_sender ? String(r.last_msg_sender) : '',
        lastSenderName: r.last_sender_display_name ? String(r.last_sender_display_name) : '',
      })
    }
    return items.slice(offset, offset + limit)
  }

  sessionCount() {
    try {
      const db = this.sessionDb
      if (!db) return 0
      return num(
        db.prepare('SELECT COUNT(*) AS c FROM SessionTable WHERE COALESCE(is_hidden,0)=0').get().c
      )
    } catch (e) {
      this.lastError = e?.message || String(e)
      return 0
    }
  }

  // ---------- 消息 ----------
  /**
   * @param {string} username 会话名（wxid / xxx@chatroom / filehelper ...）
   * @param {{limit?:number, beforeSortSeq?:number, antiRevoke?:boolean}} opts
   */
  listMessages(username, { limit = 50, beforeSortSeq = null, antiRevoke = true } = {}) {
    const table = messageTableName(username)
    const dbFile = this.tableIndex.get(table.toLowerCase())
    if (!dbFile) {
      return { table, dbFile: null, messages: [], hasMore: false, recalled: [] }
    }
    const db = this.#open(dbFile)
    if (!db) return { table, dbFile, messages: [], hasMore: false, recalled: [] }
    const nameMap = this.#nameMap(dbFile, db)
    const meSet = new Set([this.myWxid, this.myWxidShort])

    const where = beforeSortSeq ? 'WHERE sort_seq < ?' : ''
    const args = beforeSortSeq ? [beforeSortSeq, limit + 1] : [limit + 1]
    const sql = `SELECT local_id, server_id, local_type, sort_seq, real_sender_id, create_time,
                        CAST(message_content AS BLOB) AS mc, WCDB_CT_message_content AS mcType,
                        status
                 FROM ${table} ${where} ORDER BY sort_seq DESC LIMIT ?`
    let rows
    try {
      rows = db.prepare(sql).all(...args)
    } catch (e) {
      this.lastError = e?.message || String(e)
      return { table, dbFile, messages: [], hasMore: false, recalled: [] }
    }

    const hasMore = rows.length > limit
    if (hasMore) rows = rows.slice(0, limit)

    const messages = []
    for (const r of rows) {
      const senderId = num(r.real_sender_id)
      const sender = nameMap.get(senderId) || ''
      let content = decodeColumn(r.mc, r.mcType)
      // 合并/播报类消息正文常自带 "发言人id: " 前缀（可能带换行），与发言人一致时去掉
      if (sender && content.length > sender.length) {
        const esc = sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        content = content.replace(new RegExp('^' + esc + '\\s*:\\s*'), '')
      }
      const { base, sub } = splitType(r.local_type)
      const rendered = renderMessage({ localType: r.local_type, content })
      const isMine = meSet.has(sender)
      const senderIsGroup = sender.endsWith('@chatroom')
      // 图片消息：从 XML 里取出 md5，用于定位本地缓存的 DAT
      let imageMd5 = null
      if (base === 3) imageMd5 = content.match(/md5="([0-9a-f]{32})"/i)?.[1] || null
      // 语音消息：XML 里有 voicelength（毫秒）
      let durationMs = 0
      if (base === 34) durationMs = Number(content.match(/voicelength="(\d+)"/i)?.[1] || 0)
      messages.push({
        localId: num(r.local_id),
        serverId: String(r.server_id ?? ''),
        sortSeq: num(r.sort_seq),
        timeMs: num(r.create_time) * 1000,
        type: base,
        sub,
        sender,
        senderName: isMine ? '我' : sender && !senderIsGroup ? this.displayName(sender) : '',
        isMine,
        status: num(r.status),
        kind: rendered.kind,
        label: rendered.label,
        text: rendered.text,
        imageMd5,
        durationMs,
      })
    }
    messages.reverse() // 转成时间正序，方便界面渲染

    // 语音消息：附上已缓存的转写文本（一次查询批量取）
    const voiceIds = messages.filter((m) => m.type === 34).map((m) => m.localId)
    if (voiceIds.length) {
      const tr = getTranscriptsFor(this.myWxid, username, voiceIds)
      for (const m of messages) if (m.type === 34) m.transcript = tr.get(m.localId) || ''
    }

    // ---------- 防撤回 ----------
    let recalled = []
    if (antiRevoke) {
      try {
        const seen = messages.map((m) => ({ ...m }))
        archiveObserve(this.myWxid, username, seen)
        recalled = listRecalled(this.myWxid, username).map((r) => {
          const isMine = meSet.has(r.sender)
          return {
            localId: r.localId,
            sortSeq: r.sortSeq,
            timeMs: r.timeMs,
            type: r.type,
            sender: r.sender,
            senderName: isMine ? '我' : r.sender && !r.sender.endsWith('@chatroom') ? this.displayName(r.sender) : '',
            isMine,
            kind: 'recalled',
            label: '',
            text: r.text,
            imageMd5: null,
            recalled: true,
            recalledAt: r.recalledAt,
          }
        })
        // 合并 WeFlow 之前抓到的（若有）
        const wf = readWeFlowCache(this, username, table, decodeColumn)
        for (const w of wf) {
          const isMine = meSet.has(nameMap.get(w.senderId) || '')
          recalled.push({
            localId: w.localId,
            sortSeq: w.sortSeq,
            timeMs: w.timeMs,
            type: w.type,
            sender: nameMap.get(w.senderId) || '',
            senderName: isMine ? '我' : '',
            isMine,
            kind: 'recalled',
            label: '',
            text: w.text,
            imageMd5: null,
            recalled: true,
            recalledAt: w.recalledAt,
            source: 'weflow',
          })
        }
      } catch (e) {
        this.lastError = '防撤回观察失败: ' + (e?.message || e)
      }
    }
    return { table, dbFile, messages, hasMore, recalled }
  }

  stats() {
    return {
      ...this._stats,
      messageDbs: [...this._dbs.keys()].filter((k) => /[\\/]message[\\/]/.test(k)).length,
      tables: this._tableIndex?.size ?? 0,
      lastError: this.lastError,
    }
  }

  // ---------- 对外辅助（给 moments / stats 模块用） ----------
  /** 打开任意源库（自动解密 + 变化重连） */
  openSource(sourcePath) {
    if (!fs.existsSync(sourcePath)) return null
    return this.#open(sourcePath)
  }

  /** 某消息库的 发言人id → wxid 映射 */
  nameMapFor(dbFile, db) {
    return this.#nameMap(dbFile, db)
  }

  /** 会话覆盖的年份（按最后消息时间推算） */
  availableYears() {
    try {
      const row = this.sessionDb
        ?.prepare('SELECT MIN(last_timestamp) AS a, MAX(last_timestamp) AS b FROM SessionTable')
        .get()
      const from = Number(row?.a ?? 0)
      const to = Number(row?.b ?? 0)
      if (!from || !to) return [new Date().getFullYear()]
      const y1 = new Date(from * 1000).getFullYear()
      const y2 = new Date(to * 1000).getFullYear()
      const years = []
      for (let y = y2; y >= y1; y--) years.push(y)
      return years
    } catch {
      return [new Date().getFullYear()]
    }
  }

  /** 头像（head_image.db 里就是 JPEG 原始字节） */
  avatar(username) {
    if (!username) return null
    if (this._avatarCache?.has(username)) return this._avatarCache.get(username)
    const cache = (this._avatarCache ||= new Map())
    let buf = null
    try {
      const file = path.join(this.dbStorage, 'head_image', 'head_image.db')
      const db = this.openSource(file)
      if (db) {
        const row = db.prepare('SELECT image_buffer FROM head_image WHERE username = ?').get(username)
        if (row?.image_buffer) buf = Buffer.from(row.image_buffer)
      }
    } catch {
      buf = null
    }
    if (cache.size > 500) cache.clear()
    cache.set(username, buf)
    return buf
  }

  close() {
    for (const { db } of this._dbs.values()) {
      try {
        db.close()
      } catch {
        /* ignore */
      }
    }
    this._dbs.clear()
    this._tableIndex = null
    this._nameMapCache.clear()
    this._contactMap = null
  }
}
