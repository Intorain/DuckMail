"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import { useTranslations } from "next-intl"
import { useHeroUIToast } from "@/hooks/use-heroui-toast"

interface VerificationCodeChipProps {
  code: string
  // compact 用于邮件列表行内；banner 用于详情页顶部
  variant?: "compact" | "banner"
}

// 识别出的验证码 + 复制。所在的邮件行本身可点击，这里拦截事件，
// 避免选中验证码文字或点复制时顺带打开邮件。
// 复制成功只在原位换成对勾，不弹 toast；失败才提示。
export default function VerificationCodeChip({ code, variant = "compact" }: VerificationCodeChipProps) {
  const t = useTranslations("verificationCode")
  const tc = useTranslations("common")
  const { toast } = useHeroUIToast()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("Failed to copy verification code:", err)
      toast({ title: tc("copyFailed"), description: tc("clipboardError"), color: "danger" })
    }
  }

  const stopKeys = (e: React.KeyboardEvent) => e.stopPropagation()
  const label = copied ? t("copied") : t("copy")
  const icon = (size: number) =>
    copied ? (
      <Check size={size} strokeWidth={2.5} className="text-success-600 dark:text-success-400" />
    ) : (
      <Copy size={size} className="text-gray-400 dark:text-gray-500" />
    )

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={copy}
        onKeyDown={stopKeys}
        aria-label={`${label} ${code}`}
        title={label}
        className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white pl-2 pr-1.5 font-mono text-[13px] font-semibold tracking-wider text-gray-900 transition-colors hover:border-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-800"
      >
        {code}
        {icon(13)}
      </button>
    )
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={stopKeys}
      className="inline-flex max-w-full items-center gap-4 rounded-lg border border-gray-200 bg-white py-1.5 pl-4 pr-1.5 dark:border-gray-700 dark:bg-gray-900"
    >
      <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{t("label")}</span>
      <span className="select-all truncate font-mono text-xl font-semibold tracking-widest text-gray-900 dark:text-gray-50">
        {code}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`${label} ${code}`}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
      >
        {icon(15)}
        {copied ? t("copiedShort") : t("copyShort")}
      </button>
    </div>
  )
}
