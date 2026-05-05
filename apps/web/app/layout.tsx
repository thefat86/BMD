import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./pwa-register";
import { ToastProvider } from "../lib/ui/toast";
import { IdleLogout } from "../lib/ui/idle-logout";

export const metadata: Metadata = {
  title: "BMD · Back Mes Do",
  description: "L'argent partagé. L'amitié protégée. Tontines, colocs, voyages — sans drama.",
  manifest: "/manifest.json",
  applicationName: "BMD",
  appleWebApp: {
    capable: true,
    title: "BMD",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0E0B14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
        <IdleLogout />
      </body>
    </html>
  );
}
