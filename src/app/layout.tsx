
import type { Metadata } from 'next';
import { Inter, Alegreya } from 'next/font/google';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { VoiceNoteProvider } from '@/components/voice-notes/voice-note-provider';
import { VoiceNoteDialog } from '@/components/voice-notes/voice-note-dialog';

// Configure optimized fonts
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const alegreya = Alegreya({
  subsets: ['latin'],
  variable: '--font-alegreya',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Designer's Ink Command Center",
  description: 'Professional command center for tracking billable hours, print jobs, and design tasks by Jeff Dillon.',
  openGraph: {
    title: "Designer's Ink Command Center",
    description: 'The ultimate ledger and task management tool for design professionals.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${alegreya.variable}`} suppressHydrationWarning>
      <body className="font-body antialiased" suppressHydrationWarning>
        <FirebaseClientProvider>
          <VoiceNoteProvider>
            {children}
            <VoiceNoteDialog />
            <Toaster />
          </VoiceNoteProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
