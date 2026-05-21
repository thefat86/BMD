"use client";

/**
 * V211.C — Route /dashboard/groups/[id]/members
 *
 * Desktop : DesktopGroupMembersView (tableau dense).
 * Mobile : redirige vers la vue groupe principale.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, getToken } from "../../../../../lib/api-client";
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { DesktopGroupMembersView } from "../../../../../lib/ui/desktop-group-members-view";
import { DesktopInviteDrawer } from "../../../../../lib/ui/desktop-invite-drawer";
import {
  GroupSectionSkeleton,
  GroupSectionError,
} from "../../../../../lib/ui/group-section-states";
import { useT } from "../../../../../lib/i18n/app-strings";

export default function GroupMembersPage() {
  const params = useParams() as { id: string };
  const groupId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const { isMobile } = useBreakpoint();

  const [group, setGroup] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // V228 — On charge aussi tontine + détail caisses pour pouvoir afficher
  // ligne à ligne le solde de chaque membre dans les 3 modules.
  const [tontine, setTontine] = useState<any | null>(null);
  const [fundDetails, setFundDetails] = useState<any[]>([]);

  // V215.E3 — Drawer Inviter ouvert en local via ?action=invite. La fermeture
  // nous laisse sur /members, pas sur le hub.
  const action = searchParams.get("action");

  // V215.E4 — Refresh local après ajout de membre pour qu'il apparaisse
  // INSTANTANÉMENT dans la liste sans avoir besoin de quitter+revenir.
  const refresh = useCallback(async () => {
    try {
      // V228 — Refetch les 3 sources en parallèle (Promise.all) :
      // group, balance, tontine, et liste+détail des caisses.
      const [g, b, tRes, fundsList] = await Promise.all([
        api.getGroup(groupId),
        api.getBalance(groupId),
        api.getTontine(groupId).catch(() => ({ tontine: null })),
        api.listProjectFunds(groupId).catch(() => []),
      ]);
      setGroup(g);
      setBalance(b);
      setTontine((tRes as any)?.tontine ?? null);
      if (fundsList.length > 0) {
        const details = await Promise.allSettled(
          fundsList.map((f: any) => api.getProjectFund(f.id)),
        );
        setFundDetails(
          details.map((d) => (d.status === "fulfilled" ? d.value : null)),
        );
      } else {
        setFundDetails([]);
      }
    } catch (e) {
      console.warn("refresh group members failed", e);
    }
  }, [groupId]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (isMobile) {
      router.replace(`/dashboard/groups/${groupId}`);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // V215.A2 — `api.me()` retourne { user }, pas `api.getMe()` (qui
        // n'existait pas → TypeError → group restait null → loading infini).
        // V228 — On ajoute tontine + funds détails pour les 3 colonnes de
        // solde par membre. Si l'un échoue on garde la page utilisable.
        const [g, b, meRes, tRes, fundsList] = await Promise.all([
          api.getGroup(groupId),
          api.getBalance(groupId),
          api.me(),
          api.getTontine(groupId).catch(() => ({ tontine: null })),
          api.listProjectFunds(groupId).catch(() => []),
        ]);
        if (cancelled) return;
        setGroup(g);
        setBalance(b);
        setMe(meRes?.user ?? null);
        setTontine((tRes as any)?.tontine ?? null);
        if (fundsList.length > 0) {
          const details = await Promise.allSettled(
            fundsList.map((f: any) => api.getProjectFund(f.id)),
          );
          if (!cancelled) {
            setFundDetails(
              details.map((d) => (d.status === "fulfilled" ? d.value : null)),
            );
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.warn("load group members failed", e);
        setLoadError(
          e instanceof Error ? e.message : String(e || "load_failed"),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, isMobile, router]);

  if (isMobile) return null;

  return (
    <ResponsiveShell
      breadcrumb={t("group.title") || "Groupes"}
      desktopTitle={group?.name ?? t("common.loading")}
      mobileTitle={group?.name ?? t("common.loading")}
      back={{ href: `/dashboard/groups/${groupId}` }}
      hideFab
    >
      {loading ? (
        <GroupSectionSkeleton label={t("common.loading") || "Chargement…"} />
      ) : !group ? (
        <GroupSectionError
          message={
            loadError ||
            t("group.members.loadError") ||
            "Impossible de charger les membres."
          }
          backHref={`/dashboard/groups/${groupId}`}
          backLabel={t("group.backToHub") || "↩ Retour au hub"}
          retryLabel={t("common.retry") || "Réessayer"}
        />
      ) : (
        <DesktopGroupMembersView
          group={group}
          balance={balance}
          meId={me?.id}
          tontine={tontine}
          fundDetails={fundDetails}
        />
      )}
      {/* V215.E3 + E4 — Drawer Inviter overlay sur la page /members. À la
          fermeture on reste sur /members. Au succès on refetch → le membre
          (ou l'invitation) apparaît immédiatement. */}
      {!loading && group && action === "invite" && (
        <DesktopInviteDrawer
          groupId={groupId}
          groupName={group.name}
          onClose={() => router.replace(`/dashboard/groups/${groupId}/members`)}
          onSent={() => {
            void refresh();
          }}
        />
      )}
    </ResponsiveShell>
  );
}

