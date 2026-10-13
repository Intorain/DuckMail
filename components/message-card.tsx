"use client"

import { Card, CardBody } from "@heroui/card"
import { Avatar } from "@heroui/avatar"
import { formatDistanceToNow } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import { useTranslations, useLocale } from "next-intl"
import VerificationCodeChip from "@/components/verification-code-chip"
import { useIsMobile } from "@/hooks/use-mobile"
import type { Message } from "@/types"

interface MessageCardProps {
  message: Message
  // 识别出的验证码，没有则不显示
  code?: string | null
  onSelect: (message: Message) => void
}

export default function MessageCard({ message, code, onSelect }: MessageCardProps) {
  const isMobile = useIsMobile()
  const t = useTranslations("messageList")
  const locale = useLocale()

  return (
    <Card
      as="div"
      isPressable
      onPress={() => onSelect(message)}
      className={`w-full transition-all duration-300 cursor-pointer ${
        !message.seen
          ? "border-l-4 border-l-primary-500 border-t border-r border-b border-primary-200 dark:border-primary-800 bg-gradient-to-r from-primary-50/80 to-primary-50/40 dark:from-primary-900/30 dark:to-primary-900/10 shadow-lg hover:shadow-xl hover:scale-[1.02]"
          : "border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg hover:scale-[1.01]"
      }`}
    >
      <CardBody className={`${isMobile ? 'p-3' : 'p-5'} w-full`}>
        <div className={`flex items-start ${isMobile ? 'space-x-3' : 'space-x-4'} w-full`}>
          <div className="relative">
            <Avatar
              name={message.from.name
                ? message.from.name.charAt(0).toUpperCase()
                : message.from.address.charAt(0).toUpperCase()}
              className={`flex-shrink-0 font-semibold ${
                !message.seen
                  ? "bg-primary-500 text-white shadow-lg"
                  : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
              }`}
              size={isMobile ? "md" : "lg"}
            />
            {!message.seen && (
              <div className={`absolute -top-1 -right-1 ${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} bg-primary-500 border-2 border-white dark:border-gray-800 rounded-full`}></div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className={`flex items-start justify-between ${isMobile ? 'mb-1' : 'mb-2'}`}>
              <div className="flex-1 min-w-0">
                <h3 className={`${isMobile ? 'text-sm' : 'text-base'} truncate ${
                  !message.seen
                    ? "font-bold text-gray-900 dark:text-white"
                    : "font-semibold text-gray-700 dark:text-gray-300"
                }`}>
                  {message.from.name || message.from.address}
                </h3>
                <p className={`${isMobile ? 'text-xs' : 'text-sm'} truncate ${isMobile ? 'mt-0.5' : 'mt-1'} ${
                  !message.seen
                    ? "font-semibold text-gray-800 dark:text-gray-200"
                    : "font-medium text-gray-600 dark:text-gray-400"
                }`}>
                  {message.subject}
                </p>
              </div>
              <div className={`flex flex-col items-end ${isMobile ? 'ml-2' : 'ml-3'}`}>
                <span className={`${isMobile ? 'text-xs' : 'text-xs'} flex-shrink-0 ${
                  !message.seen
                    ? "text-primary-600 dark:text-primary-400 font-medium"
                    : "text-gray-500 dark:text-gray-400"
                }`}>
                  {formatDistanceToNow(new Date(message.createdAt), {
                    addSuffix: true,
                    locale: locale === "en" ? enUS : zhCN,
                  })}
                </span>
                {!message.seen && (
                  <div className={`${isMobile ? 'mt-0.5 px-1.5 py-0.5' : 'mt-1 px-2 py-0.5'} bg-primary-500 text-white text-xs rounded-full font-medium`}>
                    {t("new")}
                  </div>
                )}
              </div>
            </div>

            <p className={`${isMobile ? 'text-xs' : 'text-sm'} leading-relaxed line-clamp-2 ${
              !message.seen
                ? "text-gray-700 dark:text-gray-300"
                : "text-gray-500 dark:text-gray-400"
            }`}>
              {message.intro}
            </p>
            {code && (
              <div className={isMobile ? "mt-1.5" : "mt-2"}>
                <VerificationCodeChip code={code} />
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
