/**
 * Network — état de la connectivité (online/offline, wifi vs cellular).
 *
 * Usage BMD :
 *  - Désactiver les actions qui nécessitent l'API (créer une dépense,
 *    valider un paiement) en cas d'offline, avec message chaleureux.
 *  - Synchroniser les changements en attente quand on repasse online.
 *  - Adapter la qualité de l'image OCR selon la connexion (compress plus
 *    fort en cellular vs wifi).
 */

import { Network } from "@capacitor/network";

type NetStatus = { connected: boolean; type: "wifi" | "cellular" | "none" | "unknown" };
type StatusHandler = (status: { connected: boolean }) => void;

export const network = {
  async status(): Promise<NetStatus> {
    const s = await Network.getStatus();
    return {
      connected: s.connected,
      type: (s.connectionType as NetStatus["type"]) ?? "unknown",
    };
  },

  onChange(handler: StatusHandler): () => void {
    const sub = Network.addListener("networkStatusChange", (s) => {
      handler({ connected: s.connected });
    });
    return () => void sub.then((s) => s.remove());
  },
};
