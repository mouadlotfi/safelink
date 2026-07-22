import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary } from "@/components/error-boundary";
import { Navigation } from "@/components/navigation";
import { ToastProvider } from "@/components/toast";
export const metadata: Metadata = {
  title: "Safelink — Clean URLs",
  description: "Remove trackers from URLs and get alternative links for supported websites.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg"
  }
};

export const viewport = {
  themeColor: "#0a0a0b"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <ToastProvider>

          <Navigation />
          <main className="min-h-screen px-4 pb-24 pt-8 sm:px-6 lg:pl-64 lg:pr-8 lg:pt-12">
            <div className="mx-auto max-w-5xl">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
