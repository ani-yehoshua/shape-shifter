"use client";

import { AuthProvider } from "@/lib/contexts/AuthContext";
import { PreferencesProvider } from "@/lib/contexts/PreferencesContext";
import SupabaseProvider from "@/components/SupabaseProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SupabaseProvider>
            <AuthProvider>
                <PreferencesProvider>{children}</PreferencesProvider>
            </AuthProvider>
        </SupabaseProvider>
    );
}
