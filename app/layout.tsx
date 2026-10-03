import type { Metadata, Viewport } from "next";
import { Bangers, Dela_Gothic_One, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

/* Bangers for the comic headings; Dela Gothic One covers the Japanese
   characters Bangers lacks; Noto Sans JP sets the body copy in both languages. */
const bangers = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bangers",
});

const dela = Dela_Gothic_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dela",
  preload: false,
});

const noto = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto",
});

const title = "Sanji's Sea Kitchen | Interactive Manga Culinary Journey";
const description =
  "Step inside the kitchen of the Straw Hat Pirates' legendary master chef. Explore Sanji's story-driven dishes, complete with localized ingredients, manga history, and secret culinary methods.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    title,
    description,
    siteName: "Sanji's Sea Kitchen",
  },
};

export const viewport: Viewport = {
  themeColor: "#FDFBF7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bangers.variable} ${dela.variable} ${noto.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
