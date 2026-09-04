import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { getColors, loadThemePrefs, saveThemePrefs, onThemePrefsChanged } from './theme';

const ThemeContext = createContext({
  mode: 'system',
  palette: 'slate',
  scheme: 'dark',
  colors: getColors('dark', 'slate'),
  setMode: () => {},
  setPalette: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('system');
  const [palette, setPaletteState] = useState('slate');
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme() || 'dark');

  useEffect(() => {
    let cancelled = false;
    loadThemePrefs().then((prefs) => {
      if (cancelled) return;
      setModeState(prefs.mode);
      setPaletteState(prefs.palette);
    });
    const unsubPrefs = onThemePrefsChanged((prefs) => {
      if (cancelled) return;
      setModeState(prefs.mode);
      setPaletteState(prefs.palette);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme || 'dark');
    });
    return () => {
      cancelled = true;
      unsubPrefs();
      sub?.remove?.();
    };
  }, []);

  const persist = async (next) => {
    const saved = await saveThemePrefs({
      mode: next.mode ?? mode,
      palette: next.palette ?? palette,
    });
    setModeState(saved.mode);
    setPaletteState(saved.palette);
  };

  const value = useMemo(() => {
    const scheme = mode === 'light' || mode === 'dark' ? mode : systemScheme === 'light' ? 'light' : 'dark';
    return {
      mode,
      palette,
      scheme,
      colors: getColors(mode, palette),
      setMode: (nextMode) => persist({ mode: nextMode }),
      setPalette: (nextPalette) => persist({ palette: nextPalette }),
    };
  }, [mode, palette, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
