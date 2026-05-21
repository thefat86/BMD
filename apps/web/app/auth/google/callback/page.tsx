"use client";

/**
 * Page de retour OAuth Google.
 * URL appelée par Google après autorisation : /auth/google/callback?code=...&state=...
 *
 * Workflow :
 *  1. On lit `code` et `state` dans l'URL
 *  2. On vérifie que `state` correspond à celui qu'on a stocké en sessionStorage
 *  3. On POST au backend pour échanger le code contre un JWT BMD
 *  4. On stocke le JWT et on redirige vers le dashboard
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, setToken, invalidateMeCache } from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { clearGoogleState, readGoogleState } from "@/lib/google-sso";
import { useT } from "@/lib/i18n/app-strings";

export default function GoogleCallbackPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState(t("auth.googleValidating"));

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    if (oauthError) {
      setError(
        new Error(
          oauthError === "access_denied"
            ? t("auth.googleAccessDenied")
            : t("auth.googleErrorResponse", { error: oauthError }),
        ),
      );
      return;
    }

    if (!code || !state) {
      setError(new Error(t("auth.googleIncomplete")));
      return;
    }

    // Vérifie le state local (CSRF — défense en profondeur, le backend revérifie aussi)
    const storedState = readGoogleState();
    if (storedState && storedState !== state) {
      setError(
        new Error(t("auth.googleCSRFError")),
      );
      return;
    }

    (async () => {
      try {
        setStatus(t("auth.googleExchanging"));
        const r = await api.googleSsoCallback(code, state);
        setToken(r.token);
        invalidateMeCache();
        clearGoogleState();
        setStatus(t("auth.googleWelcome"));
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
              {t("auth.googleInterrupted")}
            </h1>
            <ApiErrorAlert error={error} />
            <Link
              href="/login"
              className="mt-4 inline-block rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 font-medium transition"
            >
              {t("auth.googleBackLink")}
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

