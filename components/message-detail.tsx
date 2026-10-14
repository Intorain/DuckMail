"use client"

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react"
import { Spinner } from "@heroui/spinner"
import { ArrowLeft, CheckCircle, ChevronDown, ChevronUp, Download, EyeOff, Paperclip, Trash2, X, XCircle } from "lucide-react"
import { downloadHostedFile, getMessage, markMessageAsRead, deleteMessage as apiDeleteMessage } from "@/lib/api"
import type { Message, MessageDetail as MessageDetailType } from "@/types"
import { useAuth } from "@/contexts/auth-context"
import { format } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import { useHeroUIToast } from "@/hooks/use-heroui-toast"
import { useTranslations, useLocale } from "next-intl"
import VerificationCodeChip from "@/components/verification-code-chip"
import VerificationLinkButton from "@/components/verification-link-button"
import { extractVerificationCode } from "@/lib/verification-code"
import { extractVerificationLink } from "@/lib/verification-link"

// 已打开过的邮件详情：在阅读面板里来回切换时直接显示，不再重新请求、转圈
const detailCache = new Map<string, MessageDetailType>()
const DETAIL_CACHE_LIMIT = 30

function cacheDetail(key: string, detail: MessageDetailType) {
  detailCache.delete(key)
  detailCache.set(key, detail)
  if (detailCache.size > DETAIL_CACHE_LIMIT) {
    detailCache.delete(detailCache.keys().next().value!)
  }
}

const iframeColors = (dark: boolean) =>
  dark ? { background: "#111827", color: "#e5e7eb", link: "#818cf8" } : { background: "#ffffff", color: "#1f2937", link: "#4f46e5" }

// 邮件内容渲染组件 - 使用 iframe 隔离样式
function EmailContent({ html, text }: { html?: string[]; text?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(200)

  const adjustIframeHeight = useCallback(() => {
    const iframe = iframeRef.current
    if (iframe?.contentWindow?.document?.body) {
      const body = iframe.contentWindow.document.body
      const height = Math.max(body.scrollHeight, body.offsetHeight)
      if (height > 0) {
        setIframeHeight(height + 20)
      }
    }
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const hasHtml = html && html.length > 0 && html.join("").trim()
    const safeText = (text || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
    const content = hasHtml ? html.join("") : `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${safeText}</pre>`
    const colors = iframeColors(document.documentElement.classList.contains("dark"))

    const wrappedContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:;">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            word-wrap: break-word;
            overflow-wrap: break-word;
            background-color: ${colors.background};
            color: ${colors.color};
          }
          img { max-width: 100%; height: auto; }
          table { max-width: 100%; }
          a { color: ${colors.link}; }
          pre { white-space: pre-wrap; word-wrap: break-word; }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `

    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(wrappedContent)
      doc.close()
      iframe.onload = adjustIframeHeight
      setTimeout(adjustIframeHeight, 100)
      setTimeout(adjustIframeHeight, 500)
      setTimeout(adjustIframeHeight, 1000)
    }
  }, [html, text, adjustIframeHeight])

  // 面板宽度变化（窗口缩放）会让正文重新换行，高度跟着重算
  useEffect(() => {
    window.addEventListener("resize", adjustIframeHeight)
    return () => window.removeEventListener("resize", adjustIframeHeight)
  }, [adjustIframeHeight])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const body = iframeRef.current?.contentWindow?.document?.body
      if (body) {
        const colors = iframeColors(document.documentElement.classList.contains("dark"))
        body.style.backgroundColor = colors.background
        body.style.color = colors.color
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <iframe
      ref={iframeRef}
      title="Email Content"
      sandbox="allow-same-origin"
      style={{
        width: "100%",
        height: `${iframeHeight}px`,
        border: "none",
        display: "block",
      }}
    />
  )
}

const toolButton =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-35 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100"

interface MessageDetailProps {
  messageId: string
  // 列表里已有的摘要：正文加载完成前先用它渲染标题、发件人，切换邮件时不闪空白
  preview?: Message | null
  onClose: () => void
  onDeleted: (messageId: string) => void
  onPrev?: () => void
  onNext?: () => void
}

// 阅读面板的内容：顶部工具栏固定，下面是可滚动的邮件正文。
// 外层的定位和进出场动画由页面负责（宽屏右侧分栏，窄屏整块滑入覆盖列表）。
export default function MessageDetail({ messageId, preview, onClose, onDeleted, onPrev, onNext }: MessageDetailProps) {
  const { token, currentAccount } = useAuth()
  const { toast } = useHeroUIToast()
  const t = useTranslations("messageDetail")
  const tList = useTranslations("messageList")
  const locale = useLocale()

  const cacheKey = `${currentAccount?.id}:${messageId}`
  const [detail, setDetail] = useState<MessageDetailType | null>(() => detailCache.get(cacheKey) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isHosted = currentAccount?.source === "microsoft"
  const providerId = currentAccount?.providerId || "duckmail"
  const canDelete = currentAccount?.capabilities?.hideMessagesLocally !== false

  const hints = useMemo(() => {
    if (!detail) return { code: null, link: null }
    const body = { subject: detail.subject, text: detail.text, html: detail.html }
    return { code: extractVerificationCode(body), link: extractVerificationLink(body) }
  }, [detail])

  useEffect(() => {
    // 请求期间切换了邮件 / 账号时，丢弃旧请求的结果
    let cancelled = false

    // 以服务端返回的 seen 为准决定是否标记已读；标记失败不影响阅读
    const markRead = (d: MessageDetailType) => {
      if (d.seen || !token || currentAccount?.capabilities?.markSeenLocally === false) return
      markMessageAsRead(token, d.id, providerId)
        .then(() => cacheDetail(cacheKey, { ...d, seen: true }))
        .catch((err) => console.warn("Failed to mark message as read:", err))
    }

    const cached = detailCache.get(cacheKey)
    if (cached) {
      markRead(cached)
      return
    }
    if (!token) {
      setError(t("authError"))
      return
    }

    getMessage(token, messageId, providerId)
      .then((d) => {
        if (cancelled) return
        cacheDetail(cacheKey, d)
        setDetail(d)
        markRead(d)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Failed to fetch message detail:", err)
        setError(isHosted && err instanceof Error ? err.message : t("fetchError"))
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, messageId, token, providerId])

  const handleDelete = async () => {
    if (!token || deleting) return
    setDeleting(true)
    try {
      await apiDeleteMessage(token, messageId, providerId)
      detailCache.delete(cacheKey)
      toast({ title: t("messageDeleted"), color: "success", variant: "flat", icon: <CheckCircle size={16} /> })
      onDeleted(messageId)
    } catch (err) {
      console.error("Failed to delete message:", err)
      toast({ title: t("deleteFailed"), description: t("deleteError"), color: "danger", variant: "flat", icon: <XCircle size={16} /> })
      setDeleting(false)
    }
  }

  const downloadFailed = (err: unknown) =>
    toast({
      title: t("downloadFailed"),
      description: err instanceof Error ? err.message : undefined,
      color: "danger",
      variant: "flat",
    })

  // 托管邮箱的下载需要带 token 请求，普通邮箱直接走链接
  const downloadLink = (url: string, filename: string, label: string, className: string, children: ReactNode) =>
    isHosted ? (
      <button
        type="button"
        className={className}
        aria-label={label}
        title={label}
        onClick={() => token && downloadHostedFile(token, url, filename).catch(downloadFailed)}
      >
        {children}
      </button>
    ) : (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className} aria-label={label} title={label}>
        {children}
      </a>
    )

  const head = detail ?? preview
  const fromName = head ? head.from.name || head.from.address : ""
  const attachments = detail?.hasAttachments ? detail.attachments ?? [] : []

  return (
    <div className="flex h-full flex-col bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100">
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-gray-200 px-2 dark:border-gray-800 sm:px-3">
        <button type="button" onClick={onClose} className={toolButton} aria-label={t("close")} title={`${t("close")} (Esc)`}>
          <ArrowLeft size={18} className="xl:hidden" />
          <span className="xl:hidden">{t("back")}</span>
          <X size={18} className="hidden xl:block" />
        </button>
        <span aria-hidden className="mx-1.5 h-4 w-px bg-gray-200 dark:bg-gray-800" />
        <button type="button" onClick={onPrev} disabled={!onPrev} className={toolButton} aria-label={t("prev")} title={`${t("prev")} (↑)`}>
          <ChevronUp size={18} />
        </button>
        <button type="button" onClick={onNext} disabled={!onNext} className={toolButton} aria-label={t("next")} title={`${t("next")} (↓)`}>
          <ChevronDown size={18} />
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          {detail?.downloadUrl &&
            downloadLink(detail.downloadUrl, `${detail.id}.eml`, t("downloadEml"), toolButton, <Download size={17} />)}
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className={`${toolButton} hover:text-danger dark:hover:text-danger`}
            aria-label={isHosted ? t("hideLocally") : t("delete")}
            title={isHosted ? t("hideLocallyDesc") : t("delete")}
          >
            {isHosted ? <EyeOff size={17} /> : <Trash2 size={17} />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-5 py-5 sm:px-6 sm:py-6">
          {head ? (
            <>
              <h1 className="break-words text-lg font-semibold leading-snug text-gray-900 dark:text-gray-50 sm:text-xl">
                {head.subject || tList("noSubject")}
              </h1>
              <div className="mt-3 flex items-start justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{fromName}</span>
                    {head.from.name && <span className="text-gray-500 dark:text-gray-400"> &lt;{head.from.address}&gt;</span>}
                  </p>
                  <p className="mt-0.5 truncate text-gray-500 dark:text-gray-400">
                    {t("to")}
                    {head.to.map((r) => r.address).join(", ")}
                  </p>
                  {detail?.cc && detail.cc.length > 0 && (
                    <p className="mt-0.5 truncate text-gray-500 dark:text-gray-400">
                      {t("cc")}
                      {detail.cc.join(", ")}
                    </p>
                  )}
                  {detail?.bcc && detail.bcc.length > 0 && (
                    <p className="mt-0.5 truncate text-gray-500 dark:text-gray-400">
                      {t("bcc")}
                      {detail.bcc.join(", ")}
                    </p>
                  )}
                </div>
                <time dateTime={head.createdAt} className="shrink-0 pt-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {format(new Date(head.createdAt), locale === "en" ? "MMM d, yyyy HH:mm" : "yyyy年M月d日 HH:mm", {
                    locale: locale === "en" ? enUS : zhCN,
                  })}
                </time>
              </div>
            </>
          ) : (
            // 从网址恢复、列表还没加载时没有摘要，先放静态占位
            <div aria-hidden>
              <div className="h-6 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="mt-4 h-4 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          )}

          {(hints.code || hints.link) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {hints.code && <VerificationCodeChip code={hints.code} variant="banner" />}
              {hints.link && <VerificationLinkButton link={hints.link} variant="banner" />}
            </div>
          )}

          <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
            {error ? (
              <p role="alert" className="py-12 text-center text-small text-danger">
                {error}
              </p>
            ) : detail ? (
              <EmailContent html={detail.html} text={detail.text} />
            ) : (
              <div className="flex justify-center py-16">
                <Spinner size="sm" color="default" />
              </div>
            )}
          </div>

          {attachments.length > 0 && (
            <section className="mt-6 border-t border-gray-100 pt-5 dark:border-gray-800">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Paperclip size={15} />
                {t("attachments")} · {attachments.length}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 py-2 pl-3 pr-1.5 dark:border-gray-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-800 dark:text-gray-200" title={attachment.filename}>
                        {attachment.filename}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{Math.max(1, Math.round(attachment.size / 1024))} KB</p>
                    </div>
                    {downloadLink(
                      attachment.downloadUrl,
                      attachment.filename,
                      `${t("download")} ${attachment.filename}`,
                      toolButton,
                      <Download size={16} />,
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </div>
    </div>
  )
}
