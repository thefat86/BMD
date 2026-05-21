"use client";

/**
 * V211.D — Route /dashboard/groups/[id]/meetings
 *
 * Desktop : DesktopGroupMeetingsView (split 40/60 + REC + summary IA).
 * Mobile : redirige vers la vue groupe principale.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, getToken } from "../../../../../lib/api-client";
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { DesktopGroupMeetingsView } from "../../../../../lib/ui/desktop-group-meetings-view";
import { useT } from "../../../../../lib/i18n/app-strings";

export default function GroupMeetingsPage() {
  const params = useParams() as { id: string };
  const groupId = params.id;
  const router = useRouter();
  const t = useT();
  const { isMobile } = useBreakpoint();
  // V219.A — Lit ?meetingId=... pour auto-sélectionner et ouvrir le modal
  // de revue après clic sur la notification "Réviser & appliquer".
  const searchParams = useSearchParams();
  const focusMeetingId = searchParams.get("meetingId");

  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
        const g = await api.getGroup(groupId);
        if (cancelled) return;
        setGroup(g);
      } catch {
        // silent
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
      {loading || !group ? (
        <div style={{ padding: 40, textAlign: "center", color: "#8B6F47" }}>
          {t("common.loading")}
        </div>
      ) : (
        <DesktopGroupMeetingsView
          group={group}
          autoSelectMeetingId={focusMeetingId}
        />
      )}
    </ResponsiveShell>
  );
}
