"use client"

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { Spinner } from "@heroui/spinner"
import { getMessages } from "@/lib/api"
import type { Message } from "@/types"
import { useAuth } from "@/contexts/auth-context"
import { useMailChecker } from "@/hooks/use-mail-checker"
import { useMailStatus } from "@/contexts/mail-status-context"
import { Mail } from "lucide-react"
import { useTranslations } from "next-intl"
import InboxIntro from "@/components/inbox-intro"
import MessageRow from "@/components/message-row"
import { useVerificationCodes } from "@/hooks/use-verification-codes"

interface MessageListProps {
  onSelectMessage: (message: Message) => void
  refreshKey?: number
}

export default function MessageList({ onSelectMessage, refreshKey }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { token, currentAccount } = useAuth()
  const { isEnabled } = useMailStatus()
  const t = useTranslations("messageList")
  // 请求序号：切换账号 / 手动刷新时递增，只有最新一次请求的结果才允许写入状态，
  // 避免上一个账号仍在飞的请求（成功或失败）覆盖当前账号的数据
  const loadSeqRef = useRef(0)
  const codes = useVerificationCodes(messages, {
    token,
    providerId: currentAccount?.providerId || "duckmail",
    prefetchBody: true,
  })

  // "3 分钟前"这类相对时间需要定期刷新；列表本身只在邮件变化时才会重新渲染
  const [, setNow] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // 处理消息列表更新
  const handleMessagesUpdate = useCallback((newMessages: Message[]) => {
    setMessages(newMessages)
    setError(null)
    if (loading) {
      setLoading(false)
    }
  }, [loading])

  // 手动刷新邮件：保留当前列表原地更新，不切回加载态，避免整屏闪一下
  const manualRefresh = useCallback(async () => {
    if (!token || !currentAccount) return

    const seq = ++loadSeqRef.current
    try {
      const providerId = currentAccount.providerId || "duckmail"
      const { messages: fetchedMessages } = await getMessages(token, 1, providerId)
      if (seq !== loadSeqRef.current) return
      setMessages(fetchedMessages || [])
      setError(null)
    } catch (err) {
      if (seq !== loadSeqRef.current) return
      console.error("Failed to refresh messages:", err)
      setError(t("refreshError"))
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false)
      }
    }
  }, [token, currentAccount, t])

  // 列表可见时新邮件会直接出现在顶部，不再额外弹 toast
  useMailChecker({
    onMessagesUpdate: handleMessagesUpdate,
    interval: 2000,
    enabled: isEnabled,
    startImmediately: false,
  })

  // 初始加载
  useEffect(() => {
    // 每次账号 / token 变化都开启一轮新的加载，旧请求的结果在返回后会被序号校验丢弃
    const seq = ++loadSeqRef.current

    const fetchInitialMessages = async () => {
      if (!token || !currentAccount) {
        console.log("📥 [MessageList] No token or account, clearing messages")
        setMessages([])
        setError(null)
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        console.log(`📥 [MessageList] Loading initial messages for account: ${currentAccount.address}`)
        const providerId = currentAccount.providerId || "duckmail"
        const { messages: fetchedMessages } = await getMessages(token, 1, providerId)
        if (seq !== loadSeqRef.current) {
          console.log(`📥 [MessageList] Ignoring stale result for account: ${currentAccount.address}`)
          return
        }
        setMessages(fetchedMessages || [])
        setError(null)
        console.log(`📥 [MessageList] Loaded ${fetchedMessages?.length || 0} initial messages`)
      } catch (err) {
        if (seq !== loadSeqRef.current) {
          console.log(`📥 [MessageList] Ignoring stale error for account: ${currentAccount.address}`)
          return
        }
        console.error("Failed to fetch messages:", err)
        setError(t("fetchError"))
        setMessages([])
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false)
        }
      }
    }

    fetchInitialMessages()
  }, [token, currentAccount?.id, t])

  // 监听手动刷新
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      manualRefresh()
    }
  }, [refreshKey, manualRefresh])

  // 加载 / 空 / 出错 / 列表几种状态共用同一个外框和标题，切换时标题位置不跳
  const page = (children: ReactNode, status?: ReactNode) => (
    <div className="w-full px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <h2 className="flex items-baseline gap-2 text-xl font-semibold text-gray-900 dark:text-gray-50">
          {t("inbox")}
          {messages.length > 0 && (
            <span className="text-sm font-normal tabular-nums text-gray-400 dark:text-gray-500">{messages.length}</span>
          )}
        </h2>
        {status}
      </div>
      {children}
    </div>
  )

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        {page(
          <div className="flex items-center justify-center gap-2 py-16 text-small text-gray-500 dark:text-gray-400">
            <Spinner size="sm" color="default" />
            {t("loading")}
          </div>,
        )}
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        {page(
          <div className="flex flex-col items-center py-16 text-center">
            <Mail className="mb-4 h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
            {error ? (
              <p role="alert" className="text-small text-danger">{error}</p>
            ) : (
              <>
                <h3 className="text-medium font-medium text-gray-800 dark:text-gray-100">{t("emptyTitle")}</h3>
                <p className="mt-1.5 flex items-center gap-1.5 text-small text-gray-500 dark:text-gray-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${isEnabled ? "bg-green-500" : "bg-gray-400"}`} />
                  {isEnabled ? t("autoChecking") : t("autoCheckPaused")}
                </p>
              </>
            )}
          </div>,
        )}
        {/* 收件箱为空时用简短的系统说明填充右侧空白，可向下滚动浏览 */}
        {!error && <InboxIntro />}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {page(
        <>
          {error && (
            <p role="alert" className="mb-3 text-small text-danger">
              {error}
            </p>
          )}
          <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} code={codes.get(message.id)} onSelect={onSelectMessage} />
            ))}
          </div>
        </>,
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className={`h-1.5 w-1.5 rounded-full ${isEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
          {isEnabled ? t("pollingActive") : t("pollingPaused")}
        </span>,
      )}
    </div>
  )
}
