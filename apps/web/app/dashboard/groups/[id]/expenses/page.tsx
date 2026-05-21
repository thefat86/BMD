"use client";

/**
 * V211.B — Route /dashboard/groups/[id]/expenses
 *
 * Sur desktop : rend DesktopGroupExpensesView (split 60/40 liste + détail).
 * Sur mobile : redirige vers la vue groupe principale (mobile-group-view
 * gère les dépenses de manière native, on n'a pas besoin de duplication).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, getToken } from "../../../../../lib/api-client";
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { DesktopGroupExpensesView } from "../../../../../lib/ui/desktop-group-expenses-view";
import { DesktopAddExpenseDrawer } from "../../../../../lib/ui/desktop-add-expense-drawer";
import {
  GroupSectionSkeleton,
  GroupSectionError,
} from "../../../../../lib/ui/group-section-states";
import { useT } from "../../../../../lib/i18n/app-strings";

export default function GroupExpensesPage() {
  const params = useParams() as { id: string };
  const groupId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const { isMobile } = useBreakpoint();
  // V215.E3 — Le drawer "Ajouter dépense" s'ouvre LOCALEMENT via ?action=add-expense
  // sur la page /expenses au lieu de naviguer vers le hub. Quand on ferme le
  // drawer on reste sur /expenses.
  const action = searchParams.get("action");
  // V245.B — Quand on arrive sur /expenses depuis le banner anti-doublon
  // (clic "Voir la dépense" dans le scan/voice), l'URL embarque `?expense=<id>`.
  // On lit cet ID et on le passe à la vue pour qu'elle présélectionne la
  // dépense correspondante au mount (au lieu de la première de la liste).
  const initialSelectedId = searchParams.get("expense");

  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  // V222.F — Snapshot backend des balances + suggestions (algo greedy serveur)
  // pour brancher la vue "Qui doit quoi" sur la source de vérité serveur.
  const [balanceSnapshot, setBalanceSnapshot] = useState<{
    balances: Array<{ userId: string; net: string }>;
    suggestions: Array<{ fromUserId: string; toUserId: string; amount: string }>;
  } | null>(null);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // V215.E3 — Extrait pour pouvoir refetch après création depuis le drawer
  // sans changer de page.
  // V222.F — Refetch aussi getBalance pour rafraîchir le panneau Qui doit quoi.
  const refresh = useCallback(async () => {
    try {
      const [g, ex, meRes, bal] = await Promise.all([
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.me(),
        api.getBalance(groupId).catch(() => null),
      ]);
      setGroup(g);
      setExpenses((ex as any) ?? []);
      setMe(meRes?.user ?? null);
      if (bal) setBalanceSnapshot(bal as any);
    } catch (e) {
      console.warn("refresh group expenses failed", e);
    }
  }, [groupId]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (isMobile) {
      // V211.B — Sur mobile, la vue groupe principale gère les dépenses
      // nativement (MobileGroupView). On y renvoie directement.
      router.replace(`/dashboard/groups/${groupId}`);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // V215.A2 — `api.me()` retourne { user }, pas `api.getMe()` qui n'existait
        // pas et faisait throw → expenses restait [] et group null → loading
        // infini. Fix : appeler le vrai endpoint.
        const [g, ex, meRes, bal] = await Promise.all([
          api.getGroup(groupId),
          api.listExpenses(groupId),
          api.me(),
          // V222.F — getBalance retourne {balances, suggestions} (sortie de
          // l'algo greedy backend). On l'utilise comme source de vérité.
          api.getBalance(groupId).catch(() => null),
        ]);
        if (cancelled) return;
        setGroup(g);
        setExpenses((ex as any) ?? []);
        setMe(meRes?.user ?? null);
        if (bal) setBalanceSnapshot(bal as any);
      } catch (e) {
        if (cancelled) return;
        console.warn("load group expenses failed", e);
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

  // V215.E3 — Ferme le drawer sans changer de page : on retire juste le
  // searchParam ?action mais on reste sur /expenses.
  function closeDrawer() {
    router.replace(`/dashboard/groups/${groupId}/expenses`);
  }

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
            t("group.expenses.loadError") ||
            "Impossible de charger les dépenses."
          }
          backHref={`/dashboard/groups/${groupId}`}
          backLabel={t("group.backToHub") || "↩ Retour au hub"}
          retryLabel={t("common.retry") || "Réessayer"}
        />
      ) : (
        <DesktopGroupExpensesView
          group={group}
          expenses={expenses}
          meId={me?.id}
          // V222.F — Snapshot backend des balances/suggestions, source de
          // vérité après tous les règlements confirmés. Le composant le
          // privilégie sur le calcul client.
          balanceSnapshot={balanceSnapshot}
          // V220.D — Permet au bouton Supprimer de refetch la liste après
          // suppression sans recharger toute la page.
          onChange={() => void refresh()}
          // V245.B — Présélectionne la dépense ciblée par le banner anti-doublon
          // (`?expense=<id>` dans l'URL).
          initialSelectedId={initialSelectedId}
        />
      )}
      {/* V215.E3 — Drawer ajouté DANS la page expenses (overlay local) pour
          que la fermeture nous laisse sur /expenses, pas sur le hub.
          V216.E — Support édition : ?action=add-expense&editId=<id>. */}
      {!loading && group && action === "add-expense" && (
        <DesktopAddExpenseDrawer
          group={group}
          me={me}
          onClose={closeDrawer}
          onCreated={() => {
            void refresh();
            closeDrawer();
          }}
          editingExpense={(() => {
            const editId = searchParams.get("editId");
            if (!editId) return undefined;
            const found = expenses.find((e: any) => e.id === editId);
            return found as any;
          })()}
        />
      )}
    </ResponsiveShell>
  );
}
