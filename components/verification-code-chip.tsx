"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@heroui/button"
import { Check, Copy, KeyRound } from "lucide-react"
import { useTranslations } from "next-intl"
import { useHeroUIToast } from "@/hooks/use-heroui-toast"

interface VerificationCodeChipProps {
  code: string
  // compact 用于邮件列表行内；banner 用于详情页顶部
  variant?: "compact" | "banner"
}

// 识别出的验证码 + 复制按钮。所在的邮件行本身可点击，这里拦截事件，
// 避免选中验证码文字或点复制时顺带打开邮件。
export default function VerificationCodeChip({ code, variant = "compact" }: VerificationCodeChipProps) {
  const t = useTranslations("verificationCode")
  const tc = useTranslations("common")
  const { toast } = useHeroUIToast()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
      toast({ title: t("copied"), description: code, color: "success", timeout: 2000 })
    } catch (err) {
      console.error("Failed to copy verification code:", err)
      toast({ title: tc("copyFailed"), description: tc("clipboardError"), color: "danger" })
    }
  }

  const banner = variant === "banner"

  return (
    <div
      className={`inline-flex max-w-full items-center rounded-lg border border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-900/20 ${
        banner ? "gap-3 px-3 py-2" : "gap-2 py-0.5 pl-2 pr-0.5"
      }`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <KeyRound size={banner ? 16 : 14} className="shrink-0 text-success-600 dark:text-success-400" />
      <span className={`shrink-0 text-success-700 dark:text-success-300 ${banner ? "text-sm" : "text-xs"}`}>{t("label")}</span>
      <span
        className={`select-all truncate font-mono font-semibold tracking-wider text-success-800 dark:text-success-200 ${
          banner ? "text-xl" : "text-sm"
        }`}
      >
        {code}
      </span>
      <Button
        isIconOnly
        size="sm"
        variant="light"
        color="success"
        aria-label={copied ? tc("copied") : t("copy")}
        title={copied ? tc("copied") : t("copy")}
        onPress={copy}
        className={banner ? "" : "h-7 w-7 min-w-7"}
      >
        {copied ? <Check size={banner ? 18 : 15} /> : <Copy size={banner ? 18 : 15} />}
      </Button>
    </div>
  )
}
