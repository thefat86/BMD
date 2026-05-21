"use client";

/**
 * V52.I2 — <MobileSearchView /> · Page recherche mobile-native.
 *
 * Vue 100% mobile : input large sticky-top + cards verticales tappables,
 * icônes V45 (plus d'emojis 🔍💸🎙️📋). Branchée via early-return isMobile
 * dans /dashboard/search.
 *
 * Search unifié : libellés de dépenses + transcripts audio (marché +
 * réunions). Debounce 300ms, focus auto, snippet surligné style Google,
 * empty state premium.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { Icon, type IconName } from "./icons";

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

export function MobileSearchView() {
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
    <div
      style={{
        padding: "12px 16px",
        paddingBottom: "max(96px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Input search — full width, icône intégrée à gauche, 48px tap target */}
      <div
        style={{
          position: "relative",
          marginBottom: 16,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--cocoa-soft, var(--cream-soft))",
            pointerEvents: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <Icon name="search" size={18} color="currentColor" strokeWidth={1.8} />
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
            padding: "14px 16px 14px 44px",
            fontSize: 16,
            border: "1px solid var(--cocoa-line, rgba(244,228,193,0.10))",
            borderRadius: 14,
            background: "var(--paper, rgba(244,228,193,0.04))",
            color: "var(--cocoa, var(--cream))",
            minHeight: 50,
            outline: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        {q && (
          <button
            type="button"
            aria-label="Effacer"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "transparent",
              border: "none",
              color: "var(--cocoa-soft, var(--cream-soft))",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              touchAction: "manipulation",
            }}
          >
            <Icon name="x" size={16} color="currentColor" strokeWidth={2} />
          </button>
        )}
      </div>

      {loading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 8,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 76,
                background: "var(--paper, rgba(244,228,193,0.04))",
                border:
                  "1px solid var(--cocoa-line, rgba(244,228,193,0.06))",
                borderRadius: 14,
                opacity: 0.7,
                animation: `bmd-search-skel 1.2s ease-in-out ${i * 0.08}s infinite`,
              }}
            />
          ))}
          <style jsx>{`
            @keyframes bmd-search-skel {
              0%,
              100% {
                opacity: 0.5;
              }
              50% {
                opacity: 0.9;
              }
            }
          `}</style>
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <div
          style={{
            marginTop: 40,
            padding: "32px 24px",
            textAlign: "center",
            color: "var(--cocoa-soft, var(--cream-soft))",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              margin: "0 auto 18px",
              borderRadius: 22,
              background:
                "linear-gradient(135deg, var(--v45-saffron-pale, rgba(232,163,61,0.18)), rgba(181,70,46,0.05))",
              border:
                "1px solid var(--v45-saffron-pale, rgba(232,163,61,0.25))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--v45-saffron, var(--saffron))",
            }}
          >
            <Icon name="search" size={30} color="currentColor" strokeWidth={1.6} />
          </div>
          <h3
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "var(--cocoa, var(--cream))",
            }}
          >
            {t("search.empty") || "Aucun résultat"}
          </h3>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Essaye un autre mot-clé, le nom d&apos;une personne, ou un
            montant.
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p
            style={{
              marginTop: 4,
              marginBottom: 12,
              fontSize: 10,
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
                  marginBottom: 8,
                  border:
                    "1px solid var(--cocoa-line, rgba(244,228,193,0.08))",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "var(--paper, rgba(244,228,193,0.03))",
                }}
              >
                <Link
                  href={r.link}
                  style={{
                    display: "block",
                    padding: "12px 14px",
                    textDecoration: "none",
                    color: "inherit",
                    minHeight: 60,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
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
                        size={15}
                        color="currentColor"
                        strokeWidth={1.7}
                      />
                    </span>
                    <strong
                      style={{
                        fontSize: 13,
                        color: "var(--v45-saffron, var(--saffron))",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.groupName}
                    </strong>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--cocoa-mute, var(--muted))",
                        flexShrink: 0,
                      }}
                    >
                      {new Date(r.occurredAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--cocoa, var(--cream))",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {highlight(r.snippet, q)}
                  </p>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 11,
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

      {/* Empty initial — avant toute recherche */}
      {!loading && !hasSearched && q.trim().length < 2 && (
        <div
          style={{
            marginTop: 40,
            padding: "32px 24px",
            textAlign: "center",
            color: "var(--cocoa-soft, var(--cream-soft))",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 16px",
              borderRadius: 20,
              background: "var(--paper, rgba(244,228,193,0.06))",
              border:
                "1px solid var(--cocoa-line, rgba(244,228,193,0.10))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--cocoa-mute, var(--muted))",
            }}
          >
            <Icon name="search" size={26} color="currentColor" strokeWidth={1.5} />
          </div>
          <p
            style={{
              fontSize: 14,
              margin: 0,
              lineHeight: 1.5,
              maxWidth: 280,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Cherche dans tes dépenses, factures et preuves audio. 2
            caractères minimum.
          </p>
        </div>
      )}
    </div>
  );
}
