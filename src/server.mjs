// 本地 HTTP 服务：API + 静态界面（多账号支持）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AccountRepo } from './repo.mjs'
import { listMoments } from './moments.mjs'
import { sessionAnalytics, annualReport, dataInventory } from './stats.mjs'
import { getImage, mimeOf, getFfmpeg } from './media.mjs'
import { archiveStats, archivePath } from './antirevoke.mjs'
import {
  modelStatus as voiceModelStatus,
  transcriptStats,
  transcribeMessage,
  transcribeSession,
  searchTranscripts,
} from './voice.mjs'
import { resolveAccounts, loadConfig } from './keystore.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data, (k, v) => (typeof v === 'bigint' ? Number(v) : v)))
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('404')
    return
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  fs.createReadStream(file).pipe(res)
}

/** 导出成 HTML（一段可独立打开的文件） */
function renderExportHtml({ session, messages, exportedAt }) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const rows = messages
    .map((m) => {
      const time = new Date(m.timeMs).toLocaleString('zh-CN', { hour12: false })
      const who = m.isMine ? '我' : m.senderName || m.sender || '?'
      const body = m.label ? `${m.label} ${m.text || ''}` : m.text || ''
      return `<div class="msg${m.isMine ? ' mine' : ''}"><div class="meta"><b>${esc(who)}</b> · ${esc(time)}</div><div class="bubble">${esc(body)}</div></div>`
    })
    .join('\n')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(session.name)} · 聊天记录</title>
<style>
body{margin:0;background:#f6f4ef;color:#26221c;font:14px/1.6 "Microsoft YaHei UI",system-ui,sans-serif}
header{padding:18px 22px;border-bottom:1px solid rgba(0,0,0,.08);background:#fff}
h1{font-size:16px;margin:0 0 4px}
.sub{color:#8b8578;font-size:12px}
.wrap{padding:18px 22px;max-width:900px;margin:0 auto}
.msg{margin:10px 0;display:flex;flex-direction:column;align-items:flex-start}
.msg.mine{align-items:flex-end}
.meta{font-size:11px;color:#9a9384;margin-bottom:3px}
.bubble{background:#fff;border:1px solid rgba(0,0,0,.07);padding:8px 12px;border-radius:10px;max-width:70%;white-space:pre-wrap;word-break:break-word}
.msg.mine .bubble{background:#e8f3ec;border-color:#c9e2d3}
</style></head><body>
<header><h1>${esc(session.name)}</h1><div class="sub">${esc(session.username)} · 共 ${messages.length} 条 · 导出于 ${esc(exportedAt)}</div></header>
<div class="wrap">${rows}</div></body></html>`
}

/**
 * @param {{account:object, port:number, cacheDir:string}} opts
 */
export function startServer({ account, port = 7080, cacheDir }) {
  const accounts = resolveAccounts()
  const repos = new Map()
  const defaultWxid = account.wxid

  function repoFor(wxid) {
    const target = accounts.find((a) => a.wxid === (wxid || defaultWxid)) || account
    if (!repos.has(target.wxid)) {
      const repo = new AccountRepo(target, { cacheDir })
      if (!repo.exists) throw new Error(`账号数据目录不存在: ${repo.dbStorage}`)
      repos.set(target.wxid, repo)
    }
    return { repo: repos.get(target.wxid), account: target }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
    const p = url.pathname
    const q = url.searchParams

    try {
      // ---------- 元信息 ----------
      if (p === '/api/meta') {
        const { repo, account: acc } = repoFor(q.get('account'))
        return json(res, 200, {
          version: '0.3.0',
          account: { wxid: acc.wxid, dbPath: acc.dbPath, source: acc.source || 'config' },
          accounts: accounts.map((a) => ({ wxid: a.wxid, dbPath: a.dbPath })),
          myWxid: repo.myWxidShort,
          myName: repo.displayName(repo.myWxidShort) || repo.myWxidShort,
          imageKeys: Boolean(repo.imageKeys),
          ffmpeg: Boolean(getFfmpeg()),
          sessionCount: repo.sessionCount(),
          cache: repo.cache.stats(),
        })
      }

      if (p === '/api/home') {
        const { repo, account: acc } = repoFor(q.get('account'))
        const t0 = performance.now()
        const sessions = repo.listSessions({ limit: 2000 })
        const groups = sessions.filter((s) => s.isGroup).length
        const unread = sessions.reduce((s, x) => s + (x.unread || 0), 0)
        const times = sessions.map((s) => s.timeMs).filter(Boolean)
        return json(res, 200, {
          account: { wxid: acc.wxid, myWxid: repo.myWxidShort },
          sessionCount: sessions.length,
          groupCount: groups,
          contactCount: (() => {
            try {
              return Number(repo.contactDb?.prepare('SELECT COUNT(*) AS c FROM contact').get().c ?? 0)
            } catch {
              return 0
            }
          })(),
          unread,
          firstMs: Math.min(...times),
          lastMs: Math.max(...times),
          topSessions: sessions.slice(0, 5),
          years: repo.availableYears(),
          cache: repo.cache.stats(),
          ms: +(performance.now() - t0).toFixed(1),
        })
      }

      // ---------- 聊天 ----------
      if (p === '/api/sessions') {
        const { repo } = repoFor(q.get('account'))
        const t0 = performance.now()
        const sessions = repo.listSessions({
          limit: Number(q.get('limit') || 300),
          offset: Number(q.get('offset') || 0),
          keyword: q.get('keyword') || '',
        })
        return json(res, 200, { sessions, ms: +(performance.now() - t0).toFixed(2) })
      }

      if (p === '/api/messages') {
        const { repo } = repoFor(q.get('account'))
        const username = q.get('username')
        if (!username) return json(res, 400, { error: '缺少 username' })
        const t0 = performance.now()
        const before = q.get('before')
        const result = repo.listMessages(username, {
          limit: Number(q.get('limit') || 60),
          beforeSortSeq: before ? Number(before) : null,
          antiRevoke: q.get('antiRevoke') !== '0',
        })
        return json(res, 200, { ...result, ms: +(performance.now() - t0).toFixed(2) })
      }

      if (p === '/api/avatar') {
        const { repo } = repoFor(q.get('account'))
        const buf = repo.avatar(q.get('username'))
        if (!buf) {
          res.writeHead(404, { 'content-type': 'text/plain' })
          return res.end('no avatar')
        }
        res.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': buf.length,
          'cache-control': 'private, max-age=86400',
        })
        return res.end(buf)
      }

      // ---------- 聊天图片（本地 DAT 缓存解密） ----------
      if (p === '/api/image') {
        const { repo } = repoFor(q.get('account'))
        const md5 = q.get('md5') || ''
        const thumb = q.get('thumb') === '1'
        const out = getImage(repo, md5, repo.imageKeys, { thumb })
        if (!out.data) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
          return res.end(JSON.stringify({ error: out.error || '图片不可用' }))
        }
        res.writeHead(200, {
          'content-type': mimeOf(out.ext),
          'content-length': out.data.length,
          'cache-control': 'private, max-age=604800',
        })
        return res.end(out.data)
      }

      // ---------- 防撤回归档统计 ----------
      if (p === '/api/archive') {
        const { repo, account: acc } = repoFor(q.get('account'))
        return json(res, 200, {
          ...archiveStats(repo.myWxid),
          path: archivePath,
          account: acc.wxid,
        })
      }

      // ---------- 语音转文字 ----------
      if (p === '/api/voice/status') {
        const { repo } = repoFor(q.get('account'))
        return json(res, 200, {
          model: voiceModelStatus(),
          transcripts: transcriptStats(repo.myWxid),
        })
      }

      if (p === '/api/voice') {
        const { repo } = repoFor(q.get('account'))
        const username = q.get('username')
        const localId = Number(q.get('localId'))
        if (!username || !localId) return json(res, 400, { error: '缺少 username / localId' })
        const createTime = q.get('createTime') ? Number(q.get('createTime')) : undefined
        const out = await transcribeMessage(repo, username, localId, createTime, q.get('serverId') || undefined)
        return json(res, 200, out)
      }

      if (p === '/api/transcribe') {
        const { repo } = repoFor(q.get('account'))
        const username = q.get('username')
        if (!username) return json(res, 400, { error: '缺少 username' })
        const limit = Number(q.get('limit') || 30)
        const t0 = performance.now()
        const out = await transcribeSession(repo, username, { limit })
        return json(res, 200, { ...out, ms: +(performance.now() - t0).toFixed(0) })
      }

      // ---------- 搜索（文本消息 + 语音转写） ----------
      if (p === '/api/search') {
        const { repo } = repoFor(q.get('account'))
        const keyword = String(q.get('q') || '').trim()
        if (!keyword) return json(res, 400, { error: '缺少关键词' })
        const username = q.get('username') || ''
        const limit = Number(q.get('limit') || 50)
        const t0 = performance.now()

        const hits = []
        // 1) 语音转写命中
        for (const t of searchTranscripts(repo.myWxid, keyword, { session: username, limit })) {
          hits.push({
            kind: 'voice',
            username: t.session,
            name: repo.displayName(t.session),
            localId: t.localId,
            text: t.text,
          })
        }
        // 2) 指定会话时，再搜该会话的文本消息
        if (username) {
          const res2 = repo.listMessages(username, { limit: 800, antiRevoke: false })
          const kw = keyword.toLowerCase()
          for (const m of res2.messages) {
            if (!m.text || !m.text.toLowerCase().includes(kw)) continue
            hits.push({
              kind: m.type === 1 ? 'text' : m.kind,
              username,
              name: repo.displayName(username),
              localId: m.localId,
              sortSeq: m.sortSeq,
              timeMs: m.timeMs,
              text: m.text,
            })
          }
        }
        return json(res, 200, { keyword, count: hits.length, hits: hits.slice(0, limit), ms: +(performance.now() - t0).toFixed(0) })
      }

      // ---------- 朋友圈 ----------
      if (p === '/api/moments') {
        const { repo } = repoFor(q.get('account'))
        const t0 = performance.now()
        const data = listMoments(repo, {
          limit: Number(q.get('limit') || 30),
          offset: Number(q.get('offset') || 0),
          username: q.get('username') || '',
        })
        return json(res, 200, { ...data, ms: +(performance.now() - t0).toFixed(1) })
      }

      // ---------- 分析 ----------
      if (p === '/api/analytics/session') {
        const { repo } = repoFor(q.get('account'))
        const username = q.get('username')
        if (!username) return json(res, 400, { error: '缺少 username' })
        const t0 = performance.now()
        const data = sessionAnalytics(repo, username)
        return json(res, 200, { ...data, ms: +(performance.now() - t0).toFixed(1) })
      }

      if (p === '/api/annual') {
        const { repo } = repoFor(q.get('account'))
        const t0 = performance.now()
        const year = Number(q.get('year') || new Date().getFullYear())
        const data = annualReport(repo, year)
        return json(res, 200, { ...data, ms: +(performance.now() - t0).toFixed(0) })
      }

      // ---------- 数据管理 ----------
      if (p === '/api/data') {
        const { repo, account: acc } = repoFor(q.get('account'))
        const t0 = performance.now()
        const data = dataInventory(repo)
        const cfg = loadConfig()
        return json(res, 200, {
          ...data,
          account: { wxid: acc.wxid, dbPath: acc.dbPath, source: acc.source || 'config' },
          accounts: accounts.map((a) => {
            const saved = (cfg.accounts || []).find((x) => x.wxid === a.wxid) || {}
            return {
              wxid: a.wxid,
              dbPath: a.dbPath,
              keyMask: saved.key ? saved.key.slice(0, 6) + '…' + saved.key.slice(-4) : '（环境变量）',
          latest: saved.key ? true : false,
            }
          }),
          stats: repo.stats(),
          archive: archiveStats(repo.myWxid),
          voice: { model: voiceModelStatus(), transcripts: transcriptStats(repo.myWxid) },
          media: (() => {
            let bytes = 0
            let files = 0
            const dir = path.join(cacheDir, 'media')
            if (fs.existsSync(dir)) {
              for (const f of fs.readdirSync(dir)) {
                files++
                try {
                  bytes += fs.statSync(path.join(dir, f)).size
                } catch {}
              }
            }
            return { bytes, files }
          })(),
          ffmpeg: getFfmpeg(),
          ms: +(performance.now() - t0).toFixed(1),
        })
      }

      // ---------- 导出 ----------
      if (p === '/api/export') {
        const { repo } = repoFor(q.get('account'))
        const username = q.get('username')
        if (!username) return json(res, 400, { error: '缺少 username' })
        const format = (q.get('format') || 'json').toLowerCase()
        const limit = Number(q.get('limit') || 5000)
        const fromTs = q.get('from') ? new Date(q.get('from') + 'T00:00:00').getTime() : 0
        const toTs = q.get('to') ? new Date(q.get('to') + 'T23:59:59').getTime() : Infinity
        const raw = repo.listMessages(username, { limit, antiRevoke: false })
        const res2 = {
          messages: raw.messages.filter((m) => m.timeMs >= fromTs && m.timeMs <= toTs),
        }
        const name = repo.displayName(username)
        const safe = (name || username).replace(/[\\/:*?"<>|]/g, '_')
        const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false })

        if (format === 'html') {
          const html = renderExportHtml({
            session: { name, username },
            messages: res2.messages,
            exportedAt,
          })
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.html`,
          })
          return res.end(html)
        }
        if (format === 'txt') {
          const lines = res2.messages.map((m) => {
            const who = m.isMine ? '我' : m.senderName || m.sender
            const body = m.label ? `${m.label} ${m.text || ''}` : m.text
            return `[${new Date(m.timeMs).toLocaleString('zh-CN', { hour12: false })}] ${who}: ${body}`
          })
          const text = `会话：${name} (${username})\n导出条数：${res2.messages.length}\n\n${lines.join('\n')}`
          res.writeHead(200, {
            'content-type': 'text/plain; charset=utf-8',
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.txt`,
          })
          return res.end(text)
        }
        const payload = {
          account: repo.account.wxid,
          session: { username, name, isGroup: username.endsWith('@chatroom') },
          exportedAt: new Date().toISOString(),
          count: res2.messages.length,
          messages: res2.messages,
        }
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.json`,
        })
        return res.end(JSON.stringify(payload, null, 2))
      }

      if (p === '/api/stats') {
        const { repo } = repoFor(q.get('account'))
        return json(res, 200, repo.stats())
      }
      if (p.startsWith('/api/')) return json(res, 404, { error: 'unknown api' })
      return serveStatic(res, p)
    } catch (e) {
      return json(res, 500, { error: e?.message || String(e) })
    }
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`
      const { repo } = repoFor(defaultWxid)
      console.log(`\n  weka 已启动 → ${url}\n  账号 ${defaultWxid} · ${repo.sessionCount()} 个会话`)
      console.log(`  缓存目录 ${cacheDir}\n  按 Ctrl+C 退出\n`)
      resolve({ server, url, repos })
    })
  })
}


