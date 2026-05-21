"use client";

/**
 * V211.F — Route /dashboard/groups/[id]/activity
 *
 * Desktop : DesktopGroupActivityView (feed 2/1).
 * Mobile : redirige vers la vue groupe principale.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getToken } from "../../../../../lib/api-client";
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { DesktopGroupActivityView } from "../../../../../lib/ui/desktop-group-activity-view";
import { useT } from "../../../../../lib/i18n/app-strings";

export default function GroupActivityPage() {
  const params = useParams() as { id: string };
  const groupId = params.id;
  const router = useRouter();
  const t = useT();
  const { isMobile } = useBreakpoint();

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
        <DesktopGroupActivityView group={group} />
      )}
    </ResponsiveShell>
  );
}
