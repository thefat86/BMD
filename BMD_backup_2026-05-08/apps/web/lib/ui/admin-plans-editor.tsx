"use client";

/**
 * Éditeur complet des plans tarifaires (spec §6.3).
 *
 * Fonctionnalités :
 *  - Liste tous les plans avec leurs limites en clair
 *  - Création de nouveau plan (code, nom, prix, description, limites)
 *  - Suppression d'un plan (refus si users encore dessus, FREE protégé)
 *  - Édition de chaque champ
 *  - Édition du JSON `limits` clé par clé : ajouter/supprimer une autorisation
 *  - Toggle actif/inactif
 *
 * Modèle de "limites" :
 *  - Number > 0 : quota (ex: maxGroups = 10)
 *  - Number = -1 : illimité
 *  - Number = 0 : bloqué
 *  - Boolean true : feature activée
 *  - Boolean false : feature bloquée
 *
 * Clés bien connues (auto-complétées) :
 *  maxGroups, maxMembersPerGroup, ocrPerMonth, whatsappBot, multiCurrency,
 *  debtSwap, exportPdfExcel, adsEnabled, adminDashboard, taxReceipts,
 *  prioritySupport
 *
 * Toute modif est appliquée en temps réel (cache 5 min côté backend).
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  priceCentsYearly: number | null;
  description: string | null;
  limits: Record<string, any>;
  displayOrder: number;
  isActive: boolean;
  userCount: number;
}

/// Métadonnées des limites connues — pour aider l'admin
const KNOWN_LIMITS: Array<{
  key: string;
  label: string;
  type: "number" | "boolean";
  hint: string;
}> = [
  {
    key: "maxGroups",
    label: "Nombre max de groupes",
    type: "number",
    hint: "-1 = illimité",
  },
  {
    key: "maxMembersPerGroup",
    label: "Membres max par groupe",
    type: "number",
    hint: "-1 = illimité",
  },
  {
    key: "ocrPerMonth",
    label: "Scans OCR par mois",
    type: "number",
    hint: "-1 = illimité",
  },
  {
    key: "whatsappBot",
    label: "Bot WhatsApp activé",
    type: "boolean",
    hint: "Conversation naturelle dans WhatsApp",
  },
  {
    key: "multiCurrency",
    label: "Multi-devises",
    type: "boolean",
    hint: "25 devises africaines + internationales",
  },
  {
    key: "debtSwap",
    label: "Swap de dettes",
    type: "boolean",
    hint: "Compensation triangulaire / N-aire",
  },
  {
    key: "exportPdfExcel",
    label: "Export PDF/Excel",
    type: "boolean",
    hint: "Rapports comptables imprimables",
  },
  {
    key: "adsEnabled",
    label: "Publicités affichées",
    type: "boolean",
    hint: "Forfait gratuit uniquement",
  },
  {
    key: "adminDashboard",
    label: "Dashboard admin client",
    type: "boolean",
    hint: "Pack Communauté",
  },
  {
    key: "taxReceipts",
    label: "Reçus fiscaux automatiques",
    type: "boolean",
    hint: "Pour paroisses et associations",
  },
  {
    key: "prioritySupport",
    label: "Support prioritaire",
    type: "boolean",
    hint: "Réponse < 4h",
  },
  // ====== Sprint AC-3 · Réunions enregistrées (procès-verbaux audio) ======
  {
    key: "meetingsPerMonth",
    label: "Réunions enregistrées / mois",
    type: "number",
    hint: "0 = bloqué, -1 = illimité, N = quota",
  },
  {
    key: "meetingAddonCents",
    label: "Coût addon réunion (centimes EUR)",
    type: "number",
    hint: "Facturé via Stripe au-delà du quota. 0 = pas d'addon possible.",
  },
  {
    key: "meetingMaxDurationSeconds",
    label: "Durée max d'une réunion (secondes)",
    type: "number",
    hint: "Hard cap. Défaut 3600 = 1h. Au-delà, l'enregistrement s'arrête.",
  },
  {
    key: "meetingWarnAtSeconds",
    label: "Avertissement à (secondes)",
    type: "number",
    hint: "Affiche un compte à rebours dans l'UI à ce seuil. Défaut 3000 = 50 min.",
  },
  {
    key: "audioProofMaxSeconds",
    label: "Durée max preuve audio dépense (secondes)",
    type: "number",
    hint: "Cas marché Afrique. Défaut 300 = 5 min.",
  },
  {
    key: "twoFactor",
    label: "2FA (TOTP)",
    type: "boolean",
    hint: "Authenticator app",
  },
  {
    key: "customRoles",
    label: "Rôles admin custom",
    type: "boolean",
    hint: "Permissions fines par membre",
  },
];

export function AdminPlansEditor(): JSX.Element {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.adminListPlans();
      setPlans(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="card">
      <div className="card-head">
        <h2>💎 Plans tarifaires</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="muted" style={{ fontSize: 11 }}>
            {plans.length}
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="btn btn-sm"
            style={{ padding: "6px 12px", minHeight: 32 }}
          >
            ＋ Nouveau plan
          </button>
        </div>
      </div>
      <p
        className="muted"
        style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}
      >
        Modifications appliquées en temps réel à tous les utilisateurs (cache
        5 min côté serveur). Spec §6.3.
      </p>

      {loading && <p className="muted">Chargement…</p>}
      {error && <div className="error">Erreur : {error}</div>}

      {!loading && plans.length === 0 && !error && (
        <p className="muted text-center" style={{ padding: "20px 0" }}>
          Aucun plan. Crée le premier ↑
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {plans.map((p) =>
          editingCode === p.code ? (
            <PlanEditCard
              key={p.code}
              plan={p}
              onCancel={() => setEditingCode(null)}
              onSaved={async () => {
                setEditingCode(null);
                await load();
                toast.success("Plan mis à jour");
              }}
              onDeleted={async () => {
                setEditingCode(null);
                await load();
                toast.success("Plan supprimé");
              }}
            />
          ) : (
            <PlanReadCard
              key={p.code}
              plan={p}
              onEdit={() => setEditingCode(p.code)}
            />
          ),
        )}
      </div>

      {showCreate && (
        <PlanCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
            toast.success("Plan créé");
          }}
        />
      )}
    </div>
  );
}

/* =================================================================
 * VUE LECTURE D'UN PLAN
 * ================================================================= */
function PlanReadCard({
  plan,
  onEdit,
}: {
  plan: Plan;
  onEdit: () => void;
}): JSX.Element {
  const limits = plan.limits ?? {};
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${plan.isActive ? "var(--line)" : "var(--line-soft)"}`,
        borderRadius: 14,
        padding: 16,
        opacity: plan.isActive ? 1 : 0.6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: plan.isActive
              ? "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))"
              : "rgba(255,255,255,0.06)",
            color: plan.isActive ? "#16111E" : "var(--cream-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {plan.code === "FREE"
            ? "🌱"
            : plan.code === "PREMIUM"
              ? "✨"
              : plan.code === "COMMUNITY"
                ? "🏛"
                : "💎"}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--cream)",
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            {plan.name}
            {!plan.isActive && (
              <span
                style={{
                  fontSize: 9,
                  color: "var(--rose, #ef4444)",
                  marginLeft: 8,
                  letterSpacing: 1,
                }}
              >
                INACTIF
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            <code>{plan.code}</code> · {plan.userCount} utilisateur
            {plan.userCount > 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--saffron, #E8A33D)",
            }}
          >
            {plan.priceCents === 0
              ? "Gratuit"
              : `${(plan.priceCents / 100).toFixed(2)} €`}
            {plan.priceCents > 0 && (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {" "}
                /mois
              </span>
            )}
          </div>
          {plan.priceCentsYearly && (
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              ou {(plan.priceCentsYearly / 100).toFixed(0)} €/an
            </div>
          )}
        </div>
        <button
          onClick={onEdit}
          className="btn-ghost btn-sm"
          style={{ padding: "8px 12px", minHeight: 36, fontSize: 12 }}
        >
          ✏️ Éditer
        </button>
      </div>

      {plan.description && (
        <p
          style={{
            fontSize: 12,
            color: "var(--cream-soft)",
            margin: "8px 0",
            fontStyle: "italic",
          }}
        >
          « {plan.description} »
        </p>
      )}

      {/* Limites & autorisations */}
      <div
        style={{
          background: "rgba(0,0,0,0.25)",
          borderRadius: 10,
          padding: 10,
          marginTop: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.5,
            color: "var(--gold, #C9A24A)",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Autorisations & limites ({Object.keys(limits).length})
        </div>
        {Object.keys(limits).length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
            Aucune limite définie
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 6,
            }}
          >
            {Object.entries(limits).map(([k, v]) => {
              const known = KNOWN_LIMITS.find((kl) => kl.key === k);
              return (
                <LimitRow key={k} keyName={k} value={v} known={known} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LimitRow({
  keyName,
  value,
  known,
}: {
  keyName: string;
  value: any;
  known?: (typeof KNOWN_LIMITS)[number];
}): JSX.Element {
  const label = known?.label ?? keyName;
  let display: string;
  let color: string;
  if (typeof value === "boolean") {
    display = value ? "✓ Activé" : "✗ Bloqué";
    color = value ? "var(--emerald, #3F7D5C)" : "var(--rose, #ef4444)";
  } else if (value === -1) {
    display = "∞ Illimité";
    color = "var(--saffron, #E8A33D)";
  } else if (value === 0) {
    display = "✗ Bloqué";
    color = "var(--rose, #ef4444)";
  } else {
    display = String(value);
    color = "var(--cream)";
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 12,
        padding: "4px 0",
      }}
    >
      <span style={{ color: "var(--cream-soft)", flex: 1, minWidth: 0 }}>
        {label}
      </span>
      <span style={{ color, fontWeight: 600, flexShrink: 0 }}>{display}</span>
    </div>
  );
}

/* =================================================================
 * VUE ÉDITION D'UN PLAN
 * ================================================================= */
function PlanEditCard({
  plan,
  onCancel,
  onSaved,
  onDeleted,
}: {
  plan: Plan;
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}): JSX.Element {
  const toast = useToast();
  const dialog = useDialog();
  const [name, setName] = useState(plan.name);
  const [priceEur, setPriceEur] = useState((plan.priceCents / 100).toString());
  const [priceYear, setPriceYear] = useState(
    plan.priceCentsYearly ? (plan.priceCentsYearly / 100).toString() : "",
  );
  const [description, setDescription] = useState(plan.description ?? "");
  const [isActive, setIsActive] = useState(plan.isActive);
  const [limits, setLimits] = useState<Record<string, any>>({
    ...(plan.limits ?? {}),
  });
  const [busy, setBusy] = useState(false);

  // Form pour ajouter une nouvelle limite custom
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<"number" | "boolean">("number");
  const [newValue, setNewValue] = useState("");

  async function save() {
    setBusy(true);
    try {
      const cents = Math.round(parseFloat(priceEur) * 100);
      const yearCents = priceYear ? Math.round(parseFloat(priceYear) * 100) : null;
      await api.adminUpdatePlan(plan.code, {
        name,
        priceCents: Number.isFinite(cents) && cents >= 0 ? cents : 0,
        priceCentsYearly: yearCents !== null && Number.isFinite(yearCents) ? yearCents : null,
        description: description || null,
        limits,
        isActive,
      });
      onSaved();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    const ok = await dialog.confirm(
      `Supprimer le plan "${plan.name}" ? Cette action est irréversible.`,
      {
        variant: "danger",
        title: "Supprimer le plan",
        confirmLabel: "Supprimer",
      },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.adminDeletePlan(plan.code);
      onDeleted();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  function setLimit(key: string, value: any) {
    setLimits((l) => ({ ...l, [key]: value }));
  }

  function removeLimit(key: string) {
    setLimits((l) => {
      const next = { ...l };
      delete next[key];
      return next;
    });
  }

  function addCustomLimit() {
    const k = newKey.trim();
    if (!k) return;
    if (k in limits) {
      toast.error("Cette clé existe déjà");
      return;
    }
    if (newType === "boolean") {
      setLimit(k, newValue === "true");
    } else {
      const n = parseFloat(newValue);
      setLimit(k, Number.isFinite(n) ? n : 0);
    }
    setNewKey("");
    setNewValue("");
  }

  return (
    <div
      style={{
        background: "rgba(232,163,61,0.04)",
        border: "1px solid var(--saffron, #E8A33D)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.5,
          color: "var(--saffron, #E8A33D)",
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        ✏️ Édition · {plan.code}
      </div>

      {/* Champs de base */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <Field label="Nom commercial">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Prix mensuel (€)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceEur}
            onChange={(e) => setPriceEur(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Prix annuel (€) – optionnel">
          <input
            type="number"
            step="1"
            min="0"
            value={priceYear}
            onChange={(e) => setPriceYear(e.target.value)}
            placeholder="ex: 29"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Description marketing">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Plan actif (proposé aux nouveaux utilisateurs)
      </label>

      {/* Éditeur des limites */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: "rgba(0,0,0,0.3)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            color: "var(--gold, #C9A24A)",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          🔐 Autorisations & limites
        </div>

        {/* Limites connues : toggle activable même si pas encore dans le plan */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 6,
          }}
        >
          {KNOWN_LIMITS.map((kl) => (
            <LimitEditor
              key={kl.key}
              meta={kl}
              value={limits[kl.key]}
              onChange={(v) => setLimit(kl.key, v)}
              onRemove={() => removeLimit(kl.key)}
            />
          ))}
        </div>

        {/* Limites custom (clés non connues) */}
        {Object.keys(limits).filter(
          (k) => !KNOWN_LIMITS.some((kl) => kl.key === k),
        ).length > 0 && (
          <>
            <div
              style={{
                fontSize: 10,
                color: "var(--muted)",
                marginTop: 14,
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Limites personnalisées
            </div>
            {Object.entries(limits)
              .filter(([k]) => !KNOWN_LIMITS.some((kl) => kl.key === k))
              .map(([k, v]) => (
                <CustomLimitRow
                  key={k}
                  keyName={k}
                  value={v}
                  onChange={(nv) => setLimit(k, nv)}
                  onRemove={() => removeLimit(k)}
                />
              ))}
          </>
        )}

        {/* Ajout d'une limite custom */}
        <div
          style={{
            marginTop: 14,
            padding: 10,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 8,
            border: "1px dashed var(--line-soft)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            ＋ Ajouter une limite personnalisée
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1fr auto",
              gap: 6,
              alignItems: "center",
            }}
          >
            <input
              placeholder="ex: maxAttachmentsPerExpense"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={inputStyle}
            />
            <select
              value={newType}
              onChange={(e) => {
                setNewType(e.target.value as any);
                setNewValue("");
              }}
              style={inputStyle}
            >
              <option value="number">Nombre</option>
              <option value="boolean">Booléen</option>
            </select>
            {newType === "number" ? (
              <input
                type="number"
                placeholder="-1 = illimité"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                style={inputStyle}
              />
            ) : (
              <select
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                style={inputStyle}
              >
                <option value="">…</option>
                <option value="true">✓ Activé</option>
                <option value="false">✗ Bloqué</option>
              </select>
            )}
            <button
              onClick={addCustomLimit}
              disabled={!newKey.trim() || !newValue}
              className="btn btn-sm"
              style={{ padding: "6px 10px" }}
            >
              ＋
            </button>
          </div>
        </div>
      </div>

      {/* Boutons */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onCancel}
          className="btn-ghost btn-sm"
          style={{ flex: 1, minWidth: 80 }}
          disabled={busy}
        >
          Annuler
        </button>
        {plan.code !== "FREE" && (
          <button
            onClick={doDelete}
            className="btn-ghost btn-sm"
            style={{
              flex: 1,
              minWidth: 80,
              color: "var(--rose, #ef4444)",
              borderColor: "var(--rose, #ef4444)",
            }}
            disabled={busy}
          >
            🗑 Supprimer
          </button>
        )}
        <button
          onClick={save}
          className="btn btn-sm"
          style={{ flex: 2, minWidth: 120 }}
          disabled={busy}
        >
          {busy ? "Enregistrement…" : "✓ Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 10,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function LimitEditor({
  meta,
  value,
  onChange,
  onRemove,
}: {
  meta: (typeof KNOWN_LIMITS)[number];
  value: any;
  onChange: (v: any) => void;
  onRemove: () => void;
}): JSX.Element {
  const isSet = value !== undefined;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 8,
        background: isSet ? "rgba(232,163,61,0.04)" : "transparent",
        borderRadius: 6,
        border: isSet
          ? "1px solid var(--line)"
          : "1px solid var(--line-soft)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--cream)", fontWeight: 600 }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>{meta.hint}</div>
      </div>
      {meta.type === "boolean" ? (
        <button
          type="button"
          onClick={() => onChange(value === true ? false : true)}
          style={{
            background:
              value === true
                ? "var(--emerald, #3F7D5C)"
                : value === false
                  ? "var(--rose, #ef4444)"
                  : "rgba(255,255,255,0.08)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            minWidth: 80,
          }}
        >
          {value === true ? "✓ ON" : value === false ? "✗ OFF" : "—"}
        </button>
      ) : (
        <input
          type="number"
          value={value ?? ""}
          placeholder="—"
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : undefined);
          }}
          style={{ ...inputStyle, width: 80, padding: "4px 6px" }}
        />
      )}
      {isSet && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Retirer cette limite"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 14,
            padding: "2px 6px",
          }}
          title="Retirer cette limite"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function CustomLimitRow({
  keyName,
  value,
  onChange,
  onRemove,
}: {
  keyName: string;
  value: any;
  onChange: (v: any) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 6,
        marginTop: 4,
      }}
    >
      <code style={{ fontSize: 12, flex: 1, color: "var(--cream-soft)" }}>
        {keyName}
      </code>
      {typeof value === "boolean" ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          style={{
            background: value
              ? "var(--emerald, #3F7D5C)"
              : "var(--rose, #ef4444)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {value ? "✓ ON" : "✗ OFF"}
        </button>
      ) : (
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          style={{ ...inputStyle, width: 80, padding: "4px 6px" }}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Supprimer"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--rose, #ef4444)",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        🗑
      </button>
    </div>
  );
}

/* =================================================================
 * MODALE DE CRÉATION
 * ================================================================= */
function PlanCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [priceEur, setPriceEur] = useState("0");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!/^[A-Z0-9_]{2,40}$/.test(code)) {
      toast.error(
        "Code invalide : majuscules / chiffres / _ uniquement, 2 à 40 caractères",
      );
      return;
    }
    if (!name.trim()) {
      toast.error("Nom requis");
      return;
    }
    setBusy(true);
    try {
      const cents = Math.round(parseFloat(priceEur) * 100);
      await api.adminCreatePlan({
        code: code.trim(),
        name: name.trim(),
        priceCents: Number.isFinite(cents) && cents >= 0 ? cents : 0,
        description: description.trim() || undefined,
        limits: {},
      });
      onCreated();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,11,20,0.85)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9990,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, #16111E 0%, #1F1429 100%)",
          border: "1px solid rgba(232,163,61,0.18)",
          borderRadius: 16,
          padding: 20,
          maxWidth: 460,
          width: "100%",
          color: "var(--cream)",
        }}
      >
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 22,
            margin: "0 0 4px",
          }}
        >
          ＋ Nouveau plan
        </h2>
        <p
          className="muted"
          style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}
        >
          Tu pourras configurer les limites et autorisations après la création
          en cliquant sur "Éditer".
        </p>

        <Field label="Code unique (majuscules)">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ex: ENTERPRISE"
            style={inputStyle}
          />
        </Field>
        <div style={{ height: 10 }} />
        <Field label="Nom commercial">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Entreprise"
            style={inputStyle}
          />
        </Field>
        <div style={{ height: 10 }} />
        <Field label="Prix mensuel (€)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceEur}
            onChange={(e) => setPriceEur(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <div style={{ height: 10 }} />
        <Field label="Description (optionnel)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="ex: Pour les grandes équipes — support dédié et SLA"
          />
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={busy}
            className="btn-ghost btn-sm"
            style={{ flex: 1 }}
          >
            Annuler
          </button>
          <button
            onClick={create}
            disabled={busy}
            className="btn btn-sm"
            style={{ flex: 2 }}
          >
            {busy ? "Création…" : "✓ Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  background: "rgba(0,0,0,0.3)",
  border: "1px solid var(--line-soft, rgba(244,228,193,0.08))",
  borderRadius: 6,
  color: "var(--cream, #F4E4C1)",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
