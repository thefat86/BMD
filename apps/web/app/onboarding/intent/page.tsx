"use client";

/**
 * /onboarding/intent · Premier écran après le 1er login réussi (V115).
 *
 * Architecture en deux étapes :
 *  1. **Welcome** — accueil chaleureux : qui on est, ce qu'on fait, et
 *     pourquoi tu vas rester. Tagline, 3 promesses produit, CTA « C'est parti ».
 *  2. **Intent** — « tu es ici pour quoi ? » avec les 5 cas d'usage du
 *     wizard de création de groupe (TONTINE/COLOC/TRAVEL/EVENT/OTHER).
 *     La sélection stocke `bmd_pending_intent` puis route /dashboard où le
 *     dashboard détecte la clé et ouvre `MobileCreateGroupSheet` pré-rempli
 *     (V52.H1, déjà branché).
 *
 * **V115 — Décisions UX importantes**
 *  - Le welcome n'est PAS skippable. Donner un message d'accueil chaleureux
 *    sur le premier contact avec l'app a une valeur produit forte : ça pose
 *    la promesse (« l'argent partagé, l'amitié protégée ») avant qu'on
 *    demande quoi que ce soit. Skip arrive seulement au step intent.
 *  - Les libellés d'intent sont strictement identiques à ceux du wizard
 *    (`mobile-create-group-sheet.tsx`) — toute évolution doit être faite
 *    *en miroir* dans le wizard. Sinon le user choisit « Tontine » ici et
 *    arrive sur un wizard avec un libellé différent → confusion.
 *  - V45-light strict : ivoire (#FBF6EC), paper (#FFFFFF), cocoa (#2B1F15),
 *    saffron (#C58A2E). Aucun fond dark, aucun emoji décoratif.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "../../../lib/api-client";
import { haptic } from "../../../lib/platform";
import { Icon, type IconName } from "../../../lib/ui/icons";

/** V113 — Type local strictement aligné sur le wizard de création de
 *  groupe. Toute évolution doit être faite *en miroir* dans
 *  `lib/ui/mobile-create-group-sheet.tsx`. */
type GroupType = "TONTINE" | "COLOC" | "TRAVEL" | "EVENT" | "OTHER";

/** V174.B — Pseudo-type pour le cas "Reconnaissance de dette" :
 *  pas un GroupType, mais un cas d'usage à part qui redirige vers
 *  /dashboard/debts/new au lieu d'ouvrir le wizard de groupe. */
type IntentType = GroupType | "DEBT";

interface Intent {
  type: IntentType;
  iconName: IconName;
  /** Libellé identique à celui du wizard (hardcodé FR pour rester en
   *  phase exacte ; le wizard ne passe pas par i18n non plus). */
  label: string;
  hint: string;
  /** Suggestions de noms pour pré-remplir le champ « Nom du groupe » du
   *  wizard. Le wizard les utilise comme placeholder du premier input.
   *  Inutilisé pour le type "DEBT". */
  nameSuggestions: string[];
}

/** Les 5 cas du wizard — labels et hints rigoureusement identiques.
 *  Cf. `lib/ui/mobile-create-group-sheet.tsx` lignes 43-72. */
const INTENTS: Intent[] = [
  {
    type: "TONTINE",
    iconName: "coins",
    label: "Tontine",
    hint: "Rotation d'épargne",
    nameSuggestions: [
      "Tontine de la famille",
      "Tontine du quartier",
      "Hui des amis",
    ],
  },
  {
    type: "COLOC",
    iconName: "home",
    label: "Coloc",
    hint: "Vivre ensemble",
    nameSuggestions: ["Coloc Belleville", "Appart en coloc", "Notre maison"],
  },
  {
    type: "TRAVEL",
    iconName: "plane",
    label: "Voyage & sortie",
    hint: "Vacances, week-end",
    nameSuggestions: ["Voyage Dakar", "Trip Maroc", "Vacances été 2026"],
  },
  {
    type: "EVENT",
    iconName: "users",
    label: "Vie quotidienne",
    hint: "Amis, famille, repas",
    nameSuggestions: ["Repas du dimanche", "Famille", "Sortie amis"],
  },
  /* V174.B — Cas d'usage RDD : prêt formalisé entre proches.
     Au clic, on saute le wizard de groupe et on file direct sur
     /dashboard/debts/new (wizard reconnaissance de dette). */
  {
    type: "DEBT",
    iconName: "file-text",
    label: "Prêt entre proches",
    hint: "Reconnaissance de dette",
    nameSuggestions: [],
  },
  {
    type: "OTHER",
    iconName: "folder",
    label: "Autre",
    hint: "Cas particulier",
    nameSuggestions: ["Mon projet", "Cas particulier", "Autre groupe"],
  },
];

/** V174.A — Promesses produit affichées dans le hero welcome.
 *  Quatre bullets qui couvrent les 4 piliers de BMD :
 *    1) Groupes & dépenses (tontines, colocs, voyages…)
 *    2) Reconnaissances de dette (prêts formalisés entre proches)
 *    3) Relations apaisées (l'argent ne fragilise plus l'amitié)
 *    4) Rigueur financière (signatures qualifiées, RGPD, multi-devises)
 *  Chacune liée à une icône SVG du registry. Libellés "ce que l'app
 *  fait pour toi" plutôt que "ce qu'elle est". */
const WELCOME_PROMISES: Array<{ icon: IconName; title: string; body: string }> =
  [
    {
      icon: "coins",
      title: "Les comptes au clair",
      body:
        "Tontines, dépenses partagées, soldes en multi-devises — qui doit quoi à qui, sans calculatrice et sans drama.",
    },
    {
      icon: "file-text",
      title: "Prêts entre proches, formalisés",
      body:
        "Reconnaissances de dette avec échéancier, signatures électroniques qualifiées (eIDAS) et témoins. Pour prêter sereinement, sans gêne.",
    },
    {
      icon: "users",
      title: "Tes proches avant tes apps",
      body:
        "L'argent partagé fragilise vite l'amitié. BMD enlève la gêne : tu paies, tu réclames, tu encaisses, sans avoir à demander.",
    },
    {
      icon: "shield",
      title: "Sérieux, sans la fadeur d'une banque",
      body:
        "Scan IA des reçus, historique exportable, RGPD, multi-devises, signatures eIDAS. La rigueur d'un outil financier — la chaleur d'un cercle d'amis.",
    },
  ];

type Step = "welcome" | "intent";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState<string | null>(null);

  // Garde : pas authentifié → /login.
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);

  function pickIntent(intent: Intent) {
    haptic("tap");
    setBusy(intent.type);
    // V174.B — Cas "Prêt entre proches" (DEBT) : on saute le wizard de
    // groupe et on file directement sur le wizard RDD.
    if (intent.type === "DEBT") {
      try {
        window.localStorage.removeItem("bmd_pending_intent");
      } catch {
        /* ignore */
      }
      router.push("/dashboard/debts/new");
      return;
    }
    // On stocke le choix dans localStorage. Le dashboard détectera la
    // valeur au mount et ouvrira automatiquement le CreateGroupSheet
    // pré-rempli avec le type + suggestions de noms (V52.H1).
    try {
      window.localStorage.setItem(
        "bmd_pending_intent",
        JSON.stringify({
          type: intent.type,
          nameSuggestions: intent.nameSuggestions,
          at: new Date().toISOString(),
        }),
      );
    } catch {
      /* ignore */
    }
    router.push("/dashboard");
  }

  function skipIntent() {
    try {
      window.localStorage.removeItem("bmd_pending_intent");
    } catch {
      /* ignore */
    }
    router.push("/dashboard");
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        // Fond V45-light : ivoire avec halo radial saffron chaud.
        background:
          "radial-gradient(900px 500px at 50% -10%, rgba(197,138,46,0.14), transparent 60%), " +
          "radial-gradient(700px 400px at 110% 100%, rgba(159,70,40,0.08), transparent 60%), " +
          "linear-gradient(180deg, var(--ivory, #FBF6EC) 0%, var(--ivory-2, #F4ECD8) 100%)",
        color: "var(--cocoa, #2B1F15)",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 28px) 20px calc(env(safe-area-inset-bottom, 0px) + 96px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          width: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {step === "welcome" ? (
          <WelcomeStep onContinue={() => setStep("intent")} />
        ) : (
          <IntentStep
            intents={INTENTS}
            busy={busy}
            onPick={pickIntent}
          />
        )}
      </div>

      {/* Skip — visible uniquement au step intent. Sur le welcome on
          force l'utilisateur à au moins voir la promesse produit ; sur
          intent il peut filer vers le dashboard sans choisir. */}
      {step === "intent" && (
        <button
          type="button"
          onClick={skipIntent}
          disabled={!!busy}
          className="bmd-skip"
        >
          Je passe — j&apos;explorerai par moi-même
        </button>
      )}

      <style jsx>{`
        .bmd-skip {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 16px 20px
            calc(env(safe-area-inset-bottom, 0px) + 16px);
          background: linear-gradient(
            180deg,
            rgba(251, 246, 236, 0) 0%,
            rgba(251, 246, 236, 0.92) 35%,
            rgba(251, 246, 236, 0.98) 100%
          );
          border: none;
          color: var(--cocoa-soft, #6b5a47);
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          text-align: center;
          text-decoration: underline;
          text-underline-offset: 4px;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          -webkit-tap-highlight-color: transparent;
        }
        .bmd-skip:disabled {
          opacity: 0.4;
          cursor: wait;
        }
        .bmd-skip:active {
          color: var(--cocoa, #2b1f15);
        }
      `}</style>
    </main>
  );
}

// ============================================================
// STEP 1 — WELCOME (hero chaleureux, donne envie de rester)
// ============================================================

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 28,
        animation: "bmd-fade-in 240ms ease-out",
      }}
    >
      {/* Logo encart + tagline — premier contact visuel, doit poser
          immédiatement le ton « brand chaleureux + sérieux financier ». */}
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 28px rgba(159,70,40,0.30)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bmd-logo.svg"
            alt="BMD"
            width={32}
            height={32}
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>
        <div>
          <h1
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 38,
              lineHeight: 1.1,
              fontWeight: 700,
              margin: 0,
              color: "var(--cocoa, #2B1F15)",
              letterSpacing: -0.5,
            }}
          >
            Bienvenue dans BMD.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--v45-saffron, #C58A2E)",
              margin: "8px 0 0",
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            L&apos;argent partagé. L&apos;amitié protégée.
          </p>
        </div>
      </header>

      {/* Message d'accueil — court, personnel, sans corporate-bla. On
          parle à la personne, pas au « client », et on annonce ce
          qu'on va faire ensemble dans les 30 prochaines secondes. */}
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.6,
          color: "var(--cocoa-soft, #6B5A47)",
          margin: 0,
          maxWidth: 540,
        }}
      >
        Heureux de te voir. On a construit BMD pour que partager l&apos;argent
        avec tes proches reste simple, clair et juste — sans abîmer les
        relations qui comptent. Avant qu&apos;on plonge, prends 15 secondes pour
        comprendre la promesse.
      </p>

      {/* Trois promesses produit, format compact mais aéré. Chaque
          promesse a une icône SVG du registry (jamais d'emoji). */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {WELCOME_PROMISES.map((promise) => (
          <li
            key={promise.title}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: "14px 16px",
              background: "var(--paper, #FFFFFF)",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
              borderRadius: 16,
              boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, var(--v45-saffron-pale, rgba(197,138,46,0.18)), rgba(197,138,46,0.06))",
                border: "1px solid var(--v45-saffron, #C58A2E)",
                color: "var(--v45-saffron, #C58A2E)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={promise.icon} size={20} strokeWidth={1.8} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--cocoa, #2B1F15)",
                  lineHeight: 1.25,
                  marginBottom: 2,
                }}
              >
                {promise.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--cocoa-soft, #6B5A47)",
                }}
              >
                {promise.body}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* CTA principal — gros bouton saffron solide qui pousse à
          avancer. Sur tactile (mobile + tablet), occupe toute la
          largeur ; sur desktop, on cap à 280px pour pas qu'il
          devienne absurde. */}
      <button
        type="button"
        onClick={onContinue}
        className="bmd-cta-primary"
      >
        <span>C&apos;est parti</span>
        <Icon name="arrow-right" size={18} strokeWidth={2.2} />
      </button>

      <style jsx>{`
        @keyframes bmd-fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .bmd-cta-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          max-width: 320px;
          padding: 16px 24px;
          min-height: 56px;
          border: none;
          border-radius: 16px;
          background: linear-gradient(
            135deg,
            var(--v45-saffron, #c58a2e),
            var(--v45-terracotta, #9f4628)
          );
          color: #ffffff;
          font-size: 16px;
          font-weight: 700;
          font-family: inherit;
          letter-spacing: 0.3px;
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(159, 70, 40, 0.28);
          transition:
            transform 0.12s ease,
            box-shadow 0.2s ease;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          align-self: flex-start;
        }
        @media (hover: hover) and (pointer: fine) {
          .bmd-cta-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 32px rgba(159, 70, 40, 0.36);
          }
        }
        .bmd-cta-primary:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

// ============================================================
// STEP 2 — INTENT (5 cas du wizard de création de groupe)
// ============================================================

function IntentStep({
  intents,
  busy,
  onPick,
}: {
  intents: Intent[];
  busy: string | null;
  onPick: (intent: Intent) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        animation: "bmd-fade-in 240ms ease-out",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--v45-saffron, #C58A2E)",
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          Étape 2 sur 2
        </span>
        <h1
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 34,
            lineHeight: 1.12,
            fontWeight: 700,
            margin: 0,
            color: "var(--cocoa, #2B1F15)",
            letterSpacing: -0.4,
          }}
        >
          Tu es ici pour quoi&nbsp;?
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--cocoa-soft, #6B5A47)",
            margin: 0,
            lineHeight: 1.55,
            maxWidth: 480,
          }}
        >
          Choisis ton cas d&apos;usage principal — on te pré-remplit ton
          premier groupe pour aller vite. Tu pourras toujours en créer
          d&apos;autres ensuite.
        </p>
      </header>

      <div className="bmd-intent-grid">
        {intents.map((intent) => {
          const isActive = busy === intent.type;
          return (
            <button
              key={intent.type}
              type="button"
              onClick={() => onPick(intent)}
              disabled={!!busy}
              className="bmd-intent-card"
              style={{ opacity: busy && !isActive ? 0.4 : 1 }}
            >
              <span aria-hidden className="bmd-intent-icon">
                <Icon name={intent.iconName} size={22} strokeWidth={1.8} />
              </span>
              <span className="bmd-intent-label">{intent.label}</span>
              <span className="bmd-intent-hint">{intent.hint}</span>
              {isActive && (
                <span className="bmd-intent-loading" aria-live="polite">
                  Préparation…
                </span>
              )}
            </button>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes bmd-fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .bmd-intent-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 600px) {
          .bmd-intent-grid {
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
        }
        .bmd-intent-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 18px 18px 16px;
          background: var(--paper, #ffffff);
          border: 1.5px solid var(--v45-line, rgba(43, 31, 21, 0.08));
          border-radius: 18px;
          color: var(--cocoa, #2b1f15);
          text-align: left;
          font-family: inherit;
          min-height: 140px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(43, 31, 21, 0.04);
          transition:
            transform 0.18s ease,
            border-color 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        @media (hover: hover) and (pointer: fine) {
          .bmd-intent-card:not(:disabled):hover {
            border-color: var(--v45-saffron, #c58a2e);
            background: linear-gradient(
              135deg,
              var(--paper, #ffffff),
              var(--v45-saffron-pale, rgba(197, 138, 46, 0.06))
            );
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(197, 138, 46, 0.18);
          }
        }
        .bmd-intent-card:not(:disabled):active {
          transform: scale(0.97);
          border-color: var(--v45-saffron, #c58a2e);
          background: var(--v45-saffron-pale, rgba(197, 138, 46, 0.10));
        }
        .bmd-intent-card:disabled {
          cursor: wait;
        }
        .bmd-intent-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            var(--v45-saffron-pale, rgba(197, 138, 46, 0.18)),
            rgba(197, 138, 46, 0.06)
          );
          border: 1px solid var(--v45-saffron, #c58a2e);
          color: var(--v45-saffron, #c58a2e);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-bottom: 12px;
        }
        .bmd-intent-label {
          font-size: 17px;
          font-weight: 700;
          color: var(--cocoa, #2b1f15);
          font-family: "Cormorant Garamond", serif;
          line-height: 1.2;
          margin-bottom: 4px;
        }
        .bmd-intent-hint {
          font-size: 13px;
          color: var(--cocoa-soft, #6b5a47);
          line-height: 1.45;
          flex-grow: 1;
        }
        .bmd-intent-loading {
          margin-top: 8px;
          font-size: 11px;
          color: var(--v45-saffron, #c58a2e);
          font-weight: 700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
