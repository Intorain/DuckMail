"use client"

import { formatDistanceToNow } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import { useTranslations, useLocale } from "next-intl"
import VerificationCodeChip from "@/components/verification-code-chip"
import type { Message } from "@/types"

interface MessageRowProps {
  message: Message
  // 识别出的验证码，没有则不显示
  code?: string | null
  onSelect: (message: Message) => void
}

// 收件箱列表中的一行。窄屏两行（发件人 + 时间 / 主题 + 验证码），
// xl 以上铺满宽度改为单行：发件人 | 主题 | 验证码 | 时间，验证码和时间各自成列对齐。
// 主题行固定高度，正文补取完成后验证码出现时不会撑高这一行、推动下面的邮件。
// 行内有复制按钮，不能用 <button> 包裹，改用 role="button"
export default function MessageRow({ message, code, onSelect }: MessageRowProps) {
  const t = useTranslations("messageList")
  const locale = useLocale()
  const unread = !message.seen
  const sender = message.from.name || message.from.address
  const createdAt = new Date(message.createdAt)

  const time = (className: string) => (
    <time
      dateTime={message.createdAt}
      title={createdAt.toLocaleString(locale)}
      className={`shrink-0 whitespace-nowrap text-xs tabular-nums text-gray-400 dark:text-gray-500 ${className}`}
    >
      {formatDistanceToNow(createdAt, {
        addSuffix: true,
        locale: locale === "en" ? enUS : zhCN,
      })}
    </time>
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(message)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(message)
        }
      }}
      className="mail-row flex cursor-pointer items-center gap-4 py-3 pl-6 pr-3 sm:pl-7 sm:pr-4"
    >
      {/* 未读圆点挂在左侧留白里，已读 / 未读行的文字保持对齐；窄屏对齐发件人那一行 */}
      {unread && (
        <span
          aria-hidden
          className="absolute left-2.5 top-[19px] h-1.5 w-1.5 rounded-full bg-primary sm:left-3 xl:top-1/2 xl:-translate-y-1/2"
        />
      )}

      <div className="min-w-0 flex-1 xl:flex xl:items-center xl:gap-4">
        <div className="flex items-baseline gap-3 xl:w-44 xl:shrink-0 2xl:w-56">
          <p
            className={`min-w-0 flex-1 truncate text-sm ${
              unread ? "font-semibold text-gray-900 dark:text-gray-50" : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {unread && <span className="sr-only">{t("unread")} · </span>}
            {sender}
          </p>
          {time("xl:hidden")}
        </div>

        <div className="mt-0.5 flex min-h-6 items-center gap-3 xl:mt-0 xl:min-w-0 xl:flex-1 xl:gap-4">
          <p
            className={`min-w-0 flex-1 truncate text-sm ${
              unread ? "text-gray-800 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {message.subject || t("noSubject")}
            {message.intro && (
              <span className="hidden text-gray-400 dark:text-gray-500 xl:inline"> — {message.intro}</span>
            )}
          </p>
          {code && <VerificationCodeChip code={code} />}
        </div>

        {message.intro && (
          <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500 xl:hidden">{message.intro}</p>
        )}
      </div>

      {time("hidden min-w-[6rem] text-right xl:block")}
    </div>
  )
}
