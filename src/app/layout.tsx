import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz", "SOFT"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Vaultly", template: "%s · Vaultly" },
  description: "Vaultly keeps your files: upload, organize, version, share and ask AI about them.",
  applicationName: "Vaultly",
  // Private file storage should not be indexed.
  robots: { index: false, follow: false },
  openGraph: {
    title: "Vaultly",
    description: "Personal cloud storage with versioning, sharing and AI search.",
    siteName: "Vaultly",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f1e8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
