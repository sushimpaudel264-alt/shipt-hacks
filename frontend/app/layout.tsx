import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Codelingo: learn anywhere, even offline",
  description: "Learn coding, math and science with short interactive lessons. Download courses and keep learning offline.",
  icons: {
    icon: [
      { url: "/logo-96.png", sizes: "96x96", type: "image/png" },
      { url: "/logo-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/logo-192.png",
  },
};

// Applies the saved light/dark choice before first paint (key matches THEME_KEY in lib/codesprout/app.js).
const themeScript = `(function(){try{var t=localStorage.getItem("codesprout-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
