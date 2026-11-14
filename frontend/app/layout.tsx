import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CodeLingoProvider } from "@/lib/hooks";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeLingo",
  description: "Download at school. Learn anywhere. Offline-first learning for students ages 8-16.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Data layer: React Query, local student, sync engine, service worker. Keep this wrapper. */}
        <CodeLingoProvider>{children}</CodeLingoProvider>
      </body>
    </html>
  );
}
