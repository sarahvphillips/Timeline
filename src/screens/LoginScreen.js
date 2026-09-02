import React, { useState } from 'react';
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
} from 'react-native';
import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from '../services/firebase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing info', 'Please enter both email and password.');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
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
          message = 'Incorrect email or password.';
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
        default:
          message = error.message || message;
      }

      Alert.alert(isRegisterMode ? 'Registration failed' : 'Login failed', message);
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
        <Text style={styles.title}>Timeline</Text>
        <Text style={styles.subtitle}>
          {isRegisterMode ? 'Create an account' : 'Sign in to continue'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading && !resetLoading}
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password (min 6 characters)"
            placeholderTextColor="#999"
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
            <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        </View>

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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 16,
    padding: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
    marginBottom: 14,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 10,
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eyeIcon: {
    fontSize: 18,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    marginTop: -6,
    padding: 4,
  },
  forgotText: {
    color: '#60a5fa',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#3b82f6',
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
    color: '#60a5fa',
    fontSize: 14,
  },
});
