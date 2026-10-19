import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import {ThemeProvider} from '@/components/theme-provider';

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "NextKinHR — AI Staffing & Recruiting Intelligence",
  description:
    "Connecting top software engineering talent, recruiters, and forward-thinking clients. Discover curated opportunities, track hiring pipelines, and build exceptional teams in NextKinHR.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;550;600;650;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground">
        <ThemeProvider><TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-right" /></ThemeProvider>
      </body>
    </html>
  );
}
