"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Mail,
  SlidersHorizontal,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useMailStatus } from "@/contexts/mail-status-context";
import { getHostedMessagePage, syncHostedAccount } from "@/lib/api";
import type { HostingStatus, Message } from "@/types";
import MessageRow from "@/components/message-row";
import SelectionHighlight from "@/components/selection-highlight";
import { useVerificationHints } from "@/hooks/use-verification-hints";
import {
  useVisibleMessages,
  type MessageOverrides,
} from "@/hooks/use-visible-messages";

const PAGE_SIZE = 30;

// 和阅读面板工具栏一致的小图标按钮
const iconButton =
  "relative inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-35 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100";

function httpStatus(e: unknown) {
  const match =
    e instanceof Error ? e.message.match(/^HTTP (\d+)/) : null;
  return match ? Number(match[1]) : 0;
}

export default function HostedMessageList({
  onSelectMessage,
  refreshKey,
  selectedId,
  ...overrides
}: MessageOverrides & {
  onSelectMessage: (m: Message) => void;
  refreshKey: number;
  selectedId?: string | null;
}) {
  const t = useTranslations("hostedInbox");
  const tList = useTranslations("messageList");
  const locale = useLocale();
  const { isEnabled } = useMailStatus();
  const { token, currentAccount } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [sync, setSync] = useState<HostingStatus | undefined>(
      currentAccount?.hosting,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filterOpen, setFilterOpen] = useState(false),
    [subject, setSubject] = useState(""),
    [from, setFrom] = useState(""),
    [after, setAfter] = useState(""),
    [filters, setFilters] = useState<Record<string, string>>({});
  const sequence = useRef(0);
  // 托管邮件列表自带摘要；拉取远端正文代价高，只用主题 + 摘要识别
  const { codes, links } = useVerificationHints(messages, {
    token,
    providerId: currentAccount?.providerId || "duckmail",
  });
  const visible = useVisibleMessages(messages, overrides);
  const load = useCallback(
    async (manual = false) => {
      if (!token || !currentAccount) return;
      const seq = ++sequence.current;
      setBusy(true);
      try {
        if (manual) {
          try {
            await syncHostedAccount(token, currentAccount.id);
          } catch (e) {
            const status = httpStatus(e);
            if (status !== 409 && status !== 424) throw e;
          }
        }
        const data = await getHostedMessagePage(token, page, filters);
        if (seq !== sequence.current) return;
        setMessages(data.messages);
        setTotal(data.total);
        setSync(data.sync);
        setError("");
      } catch (e) {
        if (seq === sequence.current)
          setError(e instanceof Error ? e.message : t("loadFailed"));
      } finally {
        if (seq === sequence.current) setBusy(false);
      }
    },
    [token, currentAccount?.id, page, filters, t],
  );
  useEffect(() => {
    load();
    const timer = isEnabled
      ? setInterval(() => {
          if (!document.hidden) load();
        }, 3000)
      : undefined;
    return () => {
      if (timer) clearInterval(timer);
      sequence.current++;
    };
  }, [load, isEnabled]);
  useEffect(() => {
    if (
      !isEnabled ||
      sync?.paused ||
      sync?.status === "needs_reauth" ||
      sync?.initialSyncComplete
    )
      return;
    const timer = setTimeout(() => load(), 1500);
    return () => clearTimeout(timer);
  }, [isEnabled, load, sync?.paused, sync?.status, sync?.initialSyncComplete]);
  useEffect(() => {
    if (refreshKey) load(true);
  }, [refreshKey]);
  const warning = sync?.paused
    ? t("paused")
    : sync?.status === "needs_reauth"
      ? t("needsReauth")
      : !sync?.initialSyncComplete
        ? t("indexing")
        : sync?.stale
          ? t("stale")
          : "";
  const filterCount = Object.values(filters).filter(Boolean).length;
  const lastSync = sync?.lastSuccessAt
    ? t("lastSync", {
        time: formatDistanceToNow(new Date(sync.lastSuccessAt), {
          addSuffix: true,
          locale: locale === "en" ? enUS : zhCN,
        }),
      })
    : t("notSynced");
  const notices = [
    warning && (sync?.errorMessage ? `${warning} ${sync.errorMessage}` : warning),
    sync?.truncated && t("truncated"),
  ].filter(Boolean) as string[];

  // 头部、列表、加载 / 空状态与普通收件箱（message-list.tsx）保持同一套样式，
  // 只多出托管邮箱特有的同步状态、筛选和分页；手动同步走顶栏的刷新按钮（refreshKey）
  return (
    <div data-mail-scroller className="h-full overflow-y-auto">
      <div className="w-full px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
          <h2 className="flex items-baseline gap-2 text-xl font-semibold text-gray-900 dark:text-gray-50">
            {t("inbox")}
            {total > 0 && (
              <span className="text-sm font-normal tabular-nums text-gray-400 dark:text-gray-500">
                {total}
              </span>
            )}
          </h2>
          <div data-inbox-aside className="flex min-w-0 items-center gap-2">
            <span
              className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
              title={sync?.lastSuccessAt ? new Date(sync.lastSuccessAt).toLocaleString(locale) : undefined}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  !isEnabled ? "bg-gray-300 dark:bg-gray-600" : warning ? "bg-amber-500" : "bg-green-500"
                }`}
              />
              <span className="hidden shrink-0 sm:inline">{t("hosted")} ·</span>
              <span className="truncate">{lastSync}</span>
            </span>
            <button
              type="button"
              onClick={() => setFilterOpen((open) => !open)}
              aria-expanded={filterOpen}
              aria-label={t("filter")}
              title={t("filter")}
              className={`${iconButton} ${filterOpen ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-gray-100" : ""}`}
            >
              <SlidersHorizontal size={15} />
              {filterCount > 0 && (
                <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          </div>
        </div>

        {filterOpen && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-4">
            {/* 按面板自身宽度排列：列表变窄（阅读面板打开）时自动换行 */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
              <Input
                size="sm"
                labelPlacement="outside"
                label={t("from")}
                placeholder={t("fromPlaceholder")}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <Input
                size="sm"
                labelPlacement="outside"
                label={t("subject")}
                placeholder={t("subjectPlaceholder")}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <Input
                size="sm"
                labelPlacement="outside"
                label={t("after")}
                placeholder=" "
                type="datetime-local"
                value={after}
                onChange={(e) => setAfter(e.target.value)}
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="light"
                onPress={() => {
                  setFrom("");
                  setSubject("");
                  setAfter("");
                  setFilters({});
                  setPage(1);
                }}
              >
                {t("clearFilter")}
              </Button>
              <Button
                size="sm"
                color="primary"
                onPress={() => {
                  setFilters({
                    from,
                    subject,
                    receivedAfter: after ? new Date(after).toISOString() : "",
                  });
                  setPage(1);
                }}
              >
                {t("applyFilter")}
              </Button>
            </div>
          </div>
        )}

        {notices.length > 0 && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-small text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              {notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 text-small text-danger">
            {error}
          </p>
        )}

        {busy && !visible.length ? (
          <div className="flex items-center justify-center gap-2 py-16 text-small text-gray-500 dark:text-gray-400">
            <Spinner size="sm" color="default" />
            {tList("loading")}
          </div>
        ) : !visible.length ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Mail className="mb-4 h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
            <h3 className="text-medium font-medium text-gray-800 dark:text-gray-100">
              {!sync?.initialSyncComplete
                ? t("indexingEmpty")
                : sync?.stale
                  ? t("staleEmpty")
                  : t("noMatch")}
            </h3>
          </div>
        ) : (
          <div className="mail-list rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
            <SelectionHighlight selectedId={selectedId} layoutKey={visible} />
            {visible.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                code={codes.get(m.id)}
                link={links.get(m.id)}
                selected={m.id === selectedId}
                onSelect={onSelectMessage}
              />
            ))}
          </div>
        )}

        {/* 超过一页才显示分页 */}
        {total > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{t("rangeTotal", { total })}</span>
            <div className="flex items-center gap-1">
              <span className="mr-1 tabular-nums">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
              </span>
              <button
                type="button"
                className={iconButton}
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label={t("prevPage")}
                title={t("prevPage")}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className={iconButton}
                disabled={page * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
                aria-label={t("nextPage")}
                title={t("nextPage")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
