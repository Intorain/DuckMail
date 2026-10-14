"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Mail, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const { isEnabled } = useMailStatus();
  const { token, currentAccount } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [sync, setSync] = useState<HostingStatus | undefined>(
      currentAccount?.hosting,
    ),
    [busy, setBusy] = useState(false),
    // 只有手动刷新才让按钮转圈；后台 3 秒轮询不应让按钮跟着闪
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
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
      if (manual) setRefreshing(true);
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
        if (seq === sequence.current) {
          setBusy(false);
          setRefreshing(false);
        }
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
  return (
    <div data-mail-scroller className="h-full overflow-y-auto">
      <div className="w-full px-3 py-4 text-gray-800 dark:text-gray-100 sm:px-6 sm:py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 sm:mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{t("inbox")}</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t("hosted")} ·{" "}
              {sync?.lastSuccessAt
                ? t("lastSync", {
                    time: new Date(sync.lastSuccessAt).toLocaleString(),
                  })
                : t("notSynced")}
            </p>
          </div>
          <Button
            data-inbox-aside
            size="sm"
            variant="flat"
            isLoading={refreshing}
            onPress={() => load(true)}
            startContent={!refreshing ? <RefreshCw size={16} /> : undefined}
          >
            {t("refresh")}
          </Button>
        </div>
        {warning && (
          <p
            role="status"
            className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            {warning}
            {sync?.errorMessage && (
              <span className="block">{sync.errorMessage}</span>
            )}
          </p>
        )}
        {sync?.truncated && (
          <p className="mb-3 text-sm text-amber-700">{t("truncated")}</p>
        )}
        {error && (
          <p
            role="alert"
            className="mb-3 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-100"
          >
            {error}
          </p>
        )}
        <details className="mb-4 rounded-lg border border-default-200 p-3 text-sm">
          <summary className="cursor-pointer">{t("filter")}</summary>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-2">
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
            <div className="flex items-end gap-2">
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
            </div>
          </div>
        </details>
        {busy && !visible.length ? (
          <div className="py-10 text-center">
            <Spinner />
          </div>
        ) : !visible.length ? (
          <div className="py-12 text-center text-default-500">
            <Mail className="mx-auto mb-3 h-8 w-8" />
            <p>
              {!sync?.initialSyncComplete
                ? t("indexingEmpty")
                : sync?.stale
                  ? t("staleEmpty")
                  : t("noMatch")}
            </p>
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
        <div className="mt-4 flex items-center justify-between gap-2 text-xs text-default-500">
          <span>{t("rangeTotal", { total })}</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              isDisabled={page === 1}
              onPress={() => setPage((p) => p - 1)}
            >
              {t("prevPage")}
            </Button>
            <Button
              size="sm"
              isDisabled={page * 30 >= total}
              onPress={() => setPage((p) => p + 1)}
            >
              {t("nextPage")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
