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
import Constants from 'expo-constants';
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
import { auth } from '../services/firebase';
import {
  getOrCreateDeviceId,
  listSessions,
  otherRecentSessions,
} from '../services/deviceSession';

function platformLabel(platform) {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  if (platform === 'web') return 'Web';
  return platform || 'Unknown';
}

function formatLastSeen(iso) {
  if (!iso) return 'unknown';
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return String(iso);
  }
}

function appAboutInfo() {
  const expoConfig = Constants.expoConfig || Constants.manifest || {};
  const version =
    expoConfig.version ||
    Constants.nativeAppVersion ||
    '1.0.0';
  const rawSdk = expoConfig.sdkVersion || Constants.manifest?.sdkVersion;
  const sdkVersion = rawSdk ? String(rawSdk).replace(/\.0$/, '') : '57';
  const name = expoConfig.name || 'TimelineApp';
  return { version, sdkVersion, name };
}

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
  const [thisDeviceId, setThisDeviceId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const about = appAboutInfo();

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

  const loadSessions = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setSessions([]);
      setThisDeviceId(null);
      return;
    }
    setSessionsLoading(true);
    try {
      const id = await getOrCreateDeviceId();
      setThisDeviceId(id);
      const listed = await listSessions(uid);
      setSessions(listed);
    } catch (e) {
      console.warn('Could not load signed-in devices in Settings', e);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadSessions();
    }, [load, loadSessions])
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

  const showComingLater = (feature) => {
    notify('Coming later', feature + ' will be available in a future update.');
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

  const thisSession = sessions.find((s) => s.id === thisDeviceId);
  const otherSessions = sessions.filter((s) => s.id !== thisDeviceId);
  const recentOthers = otherRecentSessions(sessions, thisDeviceId);
  const otherCount = recentOthers.length;
  const signedIn = !!auth.currentUser?.uid;

  const renderSoonRow = (label, detail) => (
    <TouchableOpacity
      key={label}
      style={[
        styles.menuRow,
        { borderColor: colors.cardBorder, backgroundColor: colors.card, opacity: 0.72 },
      ]}
      onPress={() => showComingLater(detail || label)}
      activeOpacity={0.7}
    >
      <View style={styles.menuRowText}>
        <Text style={[styles.menuRowLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.soonBadge, { color: colors.faint }]}>Soon</Text>
      </View>
      <Text style={[styles.chevron, { color: colors.faint }]}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.bg }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.intro, { color: colors.faint }]}>
          Working preferences at the top. Account tools, coming-soon options, and About further down.
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

        <Text style={[styles.section, { color: colors.muted }]}>Account</Text>
        <Text style={[styles.hint, { color: colors.faint }]}>
          Signed-in devices use the same sessions list as Home (Firestore users/.../sessions).
        </Text>
        <View style={[styles.devicesSection, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
          <Text style={[styles.devicesTitle, { color: colors.text }]}>Signed-in devices</Text>
          {!signedIn ? (
            <Text style={[styles.deviceMeta, { color: colors.faint }]}>Sign in to see devices for this account.</Text>
          ) : sessionsLoading && sessions.length === 0 ? (
            <Text style={[styles.deviceMeta, { color: colors.faint }]}>Loading devices…</Text>
          ) : (
            <>
              <View style={styles.deviceRow}>
                <Text style={[styles.deviceName, { color: colors.text }]}>
                  {platformLabel(thisSession?.platform || Platform.OS)}
                  <Text style={[styles.thisDevice, { color: colors.blueSoft }]}>  This device</Text>
                </Text>
                <Text style={[styles.deviceMeta, { color: colors.faint }]}>
                  Last seen {formatLastSeen(thisSession?.lastSeen || new Date().toISOString())}
                </Text>
              </View>
              {otherSessions.map((s) => (
                <View key={s.id} style={styles.deviceRow}>
                  <Text style={[styles.deviceName, { color: colors.text }]}>{platformLabel(s.platform)}</Text>
                  <Text style={[styles.deviceMeta, { color: colors.faint }]}>
                    Last seen {formatLastSeen(s.lastSeen)}
                  </Text>
                </View>
              ))}
              {otherCount > 0 ? (
                <Text style={[styles.devicesNote, { color: colors.muted }]}>
                  Also signed in on {otherCount} other device{otherCount === 1 ? '' : 's'} recently.
                </Text>
              ) : null}
            </>
          )}
        </View>
        {renderSoonRow("Sync profile to Firestore", "Syncing profile to Firestore")}
        {renderSoonRow("Extra account", "Signing in with an extra account")}

        <Text style={[styles.section, { color: colors.muted }]}>Timeline</Text>
        {renderSoonRow("Custom event categories", "Custom event categories")}
        {renderSoonRow("Default add type", "Choosing a default add type")}
        {renderSoonRow("Food tracking", "Food tracking")}
        {renderSoonRow("Widgets", "Home screen widgets")}

        <Text style={[styles.section, { color: colors.muted }]}>Sharing & mail</Text>
        {renderSoonRow("Pick from Gmail", "Pick from Gmail")}
        {renderSoonRow("Share whole timeline", "Sharing the whole timeline")}
        {renderSoonRow("Notifications", "Notifications")}

        <Text style={[styles.section, { color: colors.muted }]}>Privacy</Text>
        {renderSoonRow("Who can see shared events", "Privacy controls for shared events")}
        {renderSoonRow("Export data", "Exporting your data")}

        <Text style={[styles.section, { color: colors.muted }]}>About</Text>
        <View style={[styles.aboutCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
          <Text style={[styles.aboutName, { color: colors.text }]}>{about.name}</Text>
          <Text style={[styles.aboutLine, { color: colors.muted }]}>Version {about.version}</Text>
          <Text style={[styles.aboutLine, { color: colors.muted }]}>Expo SDK {about.sdkVersion}</Text>
          <Text style={[styles.aboutLine, { color: colors.muted }]}>#kern2622</Text>
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
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  menuRowText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  soonBadge: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 8,
  },
  devicesSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  devicesTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  deviceRow: {
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
  },
  thisDevice: {
    fontSize: 13,
    fontWeight: '700',
  },
  deviceMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  devicesNote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  aboutCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  aboutName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  aboutLine: {
    fontSize: 14,
    lineHeight: 20,
  },
});
