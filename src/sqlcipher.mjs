// weka 核心：微信 4.0 (xwechat) SQLCipher 数据库解密
// 参数（已用真实数据逆向确认）：
//   - KDF: PBKDF2-SHA512(passphrase = 32 字节密钥原文, salt = 文件前 16 字节, 256000 轮, 32 字节)
//   - 加密: AES-256-CBC，页大小 4096，每页 reserve = 80 = IV(16) + HMAC-SHA512(64)
//   - 第 1 页: 磁盘前 16 字节是 salt，顶替了 SQLite 头的前 16 字节（"SQLite format 3\0" 需自行补回）
//   - 第 n 页: 密文 = page[0:4016]，IV = page[4016:4032]，HMAC = page[4032:4096]
import crypto from 'node:crypto'

export const PAGE_SIZE = 4096
export const IV_SIZE = 16
export const HMAC_SIZE = 64
export const RESERVE = IV_SIZE + HMAC_SIZE // 80
export const SALT_SIZE = 16
export const CT_LEN = PAGE_SIZE - RESERVE // 4016
export const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1')

const KDF_ITER = 256000

/** 由 32 字节密钥与 salt 派生加密/MAC 密钥 */
export function deriveKeys(keyBuf, salt) {
  const encKey = crypto.pbkdf2Sync(keyBuf, salt, KDF_ITER, 32, 'sha512')
  const saltXor = Buffer.from(salt.map((b) => b ^ 0x3a))
  const macKey = crypto.createHmac('sha512', encKey).update(saltXor).digest().subarray(0, 32)
  return { encKey, macKey }
}

/** 页面 HMAC（用于完整性校验） */
export function pageHmac(macKey, ct, iv, pgno) {
  const pg = Buffer.alloc(4)
  pg.writeUInt32LE(pgno, 0)
  return crypto.createHmac('sha512', macKey).update(ct).update(iv).update(pg).digest()
}

function cbcDecrypt(encKey, iv, ct) {
  const d = crypto.createDecipheriv('aes-256-cbc', encKey, iv)
  d.setAutoPadding(false)
  return Buffer.concat([d.update(ct), d.final()])
}

/**
 * 解密整页。返回 { page: Buffer(4096), hmacOk: boolean }
 * 第 1 页会把 SQLite 头前 16 字节补回，末尾 80 字节补 0。
 */
export function decryptPage(encKey, macKey, pgno, rawPage) {
  const page = Buffer.alloc(PAGE_SIZE)
  const ctStart = pgno === 1 ? SALT_SIZE : 0
  const ct = rawPage.subarray(ctStart, CT_LEN)
  const iv = rawPage.subarray(CT_LEN, CT_LEN + IV_SIZE)
  const plain = cbcDecrypt(encKey, iv, ct)

  let off
  if (pgno === 1) {
    SQLITE_MAGIC.copy(page, 0)
    plain.copy(page, SALT_SIZE)
    off = SALT_SIZE + plain.length
  } else {
    plain.copy(page, 0)
    off = plain.length
  }
  page.fill(0, off)

  let hmacOk = false
  if (macKey) {
    const stored = rawPage.subarray(PAGE_SIZE - HMAC_SIZE, PAGE_SIZE)
    const calc = pageHmac(macKey, ct, iv, pgno)
    hmacOk = stored.equals(calc)
  }
  return { page, hmacOk }
}

/** 读取并校验一个加密库文件的基本信息 */
export function inspect(rawHeader) {
  if (rawHeader.length < PAGE_SIZE) return { ok: false, reason: 'too-small' }
  // 加密库没有明文头，无法直接用 magic 判断
  return { ok: true, salt: rawHeader.subarray(0, SALT_SIZE).toString('hex') }
}

/**
 * 解密整个数据库文件到内存（Buffer）
 * @param {Buffer} raw 加密库内容
 * @param {Buffer} keyBuf 32 字节密钥
 * @param {{verifyHmac?: boolean}} opts
 */
export function decryptDatabase(raw, keyBuf, opts = {}) {
  if (raw.length % PAGE_SIZE !== 0) {
    // 微信库一般页对齐；不足一页的部分丢弃
  }
  const npages = Math.floor(raw.length / PAGE_SIZE)
  if (npages < 1) throw new Error('数据库文件小于一页，无法解密')

  const salt = raw.subarray(0, SALT_SIZE)
  const { encKey, macKey } = deriveKeys(keyBuf, salt)

  const out = Buffer.alloc(npages * PAGE_SIZE)
  let hmacChecked = 0
  let hmacFailed = 0

  for (let i = 0; i < npages; i++) {
    const pgno = i + 1
    const rawPage = raw.subarray(i * PAGE_SIZE, (i + 1) * PAGE_SIZE)
    const { page, hmacOk } = decryptPage(encKey, macKey, pgno, rawPage)
    page.copy(out, i * PAGE_SIZE)
    if (opts.verifyHmac) {
      hmacChecked++
      if (!hmacOk) hmacFailed++
    }
  }

  // 修正 SQLite 头里的 page count（加密库的头部被改写，这里保持原样即可被 sqlite 接受）
  // 把文件格式版本从 2(WAL) 改成 1(rollback journal)：
  // 我们只解密主库文件、不带 WAL，改成 rollback 模式后 sqlite 不会去创建 -wal/-shm 附属文件
  if (out.length > 20) {
    out[18] = 1
    out[19] = 1
  }
  return { data: out, npages, hmacChecked, hmacFailed, salt: salt.toString('hex') }
}

/** 把密钥 hex 规范化为 32 字节 Buffer */
export function parseKey(input) {
  const clean = String(input || '').trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('密钥必须是 64 位十六进制（32 字节）')
  }
  return Buffer.from(clean, 'hex')
}
