/**
 * V144 — Helper centralisé pour le nom affiché d'un utilisateur.
 *
 * Règle métier décidée avec Fabrice (mai 2026) :
 *  - Chaque user a 2 champs : `displayName` (nom réel) et `nickname` (pseudo).
 *  - `displayPreference` = "NAME" (par défaut) ou "NICKNAME".
 *  - Si "NICKNAME" et `nickname` non vide → on affiche le pseudo.
 *  - Sinon → fallback automatique sur `displayName`.
 *  - L'admin d'un groupe NE PEUT PAS overrider ce choix (le user décide).
 *
 * IMPORTANT : tout endpoint qui retourne un user à un AUTRE user (liste
 * membres d'un groupe, contributeur d'un tour de tontine, payeur d'une
 * dépense, etc.) doit passer par `effectiveDisplayName()` avant de
 * sérialiser. Sinon on fuite le vrai nom d'un user qui voulait être vu
 * sous son pseudo.
 *
 * Exception : un user voit toujours son propre vrai nom (dans son profil),
 * peu importe sa préférence.
 */

export interface NamedUserLike {
  displayName: string;
  nickname?: string | null;
  displayPreference?: string | null;
}

/**
 * Retourne le nom à afficher pour un user selon sa préférence.
 *
 * @param user objet contenant displayName + (optionnel) nickname + displayPreference
 * @returns le pseudo si pref="NICKNAME" et pseudo défini, sinon displayName
 */
export function effectiveDisplayName(user: NamedUserLike): string {
  const pref = (user.displayPreference ?? "NAME").toUpperCase();
  const nickname = (user.nickname ?? "").trim();
  if (pref === "NICKNAME" && nickname.length > 0) {
    return nickname;
  }
  return user.displayName;
}

/**
 * Renvoie un nouvel objet user avec `displayName` remplacé par le pseudo si
 * la préférence le demande. Pratique pour masquer côté API toute trace du
 * vrai nom dans une liste membres ou un tour de tontine.
 *
 * @example
 *   const safeMember = withEffectiveDisplayName(rawMember);
 *   // safeMember.displayName est maintenant le pseudo si applicable
 */
export function withEffectiveDisplayName<T extends NamedUserLike>(user: T): T {
  const effective = effectiveDisplayName(user);
  if (effective === user.displayName) return user;
  return { ...user, displayName: effective };
}
