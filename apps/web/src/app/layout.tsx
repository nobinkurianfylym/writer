import "@fylym/ui/styles.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FYLYM Writer",
  description: "Screenwriting software a professional can trust.",
};

// Render dynamically so the per-request CSP nonce (middleware) is stamped onto
// Next's inline bootstrap scripts. This is a marketing-free authenticated app,
// so there's no static content to lose.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
