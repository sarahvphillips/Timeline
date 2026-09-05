import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../themeContext';
import { MODES, PALETTES } from '../theme';
import HomeFab from '../components/HomeFab';
import {
  getProfile,
  saveProfile,
  getLabels,
  saveLabels,
  getPoemCategories,
  savePoemCategories,
} from '../services/profileService';
import { clearThisAccountLocalCache } from '../services/localCache';

export default function SettingsScreen({ navigation }) {
  const { mode, palette, scheme, colors, setMode, setPalette } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [labels, setLabels] = useState([]);
  const [poemCats, setPoemCats] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newPoemCat, setNewPoemCat] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheNotice, setCacheNotice] = useState('');

  const load = useCallback(async () => {
    const [profile, labs, cats] = await Promise.all([
      getProfile(),
      getLabels(),
      getPoemCategories(),
    ]);
    setDisplayName(profile.displayName);
    setDateOfBirth(profile.dateOfBirth);
    setLabels(labs);
    setPoemCats(cats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSaveProfile = async () => {
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      Alert.alert('Date of birth', 'Use YYYY-MM-DD, e.g. 1990-04-21.');
      return;
    }
    setSavingProfile(true);
    try {
      await saveProfile({ displayName, dateOfBirth });
      Alert.alert('Saved', 'Profile basics are saved on this device.');
    } catch {
      Alert.alert('Error', 'Could not save profile.');
    } finally {
      setSavingProfile(false);
    }
  };


  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(title + (message ? '\n\n' + message : ''));
      return;
    }
    Alert.alert(title, message);
  };

  const confirmAction = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return Promise.resolve(window.confirm(title + (message ? '\n\n' + message : '')));
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Clear', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleClearLocalCache = async () => {
    setCacheNotice('');
    const ok = await confirmAction(
      "Clear this account's local cache",
      "Removes only this signed-in account's events, Word-to-Int list, date spans, and profile photo saved on this device. Other accounts on this device stay untouched. Firestore / cloud data is not changed.",
    );
    if (!ok) return;
    setClearingCache(true);
    try {
      await clearThisAccountLocalCache();
      await load();
      const success =
        "Local cache cleared. This account's on-device lists are empty — open Timeline or Word to Int to confirm. Other accounts keep their local data.";
      setCacheNotice(success);
      notify('Local cache cleared', success);
    } catch (e) {
      const fail = e?.message || 'Please try again while signed in.';
      setCacheNotice('Could not clear: ' + fail);
      notify('Could not clear', fail);
    } finally {
      setClearingCache(false);
    }
  };

  const addToList = async (value, list, setter, saveFn, clear) => {
    const name = String(value || '').trim();
    if (!name) return;
    if (list.some((item) => item.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already there', name);
      return;
    }
    const next = await saveFn([...list, name]);
    setter(next);
    clear('');
  };

  const removeFromList = async (name, list, setter, saveFn) => {
    const next = await saveFn(list.filter((item) => item !== name));
    setter(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.bg }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.intro, { color: colors.faint }]}>
          Appearance, profile basics, labels, and poem categories. Saved on this device.
        </Text>

        <Text style={[styles.section, { color: colors.muted }]}>Profile</Text>
        <Text style={[styles.label, { color: colors.muted }]}>Display name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="How your name appears"
          placeholderTextColor={colors.faint}
        />
        <Text style={[styles.label, { color: colors.muted }]}>Date of birth</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.faint}
        />
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.blue }]}
          onPress={handleSaveProfile}
          disabled={savingProfile}
        >
          <Text style={styles.saveBtnText}>{savingProfile ? 'Saving…' : 'Save profile'}</Text>
        </TouchableOpacity>
        <Text style={[styles.hint, { color: colors.faint }]}>
          Profile photo is still changed from Home (tap the circle at the top).
        </Text>

        <Text style={[styles.section, { color: colors.muted }]}>Light / dark</Text>
        <Text style={[styles.hint, { color: colors.faint }]}>
          Now using {scheme} {mode === 'system' ? '(from this device)' : '(manual)'}.
        </Text>
        <View style={styles.row}>
          {MODES.map((item) => {
            const on = mode === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.chip,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                  on && { backgroundColor: colors.blue, borderColor: colors.blue },
                ]}
                onPress={() => setMode(item.id)}
              >
                <Text style={[styles.chipText, { color: on ? '#fff' : colors.text }]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>Colour scheme</Text>
        {PALETTES.map((item) => {
          const on = palette === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.palette,
                { borderColor: colors.cardBorder, backgroundColor: colors.card },
                on && { borderColor: colors.blue },
              ]}
              onPress={() => setPalette(item.id)}
            >
              <View style={[styles.swatch, { backgroundColor: colors.blue }]} />
              <Text style={[styles.paletteLabel, { color: colors.text }]}>{item.label}</Text>
              {on ? <Text style={[styles.onLabel, { color: colors.blueSoft }]}>On</Text> : null}
            </TouchableOpacity>
          );
        })}

        <Text style={[styles.section, { color: colors.muted }]}>Labels</Text>
        <Text style={[styles.hint, { color: colors.faint }]}>
          Used on poems and events. Tap a chip to remove it.
        </Text>
        <View style={styles.row}>
          {labels.map((lab) => (
            <TouchableOpacity
              key={lab}
              style={[styles.chip, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
              onPress={() => removeFromList(lab, labels, setLabels, saveLabels)}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{lab}  ×</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.flex, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder="New label"
            placeholderTextColor={colors.faint}
          />
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.blue }]}
            onPress={() => addToList(newLabel, labels, setLabels, saveLabels, setNewLabel)}
          >
            <Text style={styles.saveBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>Poem categories</Text>
        <View style={styles.row}>
          {poemCats.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
              onPress={() => removeFromList(cat, poemCats, setPoemCats, savePoemCategories)}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{cat}  ×</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.flex, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
            value={newPoemCat}
            onChangeText={setNewPoemCat}
            placeholder="New poem category"
            placeholderTextColor={colors.faint}
          />
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.blue }]}
            onPress={() => addToList(newPoemCat, poemCats, setPoemCats, savePoemCategories, setNewPoemCat)}
          >
            <Text style={styles.saveBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>Local cache</Text>
        <Text style={[styles.hint, { color: colors.faint }]}>
          Clears only this signed-in account's on-device events, Word-to-Int entries, date spans, and profile photo. Does not delete Firestore data or other accounts' local keys.
        </Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.danger || '#dc2626', opacity: clearingCache ? 0.6 : 1 }]}
          onPress={handleClearLocalCache}
          disabled={clearingCache}
        >
          <Text style={styles.saveBtnText}>
            {clearingCache ? 'Clearing…' : "Clear this account's local cache"}
          </Text>
        </TouchableOpacity>
        {!!cacheNotice && (
          <Text style={{ color: colors.text, marginTop: 10, lineHeight: 20 }}>{cacheNotice}</Text>
        )}

      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  section: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  flex: {
    flex: 1,
    marginBottom: 0,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  addBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: {
    fontWeight: '600',
    fontSize: 14,
  },
  palette: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  paletteLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  onLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
