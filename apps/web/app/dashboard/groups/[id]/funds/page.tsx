"use client";

/**
 * V201 — Page route : /dashboard/groups/[id]/funds
 * =============================================================================
 * Liste des Caisses Projet du groupe. Wrapper léger qui fetch le groupe
 * (pour récupérer membres + devise par défaut) et délègue à MobileFundsView.
 *
 * Si le module est désactivé (kill switch), MobileFundsView affiche un
 * placeholder « Bientôt disponible » sans appeler les routes Caisses.
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
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { MobileFundsView } from "../../../../../lib/ui/mobile-funds-view";
import { DesktopFundsListView } from "../../../../../lib/ui/desktop-funds-views";
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { useT } from "../../../../../lib/i18n/app-strings";

export default function FundsListPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const t = useT();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const [group, setGroup] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    api
      .getGroup(groupId)
      .then((g) => {
        if (!cancelled) setGroup(g);
      })
      .catch((e) => {
        if (cancelled) return;
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, router]);

  return (
    <ResponsiveShell
      breadcrumb={
        group ? `Groupes › ${group.name} › ${t("funds.title") || "Caisses"}` : "Caisses"
      }
      desktopTitle={t("funds.title") || "Caisses projet"}
      mobileTitle={t("funds.title") || "Caisses"}
      subtitle={
        group ? `${group.name} · ${group.defaultCurrency}` : undefined
      }
      back={{ href: `/dashboard/groups/${groupId}` }}
      primaryAction={
        !isMobile && group ? (
          <Link
            href={`/dashboard/groups/${groupId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              background: "transparent",
              border: "1px solid rgba(244,228,193,0.18)",
              borderRadius: 10,
              color: "var(--cream-soft)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ↩ {t("group.hub.backToHub") || "Retour au hub"}
          </Link>
        ) : undefined
      }
    >
      {error && (
        <div style={{ padding: 20 }}>
          <p style={{ color: "var(--v45-terracotta, #9F4628)" }}>{error}</p>
        </div>
      )}
      {group && (
        bpReady && !isMobile ? (
          // V204.A — Vue desktop dédiée (≥768px)
          <DesktopFundsListView
            groupId={groupId}
            members={group.members}
            defaultCurrency={group.defaultCurrency}
          />
        ) : (
          <MobileFundsView
            groupId={groupId}
            members={group.members}
            defaultCurrency={group.defaultCurrency}
          />
        )
      )}
    </ResponsiveShell>
  );
}
