#!/usr/bin/env node
// weka CLI
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { AccountRepo } from './repo.mjs'
import { resolveAccounts, importFromWeFlow, upsertAccount, loadConfig, CONFIG_FILE, HOME } from './keystore.mjs'
import { decryptDatabase, parseKey } from './sqlcipher.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CACHE_DIR = path.join(HOME, 'cache')

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next
        i++
      } else args[key] = true
    } else args._.push(a)
  }
  return args
}

function pickAccount(args) {
  const accounts = resolveAccounts()
  if (accounts.length === 0) {
    console.error('还没有任何账号。先运行： weka import-weflow   （或设置 WEKA_KEY / WEKA_WXID / WEKA_DBPATH）')
    process.exit(1)
  }
  if (args.account) {
    const hit = accounts.find((a) => a.wxid === args.account || a.wxid.startsWith(args.account))
    if (!hit) {
      console.error(`找不到账号 ${args.account}，可用：${accounts.map((a) => a.wxid).join(', ')}`)
      process.exit(1)
    }
    return hit
  }
  return accounts[0]
}

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '-')

function cmdDoctor() {
  console.log('weka', '0.3.0')
  console.log('node', process.version)
  console.log('配置目录', HOME, fs.existsSync(CONFIG_FILE) ? '(已存在)' : '(尚未创建)')
  console.log('sqlite', `node:sqlite 内置`)
  const accounts = resolveAccounts()
  console.log('账号数', accounts.length)
  for (const a of accounts) {
    const dir = path.join(a.dbPath || '', a.wxid, 'db_storage')
    const ok = fs.existsSync(dir)
    const sessionDb = path.join(dir, 'session', 'session.db')
    console.log(
      `  - ${a.wxid}  key=${a.key.slice(0, 8)}…  dbPath=${a.dbPath}  db_storage=${ok ? 'OK' : '缺失'}  session.db=${fs.existsSync(sessionDb) ? 'OK' : '缺失'}  图片密钥=${a.imageXorKey ? '有' : '无'}`
    )
  }
  const vendorDir = path.join(path.dirname(__dirname), 'vendor')
  console.log(
    'vendor 依赖',
    fs.existsSync(path.join(vendorDir, 'silk-wasm')) ? 'silk-wasm OK' : 'silk-wasm 缺失',
    '·',
    fs.existsSync(path.join(vendorDir, 'sherpa-onnx-node')) ? 'sherpa-onnx OK' : 'sherpa-onnx 缺失'
  )
  import('./voice.mjs')
    .then((v) => {
      const st = v.modelStatus()
      console.log('语音模型', st.ready ? `就绪 ${(st.modelBytes / 1048576).toFixed(0)}MB` : '未就绪')
      console.log('  模型目录', st.dir)
      if (accounts[0]) console.log('  已转写语音', v.transcriptStats(accounts[0].wxid).count, '条')
    })
    .catch(() => {})
}

function cmdImport(args) {
  const { accounts, weflowUserData } = importFromWeFlow(args.userdata)
  for (const a of accounts) upsertAccount(a)
  console.log(`从 WeFlow 配置导入成功： ${weflowUserData}`)
  for (const a of accounts) console.log(`  + ${a.wxid}  key=${a.key.slice(0, 8)}…  dbPath=${a.dbPath}`)
  console.log(`已写入 ${CONFIG_FILE}`)
}

function cmdAccounts() {
  const accounts = resolveAccounts()
  if (!accounts.length) return console.log('(无账号)')
  for (const a of accounts) {
    const repo = new AccountRepo(a, { cacheDir: CACHE_DIR })
    let sessions = '?'
    try {
      sessions = repo.exists ? repo.sessionCount() : '数据目录缺失'
    } catch (e) {
      sessions = '打开失败: ' + e.message
    }
    console.log(`${a.wxid}  sessions=${sessions}  dbPath=${a.dbPath}  source=${a.source || 'config'}`)
    repo.close()
  }
}

function cmdSessions(args) {
  const account = pickAccount(args)
  const repo = new AccountRepo(account, { cacheDir: CACHE_DIR })
  const limit = Number(args.limit || 20)
  const t0 = performance.now()
  const list = repo.listSessions({ limit, keyword: args.keyword || '' })
  const ms = performance.now() - t0
  if (args.json) {
    console.log(JSON.stringify(list, null, 2))
  } else {
    console.log(`账号 ${account.wxid} · ${repo.sessionCount()} 个会话 · 查询 ${ms.toFixed(1)}ms`)
    console.log('─'.repeat(96))
    for (const s of list) {
      const tag = s.isGroup ? '群' : '  '
      const unread = s.unread ? ` (${s.unread})` : ''
      console.log(`${tag} ${s.name.slice(0, 18).padEnd(20)} ${fmtTime(s.timeMs).padEnd(21)}${unread}  ${s.summary.replace(/\s+/g, ' ').slice(0, 34)}`)
    }
  }
  console.log(`\n[统计] 解密 ${repo.stats().decrypted} 次 / ${repo.stats().decryptMs.toFixed(0)}ms，缓存命中 ${repo.stats().cacheHits} 次`)
  repo.close()
}

function cmdMessages(args) {
  const username = args._[1]
  if (!username) {
    console.error('用法: weka messages <username|会话名> [--limit 30] [--before sortSeq]')
    process.exit(1)
  }
  const account = pickAccount(args)
  const repo = new AccountRepo(account, { cacheDir: CACHE_DIR })
  const t0 = performance.now()
  const res = repo.listMessages(username, {
    limit: Number(args.limit || 30),
    beforeSortSeq: args.before ? Number(args.before) : null,
  })
  const ms = performance.now() - t0
  if (args.json) {
    console.log(JSON.stringify(res, null, 2))
  } else {
    console.log(`会话 ${username} · 表 ${res.table} · 库 ${res.dbFile ? path.basename(res.dbFile) : '（未找到）'} · ${ms.toFixed(1)}ms`)
    console.log('─'.repeat(96))
    for (const m of res.messages) {
      const who = (m.isMine ? '我' : m.senderName || m.sender || '?').slice(0, 12)
      const body = m.label ? m.label + (m.text ? ' ' + m.text : '') : m.text
      console.log(`${fmtTime(m.timeMs)} ${who.padEnd(13)} ${body.replace(/\s+/g, ' ').slice(0, 60)}`)
    }
    if (res.hasMore) console.log(`\n(还有更早的消息，用 --before ${res.messages[0]?.sortSeq} 继续)`)
  }
  repo.close()
}

function cmdDecrypt(args) {
  const file = args._[1]
  if (!file) {
    console.error('用法: weka decrypt <加密库路径> [--out 输出路径]')
    process.exit(1)
  }
  const account = pickAccount(args)
  const keyBuf = parseKey(account.key)
  const t0 = performance.now()
  const raw = fs.readFileSync(file)
  const { data, npages } = decryptDatabase(raw, keyBuf)
  const ms = performance.now() - t0
  const out = args.out || file.replace(/\.db$/, '.plain.db')
  fs.writeFileSync(out, data)
  console.log(`解密完成：${file}`)
  console.log(`  页数 ${npages}  耗时 ${ms.toFixed(1)}ms  输出 ${out} (${(data.length / 1048576).toFixed(2)}MB)`)
}

function cmdExport(args) {
  const username = args._[1]
  if (!username) {
    console.error('用法: weka export <username> [--limit 1000] [--out 文件] [--format json|txt]')
    process.exit(1)
  }
  const account = pickAccount(args)
  const repo = new AccountRepo(account, { cacheDir: CACHE_DIR })
  const limit = Number(args.limit || 1000)
  const res = repo.listMessages(username, { limit })
  const name = repo.displayName(username)

  if (args.format === 'txt') {
    const lines = res.messages.map((m) => {
      const who = m.isMine ? '我' : m.senderName || m.sender
      const body = m.label ? m.label + (m.text ? ' ' + m.text : '') : m.text
      return `[${fmtTime(m.timeMs)}] ${who}: ${body}`
    })
    const text = `会话：${name} (${username})\n导出条数：${res.messages.length}\n\n` + lines.join('\n')
    const out = args.out || `${username}.txt`
    fs.writeFileSync(out, text, 'utf8')
    console.log(`已导出 ${res.messages.length} 条 → ${out}`)
  } else {
    const payload = {
      account: account.wxid,
      session: { username, name, isGroup: username.endsWith('@chatroom') },
      exportedAt: new Date().toISOString(),
      count: res.messages.length,
      messages: res.messages,
    }
    const out = args.out || `${username}.json`
    fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8')
    console.log(`已导出 ${res.messages.length} 条 → ${out}`)
  }
  repo.close()
}

function cmdSelftest(args) {
  const account = pickAccount(args)
  // 用独立临时缓存目录，避免与正在运行的服务占用同一文件（Windows 文件锁）
  const tempCache = path.join(os.tmpdir(), `weka-selftest-${Date.now()}`)
  const repo = new AccountRepo(account, { cacheDir: tempCache })
  console.log(`账号 ${account.wxid}`)
  console.log(`数据目录 ${repo.dbStorage}  ${repo.exists ? 'OK' : '缺失'}`)
  if (!repo.exists) {
    console.log('跳过：数据目录不存在')
    return
  }

  const src = path.join(repo.dbStorage, 'session', 'session.db')
  const res = repo.cache.ensure(src, repo.keyBuf, { force: true })
  const db = new DatabaseSync(res.path, { readOnly: true })
  const integrity = db.prepare('PRAGMA integrity_check').get()
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM SessionTable').get()
  const tables = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'").get()
  db.close()
  console.log(`session.db 解密 ${res.decryptMs.toFixed(1)}ms → ${(res.bytes / 1048576).toFixed(2)}MB`)
  console.log(`integrity_check = ${JSON.stringify(integrity)}`)
  console.log(`表数 = ${tables.c}   会话数 = ${cnt.c}`)
  console.log(`消息表索引 = ${repo.tableIndex.size} 张（来自 ${repo.stats().messageDbs} 个消息库）`)
  repo.close()
  fs.rmSync(tempCache, { recursive: true, force: true })
  console.log('自检通过 ✅')
}

async function cmdTranscribe(args) {
  const { transcribeSession, modelStatus, transcriptStats } = await import('./voice.mjs')
  const status = modelStatus()
  console.log(`模型: ${status.ready ? '就绪' : '未就绪'}  ${status.dir}`)
  console.log(`      模型 ${(status.modelBytes / 1048576).toFixed(0)}MB · tokens ${(status.tokensBytes / 1024).toFixed(0)}KB`)
  if (!status.ready) {
    console.log('请把 model.int8.onnx 与 tokens.txt 放到上面的目录')
    return
  }
  const account = pickAccount(args)
  const repo = new AccountRepo(account, { cacheDir: CACHE_DIR })
  const username = args._[1]
  console.log(`已缓存转写: ${transcriptStats(repo.myWxid).count} 条`)

  const targets = username ? [username] : repo.listSessions({ limit: Number(args.limit || 5) }).map((s) => s.username)
  const perSession = Number(args.per || 20)
  for (const u of targets) {
    const t0 = performance.now()
    const res = await transcribeSession(repo, u, {
      limit: perSession,
      onProgress: (done, total) => process.stdout.write(`\r  ${repo.displayName(u).slice(0, 14)} ${done}/${total}`),
    })
    const ms = performance.now() - t0
    if (res.processed) {
      console.log(`\r  ✅ ${repo.displayName(u).slice(0, 16)}: 语音 ${res.total} 条, 本次转写 ${res.processed} 条, 耗时 ${(ms / 1000).toFixed(1)}s`)
    }
  }
  console.log(`\n转写缓存总数: ${transcriptStats(repo.myWxid).count} 条`)
  repo.close()
}

async function cmdServe(args) {
  const { startServer } = await import('./server.mjs')
  const account = pickAccount(args)
  const port = Number(args.port || 7080)
  await startServer({ account, port, cacheDir: CACHE_DIR })
}

function cmdBench(args) {
  const account = pickAccount(args)
  const repo = new AccountRepo(account, { cacheDir: CACHE_DIR })

  const bench = (label, fn, times = 5) => {
    fn()
    const t0 = performance.now()
    for (let i = 0; i < times; i++) fn()
    const ms = (performance.now() - t0) / times
    console.log(`${label.padEnd(28)} ${ms.toFixed(2)} ms/次`)
    return ms
  }

  console.log(`账号 ${account.wxid}`)
  bench('会话列表 (100 条)', () => repo.listSessions({ limit: 100 }))
  bench('会话总数', () => repo.sessionCount())
  const sessions = repo.listSessions({ limit: 5 })
  for (const s of sessions.slice(0, 3)) {
    const res = repo.listMessages(s.username, { limit: 50 })
    bench(`消息 50 条 (${s.username.slice(0, 10)})`, () => repo.listMessages(s.username, { limit: 50 }))
    if (res.messages.length) {
      const before = res.messages[0].sortSeq
      bench('消息翻页 (更早 50 条)', () => repo.listMessages(s.username, { limit: 50, beforeSortSeq: before }))
    }
  }
  const st = repo.stats()
  console.log(`\n[统计] 解密 ${st.decrypted} 次 / ${st.decryptMs.toFixed(0)}ms，缓存命中 ${st.cacheHits}，消息库 ${st.messageDbs}，消息表 ${st.tables}`)
  repo.close()
}

async function main() {
  const argv = process.argv.slice(2)
  const args = parseArgs(argv)
  const cmd = args._[0] || 'help'

  switch (cmd) {
    case 'doctor':
      return cmdDoctor()
    case 'import-weflow':
      return cmdImport(args)
    case 'accounts':
      return cmdAccounts()
    case 'sessions':
      return cmdSessions(args)
    case 'messages':
      return cmdMessages(args)
    case 'decrypt':
      return cmdDecrypt(args)
    case 'export':
      return cmdExport(args)
    case 'selftest':
      return cmdSelftest(args)
    case 'transcribe':
      return cmdTranscribe(args)
    case 'serve':
      return cmdServe(args)
    case 'bench':
      return cmdBench(args)
    case 'help':
    default:
      console.log(`weka 0.1.0 — 微信 4.0 本地聊天记录浏览器

用法:
  weka doctor                     检查环境与账号
  weka import-weflow [--userdata] 从 WeFlow 配置导入账号密钥
  weka accounts                   列出账号
  weka sessions [--limit N] [--keyword K] [--json]
  weka messages <username> [--limit N] [--before sortSeq] [--json]
  weka decrypt <db文件> [--out 路径]
  weka export <username> [--limit N] [--out 文件] [--format json|txt]
  weka selftest                   解密自检 + integrity_check
  weka transcribe [username] [--limit N] [--per N]  语音转文字（本地离线）
  weka serve [--port 7080]        启动本地界面
  weka bench                      性能基准

全局:
  --account <wxid>   指定账号（默认取第一个）
环境变量:
  WEKA_KEY / WEKA_WXID / WEKA_DBPATH   临时覆盖密钥与路径
`)
  }
}

main().catch((e) => {
  console.error('错误:', e?.message || e)
  process.exit(1)
})


