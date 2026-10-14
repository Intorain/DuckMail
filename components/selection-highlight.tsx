"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

// 阅读面板中当前邮件的选中底色。它是列表外框里一块独立的高亮，而不是画在每一行自己身上：
// 切换邮件时从上一封滑到下一封（CSS 过渡，快速连点时会从当前位置直接转向新目标，不打断交互）。
// 列表重排（新邮件插入、面板开合时行变高、窗口缩放）时直接跟到新位置，不做滑动，免得和瞬间移动的行错位。
// 面板开合时它被临时命名，跟着那一行一起补间、淡入淡出（见 page.tsx 的 transitionReader）。

const rowOf = (box: HTMLElement, id: string) =>
  box.querySelector<HTMLElement>(`.mail-row[data-message-id="${CSS.escape(id)}"]`)

// 把高亮放到某一行上。目标和当前一致时不动，避免轮询刷新列表时打断正在进行的滑动
function place(el: HTMLElement, row: HTMLElement, opacity: number, slide: boolean) {
  const transform = `translateY(${row.offsetTop}px)`
  const height = `${row.offsetHeight}px`
  if (el.style.transform === transform && el.style.height === height && el.style.opacity === String(opacity)) return
  el.style.transition = slide ? "" : "none"
  el.style.transform = transform
  el.style.height = height
  el.style.opacity = String(opacity)
  if (!slide) {
    // 先让瞬移生效，再恢复过渡，之后的变化才会有动画
    void el.offsetHeight
    el.style.transition = ""
  }
}

function placeAll(id: string, opacity: number, slide: boolean) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-mail-highlight]")) {
    const row = el.parentElement && rowOf(el.parentElement, id)
    if (row) place(el, row, opacity, slide)
  }
}

/** 打开面板的过渡开始前调用：把透明的高亮先放到即将选中的那一行，让它在过渡中随这一行移动、淡入 */
export function pinSelectionHighlight(id: string) {
  placeAll(id, 0, false)
}

/**
 * 面板已打开、切换到另一封时在点击当下调用：不等 React 重新渲染整页，先让高亮滑过去。
 * 之后组件提交时目标一致，不会重复触发。
 */
export function moveSelectionHighlight(id: string) {
  placeAll(id, 1, true)
}

interface SelectionHighlightProps {
  selectedId?: string | null
  // 列表内容变化（邮件增删、顺序变化）时传入新值，触发重新定位
  layoutKey: unknown
}

export default function SelectionHighlight({ selectedId, layoutKey }: SelectionHighlightProps) {
  const ref = useRef<HTMLDivElement>(null)
  // 当前显示中的那一封；关闭面板后为 null
  const shownIdRef = useRef<string | null>(null)
  // 最后选中过的那一封：关闭面板时高亮留在它的位置上淡出
  const lastIdRef = useRef<string | null>(null)

  const sync = (slide: boolean) => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return
    const id = selectedId ?? lastIdRef.current
    const row = id ? rowOf(box, id) : null
    if (!row) {
      el.style.opacity = "0"
      return
    }
    place(el, row, selectedId ? 1 : 0, slide)
  }
  const syncRef = useRef(sync)
  syncRef.current = sync

  useLayoutEffect(() => {
    const prev = shownIdRef.current
    // 只有面板已打开、在两封邮件之间切换时才滑动；开合本身由过渡动画负责
    const switching = !!selectedId && !!prev && prev !== selectedId && !document.documentElement.dataset.readerTransition
    sync(switching)
    shownIdRef.current = selectedId ?? null
    if (selectedId) lastIdRef.current = selectedId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layoutKey])

  // 行高随列表宽度变化（面板开合、窗口缩放）时跟到新位置
  useEffect(() => {
    const box = ref.current?.parentElement
    if (!box) return
    const observer = new ResizeObserver(() => syncRef.current(false))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} aria-hidden data-mail-highlight className="mail-highlight" />
}
