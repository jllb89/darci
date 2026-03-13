import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter, Roboto } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const maisonNeue = localFont({
  variable: "--font-maison",
  src: [
    { path: "../../public/fonts/maison/MaisonNeue-Light.ttf", weight: "300" },
    { path: "../../public/fonts/maison/MaisonNeue-Book.ttf", weight: "400" },
    { path: "../../public/fonts/maison/MaisonNeue-Medium.ttf", weight: "500" },
    { path: "../../public/fonts/maison/MaisonNeue-Demi.ttf", weight: "600" },
    { path: "../../public/fonts/maison/MaisonNeue-Bold.ttf", weight: "700" },
  ],
});

export const metadata: Metadata = {
  title: "DARCi - Fast, Secure Digital Notarization",
  description:
    "Notarize documents online in minutes with DARCi. Secure, compliant digital notarization with trusted identity verification and instant proof.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${roboto.variable} ${maisonNeue.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
