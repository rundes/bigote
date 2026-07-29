import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "bigote",
  description: "Gestión de proyectos, finanzas y espacios para tu organización",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className={`${figtree.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
