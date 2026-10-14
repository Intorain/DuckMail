// 开发环境的收件箱 mock 数据：在本地打开 /?mock=1 后，收件箱接口改为返回这里的邮件，
// 用来在原系统里预览验证码 / 验证链接识别、列表与阅读面板的样式。生产构建不会包含此模块（见 lib/api.ts）。
// 列表只为最新的 10 封补取正文做识别（见 hooks/use-verification-hints.ts），需要读正文才能识别的样例要排在前面。
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
  attachments?: { filename: string; contentType: string; size: number }[]
}

// 样例 HTML 邮件共用的外框：600px 居中的表格布局，和常见的事务邮件模板一致
const emailFrame = (inner: string, footer = "") =>
  `<div style="background:#f4f4f5;padding:24px 0"><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;font-family:Arial,sans-serif;color:#27272a"><tr><td style="padding:32px">${inner}</td></tr></table>${
    footer ? `<p style="max-width:560px;margin:16px auto 0;font-family:Arial,sans-serif;font-size:12px;color:#a1a1aa;text-align:center">${footer}</p>` : ""
  }</div>`
const button = (href: string, label: string, color = "#111827") =>
  `<a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${label}</a>`

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
    minutesAgo: 14,
    seen: true,
  },

  // ---- 以下为补充样例：验证链接、长文本、附件、HTML 邮件、旧邮件和不应误判的邮件 ----
  {
    id: "mock-discord",
    fromName: "Discord",
    fromAddress: "noreply@discord.com",
    subject: "Verify your Discord login",
    text: "Hey there,\n\nSomeone is trying to log in to your Discord account from a new location. Your verification code is:\n\n615248\n\nIf this wasn't you, change your password right away.",
    minutesAgo: 0,
    seen: false,
    arrivesAfterSeconds: 30,
  },
  {
    id: "mock-both",
    fromName: "Acme Cloud",
    fromAddress: "no-reply@acmecloud.io",
    subject: "Verify your email address",
    html: emailFrame(
      `<h1 style="font-size:20px;margin:0 0 16px">Verify your email address</h1><p>Your verification code is <b style="font-size:18px;letter-spacing:2px">739104</b>. It expires in 10 minutes.</p><p>Or verify your email with one click:</p><p>${button("https://acmecloud.io/verify?token=a1b2c3", "Verify email")}</p>`,
      `<a href="https://acmecloud.io/help" style="color:#a1a1aa">Help</a> · <a href="https://acmecloud.io/unsubscribe" style="color:#a1a1aa">Unsubscribe</a>`,
    ),
    minutesAgo: 2,
    seen: false,
  },
  {
    id: "mock-linear",
    fromName: "Linear",
    fromAddress: "notifications@linear.app",
    subject: "Confirm your email address",
    html: emailFrame(
      `<h1 style="font-size:20px;margin:0 0 16px">Confirm your email address</h1><p>Thanks for signing up for Linear. Please confirm your email address to finish setting up your workspace.</p><p style="margin:24px 0">${button("https://linear.app/auth/confirm?token=lin_8f2a91", "Confirm email address", "#5e6ad2")}</p><p style="font-size:13px;color:#71717a">If the button doesn't work, copy this link into your browser:<br><a href="https://linear.app/auth/confirm?token=lin_8f2a91" style="color:#5e6ad2">https://linear.app/auth/confirm?token=lin_8f2a91</a></p>`,
      `<a href="https://linear.app/privacy" style="color:#a1a1aa">Privacy</a> · <a href="https://linear.app/unsubscribe" style="color:#a1a1aa">Unsubscribe</a>`,
    ),
    minutesAgo: 5,
    seen: false,
  },
  {
    id: "mock-magic",
    fromName: "Notion",
    fromAddress: "notify@mail.notion.so",
    subject: "Sign in to Notion",
    html: emailFrame(
      `<p>Click the link below to sign in. This link expires in 10 minutes.</p><p style="margin:24px 0">${button("https://www.notion.so/loginwithemail?token=ntn_42f7", "Sign in to Notion")}</p><p style="font-size:13px;color:#71717a">If you didn't try to sign in, you can safely ignore this email.</p>`,
      `<a href="https://www.notion.so/help" style="color:#a1a1aa">Help</a>`,
    ),
    minutesAgo: 12,
    seen: true,
  },
  {
    id: "mock-cn-activate",
    fromName: "某云服务",
    fromAddress: "noreply@cloud.example.cn",
    subject: "欢迎注册，请激活您的账号",
    html: emailFrame(
      `<h1 style="font-size:20px;margin:0 0 16px">欢迎注册某云服务</h1><p>您好，请点击下方按钮激活您的账号，链接 24 小时内有效。</p><p style="margin:24px 0">${button("https://cloud.example.cn/activate?code=7c1e9d", "立即激活", "#2563eb")}</p><p style="font-size:13px;color:#71717a">如果按钮无法点击，请复制以下链接到浏览器打开：<br>https://cloud.example.cn/activate?code=7c1e9d</p>`,
      `<a href="https://cloud.example.cn/help" style="color:#a1a1aa">帮助中心</a> · 如非本人操作，请忽略本邮件`,
    ),
    minutesAgo: 17,
    seen: true,
  },
  {
    id: "mock-slack",
    fromName: "Slack",
    fromAddress: "no-reply@slack.com",
    subject: "Slack confirmation code: Q7S-8KJ",
    text: "Your confirmation code is below — enter it in your open browser window and we'll help you get signed in.\n\nQ7S-8KJ",
    minutesAgo: 28,
    seen: true,
  },
  {
    id: "mock-jp",
    fromName: "楽天会員サービス",
    fromAddress: "info@login.example.jp",
    subject: "ログイン認証コード: 902341",
    text: "ログインを完了するには、以下の認証コードを入力してください。\n\n認証コード: 902341\n\n有効期限は10分です。",
    minutesAgo: 36,
    seen: true,
  },
  {
    id: "mock-long",
    fromName: "Northwind Traders Customer Success & Billing Department",
    fromAddress: "customer-success-and-billing@northwind-traders.example.com",
    subject:
      "Re: Re: Fwd: Quarterly planning — updated timeline, owners and the open questions we discussed on Thursday's call (please review before Friday)",
    text: "Hi all,\n\nAttaching the updated timeline below. Please review the owners column and flag anything that looks off before Friday.\n\nThanks,\nDana",
    minutesAgo: 70,
    seen: true,
  },
  {
    id: "mock-nosubject",
    fromName: "",
    fromAddress: "j.doe@example.org",
    subject: "",
    text: "Sent from my iPhone",
    minutesAgo: 95,
    seen: true,
  },
  {
    id: "mock-invoice",
    fromName: "Northwind Billing",
    fromAddress: "billing@northwind-traders.example.com",
    subject: "Invoice INV-2026-0042 for October",
    text: "Hello,\n\nPlease find attached invoice INV-2026-0042 for October. The total of $1,284.00 will be charged to the card ending in 4242 on 2026-10-31.\n\nThank you for your business.",
    minutesAgo: 150,
    seen: true,
    attachments: [
      { filename: "INV-2026-0042.pdf", contentType: "application/pdf", size: 184_320 },
      { filename: "usage-details-october.csv", contentType: "text/csv", size: 9_830 },
    ],
  },
  {
    id: "mock-newsletter",
    fromName: "Figma",
    fromAddress: "no-reply@email.figma.com",
    subject: "What's new in Figma this month",
    html: emailFrame(
      `<div style="background:linear-gradient(135deg,#a259ff,#1abcfe);border-radius:6px;height:120px;margin:-8px 0 24px"></div><h1 style="font-size:22px;margin:0 0 12px">What's new this month</h1><p style="line-height:1.6;color:#52525b">Dev Mode gets faster annotations, variables now support modes in prototypes, and auto layout picks up a few long-requested tricks.</p><table role="presentation" width="100%" style="margin:20px 0;border-collapse:collapse"><tr><td style="padding:12px;border:1px solid #e4e4e7;border-radius:6px"><b>Dev Mode</b><br><span style="color:#71717a;font-size:13px">Annotations that stay in sync with the design.</span></td></tr><tr><td style="height:8px"></td></tr><tr><td style="padding:12px;border:1px solid #e4e4e7;border-radius:6px"><b>Variables</b><br><span style="color:#71717a;font-size:13px">Switch modes while prototyping.</span></td></tr></table><p>${button("https://www.figma.com/whats-new", "Read the full update", "#0d99ff")}</p>`,
      `You are receiving this because you have a Figma account. <a href="https://www.figma.com/unsubscribe" style="color:#a1a1aa">Unsubscribe</a>`,
    ),
    minutesAgo: 260,
    seen: true,
  },
  {
    // 不应识别为验证链接：重置密码
    id: "mock-reset",
    fromName: "Dropbox",
    fromAddress: "no-reply@dropbox.com",
    subject: "Reset your Dropbox password",
    html: emailFrame(
      `<p>Someone requested a new password for your Dropbox account.</p><p style="margin:24px 0">${button("https://www.dropbox.com/password_reset?t=dbx_19", "Reset password", "#0061fe")}</p><p style="font-size:13px;color:#71717a">If you didn't make this request, you can ignore this email.</p>`,
    ),
    minutesAgo: 400,
    seen: true,
  },
  {
    // 不应识别为验证链接：新设备登录提醒
    id: "mock-alert",
    fromName: "Google",
    fromAddress: "no-reply@accounts.google.com",
    subject: "Security alert: new sign-in on Mac",
    html: emailFrame(
      `<h1 style="font-size:20px;margin:0 0 16px">New sign-in on Mac</h1><p>We noticed a new sign-in to your Google Account on a Mac device. If this was you, you don't need to do anything. If not, we'll help you secure your account.</p><p style="margin:24px 0">${button("https://myaccount.google.com/notifications", "Check activity", "#1a73e8")}</p>`,
    ),
    minutesAgo: 620,
    seen: true,
  },
  {
    id: "mock-weekly",
    fromName: "Vercel",
    fromAddress: "notifications@vercel.com",
    subject: "Your weekly usage summary",
    text: "Here's how your projects did this week:\n\n- 1,284 deployments\n- 98.7% cache hit rate\n- 2 failed builds\n\nView the full report in your dashboard.",
    minutesAgo: 1_500,
    seen: true,
  },
  {
    id: "mock-welcome",
    fromName: "DuckMail",
    fromAddress: "hello@duckmail.sbs",
    subject: "欢迎使用 DuckMail 临时邮箱",
    text: "你好！\n\n这是一个临时邮箱，收到的邮件会自动出现在收件箱里。验证码和验证链接会被自动识别，点一下就能复制或打开。\n\n祝使用愉快。",
    minutesAgo: 4_400,
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
    hasAttachments: !!m.attachments?.length,
    size: (m.text ?? m.html ?? "").length,
    downloadUrl: "",
    createdAt,
    updatedAt: createdAt,
  }
}

export function mockGetMessages() {
  // 与真实接口一致：最新的在前
  const messages = MOCK_MAILS.filter(arrived)
    .map(toMessage)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { messages, total: messages.length, hasMore: false }
}

export function mockGetMessage(id: string): MessageDetail {
  const m = MOCK_MAILS.find((x) => x.id === id && arrived(x))
  if (!m) throw new Error("HTTP 404: mock message not found")
  return {
    ...toMessage(m),
    text: m.text ?? "",
    html: m.html ? [m.html] : [],
    attachments: m.attachments?.map((a, i) => ({
      ...a,
      id: `${m.id}-att-${i}`,
      disposition: "attachment",
      transferEncoding: "base64",
      related: false,
      downloadUrl: `data:${a.contentType};charset=utf-8,${encodeURIComponent(`DuckMail mock attachment: ${a.filename}`)}`,
    })),
  }
}

export function mockMarkSeen(id: string) {
  seen.add(id)
  return { seen: true }
}

export function mockDelete(id: string) {
  deleted.add(id)
}
