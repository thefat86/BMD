"use client";

/**
 * Page paramètres d'un groupe :
 *  - Mobile : <MobileGroupSettings /> (V40 — accordéon iOS dédié)
 *  - Desktop : <DesktopGroupSettingsV241View /> (V241 — refonte épurée
 *    avec preview vivante à gauche + 5 blocs accordéon à droite)
 *
 * Permissions :
 *  - Tous les membres : voient les paramètres
 *  - ADMIN / TREASURER : peuvent renommer, gérer membres, invites
 *  - ADMIN seul : peut supprimer le groupe et activer modules (taxReceipts,
 *    paymentConfirmation, charte couleur, logo PDF)
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../../../lib/api-client";
import { useToast } from "../../../../../lib/ui/toast";
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { useT } from "../../../../../lib/i18n/app-strings";
// V40 — Refonte mobile dédiée (accordéon iOS + Danger zone).
import { MobileGroupSettings } from "../../../../../lib/ui/mobile-group-settings";
// V241 — Refonte desktop épurée (preview vivante + 5 blocs accordéon).
import { DesktopGroupSettingsV241View } from "../../../../../lib/ui/desktop-group-settings-v241-view";

export default function GroupSettingsPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const toast = useToast();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const t = useT();

  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const g = await api.getGroup(groupId);
        if (!cancelled) setGroup(g);
      } catch (e) {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        toast.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, router, toast]);

  // ===== MOBILE =====
  if (bpReady && isMobile) {
    return (
      <ResponsiveShell
        breadcrumb={
          t("groupSettings.title") || t("settings.title") || "Paramètres"
        }
        mobileTitle={
          t("groupSettings.title") || t("settings.title") || "Paramètres"
        }
        back={{ href: `/dashboard/groups/${groupId}` }}
      >
        <MobileGroupSettings groupId={groupId} />
      </ResponsiveShell>
    );
  }

  // ===== DESKTOP — V241 refonte épurée =====
  return (
    <ResponsiveShell
      breadcrumb={
        group
          ? t("settings.breadcrumb", { name: group.name })
          : t("settings.title")
      }
      desktopTitle={
        group
          ? t("settingsV241.heroTitle", { name: group.name })
          : t("settings.title")
      }
      subtitle={t("settingsV241.heroSubtitle")}
      mobileTitle="Paramètres"
      back={{ href: `/dashboard/groups/${groupId}` }}
      primaryAction={
        <Link
          href={`/dashboard/groups/${groupId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 13px",
            background: "transparent",
            border: "1px solid var(--line, #EAD9B8)",
            borderRadius: 10,
            color: "var(--cocoa-soft, #6B5A47)",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ↩ {t("group.hub.backToHub") || "Retour au hub"}
        </Link>
      }
    >
      {loading || !group ? (
        <p
          style={{
            padding: 40,
            color: "var(--cocoa-soft, #6B5A47)",
            textAlign: "center",
          }}
        >
          {t("common.loading")}
        </p>
      ) : (
        <DesktopGroupSettingsV241View groupId={groupId} />
      )}
    </ResponsiveShell>
  );
}
