// 邮件里的验证 / 激活 / 登录链接识别。原则同验证码：宁可漏判，不可误判 —— 有任何歧义就返回 null。
//
// 判定分两层：
//   1. 邮件层：主题或正文必须明确是"验证邮箱 / 激活账号 / 确认注册 / 链接登录"这类邮件。
//      新登录提醒、重置密码、营销邮件里的"登录"按钮因此都不会被当成验证链接。
//   2. 链接层，按可信度分档，取最高的一档：
//      a. 按钮文字本身就是验证动作（Verify email、立即验证、激活账号……）
//      b. 按钮文字是登录（Sign in to Notion），仅限链接登录类邮件
//      c. "点击下方链接完成验证："之后单独给出的网址，或"click here"这类泛称链接
//      退订、帮助、隐私、"不是我"、重置密码、社交媒体、应用商店等链接一律排除。
// 同一档里出现多个不同目标视为歧义（同一按钮文字、同一域名的重复按钮除外）。
import { htmlToText } from "@/lib/verification-code"

export interface VerificationLink {
  url: string
  host: string
}

export interface VerificationLinkSource {
  subject?: string | null
  text?: string | null
  html?: string | string[] | null
}

// ---------- 1. 邮件层 ----------
const VERIFY_GATE_SOURCES = [
  "\\b(?:verify|confirm|activate|validate)\\s+(?:(?:your|this|the|my)\\s+)?(?:new\\s+)?(?:e-?mail(?:\\s+address)?|account|address|identity|registration|sign[\\s-]?up|subscription|device)\\b",
  "\\b(?:e-?mail|account|address|identity|registration)\\s+(?:verification|confirmation|activation)\\b",
  "\\b(?:complete|finish)\\s+(?:your\\s+)?(?:registration|sign[\\s-]?up|signing\\s+up|verification|account\\s+setup)\\b",
  "验证(?:您|你)?的?(?:邮箱|邮件地址|电子邮件|电子邮箱|账号|帐号|账户|身份|注册)|(?:邮箱|账号|帐号|账户|注册|身份)(?:验证|激活|确认)",
  "激活(?:您|你)?的?(?:账号|帐号|账户|邮箱)|确认(?:您|你)?的?(?:邮箱|邮件地址|注册|订阅)|完成(?:注册|验证|激活)",
  "驗證(?:您|你)?的?(?:信箱|電子郵件|帳號|帳戶|身分|身份)|(?:信箱|帳號|帳戶)(?:驗證|啟用)|啟用(?:您|你)?的?帳[號戶]",
  "メールアドレス(?:の|を)?(?:確認|認証)|アカウント(?:の|を)?(?:有効化|確認)|本登録|이메일\\s?(?:인증|확인)|계정\\s?(?:활성화|인증)",
]
// 链接登录（magic link）类邮件：只有这类邮件里的"登录"按钮才算数
const SIGN_IN_GATE_SOURCES = [
  "\\bmagic\\s+link\\b|\\b(?:sign|log)[\\s-]?in\\s+link\\b|\\blink\\s+(?:below\\s+)?to\\s+(?:sign|log)\\s+in\\b",
  "\\b(?:click|tap|use)\\s+(?:the|this)\\s+(?:link|button)(?:\\s+below)?\\s+to\\s+(?:sign|log)\\s+in\\b",
  "登录链接|登入链接|链接登录|點擊.{0,6}登入|点击.{0,6}(?:登录|登入)",
]

// ---------- 2. 链接层 ----------
const VERIFY_TEXT_SOURCE = [
  "\\b(?:verify|confirm|activate|validate)\\b",
  "\\b(?:complete|finish)\\s+(?:your\\s+)?(?:registration|sign[\\s-]?up|signing\\s+up|verification)\\b",
  "\\byes,?\\s+subscribe\\s+me\\b",
  "验证|驗證|确认|確認|激活|启用|啟用|完成注册|完成註冊",
  "認証|確認する|有効化|본인\\s?인증|인증|확인|활성화",
].join("|")
const SIGN_IN_TEXT_SOURCE = "\\b(?:sign|log)[\\s-]?in\\b|\\blogin\\b|\\bmagic\\s+link\\b|登录|登入|登錄|ログイン|로그인"
const GENERIC_TEXT_SOURCE =
  "^(?:click\\s+here|tap\\s+here|here|this\\s+link|the\\s+link|link|open\\s+link|点击这里|点击此处|点此|这里|此链接|点击链接|點擊這裡|點此|こちら|여기)$"
// 网址前面的说明句：要有"点 / 打开 / 复制"这类动作，并且提到验证、登录或链接本身
const CONTEXT_ACTION_SOURCE =
  "\\b(?:click|tap|open|visit|follow|press|copy|paste|go\\s+to)\\b|点击|點擊|打开|打開|访问|訪問|复制|複製|粘贴|貼上|クリック|アクセス|클릭"
const CONTEXT_TOPIC_SOURCE = `${VERIFY_TEXT_SOURCE}|${SIGN_IN_TEXT_SOURCE}|\\b(?:link|url|button)\\b|链接|鏈接|連結|网址|網址|按钮|リンク|링크`

const NEGATIVE_TEXT_SOURCE = [
  "unsubscribe|opt[\\s-]?out|preferences|manage\\s+(?:your\\s+)?(?:e-?mail|notification|subscription)",
  "privacy|terms|policy|help|support|contact|faq|feedback|learn\\s+more|read\\s+more|download",
  "view\\s+(?:it\\s+|this\\s+e-?mail\\s+)?(?:in|on)\\s+(?:your\\s+|a\\s+)?(?:web\\s+)?browser|web\\s+version",
  "not\\s+you|wasn'?t\\s+(?:me|you)|did\\s?n[o']?t\\s+(?:request|sign|create|make|try)|report|secure\\s+(?:your|my)",
  "change\\s+(?:your\\s+)?password|reset|cancel|decline|reject|deny|block|delete|remove|app\\s+store|google\\s+play",
  "退订|退訂|取消订阅|取消訂閱|偏好|隐私|隱私|条款|條款|帮助|幫助|客服|联系|聯繫|反馈|不是我|非本人|不是您|并非|举报|舉報|拒绝|取消|删除|重置|在浏览器",
  "配信停止|プライバシー|ヘルプ|수신\\s?거부|개인정보|도움말",
].join("|")
const NEGATIVE_URL_SOURCE = [
  "unsubscribe|opt-?out|/preferences|/privacy|/terms|/legal|/help\\b|/support\\b|/faq\\b|list-manage\\.com/(?:unsubscribe|profile)",
  "//(?:[\\w-]+\\.)?(?:facebook|twitter|x|instagram|linkedin|youtube|tiktok|weibo|pinterest|discord)\\.com\\b",
  "//apps\\.apple\\.com|//play\\.google\\.com",
  "\\.(?:png|jpe?g|gif|svg|webp|ico)(?:[?#]|$)",
].join("|")

interface Compiled {
  verifyGate: RegExp
  signInGate: RegExp
  verifyText: RegExp
  signInText: RegExp
  genericText: RegExp
  contextAction: RegExp
  contextTopic: RegExp
  negativeText: RegExp
  negativeUrl: RegExp
}

// 规则用到了 Unicode 属性和后行断言，老浏览器不支持时只是不显示链接
let compiled: Compiled | null | undefined
function rules(): Compiled | null {
  if (compiled !== undefined) return compiled
  try {
    compiled = {
      verifyGate: new RegExp(VERIFY_GATE_SOURCES.join("|"), "iu"),
      signInGate: new RegExp(SIGN_IN_GATE_SOURCES.join("|"), "iu"),
      verifyText: new RegExp(VERIFY_TEXT_SOURCE, "iu"),
      signInText: new RegExp(SIGN_IN_TEXT_SOURCE, "iu"),
      genericText: new RegExp(GENERIC_TEXT_SOURCE, "iu"),
      contextAction: new RegExp(CONTEXT_ACTION_SOURCE, "iu"),
      contextTopic: new RegExp(CONTEXT_TOPIC_SOURCE, "iu"),
      negativeText: new RegExp(NEGATIVE_TEXT_SOURCE, "iu"),
      negativeUrl: new RegExp(NEGATIVE_URL_SOURCE, "iu"),
    }
  } catch (err) {
    console.warn("Verification link detection is unavailable in this browser:", err)
    compiled = null
  }
  return compiled
}

// ---------- 3. 候选链接 ----------
interface Candidate {
  url: string
  host: string
  // 按钮 / 链接文字；纯文本邮件里的裸网址为空
  label: string
  // 链接前面紧挨着的那句说明
  context: string
}

const MAX_HTML = 200_000
const MAX_ANCHORS = 200

const squash = (s: string) => s.replace(/[​-‍⁠﻿­]/g, "").replace(/\s+/g, " ").trim()

function parseUrl(raw: string): { url: string; host: string } | null {
  const href = raw
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
  if (href.length > 2048) return null
  try {
    const u = new URL(href)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    return { url: u.href, host: u.hostname.replace(/^www\./, "") }
  } catch {
    return null
  }
}

// 链接前面那句话：去掉结尾的冒号 / 句号后，截到上一个句子或段落边界
function sentenceBefore(text: string): string {
  const tail = squash(text.slice(-240)).replace(/[\s:：.。,，]+$/, "")
  const parts = tail.split(/[.!?。！？]\s|[!?。！？]|\n\s*\n/)
  return parts[parts.length - 1] ?? ""
}

function anchorCandidates(html: string): Candidate[] {
  const out: Candidate[] = []
  // 长度上限防止恶意 HTML 造成回溯爆炸
  const re = /<a\b([^>]{0,1000})>([\s\S]{0,3000}?)<\/a\s*>/gi
  for (const m of html.matchAll(re)) {
    if (out.length >= MAX_ANCHORS) break
    const href = m[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const parsed = href && parseUrl(href[1] ?? href[2] ?? href[3] ?? "")
    if (!parsed) continue
    // 图片按钮没有文字，用 alt
    const alt = m[2].match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
    const label = squash(htmlToText(m[2])) || squash(alt?.[1] ?? alt?.[2] ?? "")
    const context = sentenceBefore(htmlToText(html.slice(Math.max(0, m.index! - 800), m.index!)))
    out.push({ ...parsed, label, context })
  }
  return out
}

function plainCandidates(text: string): Candidate[] {
  const out: Candidate[] = []
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'）)\]】」』]{4,2048}/gi)) {
    if (out.length >= MAX_ANCHORS) break
    const parsed = parseUrl(m[0].replace(/[.,;:!?。，；：！？]+$/, ""))
    if (!parsed) continue
    out.push({ ...parsed, label: "", context: sentenceBefore(text.slice(Math.max(0, m.index! - 400), m.index!)) })
  }
  return out
}

const looksLikeUrl = (s: string) => /^(?:https?:\/\/|www\.)\S+$/i.test(s)

// ---------- 4. 分档与去歧义 ----------
function tierOf(c: Candidate, r: Compiled): number {
  if (r.negativeUrl.test(c.url)) return 0
  const label = c.label.length <= 60 ? c.label : ""
  if (label && !looksLikeUrl(label)) {
    if (r.negativeText.test(label)) return 0
    if (r.verifyText.test(label)) return 3
    if (r.signInText.test(label)) return 2
    if (!r.genericText.test(label)) return 0
  }
  // 裸网址 / 泛称链接：看前面那句说明，泛称链接连同自身文字一起看（To activate your account, click here）
  const sentence = label && !looksLikeUrl(label) ? `${c.context} ${label}` : c.context
  if (r.negativeText.test(sentence)) return 0
  return r.contextAction.test(sentence) && r.contextTopic.test(sentence) ? 1 : 0
}

function pick(cands: Candidate[]): Candidate | null {
  const byUrl = new Map<string, Candidate>()
  for (const c of cands) if (!byUrl.has(c.url)) byUrl.set(c.url, c)
  const unique = [...byUrl.values()]
  if (unique.length === 1) return unique[0]
  // 同一个按钮在邮件里重复出现（追踪链接各不相同）：文字和域名都一致才认为是同一个
  const [first] = unique
  const same = unique.every((c) => c.host === first.host && c.label.toLowerCase() === first.label.toLowerCase() && c.label)
  return same ? first : null
}

/**
 * 识别邮件里需要点开的验证 / 激活 / 登录链接，识别不到或有歧义时返回 null。
 */
export function extractVerificationLink(source: VerificationLinkSource): VerificationLink | null {
  const r = rules()
  if (!r) return null

  const html = (Array.isArray(source.html) ? source.html.join("\n") : source.html || "").slice(0, MAX_HTML)
  const text = (source.text || "").slice(0, MAX_HTML)
  const bodyText = squash(text || htmlToText(html)).slice(0, 20_000)
  const subject = squash(source.subject ?? "").slice(0, 1000)
  const isVerify = r.verifyGate.test(subject) || r.verifyGate.test(bodyText)
  const isSignIn = r.signInGate.test(subject) || r.signInGate.test(bodyText)
  if (!isVerify && !isSignIn) return null

  let cands = html ? anchorCandidates(html) : []
  if (!cands.length) cands = plainCandidates(text || htmlToText(html))

  const tiers = new Map<number, Candidate[]>()
  for (const c of cands) {
    const tier = tierOf(c, r)
    if (tier) tiers.set(tier, [...(tiers.get(tier) ?? []), c])
  }
  for (const tier of [3, 2, 1]) {
    const list = tiers.get(tier)
    // 登录按钮只在链接登录类邮件里算数（验证邮件页眉里的"Log in"不能盖过下面的验证网址）
    if (!list || (tier === 2 && !isSignIn)) continue
    const chosen = pick(list)
    return chosen ? { url: chosen.url, host: chosen.host } : null
  }
  return null
}
