"use client"

import { useSyncExternalStore } from "react"

// 订阅 CSS 媒体查询；服务端渲染和首帧按 false 处理
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
