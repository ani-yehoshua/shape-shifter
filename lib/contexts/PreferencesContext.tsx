"use client";

import * as React from "react";

type Handedness = "right" | "left";

type PreferencesContextValue = {
    handedness: Handedness;
    setHandedness: (h: Handedness) => void;
    tuningName: string;
    setTuningName: (name: string) => void;
};

const PreferencesContext = React.createContext<PreferencesContextValue>({
    handedness: "right",
    setHandedness: () => {},
    tuningName: "Standard",
    setTuningName: () => {},
});

export function PreferencesProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [handedness, setHandednessState] = React.useState<Handedness>(() => {
        if (typeof window === "undefined") return "right";
        const stored = localStorage.getItem("pref_handedness");
        return stored === "left" ? "left" : "right";
    });

    const [tuningName, setTuningNameState] = React.useState(() => {
        if (typeof window === "undefined") return "Standard";
        return localStorage.getItem("pref_tuning") ?? "Standard";
    });

    const setHandedness = React.useCallback((h: Handedness) => {
        setHandednessState(h);
        localStorage.setItem("pref_handedness", h);
    }, []);

    const setTuningName = React.useCallback((name: string) => {
        setTuningNameState(name);
        localStorage.setItem("pref_tuning", name);
    }, []);

    return (
        <PreferencesContext.Provider
            value={{ handedness, setHandedness, tuningName, setTuningName }}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    return React.useContext(PreferencesContext);
}
