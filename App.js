import React, { useState, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';

import { auth, onAuthStateChanged, signOut } from './src/services/firebase';
import { getMonthName } from './src/services/eventService';
import { syncEventsFromCloud, readLocalEvents, LAST_UID_KEY, beginAuthScope, EVENTS_FIRESTORE_SYNC_ENABLED } from './src/services/eventService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncWordNumbersFromCloud, beginAuthScope as beginWordNumbersAuthScope, WORD_NUMBERS_FIRESTORE_SYNC_ENABLED } from './src/services/wordToIntService';
import { beginAuthScope as beginSpansAuthScope } from './src/services/dateSpanService';
import { syncSettingsFromCloud } from './src/services/profileService';
import { loadThemePrefs, writeThemePrefsLocalOnly } from './src/theme';
import { registerThisDevice } from './src/services/deviceSession';
import { buildAppLinking } from './src/services/appLinking';
import ShareToTimeline from './src/share/ShareToTimeline';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import TimelineScreen from './src/screens/TimelineScreen';
import AddEventScreen from './src/screens/AddEventScreen';
import AddPoemScreen from './src/screens/AddPoemScreen';
import StarlinkCheckScreen from './src/screens/StarlinkCheckScreen';
import YearOverviewScreen from './src/screens/YearOverviewScreen';
import MonthOverviewScreen from './src/screens/MonthOverviewScreen';
import WeekOverviewScreen from './src/screens/WeekOverviewScreen';
import AddQrScreen from './src/screens/AddQrScreen';
import WordToIntScreen from './src/screens/WordToIntScreen';
import DateSpanScreen from './src/screens/DateSpanScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import EventsWithFriendsScreen from './src/screens/EventsWithFriendsScreen';
import ShareEventScreen from './src/screens/ShareEventScreen';
import AcceptInviteScreen from './src/screens/AcceptInviteScreen';
import { ThemeProvider, useTheme } from './src/themeContext';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
const shareLinking = buildAppLinking() || undefined;

function AppShell() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        setInitializing(false);
        if (firebaseUser) {
          const uid = firebaseUser.uid;
          // Invalidate any in-flight event / wordNumbers I/O from a previous account first.
          beginAuthScope(uid);
          beginWordNumbersAuthScope(uid);
          beginSpansAuthScope(uid);
          // Load this uid locally (cloud only if the matching Firestore sync flag is on).
          // Before @timeline_last_uid so legacy migration sees the previous uid.
          // Then record this login as last_uid for future sessions.
          Promise.all([
            syncEventsFromCloud(uid).catch((err) => {
              console.warn(
                EVENTS_FIRESTORE_SYNC_ENABLED
                  ? 'Event cloud sync failed'
                  : 'Event local load failed',
                err,
              );
            }),
            syncWordNumbersFromCloud(uid).catch((err) => {
              console.warn(
                WORD_NUMBERS_FIRESTORE_SYNC_ENABLED
                  ? 'Word-to-Int cloud sync failed'
                  : 'Word-to-Int local load failed',
                err,
              );
            }),
            syncSettingsFromCloud(uid).catch((err) => {
              console.warn('Settings cloud sync failed', err);
            }),
            registerThisDevice(uid).catch((err) => {
              console.warn('Device session register failed', err);
            }),
          ]).finally(() => {
            AsyncStorage.setItem(LAST_UID_KEY, uid).catch(() => {});
          });
        } else {
          beginAuthScope(null);
          beginWordNumbersAuthScope(null);
          beginSpansAuthScope(null);
          // Logged out: guest cache only — never leave the previous user's list active.
          readLocalEvents(null).catch(() => {});
          syncWordNumbersFromCloud(null).catch(() => {});
          syncSettingsFromCloud(null).catch(() => {});
          loadThemePrefs(null)
            .then((prefs) => writeThemePrefsLocalOnly(prefs, null))
            .catch(() => {});
        }
      });
    } catch (e) {
      setError(e?.message || 'Auth failed to start');
      setInitializing(false);
    }
    return () => {
      try {
        unsubscribe();
      } catch (_) {}
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Logout error:', e);
    }
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (initializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ShareToTimeline navigationRef={navigationRef} user={user}>
      <NavigationContainer ref={navigationRef} linking={shareLinking}>
        <ThemedStatusBar />
        <ThemedNavigator navKey={user?.uid || 'logged-out'}>
          {!user ? (
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ title: 'Timeline App – Login' }}
            />
          ) : (
            <>
              <Stack.Screen name="Home" options={{ title: 'Home' }}>
                {(props) => (
                  <HomeScreen {...props} user={user} onLogout={handleLogout} />
                )}
              </Stack.Screen>

              <Stack.Screen
                name="YearOverview"
                component={YearOverviewScreen}
                options={{ title: 'Timeline' }}
              />

              <Stack.Screen
                name="MonthOverview"
                component={MonthOverviewScreen}
                options={({ route }) => ({
                  title: String(route.params?.year || 'Months'),
                  headerBackTitle: 'Back',
                })}
              />


              <Stack.Screen
                name="WeekOverview"
                component={WeekOverviewScreen}
                options={({ route }) => ({
                  title:
                    route.params?.month != null
                      ? `${getMonthName(route.params.month)} ${route.params?.year || ''}`.trim()
                      : 'Weeks',
                  headerBackTitle: 'Back',
                })}
              />

              <Stack.Screen
                name="Timeline"
                component={TimelineScreen}
                options={{ title: 'Items' }}
              />

              <Stack.Screen
                name="AddEvent"
                component={AddEventScreen}
                options={({ route }) => ({
                  title: route.params?.event ? 'Edit Event' : 'Add Event',
                })}
              />

              <Stack.Screen
                name="AddPoem"
                component={AddPoemScreen}
                options={({ route }) => ({
                  title: route.params?.event ? 'Edit Poem' : 'Add Poem',
                })}
              />

              <Stack.Screen
                name="AddQr"
                component={AddQrScreen}
                options={({ route }) => ({
                  title: route.params?.event ? 'Edit QR link' : 'Add QR link',
                })}
              />

              <Stack.Screen
                name="StarlinkCheck"
                component={StarlinkCheckScreen}
                options={{ title: 'Starlink Connection' }}
              />

              <Stack.Screen
                name="WordToInt"
                component={WordToIntScreen}
                options={{ title: 'Word to Int' }}
              />

              <Stack.Screen
                name="DateSpan"
                component={DateSpanScreen}
                options={{ title: 'Days between dates' }}
              />


              <Stack.Screen
                name="EventsWithFriends"
                component={EventsWithFriendsScreen}
                options={{ title: 'Events with friends' }}
              />

              <Stack.Screen
                name="ShareEvent"
                component={ShareEventScreen}
                options={{ title: 'Share with a friend' }}
              />

              <Stack.Screen
                name="AcceptInvite"
                component={AcceptInviteScreen}
                options={{ title: 'Enter invite code' }}
              />

              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: 'Settings' }}
              />
            </>
          )}
        </ThemedNavigator>
      </NavigationContainer>
    </ShareToTimeline>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#0f1024',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#f87171',
    padding: 20,
    textAlign: 'center',
  },
});

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />;
}

function ThemedNavigator({ children, navKey }) {
  const { colors, scheme } = useTheme();
  return (
    <Stack.Navigator
      key={navKey}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.headerText,
        headerTitleStyle: { color: colors.headerText },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {children}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
