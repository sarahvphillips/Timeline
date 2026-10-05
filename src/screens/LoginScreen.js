import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  loadRememberMe,
  loadRememberedEmail,
  prepareSignIn,
  saveRememberedEmail,
  deleteUser,
} from '../services/firebase';
import { welcomePendingKey, WELCOME_NEXT_KEY } from '../legal/welcomeEmail';
import { PRIVACY_URL, DELETE_ACCOUNT_URL, DELETE_DATA_URL } from '../legal/docs';
import { normalizeHandle, saveProfile } from '../services/profileService';
import { useTheme } from '../themeContext';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen({ onEnterGuest }) {
  const { colors, scheme, setMode } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const id = 'timeline-login-autofill';
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('style');
      node.id = id;
      document.head.appendChild(node);
    }
    node.textContent = `
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus {
        -webkit-text-fill-color: ${colors.text};
        caret-color: ${colors.text};
        box-shadow: 0 0 0 1000px ${colors.bg} inset;
      }
    `;
    return undefined;
  }, [colors.text, colors.bg]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const on = await loadRememberMe();
      const savedEmail = on ? await loadRememberedEmail() : '';
      if (!alive) return;
      setRemember(on);
      if (savedEmail) setEmail(savedEmail);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      showMessage('Missing info', 'Please enter both email and password.');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      showMessage('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      showMessage('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    const chosenName = normalizeHandle(username);
    if (isRegisterMode && chosenName.length < 3) {
      showMessage(
        'Username',
        'Choose a username of at least 3 letters or numbers. It cannot be changed later.',
      );
      return;
    }

    setLoading(true);

    try {
      await prepareSignIn(remember);
      if (isRegisterMode) {
        await AsyncStorage.setItem(WELCOME_NEXT_KEY, '1');
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred?.user?.uid;
        try {
          await saveProfile({ handle: chosenName, visibility: 'private' });
        } catch (profileError) {
          if (cred?.user) {
            try {
              await deleteUser(cred.user);
            } catch (_) {
              /* account may remain; the username was not saved */
            }
          }
          if (uid) await AsyncStorage.removeItem(welcomePendingKey(uid));
          await AsyncStorage.removeItem(WELCOME_NEXT_KEY);
          throw profileError;
        }
        if (uid) {
          await AsyncStorage.setItem(welcomePendingKey(uid), '1');
          await AsyncStorage.removeItem(WELCOME_NEXT_KEY);
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      await saveRememberedEmail(email.trim(), remember);
    } catch (error) {
      let message = 'Something went wrong. Please try again.';

      switch (error.code) {
        case 'auth/email-already-in-use':
          message = 'This email is already registered. Try logging in.';
          break;
        case 'auth/invalid-email':
          message = 'Invalid email address.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          message = isRegisterMode
            ? 'Could not create the account. Check the email and password, then try again.'
            : 'No account was found for that email, or the password is wrong. If you are new, tap "Don\'t have an account? Create one" and register.';
          break;
        case 'auth/weak-password':
          message = 'Password is too weak (minimum 6 characters).';
          break;
        case 'auth/too-many-requests':
          message = 'Too many attempts. Please wait a moment and try again.';
          break;
        case 'auth/network-request-failed':
          message = 'Network error. Check your internet connection.';
          break;
        case 'HANDLE_TAKEN':
          message = 'That username is already in use. Try another.';
          break;
        case 'HANDLE_REQUIRED':
          message = 'Choose a username of at least 3 letters or numbers.';
          break;
        default:
          message = error.message || message;
      }

      showMessage(isRegisterMode ? 'Registration failed' : 'Login failed', message);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (title, message) => {
    // Alert works better on native; window.alert is more reliable on web
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(title + '\n\n' + message);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      showMessage('Email required', 'Please enter your email address first, then tap Forgot password.');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      showMessage('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      showMessage(
        'Check your email',
        'A password reset link has been sent to ' + email.trim() + '. Check your inbox (and spam folder).'
      );
    } catch (error) {
      console.error('Password reset error:', error);
      let message = 'Could not send reset email. Please try again.';

      switch (error.code) {
        case 'auth/user-not-found':
          message = 'No account found with that email address.';
          break;
        case 'auth/invalid-email':
          message = 'Invalid email address.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many attempts. Please wait a moment and try again.';
          break;
        case 'auth/unauthorized-continue-uri':
        case 'auth/invalid-continue-uri':
          message = 'Firebase action URL is not configured correctly.';
          break;
        default:
          message = (error.code ? error.code + ': ' : '') + (error.message || message);
      }

      showMessage('Reset failed', message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.themeButton}
          onPress={() => setMode(scheme === 'dark' ? 'light' : 'dark')}
          accessibilityLabel={scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          disabled={loading || resetLoading}
        >
          <Ionicons
            name={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={18}
            color={colors.text}
          />
          <Text style={styles.themeText}>{scheme === 'dark' ? 'Light mode' : 'Dark mode'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Timeline</Text>
        <Text style={styles.subtitle}>
          {isRegisterMode ? 'Create an account' : 'Sign in to continue'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading && !resetLoading}
        />

        {isRegisterMode ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(t) => setUsername(normalizeHandle(t))}
              editable={!loading && !resetLoading}
            />
            <Text style={styles.usernameHint}>
              Letters and numbers. Friends see this instead of your email. It cannot be changed later.
            </Text>
          </>
        ) : null}

        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={colors.faint}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!loading && !resetLoading}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            disabled={loading || resetLoading}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.faint}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.rememberRow}
          onPress={() => setRemember((v) => !v)}
          disabled={loading || resetLoading}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: remember }}
        >
          <View style={[styles.rememberBox, remember && styles.rememberBoxOn]}>
            {remember ? <Text style={styles.rememberTick}>✓</Text> : null}
          </View>
          <View style={styles.rememberCopy}>
            <Text style={styles.rememberText}>Remember me</Text>
            <Text style={styles.rememberHint}>
              {remember
                ? 'Stay signed in on this device.'
                : 'Ask for the password next time the app is opened.'}
            </Text>
          </View>
        </TouchableOpacity>

        {!isRegisterMode && (
          <TouchableOpacity
            style={styles.forgotButton}
            onPress={handleForgotPassword}
            disabled={loading || resetLoading}
          >
            {resetLoading ? (
              <ActivityIndicator size="small" color="#60a5fa" />
            ) : (
              <Text style={styles.forgotText}>Forgot password?</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, (loading || resetLoading) && styles.buttonDisabled]}
          onPress={handleAuth}
          disabled={loading || resetLoading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isRegisterMode ? 'Create Account' : 'Log In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchMode}
          onPress={() => setIsRegisterMode(!isRegisterMode)}
          disabled={loading || resetLoading}
        >
          <Text style={styles.switchText}>
            {isRegisterMode
              ? 'Already have an account? Log In'
              : "Don't have an account? Create one"}
          </Text>
        </TouchableOpacity>

        {typeof onEnterGuest === 'function' ? (
          <TouchableOpacity
            style={styles.guestButton}
            onPress={onEnterGuest}
            disabled={loading || resetLoading}
          >
            <Text style={styles.guestText}>Continue as guest</Text>
            <Text style={styles.guestHint}>Try the app on this device. You can create an account later.</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.legalLine}>
          <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy policy
          </Text>
          {'  ·  '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(DELETE_DATA_URL)}>
            Delete data
          </Text>
          {'  ·  '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(DELETE_ACCOUNT_URL)}>
            Delete account
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 28,
  },
  themeButton: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  themeText: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: c.faint,
    textAlign: 'center',
    marginBottom: 28,
  },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
    marginBottom: 14,
  },
  usernameHint: {
    color: c.faint,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 14,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: 10,
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eyeIcon: {
    fontSize: 18,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  rememberBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.faint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  rememberBoxOn: {
    backgroundColor: c.blue,
    borderColor: c.blue,
  },
  rememberTick: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  rememberCopy: {
    flex: 1,
    marginLeft: 10,
  },
  rememberText: {
    color: c.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rememberHint: {
    color: c.faint,
    fontSize: 13,
    marginTop: 2,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    marginTop: -6,
    padding: 4,
  },
  forgotText: {
    color: c.blueSoft,
    fontSize: 14,
  },
  button: {
    backgroundColor: c.blue,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  switchMode: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: c.blueSoft,
    fontSize: 14,
  },
  guestButton: {
    marginTop: 22,
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: c.cardBorder,
  },
  guestText: {
    color: c.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  guestHint: {
    color: c.faint,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  legalLine: {
    marginTop: 18,
    textAlign: 'center',
    color: c.faint,
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: c.blueSoft,
    fontSize: 12,
  },
});
}

