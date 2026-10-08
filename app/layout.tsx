import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bangers, Dela_Gothic_One, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site-info";

const GTM_ID = "GTM-ML8C2V72";
const GA_ID = "G-C2H21VCJ2T";

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

const title = "Seafood Sanji - Interactive One Piece Culinary Journey & Recipes";
const description = SITE_DESCRIPTION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  verification: {
    google: "eXeVtnOJdRehcT75pKnPb4OJSiaI4xq2yinFA3wkheU",
  },
  title,
  description,
  keywords: ["seafood sanji", "sanji seafood", "sanji sea kitchen", "one piece recipes", "sanji cooking game"],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    title: "Seafood Sanji - Interactive Manga Culinary Journey",
    description: "Join Sanji in the kitchen for an interactive One Piece culinary experience.",
    siteName: SITE_NAME,
    url: "/",
    locale: "en_US",
    images: [{ url: "/images/sanji_sequence_10.webp", width: 1479, height: 900, alt: "Seafood Sanji presenting a fresh seafood casserole in his sea kitchen" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/sanji_sequence_10.webp"],
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
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());

gtag('config', '${GA_ID}');`}
        </Script>
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      </head>
      <body className="min-h-dvh">
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": `${SITE_URL}/#website`,
          url: `${SITE_URL}/`,
          name: SITE_NAME,
          description,
          inLanguage: ["en", "ja"],
        }).replace(/</g, "\\u003c") }} />
      </body>
    </html>
  );
}
