"use client";

/**
 * <CapacitorLinkInterceptor /> · V92 — Anti « Safari s'ouvre par-dessus l'app ».
 *
 * Problème : Capacitor iOS WKWebView, par défaut, intercepte les clics sur
 * `<a href>` qui pointent vers une URL avec un host différent du `server.url`
 * configuré. En dev, l'app charge `http://192.168.178.47:3000` mais Next.js
 * `<Link>` résout `/dashboard` en `http://192.168.178.47:3000/dashboard` —
 * même host, MAIS WKWebView considère parfois ces nav comme « externe » à
 * cause d'un edge case de `WKNavigationAction`. Résultat : Safari s'ouvre.
 *
 * Symptôme observé chez Fabrice : tap sur bouton « Profil » ou « Mes Groupes »
 * du bottom-nav mobile → Safari iOS s'ouvre par-dessus l'app avec
 * `http://192.168.178.47:3000/dashboard/profile`.
 *
 * Fix : intercepter TOUS les clics sur des `<a>` same-origin au niveau
 * document, faire `e.preventDefault()` + `router.push()` programmatique.
 * Le push utilise History API (pas de nav HTML) donc WKWebView ne déclenche
 * pas le comportement « external ».
 *
 * S'active UNIQUEMENT sur Capacitor (window.Capacitor.isNativePlatform()).
 * Sur web browser normal, le composant est no-op pour ne pas casser le
 * comportement standard (middle-click ouvre dans nouvel onglet, etc).
 *
 * Cibles ignorées (la nav externe est intentionnelle) :
 *   - Liens avec `target="_blank"`
 *   - Liens avec `download` attribute
 *   - Liens avec un protocole non-http (`mailto:`, `tel:`, `sms:`, ...)
 *   - Liens vers un host différent (vers stripe.com, apple.com, etc)
 *   - Click avec une touche modifier (cmd/ctrl/shift/alt) — comportement
 *     standard ouvre dans nouvel onglet, on respecte.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CapacitorLinkInterceptor(): null {
  const router = useRouter();

  useEffect(() => {
    // Skip côté web : aucune intercepton si pas Capacitor natif.
    if (typeof window === "undefined") return;
    const cap = (window as any).Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function") return;
    if (!cap.isNativePlatform()) return;

    function onClick(e: MouseEvent) {
      // Click avec modifier → comportement par défaut
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.defaultPrevented) return;

      // Remonte le DOM jusqu'à trouver un <a>
      let el = e.target as HTMLElement | null;
      while (el && el.nodeName !== "A") {
        el = el.parentElement;
      }
      if (!el) return;
      const a = el as HTMLAnchorElement;

      // Pas d'href = pas une nav
      const href = a.getAttribute("href");
      if (!href) return;

      // target="_blank" / download : nav externe voulue
      if (a.target && a.target !== "" && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;

      // Protocole non-http(s) → laisser passer (mailto:, tel:, sms:, etc)
      if (/^(mailto:|tel:|sms:|geo:|callto:)/i.test(href)) return;

      // Compare hosts : intercepte UNIQUEMENT si same-origin (donc nav app interne)
      let target: URL;
      try {
        target = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) {
        // Lien externe (stripe.com, etc) → laisser le browser gérer
        return;
      }

      // OK : c'est une nav app interne. On force le router programmatique
      // pour éviter que WKWebView ouvre Safari.
      e.preventDefault();
      const path = target.pathname + target.search + target.hash;
      router.push(path);
    }

    // useCapture: true → on attrape l'event AVANT que Next.js Link ne fasse
    // sa magie. Comme on preventDefault, le router programmatique nous prend
    // la main de manière cohérente.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
