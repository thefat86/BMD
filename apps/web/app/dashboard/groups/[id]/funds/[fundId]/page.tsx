"use client";

/**
 * V201 — Page route : /dashboard/groups/[id]/funds/[fundId]
 * =============================================================================
 * Détail d'une caisse projet. Wrapper qui récupère le user courant (pour
 * détecter rôle trésorier vs contributeur) et délègue à MobileFundDetailView.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../../../../lib/api-client";
import { ResponsiveShell } from "../../../../../../lib/ui/responsive-shell";
import { MobileFundDetailView } from "../../../../../../lib/ui/mobile-fund-detail-view";
import { DesktopFundDetailView } from "../../../../../../lib/ui/desktop-funds-views";
import { useBreakpoint } from "../../../../../../lib/use-breakpoint";
import { useT } from "../../../../../../lib/i18n/app-strings";

export default function FundDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const fundId = params.fundId as string;
  const t = useT();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const [meId, setMeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (!cancelled) setMeId(r.user.id);
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
  }, [router]);

  return (
    <ResponsiveShell
      breadcrumb={t("funds.detail.breadcrumb") || "Caisses › Détail"}
      desktopTitle={t("funds.detail.title") || "Détail de la caisse"}
      mobileTitle={t("funds.detail.title") || "Caisse"}
      back={{ href: `/dashboard/groups/${groupId}/funds` }}
    >
      {error && (
        <div style={{ padding: 20 }}>
          <p style={{ color: "var(--v45-terracotta, #9F4628)" }}>{error}</p>
        </div>
      )}
      {meId && (
        bpReady && !isMobile ? (
          <DesktopFundDetailView
            fundId={fundId}
            groupId={groupId}
            meId={meId}
          />
        ) : (
          <MobileFundDetailView
            fundId={fundId}
            groupId={groupId}
            meId={meId}
          />
        )
      )}
    </ResponsiveShell>
  );
}
