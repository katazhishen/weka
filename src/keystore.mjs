// 密钥来源管理：weka 自己的配置 / 环境变量 / 从 WeFlow 配置导入
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

export const HOME = path.join(os.homedir(), '.weka')
export const CONFIG_FILE = path.join(HOME, 'config.json')

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return { accounts: [] }
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(HOME, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  return CONFIG_FILE
}

export function upsertAccount(account) {
  const cfg = loadConfig()
  const list = Array.isArray(cfg.accounts) ? cfg.accounts : []
  const idx = list.findIndex((a) => a.wxid === account.wxid)
  if (idx >= 0) list[idx] = { ...list[idx], ...account }
  else list.push(account)
  cfg.accounts = list
  saveConfig(cfg)
  return cfg
}

/** 用 Windows DPAPI 解开 Electron safeStorage 的主密钥 */
function dpapiUnwrap(base64Blob) {
  const script = [
    '$ErrorActionPreference="Stop"',
    'try { Add-Type -AssemblyName System.Security } catch {}',
    `$b=[Convert]::FromBase64String('${base64Blob}')`,
    "$p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser')",
    '[Convert]::ToBase64String($p)',
  ].join(';')
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true }
  ).trim()
  return Buffer.from(out, 'base64')
}

/** 解开 Electron safeStorage 的 "safe:..." 值 */
function unwrapSafe(value, aesKey) {
  if (typeof value !== 'string' || !value.startsWith('safe:')) return value
  const raw = Buffer.from(value.slice(5), 'base64')
  const prefix = raw.subarray(0, 3).toString('ascii')
  if (prefix !== 'v10') throw new Error('不认识的 safeStorage 前缀: ' + prefix)
  const nonce = raw.subarray(3, 15)
  const payload = raw.subarray(15)
  const tag = payload.subarray(payload.length - 16)
  const ct = payload.subarray(0, payload.length - 16)
  const d = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}

/**
 * 从 WeFlow 的配置里导入账号与密钥（WeFlow 已停服，但它的配置里还留着可用密钥）
 * @returns {{accounts: Array<{wxid:string, dbPath:string, key:string}>, weflowUserData: string}}
 */
export function importFromWeFlow(weflowUserData) {
  const userData =
    weflowUserData ||
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'weflow')
  const configPath = path.join(userData, 'WeFlow-config.json')
  const localStatePath = path.join(userData, 'Local State')
  if (!fs.existsSync(configPath)) throw new Error('找不到 WeFlow 配置: ' + configPath)
  if (!fs.existsSync(localStatePath)) throw new Error('找不到 WeFlow Local State: ' + localStatePath)

  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'))
  const encKeyB64 = localState?.os_crypt?.encrypted_key
  if (!encKeyB64) throw new Error('Local State 中没有 os_crypt.encrypted_key')

  const blob = Buffer.from(encKeyB64, 'base64')
  if (blob.subarray(0, 5).toString('ascii') !== 'DPAPI') throw new Error('不支持的加密前缀')
  const aesKey = dpapiUnwrap(blob.subarray(5).toString('base64'))

  const dbPath = String(cfg.dbPath || '').trim()
  const accounts = []
  const perWxid = cfg.wxidConfigs && typeof cfg.wxidConfigs === 'object' ? cfg.wxidConfigs : {}

  for (const [wxid, entry] of Object.entries(perWxid)) {
    try {
      const key = unwrapSafe(entry?.decryptKey || '', aesKey)
      if (/^[0-9a-fA-F]{64}$/.test(key)) {
        const acc = { wxid, dbPath, key, source: 'weflow' }
        // 图片密钥（DAT 解密用）
        try {
          const x = unwrapSafe(entry?.imageXorKey || cfg.imageXorKey || '', aesKey)
          const a = unwrapSafe(entry?.imageAesKey || cfg.imageAesKey || '', aesKey)
          if (x) acc.imageXorKey = String(x).trim()
          if (a) acc.imageAesKey = String(a).trim()
        } catch {}
        accounts.push(acc)
      }
    } catch {
      /* 跳过解不开的条目 */
    }
  }
  if (accounts.length === 0 && cfg.decryptKey) {
    try {
      const key = unwrapSafe(cfg.decryptKey, aesKey)
      if (/^[0-9a-fA-F]{64}$/.test(key)) {
        const acc = { wxid: cfg.myWxid || 'default', dbPath, key, source: 'weflow' }
        try {
          const x = unwrapSafe(cfg.imageXorKey || '', aesKey)
          const a = unwrapSafe(cfg.imageAesKey || '', aesKey)
          if (x) acc.imageXorKey = String(x).trim()
          if (a) acc.imageAesKey = String(a).trim()
        } catch {}
        accounts.push(acc)
      }
    } catch {
      /* ignore */
    }
  }
  return { accounts, weflowUserData: userData }
}

/** 汇总最终可用的账号列表（配置 + 环境变量覆盖） */
export function resolveAccounts() {
  const cfg = loadConfig()
  const list = Array.isArray(cfg.accounts) ? [...cfg.accounts] : []
  if (process.env.WEKA_KEY) {
    const wxid = process.env.WEKA_WXID
    const dbPath = process.env.WEKA_DBPATH
    if (wxid) {
      const found = list.find((a) => a.wxid === wxid)
      if (found) {
        found.key = process.env.WEKA_KEY
        if (dbPath) found.dbPath = dbPath
      } else {
        list.push({ wxid, key: process.env.WEKA_KEY, dbPath, source: 'env' })
      }
    }
  }
  return list
}
