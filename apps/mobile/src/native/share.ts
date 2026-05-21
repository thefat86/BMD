/**
 * Share — sheet native iOS / Android pour partager un lien d'invitation.
 *
 * Usage principal BMD : inviter un membre dans un groupe (tontine, voyage,
 * etc.) en partageant le lien `https://backmesdo.com/join/<token>`. La
 * sheet native propose WhatsApp / SMS / Mail / Copier / Plus — c'est ce
 * que les utilisateurs attendent et c'est ce qui maximise les conversions.
 *
 * iOS — UIActivityViewController, gratuit, pas de permission requise.
 * Android — Intent ACTION_SEND, idem.
 */

import { Share } from "@capacitor/share";

export interface ShareOptions {
  /** Titre de l'opération (visible dans certains targets, ex: mail). */
  title?: string;
  /** Texte principal — sur WhatsApp / SMS, c'est le corps du message. */
  text: string;
  /** URL à partager. Souvent dupliqué dans `text` pour les apps qui ne lisent que ça. */
  url?: string;
  /** Pour partage email seulement (peu utilisé en pratique). */
  dialogTitle?: string;
}

export const share = {
  async share(opts: ShareOptions): Promise<void> {
    await Share.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: opts.dialogTitle ?? "Partager via",
    });
  },
};
