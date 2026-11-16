// 解密缓存管理
// 设计要点：
//   1) 缓存文件名带源文件指纹（mtime+size），源库变了就写新文件，不会去覆盖正被其它进程打开的文件（Windows 文件锁）
//   2) meta 记录真实的缓存路径，读取时以 meta 为准
//   3) 自动清理过期的旧副本
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { decryptDatabase } from './sqlcipher.mjs'

export class DbCache {
  constructor(rootDir) {
    this.root = rootDir
    fs.mkdirSync(this.root, { recursive: true })
  }

  /** 源文件指纹 */
  fingerprint(sourcePath) {
    const st = fs.statSync(sourcePath)
    return { mtimeMs: st.mtimeMs, size: st.size }
  }

  /** 某个源文件对应的缓存目录与元数据文件 */
  #slot(sourcePath, keyHex) {
    const id = crypto
      .createHash('sha1')
      .update(path.resolve(sourcePath) + '|' + keyHex.slice(0, 8))
      .digest('hex')
      .slice(0, 16)
    const dir = path.join(this.root, id)
    const base = path.basename(sourcePath, '.db')
    return { dir, base, metaFile: path.join(dir, `${base}.meta.json`) }
  }

  #readMeta(metaFile) {
    try {
      return JSON.parse(fs.readFileSync(metaFile, 'utf8'))
    } catch {
      return null
    }
  }

  /**
   * 确保明文库可读；源库有变化时会重新解密到新文件。
   * @returns {{path:string, hit:boolean, decryptMs:number, bytes:number, npages:number, fingerprint:object}}
   */
  ensure(sourcePath, keyBuf, opts = {}) {
    const fp = this.fingerprint(sourcePath)
    const slot = this.#slot(sourcePath, keyBuf.toString('hex'))
    const meta = this.#readMeta(slot.metaFile)

    if (
      !opts.force &&
      meta &&
      meta.mtimeMs === fp.mtimeMs &&
      meta.size === fp.size &&
      meta.path &&
      fs.existsSync(meta.path)
    ) {
      return { ...meta, hit: true, decryptMs: 0 }
    }

    fs.mkdirSync(slot.dir, { recursive: true })
    const t0 = performance.now()
    const raw = fs.readFileSync(sourcePath)
    const { data, npages } = decryptDatabase(raw, keyBuf)
    const ms = performance.now() - t0

    // 先尝试规范文件名；被占用则退让为带指纹的文件名（绝不覆盖正被打开的文件）
    const canonical = path.join(slot.dir, `${slot.base}.db`)
    const fingerprinted = path.join(slot.dir, `${slot.base}.${Math.round(fp.mtimeMs)}-${fp.size}.db`)
    let chosen = canonical
    try {
      const tmp = canonical + '.tmp'
      fs.writeFileSync(tmp, data)
      fs.renameSync(tmp, canonical)
    } catch {
      chosen = fingerprinted
      fs.writeFileSync(chosen, data)
    }

    const nextMeta = {
      path: chosen,
      mtimeMs: fp.mtimeMs,
      size: fp.size,
      bytes: data.length,
      npages,
      decryptMs: Math.round(ms * 10) / 10,
      at: Date.now(),
      source: sourcePath,
    }
    fs.writeFileSync(slot.metaFile, JSON.stringify(nextMeta, null, 2))
    this.#gc(slot.dir, chosen)
    return { ...nextMeta, hit: false, decryptMs: ms }
  }

  /** 清掉该目录下不再使用的旧副本（失败忽略） */
  #gc(dir, keepPath) {
    try {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f)
        if (full === keepPath || f.endsWith('.meta.json') || f.endsWith('.tmp')) continue
        if (full === keepPath) continue
        try {
          fs.rmSync(full, { force: true })
        } catch {
          /* 被占用就留着，下次再清 */
        }
      }
    } catch {
      /* ignore */
    }
  }

  stats() {
    let total = 0
    let files = 0
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name)
        if (ent.isDirectory()) walk(p)
        else {
          files++
          total += fs.statSync(p).size
        }
      }
    }
    try {
      walk(this.root)
    } catch {
      /* ignore */
    }
    return { files, bytes: total }
  }
}
