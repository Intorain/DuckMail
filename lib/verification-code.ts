// 邮件验证码识别。原则：宁可漏判，不可误判 —— 有任何歧义就返回 null。
//
// 规则综合自以下开源实现（均为宽松许可证）：
//   2FHey (CC0)、AOSP NotificationOtpDetectionHelper (Apache-2.0)、
//   cloudflare_temp_email extract_code.ts (MIT)、Raycast 扩展、Tether (MIT)
// 流程：关键词锚定的句式优先；没有命中时，在"确实是验证邮件"的前提下按位置关系兜底（仅数字）；
// 同一封邮件识别出多个不同验证码时视为歧义，不显示。

export interface VerificationCodeSource {
  subject?: string | null
  text?: string | null
  html?: string | string[] | null
  // 列表接口返回的正文摘要，可能被截断
  intro?: string | null
}

// ---------- 1. 关键词 ----------
const KW_LIST = [
  // 简 / 繁中文
  "验证码", "驗證碼", "校验码", "校驗碼", "检验码", "檢驗碼", "认证码", "認證碼", "确认码", "確認碼",
  "动态码", "動態碼", "安全码", "安全碼", "登录码", "登錄碼", "登入码", "登入碼", "激活码", "激活碼",
  "短信口令", "动态口令", "動態口令", "随机码", "隨機碼", "授权码", "授權碼",
  "(?:动态|動態|一次性|临时|臨時)\\s{0,2}密[码碼]",
  "(?<!源|邀请|推荐|优惠|兑换|股票|错误|邮政|国家|地区|商品|产品)代[码碼]",
  // 日 / 韩
  "認証コード", "確認コード", "認証番号", "確認番号", "ワンタイムパス(?:ワード|コード)", "セキュリティコード", "パスコード",
  "인증\\s?(?:코드|번호)", "확인\\s?코드", "보안\\s?코드",
  // 英文
  "verification\\s?code", "verify\\s?code", "(?<!(?:booking|reservation|order|flight|trip|ticket)\\s{0,3})confirmation\\s?code",
  "security\\s?code", "log[\\s-]?in\\s?code", "sign[\\s-]?in\\s?code", "access\\s?code",
  "auth(?:entication|orization)?\\s?code", "activation\\s?code", "validation\\s?code",
  "(?:two|2)[\\s-]?factor\\s?code", "2fa\\s?code", "one[\\s-]?time\\s?(?:pass(?:word|code)|code|pin)",
  "\\bpasscode\\b", "\\botp\\b", "\\bpin\\b",
  // 西 / 葡 / 意 / 法 / 德 / 俄 / 土 / 波 / 希伯来
  "c[óo]digo(?!\\s{1,3}postal)", "codice(?!\\s{1,3}fiscale)",
  "code\\s(?:de\\s(?:s[ée]curit[ée]|v[ée]rification|confirmation|connexion)|d['’]acc[èe]s)",
  "(?:best[äa]tigungs|verifizierungs|sicherheits|anmelde|einmal|aktivierungs)code", "einmalkennwort",
  "(?<!\\p{L})код(?!\\p{L})", "(?<!\\p{L})kod(?:u|unuz)?(?!\\p{L})", "קוד",
  // 单独的 code，排除优惠码、邮编、错误码等非验证码组合
  "\\bcode\\b(?<!(?:promo|promotion|promotional|coupon|discount|gift|referral|invite|invitation|zip|postal|post|country|area|dial|source|error|status|tracking|order|reference|ref|voucher|product|item|booking|qr|bar|redeem|redemption|html|sample|confirmation|tax|swift|sort|bank|branch|color|colour|dress|access)[\\s-]{0,3}code)",
]
const KW = `(?:${KW_LIST.join("|")})`
const CJK_KW = `(?:${KW_LIST.filter((k) => /[\p{Script=Han}\p{Script=Katakana}\p{Script=Hangul}]/u.test(k)).join("|")})`

// ---------- 2. 验证码形态 ----------
const DELIM =
  "\\s{0,3}(?:[:：=]|(?<!\\p{L})(?:is|was|ist|lautet|est|es|é|è)(?!\\p{L})|是|为|為|は|는|은|です|הוא)[\\s:：]{0,8}"
const OPEN = "[\\[【(（「『\"'“]?\\s{0,2}"
const CLOSE = "\\s{0,2}[\\]】)）」』\"'”]?"
// 不能是更长数字、金额、编号、时间、电话的一部分
const NUM_BEFORE = "(?<![\\w+\\-/#№])(?<!\\d[.,:：])(?<![$€£¥￥₹]\\s?)(?<!\\b(?:Rs|RMB|CNY|USD|EUR|GBP|HKD|NTD)\\.?\\s?)"
const NUM_AFTER = "(?![\\w/%]|[ -]\\d|[.,:：]\\d|\\s?(?:USD|EUR|GBP|RMB|CNY|元|块|円|원|年|月|日|号|點|点|时|時|分|秒))"
const DIGIT_CODE = `${NUM_BEFORE}(?:[A-Z]{1,3}-)?(\\d{3}[ -]\\d{3}|\\d{4}[ -]\\d{4}|\\d{4,8})${NUM_AFTER}`
const ALNUM_CODE =
  "(?<![\\w\\-+/#])((?=[A-Za-z0-9-]{0,10}\\d)[A-Za-z0-9]{3,5}-[A-Za-z0-9]{3,5}|(?=[A-Za-z]{0,9}\\d)[A-Za-z0-9]{4,10})(?![\\w\\-/]| \\d|[.,:]\\d)"
const ANY_CODE = `(?:${DIGIT_CODE}|${ALNUM_CODE})`
const FILLER = "(?:\\s{1,3}[^\\s。！？!?]{0,30}[^\\s。！？!?.,:]){1,6}?"

// 档 1：关键词锚定的句式，按优先级排列
const ANCHORED_SOURCES = [
  `${KW}${DELIM}${OPEN}${DIGIT_CODE}${CLOSE}`, // code: 123456 / 验证码是 123-456
  `${KW}${DELIM}${OPEN}${ALNUM_CODE}`, // code: 7F3K9Q
  // 123456 is your Acme code
  `${ANY_CODE}\\s{1,3}(?:is|est|ist|es|é)\\s{1,3}(?:(?:your|the|votre|ihr|dein|deine|der|su|tu|seu|o\\s{1,3}seu)\\s{1,3})?(?:[\\p{L}\\d.'’&-]{1,30}\\s{1,3}){0,3}(?:\\p{L}{1,20}-)?${KW}`,
  // 123456是您的验证码 / 116352（动态验证码）
  `${ANY_CODE}\\s{0,3}[(（【\\[]?\\s{0,3}(?:是|为|為|は)?\\s{0,3}(?:您|你)?的?[\\p{Script=Han}\\p{Script=Katakana}]{0,6}?${CJK_KW}`,
  `${KW}${FILLER}${DELIM}${OPEN}${ANY_CODE}`, // OTP for payment of Rs 5000 is 482913
  `${KW}\\s{0,3}${OPEN}${DIGIT_CODE}`, // 验证码123456 / 인증번호 [736251]
  `${KW}[^\\n\\d]{0,60}\\n(?:[ \\t]*\\n){0,3}[ \\t]{0,8}${OPEN}${ANY_CODE}${CLOSE}[ \\t]{0,8}(?:\\n|$)`, // "code below:\n\n 591 204\n"
]

// 档 2 的前提：邮件确实是验证类邮件（单独一个 confirm 不够）
const VERIFY_CONTEXT_SOURCE = [
  KW,
  "\\b(?:verify|confirm|activate|validate)\\s{1,3}(?:(?:your|this|the)\\s{1,3})?(?:e-?mail(?:\\s{1,3}address)?|account|identity|registration|sign[\\s-]?(?:in|up)|log[\\s-]?in|device)",
  "\\b(?:e-?mail|account|identity|log[\\s-]?in|sign[\\s-]?in)\\s{1,3}(?:verification|authentication)",
  "\\btwo[\\s-]?factor\\b|\\b2fa\\b",
  "验证(?:您|你)?的?(?:邮箱|账号|帐号|账户|身份)|(?:邮箱|账号|帐号|身份|登录)验证|驗證(?:您|你)?的?(?:信箱|帳號|身分|身份)|認証|인증",
].join("|")

// ---------- 3. 禁区：电话、金额、日期等数字（2FHey NumberGuard + 国内补充） ----------
const FORBIDDEN_SOURCES: [string, string][] = [
  ["\\+\\d[\\d\\s().\\-]{5,}\\d", "g"], // +1 415 555 2671 / +86 138...
  ["\\(?\\b\\d{3}\\)?[-. ]\\d{3}[-. ]\\d{4}\\b", "g"], // 555-123-4567
  ["\\b\\d{3}[-.]\\d{4}\\b", "g"], // 555-1234
  ["\\b(?:0\\d{2,3}|400|800)[-\\s]?\\d{3,4}[-\\s]?\\d{4}\\b", "g"], // 国内座机 / 400 热线
  ["\\d{9,}", "g"], // 长数字：账号、手机号
  ["(?:\\b(?:call|text|dial|sms|fax|tel|phone)\\b|致电|拨打|热线|客服电话|电话|手机)[^\\d\\n]{0,20}[+(]?\\d[\\d ().\\-]*", "giu"],
  ["[$€£¥￥₹]\\s?\\d[\\d,.]*", "g"],
  ["(?<![\\d,.])\\d[\\d,.]*\\s?(?:元|块|美元|USD|EUR|GBP|RMB|CNY|JPY|円|원)", "gu"],
  ["\\b\\d+[.,]\\d+\\b", "g"], // 小数、IP、千分位
  ["\\b\\d{1,2}:\\d{2}\\b", "g"],
  ["\\b\\d+\\s?(?:am|pm)\\b", "gi"],
  ["\\b\\d+(?:st|nd|rd|th)\\b", "gi"],
  ["\\b\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}\\b", "g"], // 2026-10-13 / 10/13/2026
  ["\\d{2,4}\\s?年\\s?\\d{1,2}\\s?月(?:\\s?\\d{1,2}\\s?[日号])?", "gu"],
]
// "<标签> <数字>"：数字属于前面的标签（订单号、卡号尾号……），不是验证码
const LABEL_BEFORE_SOURCE =
  "(?:\\b(?:order|invoice|receipt|tracking|shipment|parcel|booking|reservation|ticket|ref(?:erence)?|account|acct|card|ending(?:\\s+in)?|last\\s+\\d|member|customer|user|id|no|zip|postal|amount|total|price|room|flight|serial|model|sku)\\b|订单|單號|单号|运单|快递|发票|编号|編號|账号|帳號|卡号|尾号|末四位|金额|合计|房间|邮编|序列号|会员|#)\\s*(?:number|no\\.?|num|id|#|号|號)?\\s*[:：#]?\\s*$"
const USE_BEFORE_SOURCE = "(?:\\b(?:use|enter|input|type)|输入|填写|輸入|입력)\\s{0,3}[\\[【(（「\"']?\\s{0,2}(?:[A-Z]{1,3}-)?$"

interface Compiled {
  anchored: RegExp[]
  keyword: RegExp
  keywordGlobal: RegExp
  verifyContext: RegExp
  forbidden: RegExp[]
  labelBefore: RegExp
  useBefore: RegExp
  digitCode: RegExp
}

// 规则用到了后行断言，Safari 16.4 以下不支持。懒编译并兜住异常：
// 老浏览器上只是不显示验证码，不能让整个收件箱因为模块加载失败而白屏。
let compiled: Compiled | null | undefined
function rules(): Compiled | null {
  if (compiled !== undefined) return compiled
  try {
    compiled = {
      anchored: ANCHORED_SOURCES.map((s) => new RegExp(s, "giu")),
      keyword: new RegExp(KW, "iu"),
      keywordGlobal: new RegExp(KW, "giu"),
      verifyContext: new RegExp(VERIFY_CONTEXT_SOURCE, "iu"),
      forbidden: FORBIDDEN_SOURCES.map(([s, f]) => new RegExp(s, f)),
      labelBefore: new RegExp(LABEL_BEFORE_SOURCE, "iu"),
      useBefore: new RegExp(USE_BEFORE_SOURCE, "iu"),
      digitCode: new RegExp(DIGIT_CODE, "gu"),
    }
  } catch (err) {
    console.warn("Verification code detection is unavailable in this browser:", err)
    compiled = null
  }
  return compiled
}

function forbiddenRanges(text: string, r: Compiled): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const re of r.forbidden) {
    for (const m of text.matchAll(re)) {
      let s = m.index!
      let e = s + m[0].length
      // 向两侧吞掉紧挨着的数字
      while (s > 0 && /\d/.test(text[s - 1])) s--
      while (e < text.length && /\d/.test(text[e])) e++
      out.push([s, e])
    }
  }
  return out
}

// ---------- 4. 候选合理性 ----------
const OPT_OUT = new Set(["stop2end", "end2end"])
function isPlausible(code: string): boolean {
  if (/^\d+$/.test(code)) {
    if (code.length < 4 || code.length > 8) return false
    if (code.length === 4 && /^(?:19|20)\d\d$/.test(code)) return false // 年份
    if (code.length === 8 && /^(?:19|20)\d\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(code)) return false // YYYYMMDD
    return true
  }
  if (!/^[A-Za-z0-9]{4,10}$/.test(code) || !/\d/.test(code)) return false // 字母数字混合必须含数字
  if (/\p{Ll}{3}/u.test(code)) return false // AOSP：没有验证码会连续出现 3 个小写字母
  if (/^[A-Za-z]+(?:19|20)\d\d$/.test(code)) return false // SUMMER2026 这类促销码
  if (/^[0-9a-f]{6}$/.test(code) && /[a-f]/.test(code)) return false // 小写十六进制颜色
  return !OPT_OUT.has(code.toLowerCase())
}

// ---------- 5. 文本归一化 ----------
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|td|th|li|h[1-6]|table|section|center)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(+d))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

function normalize(s: string): string {
  return (
    s
      .replace(/[​-‍⁠﻿­]/g, "") // 预览文本常用的零宽占位
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角字母数字
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t 　]+/g, " ")
      // 链接、邮箱地址里的数字不可能是要复制的验证码
      .replace(/\bhttps?:\/\/[^\s<>"')\]]+/gi, " ")
      .replace(/\bwww\.[^\s<>"')\]]+/gi, " ")
      .replace(/(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g, " ")
      .replace(/(?<![-.\w])[a-z0-9][-a-z0-9]{0,62}(?:\.[a-z0-9][-a-z0-9]{0,62}){1,8}\/\S*/gi, " ")
  )
}

// ---------- 6. 提取 ----------
function collect(text: string, r: Compiled, forbidden: Array<[number, number]>): string[] | null {
  for (const re of r.anchored) {
    const found = new Set<string>()
    for (const m of text.matchAll(re)) {
      const gi = m.findIndex((g, i) => i > 0 && g !== undefined)
      if (gi < 1) continue
      const raw = m[gi]
      const start = m.index! + m[0].indexOf(raw)
      const end = start + raw.length
      if (forbidden.some(([s, e]) => s < end && start < e)) continue
      if (r.labelBefore.test(text.slice(Math.max(0, start - 30), start))) continue
      const code = raw.replace(/[ -]/g, "")
      if (isPlausible(code)) found.add(code)
    }
    if (found.size) return [...found]
  }
  return null
}

function proximityFallback(text: string, r: Compiled, forbidden: Array<[number, number]>, subjectHasKw: boolean): string[] {
  if (!subjectHasKw && !r.verifyContext.test(text)) return []
  const kwPos = [...text.matchAll(r.keywordGlobal)].map((m) => [m.index!, m.index! + m[0].length])
  const found = new Set<string>()
  // 只兜底纯数字：字母数字混合的兜底正是 2FHey 误判 "GEICO"、"Stop2End" 的来源
  for (const m of text.matchAll(r.digitCode)) {
    const raw = m[1]
    const start = m.index! + m[0].indexOf(raw)
    const end = start + raw.length
    if (forbidden.some(([s, e]) => s < end && start < e)) continue
    if (r.labelBefore.test(text.slice(Math.max(0, start - 30), start))) continue
    const code = raw.replace(/[ -]/g, "")
    if (!isPlausible(code)) continue
    // AOSP：关键词在前 50 字符内（同句或上一句），或在后 50 字符内（同句）
    const near = kwPos.some(
      ([ks, ke]) =>
        (ke <= start && start - ke <= 50 && (text.slice(ke, start).match(/[.!?。！？]/g) || []).length <= 1) ||
        (ks >= end && ks - end <= 50 && !/[.!?。！？]/.test(text.slice(end, ks))),
    )
    // 单独成行，且上一行不是 "Label:" 这种标签行
    const lineStart = text.lastIndexOf("\n", start - 1) + 1
    const lineEndIdx = text.indexOf("\n", end)
    const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx).trim()
    const alone = new RegExp(`^[\\[【(（「"']?\\s*${raw.replace(/-/g, "\\-")}\\s*[\\]】)）」"']?$`).test(line)
    const prev = text.slice(0, lineStart).trimEnd().split("\n").pop() ?? ""
    const prevOk = !/[:：]\s*$/.test(prev) || r.keyword.test(prev)
    // "use 582270" / "请输入 123456"
    const useBefore = r.useBefore.test(text.slice(Math.max(0, start - 20), start))
    if (near || (alone && prevOk) || useBefore) found.add(code)
  }
  return [...found]
}

/**
 * 从邮件中识别验证码，识别不到或有歧义时返回 null。
 * introOnly：只有列表摘要时传 true，摘要末尾可能被截断，最后一个词不参与识别。
 */
export function extractVerificationCode(
  source: VerificationCodeSource,
  { introOnly = false }: { introOnly?: boolean } = {},
): string | null {
  const r = rules()
  if (!r) return null

  const html = Array.isArray(source.html) ? source.html.join("\n") : source.html || ""
  const subject = normalize((source.subject ?? "").slice(0, 1000))
  let body = source.text?.trim() ? source.text : html ? htmlToText(html) : (source.intro ?? "")
  body = normalize(body.slice(0, 20000))
  if (introOnly) body = body.replace(/\S*$/, "")

  // Apple / WICG 的 origin-bound 格式：末行 "@example.com #123456"，最可靠
  const ob = (source.text ?? source.intro ?? "").match(/(?:^|\s)@[a-z0-9.-]+\.[a-z]{2,}\s+#([A-Za-z0-9]{4,10})\s*$/im)
  if (ob && isPlausible(ob[1])) return ob[1]

  const bodyForbidden = forbiddenRanges(body, r)
  const anchored = new Set([
    ...(collect(subject, r, forbiddenRanges(subject, r)) ?? []),
    ...(collect(body, r, bodyForbidden) ?? []),
  ])
  if (anchored.size === 1) return [...anchored][0]
  if (anchored.size > 1) return null // 多个不同验证码：有歧义，不显示

  const fallback = proximityFallback(body, r, bodyForbidden, r.keyword.test(subject))
  return fallback.length === 1 ? fallback[0] : null
}
