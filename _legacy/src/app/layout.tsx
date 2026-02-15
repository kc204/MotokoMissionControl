import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";
import TopNav from "@/components/TopNav";

const displaySans = Space_Grotesk({
  variable: "--font-display-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-code-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mission Control",
  description: "OpenClaw Agent Workforce Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${displaySans.variable} ${mono.variable} antialiased`}
      >
        <ConvexClientProvider>
          <div className="min-h-screen">
            <TopNav />
            <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-20 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
