'use client';

import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'arial', 'sans-serif']
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Browser Use - Electron App</title>
        <meta name="description" content="Browser Use Electron Application" />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          <header className="bg-blue-600 text-white p-4 shadow-md">
            <h1 className="text-2xl font-bold">Browser Use Agent</h1>
          </header>
          <main className="flex-grow p-4">
            {children}
          </main>
          <footer className="bg-gray-100 p-4 text-center text-gray-600 text-sm">
            <p>© 2025 Browser Use - Powered by Electron & Next.js</p>
          </footer>
        </div>
      </body>
    </html>
  );
} 