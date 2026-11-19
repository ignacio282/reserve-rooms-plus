import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LiveProvider } from "@/app/_components/LiveProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reserve Rooms+",
  description: "Study and meeting rooms at Maple Hollow Public Library: book, check in, and see open time live.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg font-sans text-ink">
        <LiveProvider>{children}</LiveProvider>
      </body>
    </html>
  );
}
