// 朋友圈解析：SnsTimeLine.content 是一段 <SnsDataItem><TimelineObject> XML
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

function field(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!m) return ''
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function allBlocks(xml, tag) {
  const out = []
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  let m
  while ((m = re.exec(xml))) out.push(m[1])
  return out
}

function attr(xml, tag, name) {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`, 'i'))
  return m ? m[1] : ''
}

/** 解析单条朋友圈 */
export function parseMoment(xml) {
  const id = field(xml, 'id')
  const username = field(xml, 'username')
  const createTime = Number(field(xml, 'createTime') || 0)
  const contentDesc = field(xml, 'contentDesc')
  const contentObject = xml.match(/<ContentObject>([\s\S]*?)<\/ContentObject>/i)?.[1] || ''

  const mediaList = contentObject.match(/<mediaList>([\s\S]*?)<\/mediaList>/i)?.[1] || ''
  const media = allBlocks(mediaList, 'media').map((m) => {
    const type = Number(field(m, 'type') || 0)
    const thumb = field(m, 'thumb')
    const url = m.match(/<url[^>]*>([\s\S]*?)<\/url>/i)?.[1] || ''
    return {
      type, // 1 图片 2 视频 4 链接...
      thumb,
      url,
      width: Number(attr(m, 'size', 'width') || 0),
      height: Number(attr(m, 'size', 'height') || 0),
      md5: attr(m, 'url', 'md5'),
    }
  })

  const likeList = contentObject.match(/<likeList>([\s\S]*?)<\/likeList>/i)?.[1] || ''
  const likes = allBlocks(likeList, 'like')
    .map((l) => field(l, 'userName') || field(l, 'username'))
    .filter(Boolean)

  const commentList = contentObject.match(/<commentList>([\s\S]*?)<\/commentList>/i)?.[1] || ''
  const comments = allBlocks(commentList, 'comment').map((c) => ({
    id: field(c, 'id'),
    nickname: field(c, 'nickname'),
    username: field(c, 'userName') || field(c, 'username'),
    content: field(c, 'content'),
  }))

  const title = field(contentObject, 'title')
  const description = field(contentObject, 'description')

  return {
    id,
    username,
    createTime,
    timeMs: createTime * 1000,
    contentDesc,
    title,
    description,
    media,
    likes,
    comments,
    isVideo: media.some((m) => m.type === 2),
    linkUrl: media.find((m) => m.url && !m.url.includes('mmsns.qpic.cn'))?.url || '',
  }
}

/**
 * 读取朋友圈列表
 * @param {import('./repo.mjs').AccountRepo} repo
 */
export function listMoments(repo, { limit = 30, offset = 0, username = '' } = {}) {
  const file = path.join(repo.dbStorage, 'sns', 'sns.db')
  const db = repo.openSource(file)
  if (!db) return { moments: [], total: 0, hasMore: false }

  const where = username ? 'WHERE content LIKE ?' : ''
  const args = username ? [`%<username>${username}</username>%`] : []
  const total = Number(db.prepare(`SELECT COUNT(*) AS c FROM SnsTimeLine ${where}`).get(...args)?.c ?? 0)

  const rows = db
    .prepare(`SELECT content FROM SnsTimeLine ${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`)
    .all(...args, limit + 1, offset)

  const hasMore = rows.length > limit
  const moments = []
  for (const r of rows.slice(0, limit)) {
    try {
      const m = parseMoment(String(r.content || ''))
      if (!m.contentDesc && !m.media.length && !m.title) continue
      m.authorName = repo.displayName(m.username) || m.username
      m.likeNames = m.likes.map((u) => repo.displayName(u) || u)
      moments.push(m)
    } catch {
      /* 跳过坏数据 */
    }
  }
  return { moments, total, hasMore }
}
