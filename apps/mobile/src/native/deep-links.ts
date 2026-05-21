/**
 * Deep links / Universal Links (iOS) / App Links (Android).
 *
 * Quand un utilisateur clique sur un lien `https://backmesdo.com/join/<token>`
 * (envoyé via WhatsApp, SMS, email), le système ouvre directement l'app BMD
 * et router sur l'écran approprié — pas de passage par Safari/Chrome.
 *
 * Configuration native requise (Phase 3) :
 *  iOS — `ios/App/App/App.entitlements` :
 *    <key>com.apple.developer.associated-domains</key>
 *    <array>
 *      <string>applinks:backmesdo.com</string>
 *      <string>applinks:app.backmesdo.com</string>
 *    </array>
 *
 *  Android — `android/app/src/main/AndroidManifest.xml` :
 *    <intent-filter android:autoVerify="true">
 *      <action android:name="android.intent.action.VIEW" />
 *      <category android:name="android.intent.category.DEFAULT" />
 *      <category android:name="android.intent.category.BROWSABLE" />
 *      <data android:scheme="https" android:host="backmesdo.com" />
 *      <data android:scheme="https" android:host="app.backmesdo.com" />
 *    </intent-filter>
 *
 *  Côté backend (déjà configuré côté Vercel ou à ajouter dans `apps/web/public/`) :
 *    /.well-known/apple-app-site-association
 *    /.well-known/assetlinks.json
 *  Pour qu'Apple et Google valident l'association domaine ↔ app.
 */

import { App } from "@capacitor/app";

export interface DeepLink {
  /** URL complète (`https://backmesdo.com/join/abc123`). */
  url: string;
  /** Pathname uniquement (`/join/abc123`). */
  pathname: string;
  /** Query string parsée (`{ ref: "fb1" }`). */
  query: Record<string, string>;
}

function parseUrl(rawUrl: string): DeepLink | null {
  try {
    const u = new URL(rawUrl);
    const query: Record<string, string> = {};
    u.searchParams.forEach((v, k) => (query[k] = v));
    return { url: rawUrl, pathname: u.pathname, query };
  } catch {
    return null;
  }
}

export const deepLinks = {
  /**
   * Enregistre un handler. Retourne une fonction pour se désinscrire.
   * Utilisée principalement par le `MobileShell` côté PWA pour rediriger
   * vers la bonne route Next.js sans full reload.
   */
  onLink(handler: (link: DeepLink) => void): () => void {
    let active = true;

    const subscription = App.addListener("appUrlOpen", ({ url }) => {
      if (!active) return;
      const parsed = parseUrl(url);
      if (parsed) handler(parsed);
    });

    // Premier launch : si l'app a été ouverte VIA un deep link (cold start),
    // on récupère cette URL aussi.
    void App.getLaunchUrl().then((res) => {
      if (!active || !res?.url) return;
      const parsed = parseUrl(res.url);
      if (parsed) handler(parsed);
    });

    return () => {
      active = false;
      void subscription.then((s) => s.remove());
    };
  },
};
