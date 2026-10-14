"use client"

import { useState, useEffect, useRef, useTransition, startTransition as startBackgroundUpdate } from "react"
import { flushSync } from "react-dom"
import Header from "@/components/header"
import Sidebar, { type SidebarNavItem } from "@/components/sidebar"
import { SettingsPanel } from "@/components/settings-panel"
import EmptyState from "@/components/empty-state"
import CreatingState from "@/components/creating-state"
import InboxIntro from "@/components/inbox-intro"
import AccountModal from "@/components/account-modal"
import LoginModal from "@/components/login-modal"
import AnnouncementModal, { UnreadDot, useAnnouncementUnread } from "@/components/announcement-modal"
import HostedMessageList from "@/components/hosted-message-list"
import MessageList from "@/components/message-list"
import MessageDetail from "@/components/message-detail"
import { moveSelectionHighlight, pinSelectionHighlight } from "@/components/selection-highlight"
import { AuthProvider, useAuth } from "@/contexts/auth-context"
import { useApiProvider } from "@/contexts/api-provider-context"
import { MailStatusProvider } from "@/contexts/mail-status-context"
import type { Message } from "@/types"
import { HOSTED_AUTH_REQUIRED } from "@/lib/hosting-session"
import { useHeroUIToast } from "@/hooks/use-heroui-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useTranslations, useLocale } from "next-intl"
import { useRouter, usePathname } from "@/i18n/navigation"
import { CheckCircle, Navigation, RefreshCw, Menu, AlertCircle, Languages } from "lucide-react"
import { Button } from "@heroui/button"
import { DUCKMAIL_GITHUB_URL, DUCKMAIL_LOGO_PATH } from "@/lib/brand"

// 生成随机字符串，用于用户名和密码
function generateRandomString(length: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  const charsLength = chars.length

  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(length)
    window.crypto.getRandomValues(array)
    return Array.from(array, (value) => chars[value % charsLength]).join("")
  }

  let result = ""
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * charsLength)
    result += chars[index]
  }
  return result
}

// 阅读面板当前打开的邮件写在网址 ?m= 里：浏览器后退 / 手机返回手势关闭面板，刷新后仍停在这封邮件
const READER_PARAM = "m"

function setReaderParam(id: string | null, mode: "push" | "replace") {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set(READER_PARAM, id)
  else url.searchParams.delete(READER_PARAM)
  if (url.href === window.location.href) return
  if (mode === "push") window.history.pushState(null, "", url)
  else window.history.replaceState(null, "", url)
}

const findRow = (id: string) =>
  document.querySelector<HTMLElement>(`.mail-row[data-message-id="${CSS.escape(id)}"]`)

// 阅读面板开合用 View Transitions：浏览器在开合前后各截一帧并在两帧之间补间，
// 列表变窄、单行 / 两行布局切换都变成平滑的形变 + 交叉淡入，不用逐帧重排。动画样式见 globals.css。
// 不支持、页面不可见或系统开了"减少动态效果"时直接切换。
function transitionReader(direction: "open" | "close", update: () => void, openingId?: string) {
  const root = document.documentElement
  if (
    !document.startViewTransition ||
    document.visibilityState !== "visible" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update()
    return
  }
  root.dataset.readerTransition = direction
  // 打开前先把透明的选中高亮放到要打开的那一行：过渡中它跟着这一行移动、淡入，而不是凭空出现在终点
  if (openingId) pinSelectionHighlight(openingId)
  const clearNames = window.matchMedia("(min-width: 1280px)").matches ? nameVisibleRows() : () => {}
  const transition = document.startViewTransition(() => flushSync(update))
  transition.finished.finally(() => {
    clearNames()
    // 连续开合时后一次会接管，只清掉属于自己的标记
    if (root.dataset.readerTransition === direction) delete root.dataset.readerTransition
  })
}

// 宽屏开合时列表会在单行 / 两行布局之间切换。给列表外框、标题右侧、每一行及行内的发件人、主题、验证码、
// 时间单独命名，浏览器会把它们各自从旧位置补间到新位置，整个列表不用淡出再淡入（那样看起来像刷新了一下）。
// 只命名顶边处在滚动区域上沿以下的元素：补间层不受滚动容器裁切，被滚到上方的部分会画到顶栏上。
// 可视区下方的行也命名，关闭面板、行变矮时它们会从屏幕外平滑移上来，而不是凭空淡入。
function nameVisibleRows(): () => void {
  const scroller = document.querySelector<HTMLElement>(".vt-inbox-list [data-mail-scroller]")
  if (!scroller) return () => {}
  const viewTop = scroller.getBoundingClientRect().top
  const named: HTMLElement[] = []
  const name = (el: HTMLElement, value: string, group: string) => {
    el.style.setProperty("view-transition-name", value)
    el.style.setProperty("view-transition-class", group)
    named.push(el)
  }
  const inView = (el: HTMLElement | null): el is HTMLElement => !!el && el.getBoundingClientRect().top >= viewTop

  const aside = scroller.querySelector<HTMLElement>("[data-inbox-aside]")
  if (inView(aside)) name(aside, "inbox-aside", "mail-part")
  const box = scroller.querySelector<HTMLElement>(".mail-list")
  if (inView(box)) name(box, "inbox-box", "mail-box")
  const highlight = scroller.querySelector<HTMLElement>("[data-mail-highlight]")
  if (inView(highlight)) name(highlight, "inbox-highlight", "mail-row-bg")
  for (const row of scroller.querySelectorAll<HTMLElement>(".mail-row")) {
    if (!inView(row)) continue
    const key = (row.dataset.messageId ?? "").replace(/[^\w-]/g, "_")
    name(row, `mail-${key}`, "mail-row-bg")
    // 行内各部分跟着行一起命名。单行 / 两行布局里的时间是两个元素，同一时刻只显示一个
    // （隐藏的那个没有位置，不能按位置判断），共用同一个名字
    for (const part of row.querySelectorAll<HTMLElement>("[data-vt]")) {
      name(part, `mail-${part.dataset.vt}-${key}`, "mail-part")
    }
  }
  return () => {
    for (const el of named) {
      el.style.removeProperty("view-transition-name")
      el.style.removeProperty("view-transition-class")
    }
  }
}

function MainContent() {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [loginAccountAddress, setLoginAccountAddress] = useState<string>("")
  // 阅读面板：宽屏（≥1280）列表右侧分栏，窄屏从右侧滑入盖住列表；列表始终挂载，轮询和滚动位置都保留
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 与 selectedId 同步、但立即生效：过渡动画会推迟一帧才真正写入 state，期间的判断都以它为准
  const selectedIdRef = useRef<string | null>(null)
  // 列表组件回传的当前邮件（同列表顺序），用于上一封 / 下一封和面板标题的即时显示
  const [listMessages, setListMessages] = useState<Message[]>([])
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set())
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set())
  // 打开面板时是否新压了一条历史记录：是的话关闭时走 history.back()，后退键和关闭按钮效果一致
  const pushedReaderRef = useRef(false)
  const restoreFocusIdRef = useRef<string | null>(null)
  const isWide = useMediaQuery("(min-width: 1280px)")
  const { isAuthenticated, currentAccount, accounts, register, isReady: authReady } = useAuth()
  const { apiKey, isReady: providerReady } = useApiProvider()
  // First-run: nothing to list yet, so the sidebar stays out of the way while
  // a mailbox is being provisioned automatically.
  const hasMailboxes = accounts.length > 0 || !!apiKey

  // 切换账号时关闭阅读面板并清掉本地覆盖；首次恢复账号时保留网址里的邮件
  const accountIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = accountIdRef.current
    accountIdRef.current = currentAccount?.id
    if (prev === undefined || prev === currentAccount?.id) return
    pushedReaderRef.current = false
    setReaderParam(null, "replace")
    selectedIdRef.current = null
    setSelectedId(null)
    setListMessages([])
    setReadIds(new Set())
    setRemovedIds(new Set())
  }, [currentAccount?.id])

  // 修改当前邮件：面板开合（有 ↔ 无）时走过渡动画，面板里切换邮件直接替换，保持键盘切换的干脆
  const commitSelection = (id: string | null, alsoUpdate?: () => void) => {
    const prev = selectedIdRef.current
    selectedIdRef.current = id
    const update = () => {
      setSelectedId(id)
      alsoUpdate?.()
    }
    if (!prev !== !id) transitionReader(id ? "open" : "close", update, id ?? undefined)
    else update()
  }

  // 首次进入时从网址恢复（不播动画），浏览器前进 / 后退时跟随
  useEffect(() => {
    const initial = new URL(window.location.href).searchParams.get(READER_PARAM)
    selectedIdRef.current = initial
    setSelectedId(initial)
    const syncFromUrl = () => {
      pushedReaderRef.current = false
      const id = new URL(window.location.href).searchParams.get(READER_PARAM)
      if (id !== selectedIdRef.current) commitSelection(id)
    }
    window.addEventListener("popstate", syncFromUrl)
    return () => window.removeEventListener("popstate", syncFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [refreshKey, setRefreshKey] = useState(0)
  const { toast } = useHeroUIToast()
  const isMobile = useIsMobile()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const autoCreateTriedRef = useRef(false)
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false)
  const [hasUnreadAnnouncement, markAnnouncementRead] = useAnnouncementUnread()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const t = useTranslations("mainPage")
  const tDetail = useTranslations("messageDetail")
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const onNeed = (event: Event) => {
      const address = (event as CustomEvent<{ address?: string }>).detail?.address || ""
      setLoginAccountAddress(address)
      setIsLoginModalOpen(true)
    }
    window.addEventListener(HOSTED_AUTH_REQUIRED, onNeed)
    return () => window.removeEventListener(HOSTED_AUTH_REQUIRED, onNeed)
  }, [])

  // 一键创建临时邮箱（首次进入自动触发，或用户手动触发）
  const handleQuickCreate = async () => {
    if (isCreatingAccount) return
    setIsCreatingAccount(true)

    const maxAttempts = 5
    const domain = "duckmail.sbs"

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const username = generateRandomString(10)
      const password = generateRandomString(12)
      const email = `${username}@${domain}`

      try {
        // 一键创建的临时邮箱默认不过期
        await register(email, password, 0)

        // 账号/密码可随时在右上角头像菜单查看，这里只做一次轻量提示
        toast({
          title: t("mailboxReady"),
          description: t("mailboxReadyDesc"),
          color: "success",
          variant: "flat",
          timeout: 8000,
          icon: <CheckCircle size={16} />
        })

        setIsCreatingAccount(false)
        return
      } catch (error: any) {
        const message = error?.message || ""
        const isAddressTaken =
          message.includes("该邮箱地址已被使用") ||
          message.includes("Email address already exists") ||
          message.includes("already used") ||
          message.includes("already exists")

        // 仅地址已被占用时换用户名重试（极低概率）
        if (isAddressTaken && attempt < maxAttempts - 1) {
          continue
        }

        // 其他错误直接展示给用户
        console.error("一键创建临时邮箱失败:", error)
        toast({
          title: t("createFailed"),
          description: message || t("createFailedDesc"),
          color: "danger",
          variant: "flat",
          icon: <AlertCircle size={16} />
        })
        break
      }
    }

    setIsCreatingAccount(false)
  }

  // 首次进入（本地没有任何邮箱、也没配置 API Key）时自动创建一个临时邮箱，
  // 用户无需点击即可直接停留在主界面等待收件。仅在本次会话尝试一次。
  useEffect(() => {
    if (!authReady || !providerReady || autoCreateTriedRef.current) return
    autoCreateTriedRef.current = true
    if (accounts.length === 0 && !apiKey) {
      void handleQuickCreate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, providerReady])

  const [isPending, startTransition] = useTransition()

  const handleLocaleChange = () => {
    const newLocale = locale === "en" ? "zh" : "en"
    startTransition(() => {
      router.replace(pathname, { locale: newLocale })
    })
    toast({
      title: newLocale === "en" ? t("switchedToEn") : t("switchedToZh"),
      color: "primary",
      variant: "flat",
      icon: <Languages size={16} />
    })
  }

  const handleCreateAccount = () => {
    setIsAccountModalOpen(true)
  }

  const handleLogin = () => {
    setLoginAccountAddress("")
    setIsLoginModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsAccountModalOpen(false)
  }

  const handleCloseLoginModal = () => {
    setIsLoginModalOpen(false)
    setLoginAccountAddress("")
  }

  const showMessage = (message: Message) => {
    commitSelection(message.id, () => {
      if (!message.seen && currentAccount?.capabilities?.markSeenLocally !== false) {
        setReadIds((prev) => new Set(prev).add(message.id))
      }
    })
  }

  const handleSelectMessage = (message: Message) => {
    const current = selectedIdRef.current
    if (message.id === current) return
    // 面板已打开时只替换当前记录，避免点几封邮件就要按好几次后退
    if (current) {
      setReaderParam(message.id, "replace")
      // 切换邮件：先直接把选中高亮滑过去，列表和面板放到低优先级更新里渲染（可分段让出主线程），
      // 高亮的滑动不用等整页重新渲染完，点下去立刻开始
      moveSelectionHighlight(message.id)
      startBackgroundUpdate(() => showMessage(message))
      return
    }
    setReaderParam(message.id, "push")
    pushedReaderRef.current = true
    showMessage(message)
  }

  const closeReader = () => {
    const current = selectedIdRef.current
    if (!current) return
    // 焦点在面板里（或已丢到 body）时，关闭后回到列表里对应的那一行，键盘用户不丢位置
    const active = document.activeElement
    if (!active || active === document.body || active.closest("[data-reader]")) {
      restoreFocusIdRef.current = current
    }
    const popHistory = pushedReaderRef.current
    pushedReaderRef.current = false
    commitSelection(null)
    // 随后触发的 popstate 看到 selectedIdRef 已是 null，不会重复处理
    if (popHistory) window.history.back()
    else setReaderParam(null, "replace")
  }

  // 窄屏下列表在面板打开期间是 inert 的，要等面板关闭、重新渲染之后才能把焦点放回去
  useEffect(() => {
    if (selectedId || !restoreFocusIdRef.current) return
    findRow(restoreFocusIdRef.current)?.focus({ preventScroll: true })
    restoreFocusIdRef.current = null
  }, [selectedId])

  const selectedIndex = selectedId ? listMessages.findIndex((m) => m.id === selectedId) : -1
  const prevMessage = selectedIndex > 0 ? listMessages[selectedIndex - 1] : undefined
  const nextMessage = selectedIndex >= 0 ? listMessages[selectedIndex + 1] : undefined

  const stepReader = (target: Message | undefined) => {
    if (!target) return
    const fromRow = document.activeElement?.classList.contains("mail-row")
    handleSelectMessage(target)
    // 选中行保持在列表可视范围内；键盘焦点原本在列表行上时跟着移过去
    requestAnimationFrame(() => {
      const row = findRow(target.id)
      if (fromRow) row?.focus()
      else row?.scrollIntoView({ block: "nearest" })
    })
  }

  // 删除后宽屏直接显示下一封（没有就上一封），窄屏回到列表
  const handleMessageDeleted = (messageId: string) => {
    setRemovedIds((prev) => new Set(prev).add(messageId))
    const following = isWide ? nextMessage ?? prevMessage : undefined
    if (following) {
      setReaderParam(following.id, "replace")
      showMessage(following)
    } else {
      closeReader()
    }
  }

  // Esc 关闭；↑ / ↓ 或 j / k 切换上一封 / 下一封。方向键在面板内部时留给正文滚动
  const readerKeysRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    readerKeysRef.current = (e) => {
      if (!selectedId || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return
      // 设置、登录等弹窗打开时按键交给弹窗
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return
      const inReader = !!target?.closest("[data-reader]")
      if (e.key === "Escape") {
        e.preventDefault()
        closeReader()
      } else if (e.key === "j" || (e.key === "ArrowDown" && !inReader)) {
        e.preventDefault()
        stepReader(nextMessage)
      } else if (e.key === "k" || (e.key === "ArrowUp" && !inReader)) {
        e.preventDefault()
        stepReader(prevMessage)
      }
    }
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => readerKeysRef.current(e)
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const listProps = {
    onSelectMessage: handleSelectMessage,
    refreshKey,
    selectedId,
    readIds,
    removedIds,
    onMessagesChange: setListMessages,
  }

  const handleRefresh = () => {
    toast({
      title: t("refreshing"),
      color: "primary",
      variant: "flat",
      icon: <RefreshCw size={16} />
    })
    setRefreshKey(prev => prev + 1)
  }

  const handleSidebarItemClick = (item: SidebarNavItem) => {
    if (item === "inbox") {
      closeReader()
      return
    }

    if (item === "announcement") {
      setIsAnnouncementOpen(true)
      markAnnouncementRead()
      return
    }

    if (item === "github") {
      window.open(DUCKMAIL_GITHUB_URL, "_blank", "noopener,noreferrer")
      return
    }

    if (item === "faq") {
      window.open(`/${locale}/faq`, "_blank", "noopener,noreferrer")
      return
    }

    if (item === "api") {
      window.open(`/${locale}/api-docs`, "_blank", "noopener,noreferrer")
      return
    }

    if (item === "privacy") {
      window.open(`/${locale}/privacy`, "_blank", "noopener,noreferrer")
      return
    }

    toast({
      title: item,
      description: t("comingSoon"),
      color: "warning",
      variant: "flat",
      icon: <Navigation size={16} />
    })
  }

  const sidebarProps = {
    onItemClick: handleSidebarItemClick,
    onQuickCreate: handleQuickCreate,
    onCreateAccount: handleCreateAccount,
    onLogin: handleLogin,
    onOpenSettings: () => setIsSettingsOpen(true),
    isCreating: isCreatingAccount,
    hasUnreadAnnouncement,
  }

  return (
    <>
      <div className={`flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
        {/* 桌面端侧边栏 */}
        {!isMobile && hasMailboxes && <Sidebar {...sidebarProps} />}

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* 移动端顶部栏包含菜单按钮 */}
          {isMobile && (
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              {hasMailboxes ? (
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onPress={() => setIsSidebarOpen(true)}
                  className="text-gray-600 dark:text-gray-300"
                  aria-label={t("openMenu")}
                >
                  <span className="relative">
                    <Menu size={20} />
                    {hasUnreadAnnouncement && <UnreadDot />}
                  </span>
                </Button>
              ) : (
                <div className="w-8" />
              )}
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center overflow-hidden bg-white p-0.5">
                  <img
                    src={DUCKMAIL_LOGO_PATH}
                    alt="DuckMail Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="font-semibold text-lg text-gray-800 dark:text-white">duckmail.sbs</span>
              </div>
              <div className="w-8" />
            </div>
          )}

          <Header
            onCreateAccount={handleCreateAccount}
            onQuickCreate={handleQuickCreate}
            onLocaleChange={handleLocaleChange}
            onLogin={handleLogin}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onRefresh={handleRefresh}
            isMobile={isMobile}
          />
          <main className="relative flex flex-1 overflow-hidden">
            {isAuthenticated && currentAccount ? (
              <>
                {/* 窄屏面板盖住列表时把列表设为 inert，Tab 不会跑到看不见的行上 */}
                <div className="vt-inbox-list h-full min-w-0 flex-1" inert={!!selectedId && !isWide}>
                  {currentAccount.source === "microsoft" ? (
                    <HostedMessageList key={currentAccount.id} {...listProps} />
                  ) : (
                    <MessageList {...listProps} />
                  )}
                </div>
                {selectedId && (
                  <section
                    data-reader
                    aria-label={tDetail("reader")}
                    className="vt-reader absolute inset-0 z-20 overflow-hidden shadow-[-16px_0_32px_-24px_rgb(15_23_42/0.35)] xl:static xl:z-auto xl:w-[min(45rem,58%)] xl:shrink-0 xl:border-l xl:border-gray-200 xl:shadow-none dark:xl:border-gray-800"
                  >
                    <MessageDetail
                      key={selectedId}
                      messageId={selectedId}
                      preview={selectedIndex >= 0 ? listMessages[selectedIndex] : null}
                      onClose={closeReader}
                      onDeleted={handleMessageDeleted}
                      onPrev={prevMessage && (() => stepReader(prevMessage))}
                      onNext={nextMessage && (() => stepReader(nextMessage))}
                    />
                  </section>
                )}
              </>
            ) : (
              <div className="h-full min-w-0 flex-1 overflow-y-auto">
                {!authReady || !providerReady || isCreatingAccount ? (
                  // 本地状态尚未恢复 / 正在自动创建：用同一个轻量动画占位，避免落地页闪烁
                  <CreatingState />
                ) : apiKey ? (
                  <EmptyState
                    mode="hosted"
                    onCreateAccount={handleQuickCreate}
                    isAuthenticated={isAuthenticated}
                    isCreating={isCreatingAccount}
                  />
                ) : (
                  // 自动创建失败或用户删光了邮箱：保留手动入口，并继续展示系统说明
                  <div className="flex flex-col">
                    <EmptyState onCreateAccount={handleQuickCreate} isAuthenticated={isAuthenticated} isCreating={isCreatingAccount} />
                    <InboxIntro />
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* 移动端侧边栏抽屉 */}
        {isMobile && hasMailboxes && (
          <div hidden={!isSidebarOpen} className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50 transition-opacity duration-300"
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className={`absolute left-0 top-0 h-full shadow-lg transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <Sidebar
                {...sidebarProps}
                isMobile
                onClose={() => setIsSidebarOpen(false)}
                onItemClick={(item) => {
                  handleSidebarItemClick(item)
                  setIsSidebarOpen(false)
                }}
                onQuickCreate={() => {
                  setIsSidebarOpen(false)
                  handleQuickCreate()
                }}
                onCreateAccount={() => {
                  setIsSidebarOpen(false)
                  handleCreateAccount()
                }}
                onLogin={() => {
                  setIsSidebarOpen(false)
                  handleLogin()
                }}
                onOpenSettings={() => {
                  setIsSidebarOpen(false)
                  setIsSettingsOpen(true)
                }}
              />
            </div>
          </div>
        )}
      </div>

      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AccountModal isOpen={isAccountModalOpen} onClose={handleCloseModal} />
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={handleCloseLoginModal}
        accountAddress={loginAccountAddress}
      />
      <AnnouncementModal
        isOpen={isAnnouncementOpen}
        onClose={() => setIsAnnouncementOpen(false)}
      />
    </>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <MailStatusProvider>
        <MainContent />
      </MailStatusProvider>
    </AuthProvider>
  )
}
