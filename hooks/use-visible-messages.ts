"use client"

import { useEffect, useMemo } from "react"
import type { Message } from "@/types"

export interface MessageOverrides {
  // 打开过的邮件在本地先显示为已读、删除的邮件先隐藏，等下一次拉取时与服务端自然对齐
  readIds?: ReadonlySet<string>
  removedIds?: ReadonlySet<string>
  // 把当前显示的邮件（与列表同序）同步给页面，阅读面板据此切换上一封 / 下一封
  onMessagesChange?: (messages: Message[]) => void
}

export function useVisibleMessages(messages: Message[], { readIds, removedIds, onMessagesChange }: MessageOverrides) {
  const visible = useMemo(
    () =>
      messages
        .filter((m) => !removedIds?.has(m.id))
        .map((m) => (!m.seen && readIds?.has(m.id) ? { ...m, seen: true } : m)),
    [messages, readIds, removedIds],
  )

  useEffect(() => {
    onMessagesChange?.(visible)
  }, [visible, onMessagesChange])

  return visible
}
