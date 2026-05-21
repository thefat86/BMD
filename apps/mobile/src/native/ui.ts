/**
 * UI natif — splash, status bar, keyboard.
 * Trois plugins légers regroupés ici parce qu'ils touchent à la coque visuelle.
 */

import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { Capacitor } from "@capacitor/core";

type KeyboardHandler = (info: { height: number; visible: boolean }) => void;
const keyboardHandlers = new Set<KeyboardHandler>();
let keyboardListenersAttached = false;

async function attachKeyboardListenersOnce(): Promise<void> {
  if (keyboardListenersAttached) return;
  if (Capacitor.getPlatform() === "web") return;
  keyboardListenersAttached = true;

  await Keyboard.addListener("keyboardWillShow", (info) => {
    keyboardHandlers.forEach((h) => h({ height: info.keyboardHeight, visible: true }));
  });
  await Keyboard.addListener("keyboardWillHide", () => {
    keyboardHandlers.forEach((h) => h({ height: 0, visible: false }));
  });
}

export const ui = {
  async hideSplash(): Promise<void> {
    if (Capacitor.getPlatform() === "web") return;
    // Animation fadeOut native pour douceur (pas un cut sec).
    await SplashScreen.hide({ fadeOutDuration: 300 });
  },

  async setStatusBarStyle(style: "dark" | "light"): Promise<void> {
    if (Capacitor.getPlatform() === "web") return;
    // BMD = mode dark only → status bar en mode `Dark` (texte clair sur fond sombre).
    // Ce paramètre détermine la couleur DU TEXTE, pas du fond.
    await StatusBar.setStyle({ style: style === "dark" ? Style.Dark : Style.Light });
  },

  onKeyboardChange(handler: KeyboardHandler): () => void {
    keyboardHandlers.add(handler);
    void attachKeyboardListenersOnce();
    return () => keyboardHandlers.delete(handler);
  },
};
