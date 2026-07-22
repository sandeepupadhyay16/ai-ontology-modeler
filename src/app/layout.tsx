import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-Assisted Ontology Modeler | Semantic Engine",
  description: "Create, import, visualize and co-author business domain ontologies with an interactive 3D WebGL Canvas and local AI models.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

