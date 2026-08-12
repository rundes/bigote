import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "bigote",
  description: "Gestión de proyectos, finanzas y espacios para tu organización",
};

export const viewport: Viewport = {
  // Mismo naranja que el chrome, para que la UI del browser en mobile no corte.
  themeColor: "#B44200",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className={`${figtree.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
