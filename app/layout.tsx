import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";
import Wartungspause from "@/components/Wartungspause";
import AccessGate from "@/components/AccessGate";
import { AuthProvider } from "@/app/providers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flopper Gambling",
  description: "The best fake money gambling site",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isMaintenance = false;

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#1a2c38] text-[#b1bad3]`}>
        {isMaintenance ? (
          <Wartungspause />
        ) : (
          <AccessGate>
            <AuthProvider>
              <LayoutWrapper>
                {children}
              </LayoutWrapper>
            </AuthProvider>
          </AccessGate>
        )}
      </body>
    </html>
  );
}