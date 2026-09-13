import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Expansor de fondos para cartas',
  description: 'Genera composiciones 3x3 expandidas a partir de ilustraciones de cartas coleccionables usando ComfyUI local.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
