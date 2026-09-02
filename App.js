import React, { useState, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';

import { auth, onAuthStateChanged, signOut } from './src/services/firebase';
import { syncEventsFromCloud } from './src/services/eventService';
import { syncWordNumbersFromCloud } from './src/services/wordToIntService';
import { registerThisDevice } from './src/services/deviceSession';
import { buildShareLinking } from './src/services/shareIntent';
import ShareToTimeline from './src/share/ShareToTimeline';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import TimelineScreen from './src/screens/TimelineScreen';
import AddEventScreen from './src/screens/AddEventScreen';
import AddPoemScreen from './src/screens/AddPoemScreen';
import StarlinkCheckScreen from './src/screens/StarlinkCheckScreen';
import YearOverviewScreen from './src/screens/YearOverviewScreen';
import MonthOverviewScreen from './src/screens/MonthOverviewScreen';
import AddQrScreen from './src/screens/AddQrScreen';
import WordToIntScreen from './src/screens/WordToIntScreen';
import DateSpanScreen from './src/screens/DateSpanScreen';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
const shareLinking = buildShareLinking() || undefined;

export default function App() {
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
          syncEventsFromCloud(firebaseUser.uid).catch((err) => {
            console.warn('Event cloud sync failed', err);
          });
          syncWordNumbersFromCloud(firebaseUser.uid).catch((err) => {
            console.warn('Word-to-Int cloud sync failed', err);
          });
          registerThisDevice(firebaseUser.uid).catch((err) => {
            console.warn('Device session register failed', err);
          });
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
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: true }}>
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
            </>
          )}
        </Stack.Navigator>
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
