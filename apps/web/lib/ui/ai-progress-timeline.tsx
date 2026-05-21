"use client";

/**
 * V222.A — AiProgressTimeline · Panneau de progression IA premium (desktop).
 *
 * Composant réutilisable pour occuper l'utilisateur pendant un traitement
 * IA long (scan facture OCR ou voice-to-expense). Donne un sentiment de
 * progression tangible alors que l'API ne renvoie pas (encore) d'event
 * stream — on simule l'avancement par paliers temporels calibrés sur les
 * durées réelles observées en prod (préprocess 0.5s, OCR 1.5s, LLM 2.5s,
 * catégorisation instantanée pour scan ; upload 0.5s, Whisper 3s, parse
 * 2s, catégorie instant pour voice).
 *
 * Palette V45-light : saffron actif, sage done, cocoa texte principal,
 * cream fond, sable bord. Icônes Tabler outline via classes `ti ti-...`
 * (déjà chargées globalement par le shell).
 *
 * Le composant NE bloque PAS le drawer parent : on l'affiche au-dessus
 * du formulaire en overlay sticky avec un bouton "Annuler" facultatif.
 * Si l'utilisateur annule, le parent peut soit ignorer le résultat IA,
 * soit décider de tuer la promise via un AbortController (en V222.A on
 * se contente d'ignorer côté UI — l'appel API se termine en arrière-plan).
 *
 * Usage :
 *   <AiProgressTimeline
 *     mode="scan"
 *     steps={SCAN_STEPS}
 *     onCancel={() => setAiBusy(null)}
 *   />
 */

import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n/app-strings";

export type AiStep = {
  /** Clé i18n (sans préfixe — on préfixe `aiProgress.<mode>.step.`). */
  key: string;
  /** Icône Tabler outline (sans `ti ti-`). */
  icon: string;
  /** Durée typique en ms — sert à programmer l'avance simulée. */
  durationMs: number;
};

/** Étapes scan facture (OCR + LLM). Durées calibrées sur receipt-parser prod. */
export const SCAN_STEPS: AiStep[] = [
  { key: "preprocess", icon: "photo", durationMs: 500 },
  { key: "ocr", icon: "scan", durationMs: 1500 },
  { key: "llm", icon: "sparkles", durationMs: 2500 },
  { key: "category", icon: "tag", durationMs: 400 },
];

/** Étapes voice (upload + Whisper + parsing OpenAI). */
export const VOICE_STEPS: AiStep[] = [
  { key: "upload", icon: "cloud-upload", durationMs: 500 },
  { key: "whisper", icon: "microphone", durationMs: 3000 },
  { key: "parse", icon: "brain", durationMs: 2000 },
  { key: "category", icon: "tag", durationMs: 400 },
];

const SCAN_TIPS_FR = [
  "Astuce — tu peux scanner plusieurs reçus à la suite.",
  "Le mode itemized décompose une facture article par article.",
  "L'IA détecte automatiquement la catégorie : repas, transport, courses…",
  "Tu peux corriger n'importe quel champ avant de valider.",
];

const VOICE_TIPS_FR = [
  "Astuce — dis le montant en lettres ou en chiffres, ça marche pareil.",
  "Tu peux mentionner le payeur : « Marc a payé 45 € au resto ».",
  "L'IA reconnaît les noms des membres du groupe.",
  "Parle naturellement, comme à un ami.",
];

export interface AiProgressTimelineProps {
  mode: "scan" | "voice";
  /** Si l'utilisateur peut annuler. */
  onCancel?: () => void;
  /** Steps à afficher. Si non fourni, on prend les défauts. */
  steps?: AiStep[];
}

export function AiProgressTimeline({
  mode,
  onCancel,
  steps,
}: AiProgressTimelineProps) {
  const t = useT();
  const STEPS = useMemo(
    () => steps ?? (mode === "scan" ? SCAN_STEPS : VOICE_STEPS),
    [steps, mode],
  );

  // État de progression : index de l'étape active. Avance via setTimeout
  // calibré sur step.durationMs. La dernière étape reste "active" jusqu'à
  // ce que le composant soit démonté par le parent (quand l'API résout).
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    // V222.A — Programme la séquence : on chaîne les setTimeout cumulés
    // sur durationMs. La dernière étape reste active indéfiniment (l'API
    // peut prendre plus longtemps que prévu).
    let elapsed = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < STEPS.length; i++) {
      elapsed += STEPS[i - 1]!.durationMs;
      const handle = setTimeout(() => setActiveIdx(i), elapsed);
      timeouts.push(handle);
    }
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [STEPS]);

  // Conseils tournants — un toutes les 4s en fade. Sélection langue : pour
  // l'instant FR uniquement (les fallback EN seront ajoutés via traduction
  // statique des clés `aiProgress.tips.scan.<i>` plus tard). On garde le
  // texte hardcodé FR comme fallback ultime.
  const TIPS_FR = mode === "scan" ? SCAN_TIPS_FR : VOICE_TIPS_FR;
  const [tipIdx, setTipIdx] = useState(0);
  const [tipFading, setTipFading] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => {
      setTipFading(true);
      setTimeout(() => {
        setTipIdx((i) => (i + 1) % TIPS_FR.length);
        setTipFading(false);
      }, 300);
    }, 4000);
    return () => clearInterval(iv);
  }, [TIPS_FR.length]);

  const totalSec = Math.round(
    STEPS.reduce((acc, s) => acc + s.durationMs, 0) / 1000,
  );

  const title =
    mode === "scan"
      ? t("aiProgress.scan.title") || "Analyse de ta facture"
      : t("aiProgress.voice.title") || "Compréhension de ta voix";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "relative",
        padding: "14px 16px",
        background: "#FAF6EE",
        border: "0.5px solid #D9C8A6",
        borderRadius: 11,
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      {/* Ligne lumineuse animée en haut — donne le tempo de l'analyse */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background:
            "linear-gradient(90deg, transparent 0%, #C58A2E 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "bmdAiSheen 1.6s linear infinite",
        }}
      />

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Petit indicateur "live" pulsant */}
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#C58A2E",
              boxShadow: "0 0 0 4px rgba(197,138,46,0.18)",
              animation: "bmdAiPulse 1.2s ease-in-out infinite",
            }}
          />
          <h3
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 17,
              fontWeight: 600,
              margin: 0,
              color: "#2B1F15",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h3>
          <span
            style={{
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "2px 6px",
              border: "0.5px solid #D9C8A6",
              borderRadius: 4,
              background: "rgba(197,138,46,0.08)",
            }}
          >
            {t("aiProgress.estimatedSec", { sec: String(totalSec) }) ||
              `~${totalSec}s`}
          </span>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "4px 10px",
              background: "transparent",
              color: "#8B6F47",
              border: "0.5px solid #D9C8A6",
              borderRadius: 6,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("aiProgress.cancel") || "Annuler"}
          </button>
        )}
      </header>

      {/* Liste des étapes */}
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {STEPS.map((step, i) => {
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          const isPending = i > activeIdx;
          const label =
            t(`aiProgress.${mode}.step.${step.key}`) ||
            FALLBACK_LABELS[mode][step.key] ||
            step.key;
          return (
            <li
              key={step.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px",
                borderRadius: 7,
                background: isActive ? "rgba(197,138,46,0.10)" : "transparent",
                border: isActive
                  ? "0.5px solid rgba(197,138,46,0.30)"
                  : "0.5px solid transparent",
                transition: "background 250ms ease, border-color 250ms ease",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Ligne de balayage saffron pendant active */}
              {isActive && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(197,138,46,0.18) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "bmdAiStripe 1.2s linear infinite",
                  }}
                />
              )}

              {/* Pastille d'état */}
              <span
                aria-hidden
                style={{
                  position: "relative",
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isDone
                    ? "#1F7A57"
                    : isActive
                      ? "#C58A2E"
                      : "#F4ECD9",
                  color: isPending ? "#8B6F47" : "#FFFFFF",
                  fontSize: 13,
                  border: isPending ? "0.5px solid #D9C8A6" : "none",
                  flexShrink: 0,
                  transition: "background 250ms ease, color 250ms ease",
                }}
              >
                {isDone ? (
                  <i className="ti ti-check" />
                ) : (
                  <i className={`ti ti-${step.icon}`} />
                )}
                {/* Halo pulse pendant active */}
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      inset: -3,
                      borderRadius: "50%",
                      border: "1.5px solid rgba(197,138,46,0.55)",
                      animation: "bmdAiHalo 1.2s ease-out infinite",
                    }}
                  />
                )}
              </span>

              <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: isPending ? "#8B6F47" : "#2B1F15",
                    lineHeight: 1.3,
                  }}
                >
                  {label}
                  {isActive && (
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        marginLeft: 6,
                        color: "#C58A2E",
                        fontWeight: 700,
                      }}
                    >
                      <span className="bmdAiDot">.</span>
                      <span
                        className="bmdAiDot"
                        style={{ animationDelay: "0.15s" }}
                      >
                        .
                      </span>
                      <span
                        className="bmdAiDot"
                        style={{ animationDelay: "0.30s" }}
                      >
                        .
                      </span>
                    </span>
                  )}
                </div>
                {DESCRIPTIONS[mode][step.key] && (
                  <div
                    style={{
                      fontSize: 11,
                      color: isPending ? "#A89478" : "#8B6F47",
                      marginTop: 1,
                      lineHeight: 1.3,
                    }}
                  >
                    {t(`aiProgress.${mode}.desc.${step.key}`) ||
                      DESCRIPTIONS[mode][step.key]}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Astuce tournante */}
      <div
        style={{
          marginTop: 12,
          padding: "8px 10px",
          background: "rgba(31,122,87,0.06)",
          border: "0.5px solid rgba(31,122,87,0.18)",
          borderRadius: 7,
          fontSize: 11.5,
          color: "#2B1F15",
          lineHeight: 1.4,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          opacity: tipFading ? 0 : 1,
          transition: "opacity 300ms ease",
        }}
      >
        <i
          className="ti ti-bulb"
          aria-hidden
          style={{ color: "#1F7A57", fontSize: 14, lineHeight: 1.4 }}
        />
        <span>{TIPS_FR[tipIdx]}</span>
      </div>

      <style>{`
        @keyframes bmdAiSheen {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bmdAiStripe {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bmdAiPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
        @keyframes bmdAiHalo {
          0% { transform: scale(0.85); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .bmdAiDot {
          display: inline-block;
          animation: bmdAiBlink 1.2s infinite;
        }
        @keyframes bmdAiBlink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bmdAiDot { animation: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Fallback labels FR (servent si la clé i18n n'est pas trouvée).
// On garde une copie ici en plus de l'inline `||` pour centraliser.
// ─────────────────────────────────────────────────────────────────────────

const FALLBACK_LABELS: Record<"scan" | "voice", Record<string, string>> = {
  scan: {
    preprocess: "Préparation de l'image",
    ocr: "Lecture du ticket",
    llm: "Mise en forme intelligente",
    category: "Détection de la catégorie",
  },
  voice: {
    upload: "Envoi de l'audio",
    whisper: "Conversion voix → texte",
    parse: "Extraction des infos",
    category: "Détection de la catégorie",
  },
};

const DESCRIPTIONS: Record<"scan" | "voice", Record<string, string>> = {
  scan: {
    preprocess: "Rotation, recadrage et amélioration du contraste.",
    ocr: "Mindee OCR + Tesseract en fallback.",
    llm: "L'IA nettoie et structure les champs.",
    category: "Repas, transport, courses, etc.",
  },
  voice: {
    upload: "Transfert du fichier audio vers nos serveurs.",
    whisper: "Whisper (OpenAI) transcrit ce que tu as dit.",
    parse: "Montant, date, marchand, participants.",
    category: "Repas, transport, courses, etc.",
  },
};
