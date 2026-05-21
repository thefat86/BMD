# 📊 Audit BMD vs Spécifications v2.0 — Mai 2026

Légende : ✅ fait · 🟡 partiel · ❌ manquant · 🔧 dépendance externe (config/budget)

---

## §1 — Vision & positionnement
✅ **Couvert** : pitch, problème, personas — c'est de la doc, pas du code.

---

## §2 — Personas
✅ Tous les cas d'usage Patricia / Mehdi / David / Comité Kouassi / Père Jean / Aïcha sont **techniquement adressables** par le moteur actuel (groupes typés TONTINE / COLOC / TRAVEL / EVENT / CLUB / PARISH / GENERIC + partages flexibles).

---

## §3 — Modules fonctionnels

### 3.1 Onboarding & comptes
| Item | État | Notes |
|---|---|---|
| OTP SMS / WhatsApp | 🟡 | Logique OTP ✅, **delivery réel** = console-log en dev. Twilio/Postmark non câblés 🔧 |
| Magic link email | ✅ | Implémenté `requestMagicLink` |
| 12 langues activables | 🟡 | **6 langues** dans les marketing-translations (FR, EN, ES, PT, AR, SW) + ZH, WO, AM ajoutées récemment = **9 / 12**. Manquent : LIN, Pidgin/Bamiléké, et la 12e |
| Onboarding contextuel "tu es ici pour quoi ?" | ✅ | `OnboardingModal` dans `lib/ui` |
| Choix langue par admin | 🟡 | Sélecteur user oui ; activation/désactivation côté console admin = ❌ |
| Connexion WhatsApp Business optionnelle | ❌ | Bouton SSO WhatsApp natif non implémenté |

### 3.2 Module Groupes
| Item | État | Notes |
|---|---|---|
| Création par type (7 types) | ✅ | enum `GroupType` complet |
| Invitation lien WhatsApp | 🟡 | Lien partageable ✅ ; pré-rédaction WhatsApp = côté client à confirmer |
| Invitation QR code | ✅ | Token + page `/join/[token]` |
| Invitation numéro / email | ✅ | `inviteMember` + `batchInviteMembers` |
| Mode invité (sans compte) | ✅ | `SettlementPaymentToken` + page `/pay/[token]` (paiement). Onboarding invité complet à étoffer |
| Rôles : admin, trésorier, membre, observateur | ✅ | `MemberRole` enum + `assertRole` |
| Devise principale | ✅ | `Group.defaultCurrency` |
| Auto-conversion live | ❌ | **Pas de FX live** — les montants sont stockés dans la devise de la dépense, pas convertis |

### 3.3 Module Dépenses partagées
| Item | État | Notes |
|---|---|---|
| Saisie manuelle | ✅ | |
| Scan ticket OCR | 🟡 | Module `ocr` + parser ✅ ; **provider IA réel** (Mindee, OpenAI Vision) = stub à brancher 🔧 |
| Saisie vocale STT | ❌ | Pas de pipeline audio → IA |
| Import bancaire | 🟡 | **CSV import** ✅ (`importCsvExpenses`) ; **Open Banking / agrégation** ❌ |
| Catégorisation auto | 🟡 | Champ `category` libre, classification IA non implémentée |
| Modes de partage avancés | ✅ | EQUAL / UNEQUAL / PERCENTAGE / ITEMIZED |
| Historique chronologique | ✅ | `listExpenses` |
| Pièces jointes | ✅ | `ExpenseAttachment` + `attachments` module |
| Édition collaborative + journal d'audit | ✅ | `ActivityLog` avec **chaîne de hash immuable** |

### 3.4 Module Tontines
| Item | État | Notes |
|---|---|---|
| Création (montant, fréquence, ordre) | ✅ | `createTontine` |
| Tirage aléatoire / ordre manuel | ✅ | `RANDOM` / `MANUAL` |
| Cagnotte centralisée vs versements directs | ✅ | flag `centralizedPot` |
| Rappels J-7, J-3, J-1 | 🟡 | Notifications oui ; **scheduler cron** côté API non câblé 🔧 |
| Anti-fraude : double validation | ✅ | PENDING → PAID (contributeur) → CONFIRMED (bénéficiaire) |
| Journal immuable | ✅ | hash-chain `ActivityLog.prevHash/selfHash` |
| **Hui (enchères 標會)** | 🟡 | **Backend complet** : `placeBid`, `withdrawBid`, `listBids`, `closeBidding` ✅ — **UI** = ❌ (page tontine ne montre pas les boutons Miser/Clôturer) |
| Tontines transfrontalières multi-devises | ❌ | Pas de FX live → tontine 100% mono-devise pour l'instant |

### 3.5 Module Soldes & Règlements
| Item | État | Notes |
|---|---|---|
| Calcul solde par membre | ✅ | `getBalance` |
| Algo optimisation transactions | ✅ | `suggestions[]` dans la réponse |
| Solde global multi-groupes | ✅ | `getMyGlobalBalance` (avec `byCurrency`) |
| Bouton « Régler » | ✅ | `Settlement` model + UI |
| Confirmation 2 parties | ✅ | `confirmedByPayerAt` + `confirmedByPayeeAt` |
| Notifications de règlement | ✅ | `SETTLEMENT_PROPOSED` / `SETTLEMENT_CONFIRMED` |
| Choix moyen parmi 10+ | 🟡 | Champ libre `paymentMethod` + sélecteur visuel pas terminé |

### 3.6 ⭐ Swap de dettes
| Item | État | Notes |
|---|---|---|
| Détection croisée intra-groupe | ✅ | `proposeSwap` |
| Détection inter-groupes | ❌ | Spec demande inter-groupes, code = intra-groupe seul |
| Swap binaire (debt transfer A→C↔B) | ✅ | `DebtTransfer` model |
| Swap triangulaire / N-aire | ✅ | `DebtSwap` + `DebtSwapLeg` |
| Acceptation explicite par toutes parties | ✅ | `DebtSwapParticipant` |
| Délai 48h | ✅ | `expiresAt` |
| Audit log immuable | ✅ | journal partagé |
| Limité à Premium | 🟡 | Le flag `limits.debtSwap` existe sur `Plan` mais l'`assertFeatureEnabled("debtSwap")` n'est pas appelé dans les routes — **à câbler** |

### 3.7 ⭐ Partages flexibles
| Item | État | Notes |
|---|---|---|
| Mode "Couple uniquement" | ✅ | via UNEQUAL avec 2 parts |
| Mode "Tous les contributeurs" | ✅ | EQUAL |
| Mode "Membres choisis" | ✅ | UNEQUAL/PERCENTAGE avec sous-set + `SplitPreset` réutilisable |
| Mode "Parts inégales / %" | ✅ | UNEQUAL et PERCENTAGE |
| Suggestions IA | ❌ | Pas de modèle ML, pas d'apprentissage par groupe |
| Règles par catégorie | ❌ | |

### 3.8 IA · OCR & assistant
| Item | État | Notes |
|---|---|---|
| OCR ticket multilingue | 🟡 | Endpoint `/receipts/scan` ✅ ; backend = parser stub, pas de Mindee/OpenAI Vision branché 🔧 |
| IA conversationnelle vocal/texte | ❌ | |
| Suggestion de partage IA | ❌ | |
| Détection d'anomalies | ❌ | |
| Tonalité des rappels (sympa/ferme/humour/pro) | ✅ | `User.reminderTone` ; **utilisation dans la composition des messages** = à enrichir |

### 3.9 QR Code · Payer / Recevoir
| Item | État | Notes |
|---|---|---|
| QR universel "recevoir" | ❌ | Pas de générateur QR de réception |
| Compatibilité Lydia/Wave/Wise/etc. | 🔧 | Aucune intégration provider |
| Scan inverse (payer un user BMD) | ❌ | |
| QR durée limitée + signature crypto | ❌ | |

### 3.10 Bot WhatsApp
| Item | État | Notes |
|---|---|---|
| Tout le module | ❌ | **0 ligne** côté code. Spec demande: ajout natif, NLU, sync bidirectionnelle. Énorme chantier 🔧 dépendance Meta WABA |

### 3.11 Statistiques & exports
| Item | État | Notes |
|---|---|---|
| Tableau de bord (total, solde, top, évolution) | ✅ | dashboard +  charts |
| Graphiques 6/12/24 mois | 🟡 | composant `charts.tsx` présent ; granularité 24m à vérifier |
| Comparaisons par membre/cat/groupe | 🟡 | partiellement via `getBalance` + dashboard |
| Export PDF (premium) | 🟡 | **Page d'impression** `/print` ✅ (HTML imprimable via PWA) → l'utilisateur fait Cmd+P. Pas de génération PDF serveur |
| Export Excel | ❌ | |
| Reçus fiscaux automatiques | ✅ | Page `/dashboard/groups/[id]/tax-receipt` (CERFA-style) |

### 3.12 Notifications & rappels
| Item | État | Notes |
|---|---|---|
| Push mobile | ❌ | Pas de FCM/APNs |
| Email | 🔧 | provider non câblé |
| SMS | 🔧 | provider non câblé |
| WhatsApp | 🔧 | dépendance bot |
| In-app | ✅ | `Notification` model + `NotificationBell` |
| Tonalité paramétrable | ✅ | `User.reminderTone` |
| **Mode "Ne pas déranger"** par groupe | ✅ | `GroupMember.doNotDisturb` |
| Résumé hebdo automatique | ❌ | Pas de cron |

---

## §4 — Devises & spécificités africaines
| Item | État | Notes |
|---|---|---|
| 25 devises (18 africaines + 7 majeures) | 🟡 | Stockage devise libre (string) ; pas de **liste blanche** ni table de devises côté admin |
| Taux mid-market 60s + fallback | ❌ | Aucun service FX |
| Spécificités CFA (taux fixe EUR) | ❌ | Pas de gestion zone CFA |
| Maghreb / Afrique anglo / cas Paris↔Yaoundé↔Dakar | ❌ | Bloqué tant que FX absent |

➡️ **Gros chantier** : intégrer un provider FX (XE / OpenExchangeRates / Currencylayer) + table `Currency` + mid-rate + cache 60s.

---

## §5 — Moyens de paiement intégrés
| Item | État | Notes |
|---|---|---|
| Mobile Money (Orange/MTN/Wave/M-Pesa…) | ❌ | Aucune API câblée 🔧 |
| Lydia / Wero / Wise / Revolut / PayPal / etc. | ❌ | Idem 🔧 |
| Modèle commercial (affiliations) | ❌ | Pas de tracking ref/conversion |

L'app fonctionne aujourd'hui en **"orchestration sans paiement"** — l'utilisateur déclare avoir payé, l'autre confirme. C'est conforme à la stratégie spec ("pas de garde-fond — orchestration uniquement, paiements via partenaires régulés", §12). L'intégration des providers reste un chantier produit + business.

---

## §6 — Console admin

### 6.2 Pilotage
| Item | État | Notes |
|---|---|---|
| Dashboard temps réel | ✅ | `adminStats` + `/admin` page |
| Recherche/filtres users | ✅ | `adminListUsers` |
| Vue groupes & tontines | ✅ | `adminListGroups` |
| Journal des transactions | 🟡 | `adminActivity` ✅ ; filtres avancés 🟡 |

### 6.3 Forfaits & limitations
| Item | État | Notes |
|---|---|---|
| Configuration JSON depuis console | ✅ | `Plan.limits` JSON, éditable via `adminUpdatePlan` |
| Modifs en temps réel | ✅ | Cache plan-limits TTL 5 min (à doc) |
| Plan Découverte / Premium / Communauté | ✅ | seedés |
| Application des limites (groups, members, OCR) | ✅ | `assertCanCreateGroup`, etc. — **messages chaleureux** ✅ |
| Application des features booléennes | 🟡 | `assertFeatureEnabled` existe mais peu appelée (debtSwap, exportPdf à câbler) |

### 6.4 ⭐ Module Publicités
| Item | État | Notes |
|---|---|---|
| Modèle `AdsConfig` | ✅ | |
| Console admin (toggles) | ✅ | `AdminAdsBlock` |
| Plafonds, formats, catégories autorisées/bloquées | ✅ | |
| Diffusion réelle (AdMob/Meta) côté client | ❌ | Pas de SDK pub câblé 🔧 |

### 6.5 Module Devises & taux
| Tout | ❌ | Voir §4 |

### 6.6 Module Langues & traductions
| Item | État | Notes |
|---|---|---|
| 12 langues activables | 🟡 | 9 dans le code, pas de toggle admin |
| Éditeur ligne par ligne dans console | ❌ | Traductions hardcodées dans `marketing-translations.ts` |
| Suivi % complétude | ❌ | |
| Auto-traduction IA | ❌ | |
| Versioning / rollback | ❌ | |

### 6.7 ⭐ Éditeur de pages & contenus
| Tout | ❌ | Pas de CMS embarqué |

### 6.8 Charte & thèmes
| Item | État | Notes |
|---|---|---|
| Palette indigo & safran | ✅ | Tailwind config |
| Thèmes par communauté | ❌ | |
| Mode sombre / clair | 🟡 | Tailwind dark: classes posées partiellement |

### 6.9 Croissance
| Tout | ❌ | Pas d'affiliation/codes promo/A-B test |

### 6.10 Système
| Item | État | Notes |
|---|---|---|
| Rôles admin custom | ✅ | `AdminRole` model + CRUD |
| Journal d'audit immuable (chaîne hash) | ✅ | spec §3.6 §9.1 |
| Paramètres globaux | ❌ | Pas de table `Settings` |
| API & webhooks | ❌ | |

---

## §7 — Authentification

### 7.2 Méthodes de connexion
| Méthode | État |
|---|---|
| Numéro + OTP SMS | 🟡 (provider 🔧) |
| Numéro + OTP WhatsApp | 🟡 (provider 🔧) |
| Email + lien magique | ✅ |
| Email + OTP | ✅ |
| **SSO Google** | ❌ |
| **SSO Apple** | ❌ |
| WhatsApp natif | ❌ |
| Passkey / WebAuthn | ❌ |

### 7.3 Vérification contacts
| ✅ Tout couvert (vérif obligatoire, OTP 5 min, 3 essais, badge ✓/⚠) |

### 7.4 Multi-contacts
| ✅ jusqu'à 3 par type, contact principal |

### 7.5 Sécurité
| Item | État |
|---|---|
| Anti-bombing 5 OTP/h | ✅ |
| Détection SIM swap IA | ❌ |
| **2FA TOTP optionnelle Premium/Communauté** | ✅ |
| Sessions actives + révocation distante | ✅ |
| Notif nouvelle connexion device | 🟡 (modèle prêt, hook à câbler) |
| Anti-shoulder surfing 3D Touch | ❌ |

### 7.6 ⭐ Système d'invitation à cotiser
| Item | État | Notes |
|---|---|---|
| Lien WhatsApp pré-rédigé | 🟡 | Lien généré, pré-rédaction client à finir |
| QR code partageable | ✅ | |
| SMS court bmd.app/i/XXXX | 🟡 | Délivrance SMS dépend du provider 🔧 |
| Email template visuel | 🔧 | Idem |
| Partage natif iOS/Android | 🟡 | Web Share API à valider |
| Page d'accueil personnalisée | ✅ | `/join/[token]` |
| Cotiser sans compte | ✅ | `/pay/[token]` |
| Création compte auto post-paiement | 🟡 | À automatiser dans le flow |
| Suivi statut invitation | 🟡 | Modèle `GroupInviteToken.uses` ; page de suivi par admin = ❌ |
| Relance auto J+2/J+5/J+10 | ❌ | Cron manquant |
| Détection doublon contact | ✅ | |

---

## §8 — Espace client web

### 8.2 Architecture
| Item | État |
|---|---|
| Next.js + responsive + PWA | ✅ |
| API REST partagée 100% | ✅ |
| Sync temps réel | ✅ via **SSE** (alternative WebSocket — fonctionne, single-process) |
| Mode hors-ligne Service Worker | 🟡 | PWA register OK, stratégies cache à étoffer |
| Charte indigo & safran | ✅ |

### 8.3 Modules disponibles sur web
**~85% de parité atteinte.** Zones partielles : OCR drag-drop UX, vue calendrier tontine large, dashboards graphiques riches. Manque le bot WhatsApp config.

### 8.5 Sessions et continuité
| Item | État |
|---|---|
| **Connexion par scan QR depuis mobile** | ✅ | `/login/qr` + `/qr-login/[token]` |
| Session 30 jours | ✅ | `JWT_EXPIRES_IN=30d` |
| Déconnexion à distance | ✅ | `revokeSession` |
| Sync instantanée web↔mobile | ✅ | SSE |
| Notifs push web | ❌ | Pas de Web Push API |

### 8.6 Sécurité web
| Item | État |
|---|---|
| CSP / HSTS / cookies signés | 🟡 | Partiel — à durcir avant prod |
| Détection nouveau navigateur+pays | ❌ | |
| **Auto-déconnexion 30 min inactivité** | ✅ | `IdleLogout` component |
| Pas de données sensibles en localStorage | ✅ | seul le JWT |

---

## §9 — Exigences non fonctionnelles
| Item | État |
|---|---|
| TLS 1.3 | 🔧 (déploiement) |
| AES-256 au repos | ❌ | DB Postgres en clair (à activer en prod) |
| 2FA | ✅ |
| Tokenisation moyens de paiement | ❌ |
| RGPD : minimisation, droit à l'oubli | 🟡 | Pas de route `/gdpr/delete-me` |
| Audit log immuable | ✅ |
| Démarrage app < 2s | 🟡 (à mesurer) |
| OCR < 3s | 🔧 (dépend provider) |
| FX latence < 200 ms | ❌ |
| WCAG AA / RTL / dark / VoiceOver | 🟡 | Charte cohérente, audit a11y à faire |

---

## §10 — Roadmap : où on en est ?

| Phase | Spec | État effectif |
|---|---|---|
| 1. MVP | Auth, groupes, dépenses, soldes, 2 paiements | ✅ Fait (paiements = orchestration sans provider) |
| 2. IA & WhatsApp | OCR, vocal, bot, QR, multi-devises base | 🟡 OCR stubbé, **bot/vocal/QR/FX non faits** |
| 3. Tontines & diaspora | Tontines, MoMo, multi-langues, swap | 🟡 Tontines + Hui backend ✅, **MoMo ❌, langues 9/12, swap ✅** |
| 4. Console admin | Back-office complet | 🟡 Pilotage/forfaits/rôles/pubs ✅, **CMS pages ❌, devises ❌, langues éditeur ❌** |
| 5. Premium & scale | Freemium, monétisation, dashboards | 🟡 Plans ✅, gating partiel, **affiliations ❌** |

**Estimation** : on est au ~**60-65%** de la couverture fonctionnelle de la spec v2.0. Le tronc commun (auth, groupes, dépenses, tontines, swap, soldes, console admin de base) est solide. Les chantiers lourds restants sont **FX live + multi-devises**, **bot WhatsApp**, **intégrations paiement**, **CMS console**, **IA (OCR/STT/suggestions)**.

---

## 🎯 Top priorités recommandées

### 🥇 Quick wins (faisable cette semaine, sans dépendance externe)
1. **UI Hui** — afficher les boutons Miser/Clôturer dans `dashboard/groups/[id]/tontine` (backend prêt)
2. **SSO Google** — OAuth Web (Cloud Console + 2 routes API + 1 bouton login)
3. **Câbler `assertFeatureEnabled`** sur les routes Premium (debtSwap, export, etc.)
4. **3 langues manquantes** (LIN, Pidgin, et 1 autre) ou activation/désactivation côté admin
5. **Audit log → page admin** : exposer le journal d'actions admin (modèle prêt)

### 🥈 Moyennes (1-2 sprints)
6. **FX live** — intégrer OpenExchangeRates ou XE, table `Currency`, cache 60s, support multi-devises tontine
7. **Cron rappels** — J-7/J-3/J-1 tontines, résumé hebdo, expiration tokens
8. **Délivrance OTP réelle** — Twilio (SMS), Postmark/Resend (email), provider WhatsApp Cloud API
9. **CMS de traductions** — éditeur ligne par ligne dans `/admin/translations`
10. **Web Push** — VAPID keys + service worker push handler

### 🥉 Gros chantiers (multi-sprints, partenariats)
11. **Bot WhatsApp** — Meta WABA, NLU, commands
12. **OCR provider IA réel** — Mindee/Klippa ou OpenAI Vision
13. **Intégrations paiement** — au moins Lydia, Wave, M-Pesa (négocier avec partenaires)
14. **CMS pages drag-drop** — éditeur de contenus dans console admin
15. **RGPD complet** — droit à l'oubli, portabilité, consentements granulaires

---

## ✨ Bonus déjà faits qui ne sont pas dans la spec v2.0 explicitement
- 🔧 Système d'erreurs **chaleureux + parlant** (tip + action + sévérité) côté API et UI (refonte récente)
- 🔧 Composant `<ApiErrorAlert>` réutilisable
- 🔧 SSE pour temps réel (alternative robuste au WebSocket pour single-process)
- 🔧 Hash-chain audit log (au-delà de "immutable" simple)
- 🔧 Page d'impression PDF "ready-to-print" via PWA Cmd+P
