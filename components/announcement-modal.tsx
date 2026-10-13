"use client"

import { useCallback, useEffect, useState } from "react"
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal"
import { Button } from "@heroui/button"
import { Card, CardBody } from "@heroui/card"
import { Bell, Gift, Github, Star } from "lucide-react"
import { useTranslations } from "next-intl"
import { DUCKMAIL_GITHUB_URL } from "@/lib/brand"

// 发布新公告时修改此 ID，所有用户的公告按钮会重新出现未读红点。
const ANNOUNCEMENT_ID = "2026-10-13-free-star"
const ANNOUNCEMENT_READ_KEY = "duckmail-announcement-read"

// 公告不再自动弹出，只在未读时给入口按钮加红点；打开即视为已读。
export function useAnnouncementUnread() {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    try {
      setUnread(localStorage.getItem(ANNOUNCEMENT_READ_KEY) !== ANNOUNCEMENT_ID)
    } catch {
      // 无痕模式等场景读不到存储时不打扰用户
    }
  }, [])

  const markRead = useCallback(() => {
    setUnread(false)
    try {
      localStorage.setItem(ANNOUNCEMENT_READ_KEY, ANNOUNCEMENT_ID)
    } catch {}
  }, [])

  return [unread, markRead] as const
}

// 叠在图标右上角的未读红点，父元素需为 relative。
export function UnreadDot() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white dark:ring-gray-900"
    />
  )
}

interface AnnouncementModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AnnouncementModal({ isOpen, onClose }: AnnouncementModalProps) {
  const t = useTranslations("announcement")

  return (
    <Modal isOpen={isOpen} onClose={onClose} placement="center" backdrop="blur" size="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex justify-center mb-2">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Bell size={28} className="text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-center">{t("title")}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{t("date")}</p>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <Card className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <CardBody className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-800/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Gift size={16} className="text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-green-800 dark:text-green-200 mb-2">{t("freeTitle")}</h3>
                    <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed">{t("freeDesc")}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <CardBody className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-amber-100 dark:bg-amber-800/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Star size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-2">{t("supportTitle")}</h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">{t("supportDesc")}</p>
                    <a
                      href={DUCKMAIL_GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-200 underline underline-offset-2 break-all"
                    >
                      <Github size={14} className="flex-shrink-0" />
                      {DUCKMAIL_GITHUB_URL.replace("https://", "")}
                    </a>
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="text-center text-sm text-gray-500 dark:text-gray-400 pt-2">
              <p>{t("thanks")}</p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter className="flex-col gap-2 sm:flex-row">
          <Button
            as="a"
            href={DUCKMAIL_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            color="primary"
            startContent={<Star size={16} />}
            className="w-full sm:flex-1"
          >
            {t("starOnGithub")}
          </Button>
          <Button variant="flat" onPress={onClose} className="w-full sm:flex-1">{t("close")}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
