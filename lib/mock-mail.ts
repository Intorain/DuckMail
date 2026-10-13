// 开发环境的收件箱 mock 数据：在本地打开 /?mock=1 后，收件箱接口改为返回这里的邮件，
// 用来在原系统里预览验证码识别等效果。生产构建不会包含此模块（见 lib/api.ts）。
import type { Message, MessageDetail } from "@/types"

interface MockMail {
  id: string
  fromName: string
  fromAddress: string
  subject: string
  text?: string
  html?: string
  minutesAgo: number
  seen: boolean
  // 打开页面后多少秒才"到达"，用来演示新邮件进来的效果
  arrivesAfterSeconds?: number
}

const MOCK_MAILS: MockMail[] = [
  {
    id: "mock-claude",
    fromName: "Anthropic",
    fromAddress: "no-reply@mail.anthropic.com",
    subject: "Your Claude login code",
    text: "Here is your login code for Claude:\n\n824106\n\nThis code will expire in 10 minutes. If you didn't request it, you can safely ignore this email.",
    minutesAgo: 0,
    seen: false,
    arrivesAfterSeconds: 10,
  },
  {
    id: "mock-openai",
    fromName: "OpenAI",
    fromAddress: "noreply@tm.openai.com",
    subject: "Your ChatGPT code is 039281",
    text: "Enter this temporary verification code to continue:\n\n039281\n\nIf you were not trying to log in to ChatGPT, please reset your password.",
    minutesAgo: 1,
    seen: false,
  },
  {
    id: "mock-tencent",
    fromName: "腾讯云",
    fromAddress: "noreply@cloud.tencent.com",
    subject: "【腾讯云】注册验证",
    text: "尊敬的用户：\n\n您的验证码为 528341，5分钟内有效，请勿泄露给他人。如非本人操作，请忽略本邮件。\n\n腾讯云团队",
    minutesAgo: 3,
    seen: false,
  },
  {
    id: "mock-github",
    fromName: "GitHub",
    fromAddress: "noreply@github.com",
    subject: "[GitHub] Please verify your device",
    text: "Hey there!\n\nA sign in attempt requires further verification because we did not recognize your device. To complete the sign in, enter the verification code on the unrecognized device.\n\nDevice: Chrome on macOS\nVerification code: 51208736\n\nIf you did not attempt to sign in to your account, your password may be compromised.\n\nThanks,\nThe GitHub Team",
    minutesAgo: 9,
    seen: false,
  },
  {
    id: "mock-notion",
    fromName: "Acme",
    fromAddress: "hello@acme.dev",
    subject: "Confirm your email address",
    html: '<html><head><style>.code{color:#333333;font-size:32px;font-weight:700;letter-spacing:6px}</style></head><body style="font-family:Arial,sans-serif"><p>Hi there,</p><p>Please use the following code to complete your sign-in. It is valid for 15 minutes.</p><table><tr><td class="code" style="padding:16px 24px;background:#f4f4f5;border-radius:8px">472 819</td></tr></table><p>If you didn\'t request this, you can ignore this email.</p><p style="color:#999999;font-size:12px">© 2026 Acme Inc. · 548 Market St, San Francisco, CA 94104</p></body></html>',
    minutesAgo: 15,
    seen: true,
  },
  {
    id: "mock-steam",
    fromName: "Steam",
    fromAddress: "noreply@steampowered.com",
    subject: "Your Steam account: Access from new computer",
    text: "Dear duckuser,\n\nHere is the Steam Guard code you need to login to account duckuser:\n\nF7K2Q\n\nThis email was generated because of a login attempt from a web or mobile device.",
    minutesAgo: 24,
    seen: true,
  },
  {
    id: "mock-order",
    fromName: "Amazon",
    fromAddress: "shipment-tracking@amazon.com",
    subject: "Your order #112-3344556 has shipped",
    text: "Hello,\n\nYour package is on the way. Order number: 1123344556. Arriving 2026-10-15.\nTotal charged: $123.45 to the card ending in 4242.\nTracking number 1Z999AA10123456784.",
    minutesAgo: 31,
    seen: true,
  },
  {
    id: "mock-promo",
    fromName: "某商城",
    fromAddress: "news@shop.example.com",
    subject: "本周特惠：全场 8 折，优惠码 SAVE2024",
    text: "使用优惠码 SAVE2024 下单立减 20 元，活动截止 2026年10月31日。如有疑问请致电 400-123-4567。",
    minutesAgo: 42,
    seen: true,
  },
  {
    id: "mock-link",
    fromName: "Example",
    fromAddress: "no-reply@example.com",
    subject: "Verify your email",
    text: "Click the link below to verify your email address:\nhttps://example.com/verify?token=839201&uid=123456\n\nThis link expires in 24 hours.",
    minutesAgo: 55,
    seen: true,
  },
]

const loadedAt = Date.now()
const seen = new Set(MOCK_MAILS.filter((m) => m.seen).map((m) => m.id))
const deleted = new Set<string>()

function arrived(m: MockMail) {
  return !deleted.has(m.id) && Date.now() - loadedAt >= (m.arrivesAfterSeconds ?? 0) * 1000
}

function toMessage(m: MockMail): Message {
  // 后到的邮件以到达时刻为准
  const createdAt = new Date(
    m.arrivesAfterSeconds ? loadedAt + m.arrivesAfterSeconds * 1000 : loadedAt - m.minutesAgo * 60_000,
  ).toISOString()
  return {
    id: m.id,
    accountId: "mock",
    msgid: m.id,
    from: { name: m.fromName, address: m.fromAddress },
    to: [{ name: "", address: "you@duckmail.sbs" }],
    subject: m.subject,
    // 与 DuckMail 后端一致：列表不返回正文摘要
    intro: "",
    seen: seen.has(m.id),
    isDeleted: false,
    hasAttachments: false,
    size: (m.text ?? m.html ?? "").length,
    downloadUrl: "",
    createdAt,
    updatedAt: createdAt,
  }
}

export function mockGetMessages() {
  const messages = MOCK_MAILS.filter(arrived).map(toMessage)
  return { messages, total: messages.length, hasMore: false }
}

export function mockGetMessage(id: string): MessageDetail {
  const m = MOCK_MAILS.find((x) => x.id === id && arrived(x))
  if (!m) throw new Error("HTTP 404: mock message not found")
  return { ...toMessage(m), text: m.text ?? "", html: m.html ? [m.html] : [] }
}

export function mockMarkSeen(id: string) {
  seen.add(id)
  return { seen: true }
}

export function mockDelete(id: string) {
  deleted.add(id)
}
