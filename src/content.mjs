// 消息内容解码：zstd 解压 + 微信 4.0 local_type 解析
import { zstdDecompressSync } from 'node:zlib'

/** 微信 4.0 的 local_type：低 32 位是基础类型，高 32 位是子类型 */
export function splitType(localType) {
  const v = typeof localType === 'bigint' ? localType : BigInt(Math.trunc(Number(localType)))
  return {
    base: Number(v & 0xffffffffn),
    sub: Number((v >> 32n) & 0xffffffffn),
  }
}

/** 把一个可能是压缩的列还原成字符串 */
export function decodeColumn(value, ctFlag) {
  if (value === null || value === undefined) return ''
  let buf
  if (typeof value === 'string') buf = Buffer.from(value, 'utf8')
  else buf = Buffer.from(value)
  const flag = Number(ctFlag ?? 0)
  if (flag > 0) {
    try {
      buf = zstdDecompressSync(buf)
    } catch {
      return ''
    }
  }
  return buf.toString('utf8')
}

const TYPE_LABEL = {
  1: '文本',
  3: '图片',
  34: '语音',
  37: '好友验证',
  42: '名片',
  43: '视频',
  47: '表情',
  48: '位置',
  49: '链接/文件',
  50: '通话',
  51: '通话',
  10000: '系统消息',
}

/** 从 appmsg / 各种 XML 里抠出可读的标题 */
function xmlField(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ''
}

/** 把 XML 类消息降级成可读纯文本 */
export function stripXml(xml) {
  if (!xml) return ''
  // 优先取 sysmsgtemplate 里的纯文本模板
  const plain = xmlField(xml, 'plain') || xmlField(xml, 'replacemsg')
  const src = plain || xmlField(xml, 'template') || xmlField(xml, 'content') || xmlField(xml, 'title') || xml
  return (
    src
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\$[a-zA-Z0-9_]+\$/g, '') // 模板占位符
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim() || xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  )
}

/** 内容里是否含 XML/HTML 标签 */
export function looksXml(text) {
  return /<[a-zA-Z!/]/.test(String(text || ''))
}

/**
 * 把一条消息变成界面可直出的结构
 * @returns {{kind: string, label: string, text: string}}
 */
export function renderMessage({ localType, content }) {
  const { base, sub } = splitType(localType)
  const raw = content || ''

  switch (base) {
    case 1:
      return { kind: 'text', label: '', text: looksXml(raw) ? stripXml(raw) : raw }
    case 3:
      return { kind: 'image', label: '[图片]', text: '' }
    case 34:
      return { kind: 'voice', label: '[语音]', text: '' }
    case 43:
      return { kind: 'video', label: '[视频]', text: '' }
    case 47:
      return { kind: 'sticker', label: '[表情]', text: '' }
    case 42:
      return { kind: 'card', label: '[名片]', text: xmlField(raw, 'nickname') }
    case 48:
      return { kind: 'location', label: '[位置]', text: xmlField(raw, 'poiname') }
    case 50:
    case 51:
      return { kind: 'call', label: '[通话]', text: '' }
    case 10000:
      return { kind: 'system', label: '', text: looksXml(raw) ? stripXml(raw) : raw }
    case 49: {
      const title = xmlField(raw, 'title')
      switch (sub) {
        case 5:
          return { kind: 'link', label: '[链接]', text: title }
        case 6:
          return { kind: 'file', label: '[文件]', text: title || xmlField(raw, 'title') }
        case 19:
          return { kind: 'appmsg', label: '[聊天记录]', text: title }
        case 33:
        case 36:
          return { kind: 'miniapp', label: '[小程序]', text: title }
        case 57:
          return { kind: 'quote', label: '[引用]', text: title || xmlField(raw, 'des') }
        case 2000:
          return { kind: 'transfer', label: '[转账]', text: xmlField(raw, 'des') }
        case 2001:
          return { kind: 'redpacket', label: '[红包]', text: xmlField(raw, 'des') }
        default:
          return { kind: 'appmsg', label: '[卡片]', text: title }
      }
    }
    default: {
      return {
        kind: 'other',
        label: `[${TYPE_LABEL[base] || '消息 ' + base}]`,
        text: (looksXml(raw) ? stripXml(raw) : raw).slice(0, 200),
      }
    }
  }
}
