"use client"

import { useEffect, useMemo, useState } from "react"
import { getMessage } from "@/lib/api"
import { extractVerificationCode } from "@/lib/verification-code"
import type { Message } from "@/types"

// 只为最新的几封邮件补取正文：验证码邮件几乎总是最新到达的那封
const PREFETCH_LIMIT = 10
const RETRY_AFTER_MS = 15_000

// 模块级缓存：邮件正文不会变，同一封邮件在列表 / 详情间切换时只取一次
const bodyCodes = new Map<string, string | null>()
const inflight = new Set<string>()
const failedAt = new Map<string, number>()

const cacheKey = (m: Message) => `${m.accountId}:${m.id}`

interface Options {
  token: string | null
  providerId: string
  // 列表接口不带正文摘要（intro 为空）时，是否补取详情来识别
  prefetchBody?: boolean
}

/**
 * 返回 messageId -> 验证码 的映射。先用主题 + 摘要识别；
 * 摘要为空且主题里没有验证码时，按需拉取详情正文再识别（不会标记已读）。
 */
export function useVerificationCodes(messages: Message[], { token, providerId, prefetchBody = false }: Options) {
  const [version, setVersion] = useState(0)

  const quick = useMemo(() => {
    const out = new Map<string, string | null>()
    for (const m of messages) {
      out.set(m.id, extractVerificationCode({ subject: m.subject, intro: m.intro }, { introOnly: true }))
    }
    return out
  }, [messages])

  useEffect(() => {
    if (!prefetchBody || !token) return
    const now = Date.now()
    const pending = messages
      .slice(0, PREFETCH_LIMIT)
      .filter((m) => {
        const key = cacheKey(m)
        return (
          !m.intro &&
          !quick.get(m.id) &&
          !bodyCodes.has(key) &&
          !inflight.has(key) &&
          now - (failedAt.get(key) ?? 0) > RETRY_AFTER_MS
        )
      })
    if (!pending.length) return

    // 逐封串行获取，避免新邮件一多就并发打满接口
    const run = async () => {
      for (const m of pending) {
        const key = cacheKey(m)
        inflight.add(key)
        try {
          const detail = await getMessage(token, m.id, providerId)
          bodyCodes.set(key, extractVerificationCode({ subject: detail.subject, text: detail.text, html: detail.html }))
          failedAt.delete(key)
        } catch (err) {
          failedAt.set(key, Date.now())
          console.warn("Failed to fetch message body for code detection:", err)
        } finally {
          inflight.delete(key)
        }
        setVersion((v) => v + 1)
      }
    }
    run()
  }, [messages, quick, token, providerId, prefetchBody])

  return useMemo(() => {
    const out = new Map<string, string>()
    for (const m of messages) {
      const code = quick.get(m.id) ?? bodyCodes.get(cacheKey(m))
      if (code) out.set(m.id, code)
    }
    return out
    // version 变化代表异步识别有了新结果
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, quick, version])
}
