import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "Explore connections between people and companies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-slate-950">
      <head>
        <meta name="color-scheme" content="dark" />
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background:#020617}' }} />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
        <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] py-1 text-center text-[11px] text-slate-500">
          © 2026 John Dimm
        </footer>
      </body>
    </html>
  );
}
