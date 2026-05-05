"use client";
import Link from "next/link";

/**
 * Politique de confidentialité BMD — version courte mobile-friendly.
 *
 * ⚠️ Cette page est conçue pour être pédagogique et conforme RGPD au
 * niveau MVP. Avant d'ouvrir l'app à du public payant ou à grande
 * échelle, fais relire ce texte par un avocat spécialisé en données
 * personnelles (notamment pour la liste des sous-traitants, la durée
 * de conservation par catégorie, et le DPO si applicable).
 */
export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="between" style={{ marginBottom: 14 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "var(--cream-soft)",
          }}
        >
          ← Retour
        </Link>
        <span
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 18,
            color: "var(--cream)",
            fontWeight: 700,
          }}
        >
          BMD<span style={{ color: "var(--saffron)" }}>·</span>
        </span>
      </div>

      <div className="page-header">
        <div className="titles">
          <h1>🛡️ Politique de confidentialité</h1>
          <div className="sub">
            Dernière mise à jour : {new Date().toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>En 3 phrases</h2>
        <p
          style={{
            color: "var(--cream-soft)",
            lineHeight: 1.7,
            marginTop: 8,
            fontSize: 14,
          }}
        >
          BMD ne collecte que ce qui est strictement nécessaire pour gérer
          ton compte, tes groupes et tes invitations. <strong>Nous ne
          vendons pas tes données.</strong> Les contacts que tu invites ne
          sont pas conservés s'ils ne s'inscrivent pas.
        </p>
      </div>

      <div className="card">
        <h2>📥 Données collectées sur toi</h2>
        <ul
          style={{
            listStyle: "none",
            paddingLeft: 0,
            color: "var(--cream-soft)",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <li style={{ marginBottom: 8 }}>
            ✓ <strong>Identité</strong> : ton nom affiché (que tu choisis),
            ta langue préférée, ta devise par défaut.
          </li>
          <li style={{ marginBottom: 8 }}>
            ✓ <strong>Contacts</strong> : tes numéros de téléphone et
            adresses email vérifiés (jusqu'à 3 de chaque type), nécessaires
            pour la connexion sans mot de passe.
          </li>
          <li style={{ marginBottom: 8 }}>
            ✓ <strong>Activité dans BMD</strong> : groupes auxquels tu
            participes, dépenses ajoutées, soldes, tontines, swaps. Données
            techniques nécessaires au fonctionnement de l'app.
          </li>
          <li style={{ marginBottom: 8 }}>
            ✓ <strong>Sessions</strong> : appareils sur lesquels tu es
            connecté, pour pouvoir te déconnecter à distance en cas de
            besoin.
          </li>
          <li style={{ marginBottom: 8 }}>
            ✓ <strong>Logs techniques</strong> : adresse IP et user-agent
            des requêtes, conservés 30 jours pour la sécurité (détection de
            fraude / SIM-swap).
          </li>
          <li style={{ marginBottom: 8 }}>
            ✗ <strong>Pas de mot de passe</strong> stocké : on utilise des
            codes OTP à usage unique, hashés avec argon2.
          </li>
          <li>
            ✗ <strong>Pas de cookies de tracking</strong>, pas de Google
            Analytics, pas de pixels Facebook.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>📇 Quand tu invites un contact</h2>
        <p
          style={{
            color: "var(--cream-soft)",
            lineHeight: 1.7,
            fontSize: 13,
          }}
        >
          Quand tu choisis un contact dans ton répertoire (sur Android Chrome)
          ou que tu en saisis un manuellement :
        </p>
        <ul
          style={{
            listStyle: "none",
            paddingLeft: 0,
            color: "var(--cream-soft)",
            fontSize: 13,
            lineHeight: 1.7,
            marginTop: 10,
          }}
        >
          <li style={{ marginBottom: 8 }}>
            🔒 BMD ne lit <strong>jamais</strong> ton carnet d'adresses en
            entier. Le picker système te montre tes contacts, et seuls ceux
            que tu sélectionnes <em>explicitement</em> sont transmis à BMD.
          </li>
          <li style={{ marginBottom: 8 }}>
            📨 Pour chaque contact, on stocke uniquement le nom (que tu
            vois), le téléphone OU l'email, et le groupe où tu l'invites.
          </li>
          <li style={{ marginBottom: 8 }}>
            ⏳ Si l'invité <strong>ne s'inscrit pas dans les 90 jours</strong>,
            son enregistrement « shadow » est supprimé automatiquement.
          </li>
          <li>
            🚫 Le contact peut nous demander à tout moment de supprimer
            ses données par email à <strong>privacy@bmd.app</strong>. On le
            fait sous 30 jours.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>🔐 Sécurité</h2>
        <ul
          style={{
            listStyle: "none",
            paddingLeft: 0,
            color: "var(--cream-soft)",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <li style={{ marginBottom: 8 }}>
            ✓ Tout est chiffré en transit (HTTPS / TLS 1.3).
          </li>
          <li style={{ marginBottom: 8 }}>
            ✓ Les codes OTP sont hashés (argon2 + pepper), jamais en clair.
          </li>
          <li style={{ marginBottom: 8 }}>
            ✓ Anti-bombing : maximum 5 OTP par contact et par heure.
          </li>
          <li style={{ marginBottom: 8 }}>
            ✓ Sessions JWT révocables à distance (depuis ton profil).
          </li>
          <li>
            ✓ Audit log immuable de toutes les opérations sensibles (admin,
            paiements, swaps).
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>🌍 Sous-traitants techniques</h2>
        <p
          style={{
            color: "var(--cream-soft)",
            lineHeight: 1.7,
            fontSize: 13,
          }}
        >
          BMD utilise les services suivants pour fonctionner. Ils n'ont
          accès qu'aux données strictement nécessaires à leur rôle, et
          tous sont conformes RGPD :
        </p>
        <ul
          style={{
            listStyle: "none",
            paddingLeft: 0,
            color: "var(--cream-soft)",
            fontSize: 13,
            lineHeight: 1.7,
            marginTop: 10,
          }}
        >
          <li>📦 <strong>Hébergement</strong> : à définir lors du déploiement (Vercel pour le web, Fly.io ou Railway pour le backend, Supabase ou Neon pour la base de données — tous en région EU).</li>
          <li>📧 <strong>Email</strong> : Postmark (à venir, pour les liens magiques).</li>
          <li>📱 <strong>SMS</strong> : Twilio (à venir, pour les OTP).</li>
          <li>💬 <strong>WhatsApp</strong> : Meta WhatsApp Business API (à venir, optionnel).</li>
          <li>🔍 <strong>OCR de tickets</strong> : Tesseract (open-source, tourne sur notre serveur, aucun envoi externe).</li>
        </ul>
      </div>

      <div className="card">
        <h2>👤 Tes droits</h2>
        <p
          style={{
            color: "var(--cream-soft)",
            lineHeight: 1.7,
            fontSize: 13,
          }}
        >
          Conformément au RGPD, tu peux à tout moment :
        </p>
        <ul
          style={{
            listStyle: "none",
            paddingLeft: 0,
            color: "var(--cream-soft)",
            fontSize: 13,
            lineHeight: 1.7,
            marginTop: 10,
          }}
        >
          <li>📂 <strong>Accéder</strong> à toutes les données qu'on a sur toi (depuis ton profil ou par email).</li>
          <li>✏️ <strong>Rectifier</strong> ton nom, devise, langue, contacts (depuis ton profil).</li>
          <li>🗑️ <strong>Supprimer</strong> ton compte (par email pour le moment, fonction in-app à venir).</li>
          <li>📤 <strong>Exporter</strong> tes données dans un format portable (JSON / CSV — sur demande).</li>
          <li>🚫 <strong>Refuser</strong> certains traitements (ex. notifications push, à venir).</li>
        </ul>
        <p
          style={{
            color: "var(--cream-soft)",
            fontSize: 13,
            lineHeight: 1.7,
            marginTop: 10,
          }}
        >
          Pour exercer un de ces droits :{" "}
          <strong style={{ color: "var(--saffron)" }}>
            privacy@bmd.app
          </strong>
        </p>
      </div>

      <div className="card">
        <h2>⏱️ Durées de conservation</h2>
        <ul
          style={{
            listStyle: "none",
            paddingLeft: 0,
            color: "var(--cream-soft)",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <li>· Compte actif : tant que tu utilises BMD.</li>
          <li>· Compte inactif : suppression auto après 3 ans sans connexion.</li>
          <li>· Logs techniques : 30 jours.</li>
          <li>· Codes OTP : 5 minutes (puis hash invalidé).</li>
          <li>· Shadow users (invités non inscrits) : 90 jours.</li>
          <li>· Audit log financier : 5 ans (obligation légale comptable).</li>
        </ul>
      </div>

      <div className="card">
        <h2>📞 Contact</h2>
        <p
          style={{
            color: "var(--cream-soft)",
            lineHeight: 1.7,
            fontSize: 13,
          }}
        >
          Pour toute question liée à la vie privée, écris-nous à{" "}
          <strong style={{ color: "var(--saffron)" }}>
            privacy@bmd.app
          </strong>{" "}
          ou contacte la CNIL (
          <a
            href="https://www.cnil.fr/fr/plaintes"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--saffron)" }}
          >
            cnil.fr
          </a>
          ) si tu estimes que tes droits ne sont pas respectés.
        </p>
      </div>

      <p
        className="muted text-center"
        style={{ fontSize: 11, marginTop: 30, marginBottom: 20 }}
      >
        BMD · Back Mes Do · Conçu en France
        <br />
        Document non contractuel — relire avec un juriste avant ouverture
        au public.
      </p>
    </div>
  );
}
