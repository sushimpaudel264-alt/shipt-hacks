import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codelingo: learn anywhere, even offline",
  description: "Learn coding, math and science with short interactive lessons and coding games. Install the app and keep learning offline.",
  applicationName: "Codelingo",
  icons: {
    icon: [
      { url: "/logo-96.png", sizes: "96x96", type: "image/png" },
      { url: "/logo-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Codelingo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4fb" },
    { media: "(prefers-color-scheme: dark)", color: "#110f1d" },
  ],
};

// Runs before the app: applies the saved light/dark choice (key matches THEME_KEY in
// lib/codesprout/app.js) and keeps the browser's install offer, which can fire before the
// app has loaded, so the "Install app" button can use it later.
const bootScript = `(function(){try{var t=localStorage.getItem("codesprout-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__codelingoInstall=e;window.dispatchEvent(new Event("codelingo:install"))});
window.addEventListener("appinstalled",function(){window.__codelingoInstall=null;window.dispatchEvent(new Event("codelingo:install"))})})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        {/* Self-hosted fonts (public/fonts) so text looks right offline. */}
        <link rel="preload" href="/fonts/dm-sans.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
