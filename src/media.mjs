// 图片 / 视频 / 语音媒体处理
// 图片：hardlink.db 索引 → msg/attach/<dir1>/<dir2>/Img/*.dat → AES-128-ECB + XOR 解密 → 必要时 WXGF(HEVC) 经 ffmpeg 转码
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const CACHE_DIR = path.join(os.homedir(), '.weka', 'cache', 'media')

function ensureCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

export function detectImageExt(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45) return 'webp'
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'heic'
  return null
}

const MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic' }
export const mimeOf = (ext) => MIME[ext] || 'application/octet-stream'

function stripPkcs7(data) {
  if (!data.length) return data
  const pad = data[data.length - 1]
  if (pad <= 0 || pad > 16 || pad > data.length) return data
  for (let i = data.length - pad; i < data.length; i++) if (data[i] !== pad) return data
  return data.subarray(0, data.length - pad)
}

/** 解析图片密钥（imageXorKey 可能是 "55" / "0x55" / 数字） */
export function parseImageKeys(account) {
  if (!account) return null
  const raw = account.imageXorKey
  if (raw === undefined || raw === null || raw === '') return null
  let xorKey
  const s = String(raw).trim()
  if (/^0x/i.test(s)) xorKey = parseInt(s, 16)
  else if (/^[0-9a-fA-F]{2}$/.test(s)) xorKey = parseInt(s, 16)
  else xorKey = parseInt(s, 10)
  if (Number.isNaN(xorKey)) xorKey = 0x55
  const aesKeyText = String(account.imageAesKey || '').trim()
  return { xorKey, aesKeyText }
}

/** DAT → 明文（WeChat 4.0：15 字节头 + AES(ECB) 段 + XOR 段） */
export function decryptDat(data, keys) {
  if (detectImageExt(data)) return data
  const sig = data.subarray(0, 6).toString('hex')
  if (sig === '070856320807' && keys?.aesKeyText?.length >= 16) {
    const header = data.subarray(0, 15)
    const payload = data.subarray(15)
    const aesSize = header.readInt32LE(6)
    const xorSize = header.readInt32LE(10)
    const aligned = aesSize + ((16 - (aesSize % 16)) % 16)
    if (aligned > payload.length) throw new Error('DAT aes 段长度非法')
    const aesData = payload.subarray(0, aligned)
    let plain = Buffer.alloc(0)
    if (aesData.length) {
      const d = crypto.createDecipheriv('aes-128-ecb', Buffer.from(keys.aesKeyText, 'ascii').subarray(0, 16), null)
      d.setAutoPadding(false)
      plain = stripPkcs7(Buffer.concat([d.update(aesData), d.final()]))
    }
    const remaining = payload.subarray(aligned)
    let tail = remaining
    if (xorSize > 0 && xorSize <= remaining.length) {
      const rawLen = remaining.length - xorSize
      const xorData = remaining.subarray(rawLen)
      const dec = Buffer.allocUnsafe(xorData.length)
      for (let i = 0; i < xorData.length; i++) dec[i] = xorData[i] ^ keys.xorKey
      tail = Buffer.concat([remaining.subarray(0, rawLen), dec])
    }
    return Buffer.concat([plain, tail])
  }
  // 老格式：整文件单字节 XOR
  const out = Buffer.allocUnsafe(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ keys.xorKey
  return out
}

/** 从 hardlink 索引定位 DAT 文件（thumb=true 时优先找同名 _t.dat 缩略图） */
export function findDat(repo, md5, { thumb = false } = {}) {
  try {
    const hard = repo.openSource(path.join(repo.dbStorage, 'hardlink', 'hardlink.db'))
    if (!hard) return null
    const row = hard
      .prepare('SELECT file_name, dir1, dir2 FROM image_hardlink_info_v4 WHERE md5 = ?')
      .get(String(md5).toLowerCase())
    if (!row) return null
    const d1 = hard.prepare('SELECT username FROM dir2id WHERE rowid = ?').get(Number(row.dir1))?.username
    const d2 = hard.prepare('SELECT username FROM dir2id WHERE rowid = ?').get(Number(row.dir2))?.username
    const attach = path.join(repo.accountDir, 'msg', 'attach')
    const name = String(row.file_name)
    const thumbName = name.replace(/\.dat$/i, '_t.dat')
    const names = thumb ? [thumbName, name] : [name, thumbName]
    for (const n of names) {
      const cands = [
        path.join(attach, String(d1), String(d2), 'Img', n),
        path.join(attach, String(d2), String(d1), 'Img', n),
      ]
      for (const c of cands) if (fs.existsSync(c)) return c
    }
  } catch {
    /* ignore */
  }
  return null
}

/** 找 ffmpeg（优先 WeFlow 自带的静态版，其次 PATH） */
let ffmpegPath
export function getFfmpeg() {
  if (ffmpegPath !== undefined) return ffmpegPath
  const cands = [
    process.env.WEKA_FFMPEG,
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'WeFlow',
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'ffmpeg-static',
      'ffmpeg.exe'
    ),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'WeFlow', 'resources', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  ].filter(Boolean)
  for (const c of cands) {
    try {
      if (fs.existsSync(c)) {
        ffmpegPath = c
        return c
      }
    } catch {}
  }
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    ffmpegPath = 'ffmpeg'
  } catch {
    ffmpegPath = null
  }
  return ffmpegPath
}

/** wxgf（微信自制容器，内部 HEVC）→ 标准图片 */
export function unwrapWxgf(buf) {
  if (buf.length < 20 || buf[0] !== 0x77 || buf[1] !== 0x78 || buf[2] !== 0x67 || buf[3] !== 0x66) {
    return { data: buf, ext: detectImageExt(buf) }
  }
  // 1) 头部可能内嵌传统图片
  const limit = Math.min(buf.length - 12, 4096)
  for (let i = 4; i < limit; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) return { data: buf.subarray(i), ext: 'jpg' }
    if (buf[i] === 0x89 && buf[i + 1] === 0x50 && buf[i + 2] === 0x4e && buf[i + 3] === 0x47) return { data: buf.subarray(i), ext: 'png' }
  }
  // 2) 提取 HEVC NAL，交给 ffmpeg 解码
  const ff = getFfmpeg()
  if (!ff) return { data: null, ext: null, reason: 'wxgf 需要 ffmpeg 转码，当前未找到 ffmpeg' }
  const units = extractNalus(buf)
  const vpsIdx = []
  units.forEach((u, i) => {
    if (u.length >= 2 && ((u[0] >> 1) & 0x3f) === 32) vpsIdx.push(i)
  })
  const groups = []
  for (let i = 0; i < vpsIdx.length; i++) {
    const start = vpsIdx[i]
    const end = i + 1 < vpsIdx.length ? vpsIdx[i + 1] : units.length
    const group = units.slice(start, end)
    const hasVcl = group.some((u) => u.length >= 2 && [19, 20, 1].includes((u[0] >> 1) & 0x3f))
    if (!hasVcl) continue
    groups.push(mergeNalus(group))
  }
  groups.sort((a, b) => b.length - a.length)
  const tries = groups.length ? groups : [mergeNalus(units), buf.subarray(4)]
  for (const candidate of tries) {
    if (!candidate || candidate.length < 100) continue
    try {
      const out = execFileSync(
        ff,
        ['-hide_banner', '-loglevel', 'error', '-f', 'hevc', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1'],
        { input: candidate, maxBuffer: 64 * 1024 * 1024, timeout: 20000 }
      )
      if (out && out.length > 100 && detectImageExt(out)) return { data: out, ext: detectImageExt(out) }
    } catch {
      /* 试下一个候选 */
    }
  }
  return { data: null, ext: null, reason: 'wxgf 转码失败' }
}

function extractNalus(buf) {
  const units = []
  const starts = []
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) starts.push(i + 3)
    else if (i + 4 < buf.length && buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 0 && buf[i + 3] === 1) {
      starts.push(i + 4)
      i += 3
    }
  }
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i]
    const e = i + 1 < starts.length ? starts[i + 1] - 4 : buf.length
    if (e > s) units.push(buf.subarray(s, e))
  }
  return units
}

function mergeNalus(units) {
  const parts = []
  for (const u of units) {
    if (!u || u.length < 2) continue
    parts.push(Buffer.from([0, 0, 0, 1]))
    parts.push(u)
  }
  return Buffer.concat(parts)
}

/**
 * 取图片（带磁盘缓存）
 * @returns {{data: Buffer, ext: string, cached: boolean} | {error: string}}
 */
export function getImage(repo, md5, keys, { thumb = false } = {}) {
  const id = String(md5 || '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(id)) return { error: 'md5 非法' }
  ensureCache()
  const cacheHit = ['jpg', 'png', 'gif', 'webp']
    .map((ext) => path.join(CACHE_DIR, `${id}${thumb ? '-t' : ''}.${ext}`))
    .find((p) => fs.existsSync(p))
  if (cacheHit) {
    return { data: fs.readFileSync(cacheHit), ext: path.extname(cacheHit).slice(1), cached: true }
  }

  const datPath = findDat(repo, id, { thumb })
  if (!datPath) return { error: '本地没有这张图的缓存' }
  let plain
  try {
    plain = decryptDat(fs.readFileSync(datPath), keys)
  } catch (e) {
    return { error: '解密失败: ' + e.message }
  }
  let ext = detectImageExt(plain)
  let data = plain
  if (!ext) {
    const wx = unwrapWxgf(plain)
    if (!wx.data) return { error: wx.reason || '无法识别的图片格式' }
    data = wx.data
    ext = wx.ext
  }
  if (!ext) return { error: '解密结果不是图片' }
  try {
    fs.writeFileSync(path.join(CACHE_DIR, `${id}${thumb ? '-t' : ''}.${ext}`), data)
  } catch {}
  return { data, ext, cached: false }
}
