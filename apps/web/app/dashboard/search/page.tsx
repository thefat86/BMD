"use client";

/**
 * Page Search · Recherche unifiée transcripts + dépenses + meetings.
 *
 * V52.I2 — Bascule mobile/desktop : early-return isMobile vers
 * <MobileSearchView /> (icônes V45, cards verticales). Vue desktop
 * conservée dans la page (layout dense centré, plus de breathing room).
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api-client";
import { useT } from "../../../lib/i18n/app-strings";
import { useToast } from "../../../lib/ui/toast";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
import { MobileSearchView } from "../../../lib/ui/mobile-search-view";
import { Icon, type IconName } from "../../../lib/ui/icons";

interface SearchResult {
  kind: "EXPENSE" | "ATTACHMENT_TRANSCRIPT" | "MEETING";
  id: string;
  groupId: string;
  groupName: string;
  snippet: string;
  link: string;
  occurredAt: string;
}

function kindIconName(kind: SearchResult["kind"]): IconName {
  switch (kind) {
    case "EXPENSE":
      return "receipt";
    case "ATTACHMENT_TRANSCRIPT":
      return "mic";
    case "MEETING":
      return "file-text";
  }
}

export default function SearchPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner(): JSX.Element {
  const t = useT();
  const { isMobile, ready: bpReady } = useBreakpoint();

  // V52.I2 — Mobile : early-return vers la vue dédiée mobile-native.
  // V73 — Pas de back button : page accessible depuis le bottom-nav.
  if (bpReady && isMobile) {
    return (
      <ResponsiveShell
        mobileTitle={t("search.title") || "Recherche"}
      >
        <MobileSearchView />
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      desktopTitle={t("search.title") || "Recherche"}
      breadcrumb={t("nav.dashboard")}
    >
      <DesktopSearchView />
    </ResponsiveShell>
  );
}

function DesktopSearchView(): JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const initialQ = params?.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setTotal(0);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.searchAll(q.trim());
        setResults(r.results);
        setTotal(r.total);
        setHasSearched(true);
        router.replace(`/dashboard/search?q=${encodeURIComponent(q.trim())}`);
      } catch (e) {
        toast.error(e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function highlight(snippet: string, needle: string): JSX.Element {
    if (!needle) return <>{snippet}</>;
    const parts = snippet.split(
      new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
    );
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === needle.toLowerCase() ? (
            <mark
              key={i}
              style={{
                background: "var(--v45-saffron-pale, rgba(232,163,61,0.40))",
                color: "var(--cocoa, var(--cream))",
                padding: "1px 2px",
                borderRadius: 2,
              }}
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ position: "relative", marginBottom: 24 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 16,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--cocoa-soft, var(--cream-soft))",
            pointerEvents: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <Icon name="search" size={20} color="currentColor" strokeWidth={1.8} />
        </span>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder") || "Recherche…"}
          aria-label={t("search.title") || "Recherche"}
          style={{
            width: "100%",
            padding: "16px 16px 16px 50px",
            fontSize: 16,
            border: "1px solid var(--cocoa-line, rgba(244,228,193,0.10))",
            borderRadius: 12,
            background: "var(--paper, rgba(244,228,193,0.04))",
            color: "var(--cocoa, var(--cream))",
            minHeight: 54,
            outline: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      </div>

      {loading && (
        <p
          style={{
            marginTop: 16,
            color: "var(--cocoa-soft, var(--cream-soft))",
            fontSize: 13,
          }}
        >
          Recherche en cours…
        </p>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <div
          style={{
            marginTop: 24,
            padding: 32,
            textAlign: "center",
            background: "var(--paper, rgba(244,228,193,0.04))",
            border: "1px solid var(--cocoa-line, rgba(244,228,193,0.08))",
            borderRadius: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "var(--cocoa-soft, var(--cream-soft))",
            }}
          >
            {t("search.empty") || "Aucun résultat."}
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p
            style={{
              marginBottom: 16,
              fontSize: 11,
              color: "var(--cocoa-mute, var(--muted))",
              textTransform: "uppercase",
              letterSpacing: 1.6,
              fontWeight: 700,
            }}
          >
            {t("search.results", { count: String(total) }) ||
              `${total} résultat${total > 1 ? "s" : ""}`}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {results.map((r, idx) => (
              <li
                key={`${r.kind}-${r.id}-${idx}`}
                style={{
                  marginBottom: 12,
                  border:
                    "1px solid var(--cocoa-line, rgba(244,228,193,0.08))",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--paper, rgba(244,228,193,0.03))",
                }}
              >
                <Link
                  href={r.link}
                  style={{
                    display: "block",
                    padding: 18,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background:
                          "var(--v45-saffron-pale, rgba(232,163,61,0.18))",
                        border:
                          "1px solid var(--v45-saffron-pale, rgba(232,163,61,0.30))",
                        color: "var(--v45-saffron, var(--saffron))",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon
                        name={kindIconName(r.kind)}
                        size={17}
                        color="currentColor"
                        strokeWidth={1.7}
                      />
                    </span>
                    <strong
                      style={{
                        fontSize: 14,
                        color: "var(--v45-saffron, var(--saffron))",
                        flex: 1,
                      }}
                    >
                      {r.groupName}
                    </strong>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--cocoa-mute, var(--muted))",
                      }}
                    >
                      {new Date(r.occurredAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "var(--cocoa, var(--cream))",
                    }}
                  >
                    {highlight(r.snippet, q)}
                  </p>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: 12,
                      color: "var(--cocoa-soft, var(--cream-soft))",
                    }}
                  >
                    {r.kind === "MEETING"
                      ? t("search.matchInMeeting") || "Dans une réunion"
                      : r.kind === "ATTACHMENT_TRANSCRIPT"
                        ? t("search.matchInTranscript") ||
                          "Dans une preuve audio"
                        : t("search.openExpense") || "Ouvrir la dépense"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
