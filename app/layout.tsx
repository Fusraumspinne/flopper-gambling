import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { WalletProvider } from "@/components/WalletProvider";

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
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#1a2c38] text-[#b1bad3]`}
      >
        <WalletProvider>
          <div className="flex min-h-screen">
            <Navbar />
            <main className="ml-[20%] w-[80%] min-h-screen">
              {children}
            </main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
