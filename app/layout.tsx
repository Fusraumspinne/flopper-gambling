import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";
import Wartungspause from "@/components/Wartungspause";
import AccessGate from "@/components/AccessGate";
import { AuthProvider } from "@/app/providers"
import Pause from "@/components/Pause";
import AdminBypass from "@/components/AdminBypass";
import { getWebsiteStatus } from "@/lib/websiteStatus";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const status = await getWebsiteStatus();
  const isMaintenance = status.isMaintenance;
  const isPause = status.isPaused;

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#1a2c38] text-[#b1bad3]`}>
        {isMaintenance ? (
          <AdminBypass isMaintenance>
            {children}
          </AdminBypass>
        ) : isPause ? (
          <AdminBypass isPause>
            {children}
          </AdminBypass>
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