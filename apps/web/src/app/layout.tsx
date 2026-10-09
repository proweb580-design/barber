import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { SiteChrome } from "@/components/site-chrome";
import { salon } from "@/data/mock";
import { themeInitScript } from "@/lib/theme-script";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${salon.name} — барбершоп в ${salon.city}`,
    template: `%s — ${salon.name}`,
  },
  description:
    "Мужские стрижки и борода в Ташкенте. Выберите услугу, мастера и свободное время.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      data-motion="luxury"
      className={`${manrope.variable} ${cormorant.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#f3eee6" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
