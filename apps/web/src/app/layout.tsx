import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";

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
      <body className={`${displaySans.variable} ${mono.variable} antialiased`}>
        <ConvexClientProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col lg:ml-64">
              <TopNav />
              <main className="flex-1 overflow-auto bg-[#03050a]">
                {children}
              </main>
            </div>
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
