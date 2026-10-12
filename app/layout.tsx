import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
const inter=Inter({subsets:["latin"],variable:"--font-inter"});
const display=Cormorant_Garamond({subsets:["latin"],weight:["400","500"],variable:"--font-display"});
const mono=IBM_Plex_Mono({subsets:["latin"],weight:["400","500"],variable:"--font-ibm"});
export const metadata:Metadata={title:"Ghost Market: Monad Edition — Onchain Market Research",description:"Investigate real Kuru market events on Monad: live order flow, historical replay, evidence inspection and deterministic interpretation.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body className={`${inter.variable} ${display.variable} ${mono.variable} antialiased`}>{children}</body></html>}
