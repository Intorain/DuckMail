"use client"

import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "next-intl"
import type { VerificationLink } from "@/lib/verification-link"

interface VerificationLinkButtonProps {
  link: VerificationLink
  // compact 用于邮件列表行内；banner 用于阅读面板顶部，和验证码条并排
  variant?: "compact" | "banner"
}

// 识别出的验证链接。始终在新标签页打开，不带来源页信息；横幅里显示目标域名，点之前能看清要去哪。
// 所在的邮件行本身可点击，这里拦截事件，避免点链接时顺带打开邮件。
export default function VerificationLinkButton({ link, variant = "compact" }: VerificationLinkButtonProps) {
  const t = useTranslations("verificationLink")
  const title = `${t("openTitle")} · ${link.host}`
  const stop = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  }

  if (variant === "compact") {
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        title={title}
        {...stop}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white pl-2 pr-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
      >
        {t("label")}
        <ArrowUpRight size={13} className="text-gray-400 dark:text-gray-500" />
      </a>
    )
  }

  return (
    <div
      {...stop}
      className="inline-flex max-w-full items-center gap-4 rounded-lg border border-gray-200 bg-white py-1.5 pl-4 pr-1.5 dark:border-gray-700 dark:bg-gray-900"
    >
      <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{t("label")}</span>
      <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-50" title={link.url}>
        {link.host}
      </span>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        title={title}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {t("open")}
        <ArrowUpRight size={15} />
      </a>
    </div>
  )
}
