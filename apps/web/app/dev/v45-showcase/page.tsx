"use client";

/**
 * V52.B12 — Page showcase V45 (dev only).
 *
 * Affiche tous les composants V45 livrés Vagues A + B :
 *  - Icon registry (49 icônes SVG outline)
 *  - AvatarColored (palette 4-couleur déterministe)
 *  - NumpadKeypad (numpad 4×3 Cormorant)
 *  - SplitDonut (game-changer SVG draggable)
 *  - ScanFrame (overlay 4 corners + laser)
 *  - Toggle theme dark V44 ↔ V45 light
 *
 * Cette page est uniquement destinée à la validation visuelle locale.
 * Elle n'est pas exposée en prod (mais comme on a pas de protection
 * routing dev/prod actuellement, on ajoute `noindex` côté SEO).
 *
 * URL : http://localhost:3000/dev/v45-showcase
 */
import { useState } from "react";
import { Icon, ICON_PATHS, type IconName } from "../../../lib/ui/icons";
import { AvatarColored } from "../../../lib/ui/avatar-colored";
import { NumpadKeypad } from "../../../lib/ui/numpad-keypad";
import { SplitDonut, type SplitDonutMember } from "../../../lib/ui/split-donut";
import { ScanFrame as V45ScanOverlay } from "../../../lib/ui/scan-frame";
// V52.D1 — Toggle persistant via useTheme (localStorage `bmd-theme`).
import { useTheme } from "../../../lib/ui/theme-provider";

const DEMO_MEMBERS: SplitDonutMember[] = [
  { id: "user-fabrice", name: "Fabrice", isActive: true },
  { id: "user-linda", name: "Linda", isActive: true },
  { id: "user-karim", name: "Karim", isActive: true },
  { id: "user-aicha", name: "Aïcha", isActive: true },
];

export default function V45ShowcasePage() {
  // V52.D1 — Theme PERSISTÉ via useTheme (localStorage `bmd-theme`).
  // Plus de useEffect/cleanup : le theme reste actif tant que l'user
  // n'a pas explicitement basculé en arrière (anti-FOUC via BootScript
  // dans <head>, donc pas de flash au refresh).
  const { theme, setTheme } = useTheme();
  const [amount, setAmount] = useState<string>("");
  const [shares, setShares] = useState<Record<string, number>>({
    "user-fabrice": 25,
    "user-linda": 25,
    "user-karim": 25,
    "user-aicha": 25,
  });
  const [scanning, setScanning] = useState(true);
  const [members, setMembers] = useState(DEMO_MEMBERS);
  const isV45 = theme === "v45-light";

  // Liste typée des 49 icônes (ordre du registry)
  const iconNames = Object.keys(ICON_PATHS) as IconName[];

  function toggleMember(id: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isActive: !m.isActive } : m)),
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px 16px 80px",
        maxWidth: 720,
        margin: "0 auto",
        color: "var(--cream)",
      }}
    >
      {/* Header avec toggle theme */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 24,
          padding: 16,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(232,163,61,0.18)",
          borderRadius: 14,
          position: "sticky",
          top: 12,
          zIndex: 10,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              color: "var(--cream)",
            }}
          >
            V45 · Showcase composants
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11,
              color: "var(--cream-soft)",
              letterSpacing: 0.3,
            }}
          >
            Theme actuel : <strong>{theme}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTheme(isV45 ? "dark" : "v45-light")}
          style={{
            padding: "10px 14px",
            background:
              "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "#16111E",
            fontWeight: 700,
            fontSize: 12,
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            letterSpacing: 0.3,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="sparkles" size={14} color="currentColor" strokeWidth={2} />
          {isV45 ? "Revenir dark V44" : "Voir V45 light"}
        </button>
      </header>

      {/* === SECTION 1 : Icon registry === */}
      <Section title="Icon registry · 49 icônes SVG outline 1.5px">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 10,
          }}
        >
          {iconNames.map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: 12,
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.06)",
                borderRadius: 10,
              }}
              title={name}
            >
              <Icon
                name={name}
                size={24}
                color="var(--saffron)"
                strokeWidth={1.6}
              />
              <span
                style={{
                  fontSize: 9,
                  color: "var(--cream-soft)",
                  letterSpacing: 0.2,
                  textAlign: "center",
                  lineHeight: 1.2,
                  wordBreak: "break-word",
                }}
              >
                {name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* === SECTION 2 : AvatarColored === */}
      <Section title="AvatarColored · palette 4-couleur déterministe">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 18,
            alignItems: "center",
            padding: 16,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.06)",
            borderRadius: 12,
          }}
        >
          <AvatarColored userId="user-fabrice" initials="Fabrice" size={48} />
          <AvatarColored userId="user-linda" initials="Linda" size={48} />
          <AvatarColored userId="user-karim" initials="Karim Diallo" size={48} dualInitials />
          <AvatarColored userId="user-aicha" initials="Aïcha" size={48} />
          <AvatarColored userId="user-bob" initials="Bob" size={48} />
          <AvatarColored
            userId="user-fabrice-me"
            initials="F"
            size={48}
            meTag
          />
          <AvatarColored
            userId="user-selected"
            initials="S"
            size={48}
            selected
          />
          <AvatarColored userId="ALL" variant="users" size={48} />
        </div>
      </Section>

      {/* === SECTION 3 : NumpadKeypad === */}
      <Section title="NumpadKeypad · numpad custom V45">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: 16,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.06)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              padding: "18px 14px",
              background: "rgba(244,228,193,0.06)",
              border: "1px solid rgba(232,163,61,0.25)",
              borderRadius: 14,
              textAlign: "center",
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 44,
              fontWeight: 700,
              color: "var(--cream)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {amount || "0"}{" "}
            <span style={{ fontSize: 18, color: "var(--saffron)" }}>EUR</span>
          </div>
          <NumpadKeypad
            value={amount}
            onChange={setAmount}
            maxDecimals={2}
          />
        </div>
      </Section>

      {/* === SECTION 4 : SplitDonut === */}
      <Section title="SplitDonut · game-changer interactif (drag les poignées)">
        <div
          style={{
            padding: 18,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.06)",
            borderRadius: 12,
          }}
        >
          <SplitDonut
            members={members}
            total={87.4}
            shares={shares}
            currency="EUR"
            onChange={setShares}
            onToggleExclude={toggleMember}
          />
        </div>
      </Section>

      {/* === SECTION 5 : ScanFrame === */}
      <Section title="ScanFrame · 4 corners SVG saffron + laser animé">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: 16,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.06)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              position: "relative",
              height: 220,
              borderRadius: 18,
              background:
                "repeating-linear-gradient(45deg, rgba(232,163,61,0.04) 0 6px, transparent 6px 12px)",
              overflow: "hidden",
            }}
          >
            <V45ScanOverlay scanning={scanning} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--cream-soft)",
                fontSize: 12,
                letterSpacing: 0.5,
              }}
            >
              [zone preview reçu]
            </div>
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              color: "var(--cream-soft)",
            }}
          >
            <input
              type="checkbox"
              checked={scanning}
              onChange={(e) => setScanning(e.target.checked)}
            />
            Laser actif (scanning)
          </label>
        </div>
      </Section>

      {/* === Footer instructions === */}
      <footer
        style={{
          marginTop: 32,
          padding: 16,
          background: "rgba(232,163,61,0.06)",
          border: "1px solid rgba(232,163,61,0.18)",
          borderRadius: 12,
          fontSize: 12,
          color: "var(--cream-soft)",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "var(--saffron)" }}>
          Comment tester V45 light sur le reste de l'app
        </strong>
        <br />
        Bascule le toggle ci-dessus, puis navigue vers n'importe quelle route
        (login, dashboard, group, etc.) — toute l'app reste en theme V45 light.
        <br />
        Le choix est <strong>persisté en localStorage</strong> (clé{" "}
        <code>bmd-theme</code>) : ferme l'onglet, ré-ouvre l'app, tu retrouves
        ton theme. Anti-FOUC actif : pas de flash dark→light au refresh.
        <br />
        <br />
        <strong style={{ color: "var(--saffron)" }}>Composants livrés cette session</strong>
        <br />
        Vague A : 4 fondations (variables CSS, icon registry, AvatarColored,
        NumpadKeypad)
        <br />
        Vague B Phase 1 : 30+ emojis → SVG sur 4 fichiers (login, dashboard, add
        expense, scan)
        <br />
        Vague B Phase 2 : SplitDonut + NumpadKeypad branché + ScanFrame + palette
        V45 globale via data-theme
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 18,
          fontWeight: 600,
          margin: "0 0 12px",
          color: "var(--saffron)",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
