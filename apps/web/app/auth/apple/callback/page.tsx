"use client";

/**
 * Page de retour OAuth Apple (Sign In with Apple).
 *
 * Apple POST normalement les paramètres en x-www-form-urlencoded vers
 * cette URL (response_mode=form_post). Comme Next.js sert cette page en GET,
 * on configure Apple pour qu'il redirige aussi via query string en dev,
 * ou on récupère les valeurs depuis l'URL.
 *
 * En production, il faudrait un endpoint serveur qui reçoit le POST et
 * redirige vers cette page avec ?code=...&state=...&user=...
 * Le contenu user (JSON optionnel à la 1ère connexion) doit être préservé.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, setToken, invalidateMeCache } from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { clearAppleState, readAppleState } from "@/lib/apple-sso";
import { useT } from "@/lib/i18n/app-strings";

export default function AppleCallbackPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState(t("auth.appleValidating"));

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const userJson = params.get("user");
    const oauthError = params.get("error");

    if (oauthError) {
      setError(
        new Error(
          oauthError === "user_cancelled_authorize"
            ? t("auth.appleCancelled")
            : t("auth.appleErrorResponse", { error: oauthError }),
        ),
      );
      return;
    }

    if (!code || !state) {
      setError(
        new Error(t("auth.appleIncomplete")),
      );
      return;
    }

    const stored = readAppleState();
    if (stored && stored !== state) {
      setError(
        new Error(t("auth.appleCSRFError")),
      );
      return;
    }

    // Apple ne renvoie le name qu'à la 1ère connexion, sous forme JSON
    let userName: string | undefined;
    if (userJson) {
      try {
        const u = JSON.parse(userJson) as {
          name?: { firstName?: string; lastName?: string };
        };
        const fn = u.name?.firstName?.trim() ?? "";
        const ln = u.name?.lastName?.trim() ?? "";
        userName = [fn, ln].filter(Boolean).join(" ") || undefined;
      } catch {
        /* ignore */
      }
    }

    (async () => {
      try {
        setStatus(t("auth.appleExchanging"));
        const r = await api.appleSsoCallback(code, state, userName);
        setToken(r.token);
        invalidateMeCache();
        clearAppleState();
        setStatus(t("auth.appleWelcome"));
        router.replace("/dashboard");
      } catch (e) {
        setError(e);
      }
    })();
  }, [params, router]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-amber-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white/95 backdrop-blur p-6 shadow-2xl">
        {error ? (
          <>
            <h1 className="text-xl font-semibold mb-3 text-slate-900">
              {t("auth.appleInterrupted")}
            </h1>
            <ApiErrorAlert error={error} />
            <Link
              href="/login"
              className="mt-4 inline-block rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 font-medium transition"
            >
              {t("auth.appleBackLink")}
            </Link>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"
            />
            <p className="text-slate-700">{status}</p>
          </div>
        )}
      </div>
    </main>
  );
}
