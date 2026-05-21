"use client";

/**
 * Bloc admin · Configuration publique du site (V23).
 *
 * Permet à l'admin de modifier les valeurs qui apparaissent côté site
 * vitrine et qui étaient avant hardcodées dans le code source :
 *  - supportEmail   : email principal affiché dans la FAQ, footer, etc.
 *  - privacyEmail   : email RGPD / vie privée
 *  - securityEmail  : email pour CVE / disclosure responsable
 *  - whatsappNumber : numéro WhatsApp Business (E.164 sans le +) — visible
 *                     comme bouton "Contact WhatsApp" si renseigné
 *  - siteUrl        : URL canonique du site (pour OG tags, magic links…)
 *
 * La modif est immédiatement visible sur le site vitrine grâce à
 * l'invalidation du cache `/site-config` côté API.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";

interface SiteCfg {
  supportEmail: string;
  privacyEmail: string;
  securityEmail: string;
  whatsappNumber: string | null;
  siteUrl: string;
}

export function AdminSiteConfigBlock(): JSX.Element {
  const toast = useToast();
  const [cfg, setCfg] = useState<SiteCfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const r = await api.adminGetSiteConfig();
      setCfg({
        supportEmail: r.supportEmail,
        privacyEmail: r.privacyEmail,
        securityEmail: r.securityEmail,
        whatsappNumber: r.whatsappNumber ?? "",
        siteUrl: r.siteUrl,
      });
    } catch (e) {
      toast.error(`Chargement échoué : ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await api.adminUpdateSiteConfig({
        supportEmail: cfg.supportEmail,
        privacyEmail: cfg.privacyEmail,
        securityEmail: cfg.securityEmail,
        whatsappNumber: cfg.whatsappNumber ?? "",
        siteUrl: cfg.siteUrl,
      });
      toast.success(
        "Configuration sauvegardée — visible sur le site vitrine sous 5 minutes (cache).",
      );
    } catch (e) {
      toast.error(`Échec : ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !cfg) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Chargement de la configuration site…
        </div>
      </div>
    );
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--line-soft)",
    borderRadius: 10,
    color: "var(--cream)",
    fontSize: 14,
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--cream-soft)",
    fontWeight: 600,
    marginBottom: 6,
    display: "block",
  };

  return (
    <div
      className="card"
      style={{
        marginTop: 16,
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.08), rgba(16,185,129,0.04))",
        border: "1px solid var(--line)",
      }}
    >
      <h3
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 22,
          color: "var(--cream)",
          marginBottom: 4,
        }}
      >
        🔧 Configuration site public
      </h3>
      <p
        style={{
          fontSize: 13,
          color: "var(--cream-soft)",
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        Ces valeurs sont affichées sur le site vitrine (FAQ, footer, contact).
        Toute modification est propagée sous 5 min (cache public).
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        <div>
          <label style={labelStyle}>Email de support principal</label>
          <input
            type="email"
            value={cfg.supportEmail}
            onChange={(e) =>
              setCfg({ ...cfg, supportEmail: e.target.value })
            }
            placeholder="hello@backmesdo.com"
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Email vie privée (RGPD)</label>
          <input
            type="email"
            value={cfg.privacyEmail}
            onChange={(e) =>
              setCfg({ ...cfg, privacyEmail: e.target.value })
            }
            placeholder="privacy@backmesdo.com"
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Email sécurité (CVE)</label>
          <input
            type="email"
            value={cfg.securityEmail}
            onChange={(e) =>
              setCfg({ ...cfg, securityEmail: e.target.value })
            }
            placeholder="security@backmesdo.com"
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>
            Numéro WhatsApp Business <span style={{ color: "var(--muted)" }}>(optionnel)</span>
          </label>
          <input
            type="tel"
            value={cfg.whatsappNumber ?? ""}
            onChange={(e) =>
              setCfg({ ...cfg, whatsappNumber: e.target.value })
            }
            placeholder="33612345678 (E.164 sans +)"
            style={fieldStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>URL canonique du site</label>
          <input
            type="url"
            value={cfg.siteUrl}
            onChange={(e) => setCfg({ ...cfg, siteUrl: e.target.value })}
            placeholder="https://www.backmesdo.com"
            style={fieldStyle}
          />
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{
            background:
              "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "var(--night-2, #16111E)",
            padding: "10px 22px",
            borderRadius: 10,
            border: "none",
            fontSize: 14,
            fontWeight: 700,
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.6 : 1,
            minHeight: 42,
          }}
        >
          {saving ? "Sauvegarde…" : "💾 Sauvegarder"}
        </button>
      </div>
    </div>
  );
}
