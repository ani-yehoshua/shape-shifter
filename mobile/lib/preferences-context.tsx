// Port of ../../lib/contexts/PreferencesContext.tsx on the website. Same
// two persisted preferences (handedness, default tuning), same
// "pref_handedness"/"pref_tuning" storage keys so a signed-in user's stored
// values would round-trip identically if this ever synced through the
// backend -- just AsyncStorage instead of localStorage, and reads are async
// here (there's no synchronous storage on RN), so consumers see the
// defaults for one tick before the persisted values load in.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Handedness = 'right' | 'left';

type PreferencesContextValue = {
    handedness: Handedness;
    setHandedness: (h: Handedness) => void;
    tuningName: string;
    setTuningName: (name: string) => void;
};

const HANDEDNESS_KEY = 'pref_handedness';
const TUNING_KEY = 'pref_tuning';

const PreferencesContext = createContext<PreferencesContextValue>({
    handedness: 'right',
    setHandedness: () => {},
    tuningName: 'Standard',
    setTuningName: () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [handedness, setHandednessState] = useState<Handedness>('right');
    const [tuningName, setTuningNameState] = useState('Standard');
    const loaded = useRef(false);

    useEffect(() => {
        (async () => {
            const [storedHandedness, storedTuning] = await Promise.all([
                AsyncStorage.getItem(HANDEDNESS_KEY),
                AsyncStorage.getItem(TUNING_KEY),
            ]);
            if (storedHandedness === 'left') setHandednessState('left');
            if (storedTuning) setTuningNameState(storedTuning);
            loaded.current = true;
        })();
    }, []);

    const setHandedness = (h: Handedness) => {
        setHandednessState(h);
        AsyncStorage.setItem(HANDEDNESS_KEY, h);
    };

    const setTuningName = (name: string) => {
        setTuningNameState(name);
        AsyncStorage.setItem(TUNING_KEY, name);
    };

    return (
        <PreferencesContext.Provider value={{ handedness, setHandedness, tuningName, setTuningName }}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    return useContext(PreferencesContext);
}
