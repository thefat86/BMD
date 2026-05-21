"use client";

/**
 * <MobileContactPickerSheet> · V96 — Picker carnet d'adresses cross-platform.
 *
 * Utilisé partout où BMD demande de choisir des contacts à inviter :
 *  - <MobileInviteSheet> (page groupe : mode "Répertoire")
 *  - <MobileCreateGroupSheet> (wizard étape 3 : inviter dès la création)
 *
 * Comportement par plateforme :
 *
 *  1. Capacitor iOS / Android (app native, `window.bmdNative` présent)
 *     → utilise le plugin @capacitor-community/contacts via bridge :
 *       `window.bmdNative.contacts.requestPermission()` puis `.list()`.
 *     → affiche un picker BMD avec liste + recherche + cases à cocher.
 *
 *  2. Chrome / Edge Android (web Contacts API supportée)
 *     → utilise `navigator.contacts.select()` (picker système OS).
 *     → renvoie directement la sélection système — pas de picker BMD.
 *
 *  3. Safari iOS / desktop (rien de tout ça)
 *     → affiche un message clair + lien vers la saisie manuelle.
 *
 * RGPD :
 *  - On NE STOCKE RIEN. Liste affichée en mémoire JS uniquement, jetée
 *    à la fermeture du sheet.
 *  - L'utilisateur sélectionne explicitement les contacts à inviter.
 *  - Seuls les contacts sélectionnés sont retournés au parent (qui les
 *    enverra à l'API batchInviteMembers).
 *  - Encart RGPD permanent en haut du sheet.
 */

import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { useNative } from "../use-native";
import { useT } from "../i18n/app-strings";
import { haptic } from "../platform";

export interface PickedContact {
  /** Nom à afficher (peut être null si contact anonyme). */
  displayName: string | null;
  /** Téléphones normalisés E.164 best-effort. */
  phones: string[];
  /** Emails normalisés lowercase. */
  emails: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Callback appelé quand l'utilisateur valide sa sélection. Le parent
   * est responsable de convertir cette sélection en invitations (en
   * choisissant phone OU email par contact selon la priorité métier).
   */
  onConfirm: (contacts: PickedContact[]) => void;
  /** Texte explicatif optionnel affiché en haut (au-dessus de l'encart RGPD). */
  intro?: string;
}

export function MobileContactPickerSheet({
  open,
  onClose,
  onConfirm,
  intro,
}: Props) {
  const t = useT();
  const native = useNative();

  // Détection de la stratégie utilisable
  type Strategy = "native" | "web" | "unsupported" | "checking";
  const [strategy, setStrategy] = useState<Strategy>("checking");

  // Données contacts (uniquement utilisées dans la stratégie native)
  const [allContacts, setAllContacts] = useState<PickedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Sélection multiple par index dans `allContacts`
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  // === Détection plateforme ===
  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setPermissionDenied(false);
    setSelectedIdx(new Set());
    setSearch("");

    if (native) {
      // App Capacitor : on a le plugin natif sur iOS/Android, on l'utilise
      setStrategy("native");
      return;
    }
    if (typeof window === "undefined") {
      setStrategy("unsupported");
      return;
    }
    const hasWebApi =
      typeof (navigator as any).contacts === "object" &&
      typeof (navigator as any).contacts?.select === "function";
    setStrategy(hasWebApi ? "web" : "unsupported");
  }, [open, native]);

  // === Charge la liste en mode natif ===
  useEffect(() => {
    if (!open || strategy !== "native" || !native) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    (async () => {
      try {
        const perm = await native.contacts.requestPermission();
        if (cancelled) return;
        if (!perm.granted) {
          setPermissionDenied(true);
          setAllContacts([]);
          return;
        }
        const result = await native.contacts.list();
        if (cancelled) return;
        const mapped: PickedContact[] = result.contacts.map((c) => ({
          displayName: c.displayName,
          phones: c.phones,
          emails: c.emails,
        }));
        setAllContacts(mapped);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(
          (e as Error)?.message ||
            t("group.contactsLoadError") ||
            "Impossible de charger le répertoire",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, strategy, native, t]);

  // === Web Contacts API : on déclenche le picker système au mount ===
  useEffect(() => {
    if (!open || strategy !== "web") return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await (navigator as any).contacts.select(
          ["name", "tel", "email"],
          { multiple: true },
        );
        if (cancelled) return;
        if (!Array.isArray(raw) || raw.length === 0) {
          onClose();
          return;
        }
        const mapped: PickedContact[] = raw.map((c: any) => ({
          displayName: Array.isArray(c.name) ? c.name[0] ?? null : null,
          phones: Array.isArray(c.tel) ? c.tel.filter(Boolean) : [],
          emails: Array.isArray(c.email) ? c.email.filter(Boolean) : [],
        }));
        // En mode web, le picker système est déjà la sélection finale →
        // on confirme directement sans afficher la liste BMD.
        haptic("success");
        onConfirm(mapped);
        onClose();
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error)?.message ?? "";
        // Annulation utilisateur — silencieux, on ferme.
        if (/cancel|denied|abort/i.test(msg)) {
          onClose();
          return;
        }
        setErrorMsg(msg || "Échec de l'accès au répertoire");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, strategy]);

  // === Filtrage texte (mode natif uniquement) ===
  const filteredWithIndex = useMemo(() => {
    if (!search.trim()) return allContacts.map((c, i) => ({ c, i }));
    const q = search.trim().toLowerCase();
    return allContacts
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        if (c.displayName?.toLowerCase().includes(q)) return true;
        if (c.phones.some((p) => p.toLowerCase().includes(q))) return true;
        if (c.emails.some((e) => e.toLowerCase().includes(q))) return true;
        return false;
      });
  }, [allContacts, search]);

  function toggle(i: number) {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    haptic("tap");
  }

  function confirmNative() {
    const picked: PickedContact[] = [];
    for (const i of selectedIdx) {
      const c = allContacts[i];
      if (c) picked.push(c);
    }
    if (picked.length === 0) return;
    haptic("success");
    onConfirm(picked);
    onClose();
  }

  // === Rendu commun ===
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("group.contactsPickerTitle") || "Choisir dans mon répertoire"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {intro && (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--cocoa-soft, var(--cream-soft))",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {intro}
          </p>
        )}

        {/* Encart RGPD permanent — affiché dans toutes les stratégies */}
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(91,108,255,0.06)",
            border: "1px solid rgba(91,108,255,0.20)",
            borderRadius: 10,
            fontSize: 11.5,
            color: "var(--cocoa-soft, var(--cream-soft))",
            lineHeight: 1.5,
          }}
        >
          🛡 <strong>{t("group.rgpdShield") || "Conforme RGPD"}</strong> ·{" "}
          {t("group.rgpdShortText") ||
            "Aucun contact n'est stocké. Tu valides la sélection avant l'envoi."}
        </div>

        {strategy === "checking" && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              color: "var(--cocoa-soft, var(--cream-soft))",
              fontSize: 13,
            }}
          >
            …
          </div>
        )}

        {strategy === "unsupported" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 16,
              borderRadius: 12,
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.10)",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32 }}>📕</div>
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              <strong>
                {t("group.phonebookUnsupportedTitle") ||
                  "Répertoire indisponible"}
              </strong>
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--cocoa-soft, var(--cream-soft))",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t("group.phonebookUnsupportedHint") ||
                "Ton navigateur ne permet pas l'accès au répertoire. Saisis le contact manuellement."}
            </p>
          </div>
        )}

        {strategy === "web" && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              color: "var(--cocoa-soft, var(--cream-soft))",
              fontSize: 13,
            }}
          >
            {errorMsg ?? t("group.contactsLoadingSystem") ?? "Ouverture du sélecteur système…"}
          </div>
        )}

        {strategy === "native" && (
          <>
            {loading && (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--cocoa-soft, var(--cream-soft))",
                  fontSize: 13,
                }}
              >
                {t("group.contactsLoading") || "Chargement du répertoire…"}
              </div>
            )}

            {!loading && permissionDenied && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(228,124,95,0.08)",
                  border: "1px solid rgba(228,124,95,0.30)",
                  color: "#E47C5F",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                ⚠️{" "}
                <strong>
                  {t("group.contactsDeniedTitle") || "Accès refusé"}
                </strong>
                <br />
                {t("group.contactsDeniedHint") ||
                  "Ouvre les réglages système → BMD → Contacts pour autoriser l'accès, puis réessaie."}
              </div>
            )}

            {!loading && errorMsg && !permissionDenied && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(228,124,95,0.08)",
                  border: "1px solid rgba(228,124,95,0.20)",
                  color: "#E47C5F",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {errorMsg}
              </div>
            )}

            {!loading && !permissionDenied && allContacts.length > 0 && (
              <>
                {/* Recherche */}
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    t("group.contactsSearchPlaceholder") ||
                    "Rechercher (nom, numéro, email)…"
                  }
                  style={{
                    width: "100%",
                    padding: "11px 13px",
                    background: "var(--ivory, rgba(244,228,193,0.06))",
                    border:
                      "1px solid var(--v45-line, rgba(43,31,21,0.12))",
                    borderRadius: 11,
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: "var(--cocoa, var(--cream))",
                    outline: "none",
                  }}
                />

                {/* Compteur sélection */}
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--v45-saffron, var(--saffron, #C58A2E))",
                    textTransform: "uppercase",
                    letterSpacing: 1.3,
                    fontWeight: 700,
                  }}
                >
                  {t("group.contactsSelectedCount", {
                    count: String(selectedIdx.size),
                    total: String(allContacts.length),
                  }) ||
                    `${selectedIdx.size} sélectionné${selectedIdx.size > 1 ? "s" : ""} sur ${allContacts.length}`}
                </div>

                {/* Liste (max-height + scroll interne) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    maxHeight: "50vh",
                    overflowY: "auto",
                    padding: 4,
                    background: "var(--paper, rgba(244,228,193,0.02))",
                    border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                    borderRadius: 12,
                  }}
                >
                  {filteredWithIndex.length === 0 && (
                    <div
                      style={{
                        padding: 18,
                        textAlign: "center",
                        color: "var(--cocoa-soft, var(--cream-soft))",
                        fontSize: 12,
                      }}
                    >
                      {t("group.contactsNoMatch") ||
                        "Aucun résultat — affine ta recherche."}
                    </div>
                  )}
                  {filteredWithIndex.map(({ c, i }) => {
                    const active = selectedIdx.has(i);
                    const primary =
                      c.phones[0] ?? c.emails[0] ?? "(sans contact)";
                    const secondary =
                      c.phones[0] && c.emails[0] ? c.emails[0] : null;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggle(i)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "10px 12px",
                          background: active
                            ? "rgba(232,163,61,0.14)"
                            : "transparent",
                          border: active
                            ? "1px solid rgba(232,163,61,0.45)"
                            : "1px solid transparent",
                          borderRadius: 10,
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                          transition: "background 120ms ease",
                        }}
                      >
                        {/* Checkbox carré */}
                        <span
                          aria-hidden
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: active
                              ? "2px solid var(--v45-saffron, #C58A2E)"
                              : "2px solid var(--v45-line, rgba(43,31,21,0.25))",
                            background: active
                              ? "var(--v45-saffron, #C58A2E)"
                              : "transparent",
                            color: "#FFF",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {active ? "✓" : ""}
                        </span>
                        {/* Avatar */}
                        <span
                          aria-hidden
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            background: "rgba(232,163,61,0.16)",
                            color: "var(--v45-saffron, #C58A2E)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {(c.displayName ?? "?").charAt(0).toUpperCase()}
                        </span>
                        {/* Texte */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: "var(--cocoa, var(--cream))",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {c.displayName ??
                              t("group.contactsNoName") ??
                              "(sans nom)"}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--cocoa-soft, var(--cream-soft))",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {primary}
                            {secondary ? ` · ${secondary}` : ""}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Bouton valider */}
                <button
                  type="button"
                  onClick={confirmNative}
                  disabled={selectedIdx.size === 0}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: 12,
                    border: "none",
                    background:
                      selectedIdx.size === 0
                        ? "rgba(244,228,193,0.10)"
                        : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--terracotta, #B5462E))",
                    color:
                      selectedIdx.size === 0
                        ? "var(--cocoa-soft, var(--cream-soft))"
                        : "#FFFFFF",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: selectedIdx.size === 0 ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    touchAction: "manipulation",
                  }}
                >
                  {selectedIdx.size === 0
                    ? t("group.contactsPickFirst") || "Sélectionne au moins un contact"
                    : t("group.contactsConfirmCount", {
                        count: String(selectedIdx.size),
                      }) ||
                      `Ajouter ${selectedIdx.size} contact${selectedIdx.size > 1 ? "s" : ""}`}
                </button>
              </>
            )}

            {!loading && !permissionDenied && allContacts.length === 0 && !errorMsg && (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--cocoa-soft, var(--cream-soft))",
                  fontSize: 13,
                }}
              >
                {t("group.contactsEmpty") ||
                  "Aucun contact trouvé dans ton répertoire."}
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
