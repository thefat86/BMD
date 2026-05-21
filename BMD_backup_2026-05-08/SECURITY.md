# 🔐 Sécurité BMD

> Politique de sécurité, threat model, et checklist de déploiement.
> Ce document est vivant : à relire à chaque ajout de feature sensible.

## 1. Threat model

BMD manipule trois familles d'actifs sensibles :

| Actif | Sensibilité | Conséquence d'une fuite |
|-------|-------------|--------------------------|
| Soldes & dépenses entre amis | Moyenne | Atteinte à la vie privée |
| Numéros de téléphone & emails | Moyenne (RGPD) | Spam, phishing ciblé, SIM-swap |
| Tontines & swaps de dettes | Élevée | Risque financier direct, usurpation |
| Moyens de paiement (vault) | Critique | Fraude bancaire |
| Tokens OAuth (Google, Apple, Stripe) | Critique | Prise de contrôle compte / merchant |

Les attaquants typiques attendus : (1) script-kiddies / abus de l'API publique, (2) attaquants ciblant un utilisateur précis (ex-partenaire), (3) prises de contrôle de compte via SIM-swap, (4) fraudes financières via swap de dette.

## 2. Couches de défense en place

### 2.1 Authentification

- **Pas de mot de passe** — uniquement OTP à usage unique (5 min de TTL) hashés argon2 + pepper
- **Anti-bombing** : 5 OTP max par contact / heure (`OTP_RATE_LIMIT_PER_HOUR`)
- **Anti-brute-force OTP** : 3 tentatives max avant invalidation du code (`OTP_MAX_ATTEMPTS`)
- **Sessions JWT** : 30 jours, signées avec `JWT_SECRET` (≥32 chars, vérifié au boot via zod)
- **Révocation distante** : table `Session` avec `revokedAt` — déconnexion à distance depuis le profil
- **Passkeys (FIDO2)** : `WebAuthnChallenge` table avec anti-replay (challenge à usage unique, TTL 5 min)
- **SSO** : Google + Apple en Authorization Code flow, jamais Implicit. PKCE sur Apple.

### 2.2 Données sensibles

- **Vault paiement** : AES-256-GCM avec clé `PAYMENT_VAULT_KEY` (32 octets aléatoires)
- **OTP** : jamais stockés en clair (argon2 + `OTP_PEPPER` côté serveur)
- **Logs** : `pino` filtre automatiquement les champs `password`, `token`, `secret`, `otp`
- **PII en URL** : interdit — toutes les requêtes sensibles sont en POST/PATCH

### 2.3 Anti-fraude (modules financiers)

- **Audit log immuable** : table `AuditLog` append-only sur les opérations admin / paiements / swaps
- **Swap de dette** : 4-eyes approval — créateur ≠ approveur, et 1 step de confirmation pour le débiteur
- **Tontine** : soldes calculés serveur-side (pas de trust input client), `Decimal` partout (pas de float)
- **Webhooks Stripe** : signature `STRIPE_WEBHOOK_SECRET` vérifiée avant toute action
- **Webhooks WhatsApp** : signature `X-Hub-Signature-256` vérifiée via `WHATSAPP_APP_SECRET`

### 2.4 Anti-injection

- **SQL** : 100% Prisma (paramétrage automatique). Aucun `$queryRawUnsafe`.
- **XSS** : React échappe par défaut. Aucun `dangerouslySetInnerHTML` sauf dans `legal/*` (texte statique).
- **CSRF** : JWT en `Authorization: Bearer` (pas en cookie) → pas de CSRF surface
- **CORS** : `@fastify/cors` whiteliste `WEB_BASE_URL` uniquement
- **Headers sécu** : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (cf. `next.config.js`)

### 2.5 Rate limiting

- **OTP** : 5/h par contact (anti-bombing)
- **Login attempts** : 3 OTP avant invalidation
- **API publique** : protection au niveau infra (Cloudflare / nginx) — voir `DEPLOYMENT.md`

## 3. Checklist avant ouverture publique

### 🔒 Secrets

- [ ] Tous les secrets en placeholder dans `.env.example` (jamais de vraies valeurs)
- [ ] `JWT_SECRET` rotaté (32+ chars aléatoires) → `openssl rand -hex 32`
- [ ] `OTP_PEPPER` rotaté → `openssl rand -hex 32`
- [ ] `PAYMENT_VAULT_KEY` généré → `openssl rand -base64 32` et stocké dans secret manager
- [ ] Clés VAPID régénérées pour la prod
- [ ] `STRIPE_SECRET_KEY` en mode `sk_live_*` (pas `sk_test_*`)
- [ ] `STRIPE_WEBHOOK_SECRET` correspond bien à l'endpoint prod (pas l'endpoint local de dev)
- [ ] Secrets stockés dans : Vercel/Railway env vars (chiffrées au repos) — pas dans le code, pas dans `.env` committé
- [ ] `.env`, `.env.local`, `.env.production` dans `.gitignore` (vérifie `git ls-files | grep env`)

### 🌐 Network / Infra

- [ ] HTTPS forcé partout (HSTS activé)
- [ ] `WEB_BASE_URL` matche exactement le domaine prod (pas de http://, pas de wildcard)
- [ ] CORS limité à l'origine prod uniquement (pas `*`)
- [ ] DB en réseau privé (VPC) — pas exposée publiquement
- [ ] Backups DB chiffrés et testés (procédure de restore documentée)
- [ ] Monitoring : logs centralisés (Sentry / Logtail), alertes sur les 5xx > 1%

### 🛡️ Auth

- [ ] Mode `OTP_DELIVERY_MODE` = `auto` (PAS `console`) en prod
- [ ] Twilio / Resend / WhatsApp configurés ET testés (envoi réel d'OTP)
- [ ] Apple Services ID, Team ID, Key ID, .p8 → tous renseignés
- [ ] Google OAuth Client ID → en mode "Production" sur Google Console (pas "Testing")
- [ ] Passkeys : `rpID` matche le domaine prod (cf. `passkey.routes.ts`)
- [ ] Account inactive : tâche cron qui supprime les comptes inactifs > 3 ans (RGPD)
- [ ] Shadow users : tâche cron qui supprime les invités non-inscrits > 90 jours

### 💳 Paiement

- [ ] Stripe en mode live, webhook live configuré sur `https://api.backmesdo.com/webhooks/stripe`
- [ ] Test d'un paiement réel de bout en bout (création groupe EVENT à 29€)
- [ ] Test d'un webhook Stripe : `stripe trigger payment_intent.succeeded`
- [ ] Plan EVENT : retour visuel immédiat après paiement (pas de "waiting" >5s)
- [ ] Refund : procédure documentée (qui peut refund, sous quelles conditions)

### 🚨 Audit & RGPD

- [ ] DPO / contact privacy défini → `privacy@backmesdo.com` actif et monitoré
- [ ] Conditions d'utilisation + Politique de confidentialité publiées (`/legal/cgu`, `/legal/privacy`)
- [ ] Politique de cookies si tracker (mais BMD n'en a pas → exemption)
- [ ] Procédure d'export RGPD testée (request + livraison sous 30j)
- [ ] Procédure de suppression compte testée (in-app ou email → effective sous 30j)
- [ ] Liste des sous-traitants à jour dans `/legal/privacy`
- [ ] Registre des traitements RGPD à jour (si >250 employés ou données sensibles)

### 🔐 Code & dépendances

- [ ] `npm audit` → 0 vulnerability High/Critical sur tous les packages
- [ ] Dépendances à jour : `npm outdated` → pas de retard >1 majeure sur les libs sécu (argon2, jsonwebtoken)
- [ ] `tsc --noEmit` → 0 erreur sur api & web (cf. CI workflow `ci.yml`)
- [ ] Tests E2E qui couvrent le happy path login + paiement (cf. `e2e.yml`)
- [ ] Pas de `console.log` en prod sur l'API (filtré via `LOG_LEVEL=info` minimum)
- [ ] Pas de `TODO security` ou `FIXME security` non résolus dans le code (`grep -ri "TODO security"`)

## 4. En cas d'incident

### Procédure d'urgence

1. **Stop the bleed** : couper l'accès (variable d'env `MAINTENANCE_MODE=1` côté API → renvoie 503 sur tout sauf `/health`)
2. **Snapshot** : `pg_dump` immédiat de la DB avant tout rollback
3. **Identifier** : logs centralisés → quelle requête, quelle session, quel impact
4. **Notifier** : email à privacy@backmesdo.com + utilisateurs touchés (sous 72h obligation RGPD si fuite PII)
5. **Patcher** : créer une branche `hotfix/cve-YYYY-MM-DD`, déployer en priorité
6. **Post-mortem** : documenter dans `docs/post-mortems/YYYY-MM-DD.md`

### Rotation de secrets

Si un secret est compromis (leak GitHub, fuite logs, ex-employé) :

| Secret | Rotation | Impact utilisateur |
|--------|----------|-------------------|
| `JWT_SECRET` | Génère un nouveau, redémarre l'API | **Tous les users délogués** — ils retapent juste un OTP |
| `OTP_PEPPER` | Génère un nouveau, redémarre l'API | Aucun (les OTP en cours sont juste invalidés, max 5min) |
| `PAYMENT_VAULT_KEY` | ⚠️ Procédure de re-chiffrement requise | Aucune méthode de paiement sauvegardée n'est plus lisible si pas de migration |
| `STRIPE_SECRET_KEY` | Roll dans Dashboard Stripe + update env | Webhooks coupés ~30s pendant le swap |
| `WHATSAPP_APP_SECRET` | Régénère côté Meta + update env | Webhooks WhatsApp coupés pendant le swap |
| `GOOGLE_CLIENT_SECRET` | Régénère sur Google Cloud Console | Logins SSO Google échouent ~1min |

### Disclosure responsable

Tu as découvert une vulnérabilité ? Merci ! Écris-nous à **security@backmesdo.com** avant toute publication. On s'engage à :

- Accuser réception sous 48h
- Confirmer ou réfuter sous 7 jours
- Patcher sous 30 jours pour les vuln Medium+ (sous 7j pour Critical)
- Te créditer dans le `CHANGELOG.md` (si tu le souhaites)

## 5. Hors-scope (intentionnellement)

BMD MVP n'inclut PAS :

- 🚫 2FA TOTP (l'OTP couvre le besoin "facteur de possession")
- 🚫 Chiffrement E2E des messages (BMD n'est pas une messagerie)
- 🚫 Conformité PCI-DSS niveau marchand (Stripe la prend en charge — on ne stocke jamais de PAN)
- 🚫 Audit SOC 2 (à viser pour la v2 quand on aura des clients enterprise)

Ces gaps sont conscients et documentés. Si un cas d'usage nécessite l'un de ces éléments, ouvrir une issue.

---

_Dernière revue : 2026-05-07 — relire à chaque sprint sécu._
