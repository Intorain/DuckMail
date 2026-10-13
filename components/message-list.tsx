"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Spinner } from "@heroui/spinner"
import { getMessages } from "@/lib/api"
import type { Message } from "@/types"
import { useAuth } from "@/contexts/auth-context"
import { useMailChecker } from "@/hooks/use-mail-checker"
import { useHeroUIToast } from "@/hooks/use-heroui-toast"
import { useMailStatus } from "@/contexts/mail-status-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { Mail } from "lucide-react"
import { useTranslations } from "next-intl"
import InboxIntro from "@/components/inbox-intro"
import MessageCard from "@/components/message-card"
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
  const { toast } = useHeroUIToast()
  const { isEnabled } = useMailStatus()
  const isMobile = useIsMobile()
  const t = useTranslations("messageList")
  // 请求序号：切换账号 / 手动刷新时递增，只有最新一次请求的结果才允许写入状态，
  // 避免上一个账号仍在飞的请求（成功或失败）覆盖当前账号的数据
  const loadSeqRef = useRef(0)
  const codes = useVerificationCodes(messages, {
    token,
    providerId: currentAccount?.providerId || "duckmail",
    prefetchBody: true,
  })

  // 处理新消息通知
  const handleNewMessage = useCallback((message: Message) => {
    toast({
      title: t("newEmail"),
      description: `${t("from")}: ${message.from.address}`,
      color: "success",
      variant: "flat",
      icon: <Mail size={16} />,
    })
  }, [t, toast])

  // 处理消息列表更新
  const handleMessagesUpdate = useCallback((newMessages: Message[]) => {
    setMessages(newMessages)
    setError(null)
    if (loading) {
      setLoading(false)
    }
  }, [loading])

  // 手动刷新邮件
  const manualRefresh = useCallback(async () => {
    if (!token || !currentAccount) return

    const seq = ++loadSeqRef.current
    try {
      setLoading(true)
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

  useMailChecker({
    onNewMessage: handleNewMessage,
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

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t("inbox")}</h2>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <Spinner size="lg" color="primary" />
            <p className="mt-4 text-gray-500 dark:text-gray-400">{t("loading")}</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t("inbox")}</h2>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-red-500 font-medium">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className={isMobile ? "p-2" : "p-4"}>
          <div className={isMobile ? "mb-4" : "mb-6"}>
            <h2 className={`${isMobile ? "text-xl" : "text-2xl"} font-bold text-gray-800 dark:text-gray-100`}>{t("inbox")}</h2>
          </div>
          <div className="flex flex-col items-center py-16 text-center">
            <Mail className="mb-4 h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
            <h3 className="text-medium font-medium text-gray-800 dark:text-gray-100">{t("emptyTitle")}</h3>
            <p className="mt-1.5 flex items-center gap-1.5 text-small text-gray-500 dark:text-gray-400">
              <span className={`h-1.5 w-1.5 rounded-full ${isEnabled ? "bg-green-500" : "bg-gray-400"}`} />
              {isEnabled ? t("autoChecking") : t("autoCheckPaused")}
            </p>
          </div>
        </div>
        {/* 收件箱为空时用简短的系统说明填充右侧空白，可向下滚动浏览 */}
        <InboxIntro />
      </div>
    )
  }

  return (
    <div className={`h-full w-full overflow-y-auto ${isMobile ? 'p-2' : 'p-4'}`}>
      <div className={`${isMobile ? 'mb-4' : 'mb-6'} w-full`}>
        <h2 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-gray-800 dark:text-gray-100`}>
          {t("inbox")}
        </h2>
        <div className={`flex items-center gap-2 text-xs text-gray-500 ${isMobile ? 'mt-1' : 'mt-2'} ${isMobile ? 'flex-wrap' : ''}`}>
          <div
            className={`w-2 h-2 rounded-full ${
              isEnabled ? "bg-green-500 animate-pulse" : "bg-gray-400"
            }`}
          />
          <span className={isMobile ? 'text-xs' : ''}>
            {isEnabled ? t("pollingActive") : t("pollingPaused")}
          </span>
          <span className="text-xs text-gray-400 ml-2">
            {t("messageCount")}: {messages.length}
          </span>
        </div>
      </div>
      <div className={`${isMobile ? 'space-y-2' : 'space-y-4'} w-full`}>
        {messages.map((message) => (
          <MessageCard key={message.id} message={message} code={codes.get(message.id)} onSelect={onSelectMessage} />
        ))}
      </div>
    </div>
  )
}
