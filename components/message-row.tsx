"use client"

import { formatDistanceToNow } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import { useTranslations, useLocale } from "next-intl"
import VerificationCodeChip from "@/components/verification-code-chip"
import VerificationLinkButton from "@/components/verification-link-button"
import type { VerificationLink } from "@/lib/verification-link"
import type { Message } from "@/types"

interface MessageRowProps {
  message: Message
  // 识别出的验证码，没有则不显示
  code?: string | null
  // 识别出的验证链接；同时有验证码时行内只放验证码，链接留在阅读面板里
  link?: VerificationLink | null
  // 当前在阅读面板中打开的那封
  selected?: boolean
  onSelect: (message: Message) => void
}

// 收件箱列表中的一行。列表窄时两行（发件人 + 时间 / 主题 + 验证码），
// 列表够宽（list-wide 容器查询）时改为单行：发件人 | 主题 | 验证码 | 时间，验证码和时间各自成列对齐。
// 主题行固定高度，正文补取完成后验证码出现时不会撑高这一行、推动下面的邮件。
// 行内有复制按钮，不能用 <button> 包裹，改用 role="button"
// data-vt 标出行内各部分：阅读面板开合时逐个补间位置（见 page.tsx 的 nameVisibleRows）
export default function MessageRow({ message, code, link, selected = false, onSelect }: MessageRowProps) {
  const t = useTranslations("messageList")
  const locale = useLocale()
  const unread = !message.seen
  const sender = message.from.name || message.from.address
  const createdAt = new Date(message.createdAt)

  const time = (className: string) => (
    <time
      data-vt="t"
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
      aria-current={selected || undefined}
      data-message-id={message.id}
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
          data-vt="d"
          className="absolute left-2.5 top-[19px] h-1.5 w-1.5 rounded-full bg-primary sm:left-3 list-wide:top-1/2 list-wide:-translate-y-1/2"
        />
      )}

      <div className="min-w-0 flex-1 list-wide:flex list-wide:items-center list-wide:gap-4">
        <div className="flex items-baseline gap-3 list-wide:w-44 list-wide:shrink-0">
          <p
            data-vt="s"
            className={`min-w-0 flex-1 truncate text-sm ${
              unread ? "font-semibold text-gray-900 dark:text-gray-50" : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {unread && <span className="sr-only">{t("unread")} · </span>}
            {sender}
          </p>
          {time("list-wide:hidden")}
        </div>

        <div className="mt-0.5 flex min-h-6 items-center gap-3 list-wide:mt-0 list-wide:min-w-0 list-wide:flex-1 list-wide:gap-4">
          <p
            data-vt="j"
            className={`min-w-0 flex-1 truncate text-sm ${
              unread ? "text-gray-800 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {message.subject || t("noSubject")}
            {message.intro && (
              <span className="hidden text-gray-400 dark:text-gray-500 list-wide:inline"> — {message.intro}</span>
            )}
          </p>
          {(code || link) && (
            <span data-vt="c" className="inline-flex shrink-0">
              {code ? <VerificationCodeChip code={code} /> : link && <VerificationLinkButton link={link} />}
            </span>
          )}
        </div>

        {message.intro && (
          <p data-vt="i" className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500 list-wide:hidden">
            {message.intro}
          </p>
        )}
      </div>

      {time("hidden min-w-[6rem] text-right list-wide:block")}
    </div>
  )
}
