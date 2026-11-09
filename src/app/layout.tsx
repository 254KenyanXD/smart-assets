import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Instrument_Sans } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";

import { InstallPrompt } from "@/components/install-prompt";

import "./globals.css";

const dm = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });
const geist = Geist_Mono({ subsets: ["latin"], variable: "--font-geist" });

const themeBoot = `try{if(sessionStorage.getItem("sa-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export const metadata: Metadata = {
  applicationName: "University Smart-Assets",
  title: "University Smart-Assets",
  description: "Sign in with your university email.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "University Smart-Assets",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#F1F4EF",
};

/**
 * Root shell. A cold visit stays bright. Dark mode is only the visit switch.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className={`${dm.variable} ${instrument.variable} ${geist.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <SerwistProvider
          swUrl="/sw.js"
          disable={process.env.NODE_ENV !== "production"}
          cacheOnNavigation={false}
        >
          {children}
          <InstallPrompt />
        </SerwistProvider>
      </body>
    </html>
  );
}
