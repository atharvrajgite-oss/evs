import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolNet AI — P2P Rooftop Solar Router & Virtual Microgrid",
  description: "Virtual Microgrid Digital Twin, ML Solar Forecaster, Cedar Policy Engine & Dynamic Tariff Router",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#06090e] text-slate-100 min-h-screen selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
