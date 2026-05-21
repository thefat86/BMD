"use client";

/**
 * Page Search (Sprint AC-4.1)
 * --------------------------------------------------------------
 * Recherche unifiée dans les transcripts (audio proofs marché +
 * réunions enregistrées) et les libellés de dépense de tous les groupes
 * du user.
 *
 * UX :
 *  - Input avec debounce 300ms (évite de spammer l'API à chaque frappe)
 *  - Initial focus auto sur l'input
 *  - Résultats groupés par type avec icône distincte
 *  - Snippet centré sur le mot recherché (style Google)
 *  - Lien profond vers l'objet (groupe / dépense / réunion)
 *  - Suggestion d'astuce si pas de résultats
 *  - i18n complète, RTL ready (ar)
 *
 * Mobile-first :
 *  - Input full-width avec inputmode="search"
 *  - Cards résultats empilées verticalement
 *  - Tap-targets ≥ 44px
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api-client";
import { useT } from "../../../lib/i18n/app-strings";
import { useToast } from "../../../lib/ui/toast";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";

interface SearchResult {
  kind: "EXPENSE" | "ATTACHMENT_TRANSCRIPT" | "MEETING";
  id: string;
  groupId: string;
  groupName: string;
  snippet: string;
  link: string;
  occurredAt: string;
}

function kindIcon(kind: SearchResult["kind"]): string {
  switch (kind) {
    case "EXPENSE":
      return "💸";
    case "ATTACHMENT_TRANSCRIPT":
      return "🎙️";
    case "MEETING":
      return "📋";
  }
}

export default function SearchPage(): JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const initialQ = params.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus auto à l'arrivée
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search à chaque changement de q
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
        // Persist dans l'URL pour pouvoir partager le lien
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

  // Surligne le mot recherché dans le snippet (basique : caseInsensitive replace)
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
                background: "rgba(232,163,61,0.4)",
                color: "var(--text-strong, #1f2937)",
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
    <ResponsiveShell>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "16px",
          paddingBottom: "max(80px, env(safe-area-inset-bottom))",
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>
            🔍 {t("search.title")}
          </h1>
        </header>

        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.title")}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 16,
            border: "1px solid var(--line-soft, #e5e7eb)",
            borderRadius: 10,
            background: "var(--card-bg, transparent)",
            color: "var(--text-strong, #1f2937)",
            minHeight: 48,
            outline: "none",
          }}
        />

        {loading && (
          <p style={{ marginTop: 16, color: "#6b7280", fontSize: 13 }}>
            …
          </p>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div
            style={{
              marginTop: 24,
              padding: 24,
              textAlign: "center",
              background: "var(--overlay, rgba(255,255,255,0.04))",
              borderRadius: 12,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "var(--text-soft, #4b5563)",
              }}
            >
              {t("search.empty")}
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <p
              style={{
                marginTop: 16,
                marginBottom: 12,
                fontSize: 12,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {t("search.results", { count: String(total) })}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {results.map((r, idx) => (
                <li
                  key={`${r.kind}-${r.id}-${idx}`}
                  style={{
                    marginBottom: 10,
                    border: "1px solid var(--line-soft, #e5e7eb)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--card-bg, transparent)",
                  }}
                >
                  <Link
                    href={r.link}
                    style={{
                      display: "block",
                      padding: 14,
                      textDecoration: "none",
                      color: "inherit",
                      minHeight: 56,
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
                      <span style={{ fontSize: 18 }}>{kindIcon(r.kind)}</span>
                      <strong
                        style={{
                          fontSize: 13,
                          color: "var(--saffron, #E8A33D)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.groupName}
                      </strong>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        {new Date(r.occurredAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: "var(--text-strong, #1f2937)",
                      }}
                    >
                      {highlight(r.snippet, q)}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 11,
                        color: "#6b7280",
                      }}
                    >
                      {r.kind === "MEETING"
                        ? t("search.matchInMeeting")
                        : r.kind === "ATTACHMENT_TRANSCRIPT"
                          ? t("search.matchInTranscript")
                          : t("search.openExpense")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </ResponsiveShell>
  );
}
