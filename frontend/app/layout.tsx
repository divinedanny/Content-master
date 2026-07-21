import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Command Centre — one inbox for every platform",
  description:
    "Attention-first unified social inbox for conversational-commerce businesses. Built by Dayne Core Technologies.",
};

// Runs before paint so there is no flash of the wrong theme. Defaults to the
// system setting (light fallback); an explicit choice in localStorage wins.
const noFlashScript = `(function(){try{
var t=localStorage.getItem('cc_theme');
var eff=(t==='light'||t==='dark')?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var c=localStorage.getItem('cc_contrast')==='high'?'high':'normal';
var r=document.documentElement;r.dataset.theme=eff;r.dataset.contrast=c;
}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthGate>{children}</AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
