import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useTheme, useStyles, colors, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const router = useRouter();
  const { colors, themeMode } = useTheme();
  const styles = useStyles(getStyles);
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    try {
      GoogleSignin.configure({
        webClientId: '293604785108-8b7h5mvi25i85rt5d9sb76j6o6u3d6t3.apps.googleusercontent.com',
        offlineAccess: true,
      });
    } catch (e) {
      console.warn('GoogleSignin configure error:', e);
    }
  }, []);

  // Form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Validations
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (isSignUp) {
      if (!name.trim()) {
        newErrors.name = 'Full Name is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAuthSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      if (isSignUp) {
        await registerWithEmail(name.trim(), email.trim(), password, phone.trim());
        Alert.alert('Welcome!', 'Your Rentora landlord account was created successfully!');
      } else {
        await loginWithEmail(email.trim(), password);
      }
    } catch (e: any) {
      let errorMsg = 'Something went wrong. Please try again.';
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        errorMsg = 'Incorrect email or password. Please try again.';
      } else if (e.code === 'auth/wrong-password') {
        errorMsg = 'Incorrect password. Please try again.';
      } else if (e.code === 'auth/email-already-in-use') {
        errorMsg = 'This email is already registered. Please sign in instead.';
      } else if (e.code === 'auth/network-request-failed') {
        errorMsg = 'Network error. Please check your internet connection and try again.';
      } else if (e.code === 'auth/too-many-requests') {
        errorMsg = 'Too many failed attempts. Please try again in a few minutes.';
      } else if (e.message && !e.message.includes('Firebase:')) {
        errorMsg = e.message;
      }
      Alert.alert(isSignUp ? 'Registration' : 'Sign In', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setLoading(true);
    try {
      GoogleSignin.configure({
        webClientId: '293604785108-8b7h5mvi25i85rt5d9sb76j6o6u3d6t3.apps.googleusercontent.com',
        offlineAccess: true,
      });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo: any = await GoogleSignin.signIn();
      const idToken = userInfo?.data?.idToken || userInfo?.idToken;
      if (!idToken) {
        throw new Error('Google Sign-In failed: No ID Token returned from Google Play Services.');
      }
      await loginWithGoogle(idToken);
      Alert.alert('Welcome!', 'Logged in with Google successfully!');
    } catch (e: any) {
      console.error('Google Sign-In Error:', e);
      let errorMsg = e.message || 'Google Sign-In failed';
      if (e.code === 'SIGN_IN_CANCELLED' || e.code === '12501') {
        errorMsg = 'Sign in was cancelled';
      } else if (e.code === 'IN_PROGRESS') {
        errorMsg = 'Sign in is already in progress';
      } else if (e.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        errorMsg = 'Google Play Services not available or outdated';
      } else if (errorMsg.includes('DEVELOPER_ERROR') || e.code === 'DEVELOPER_ERROR' || e.code === '10' || e.code === 10) {
        errorMsg = 'DEVELOPER_ERROR: Please verify SHA-1 (5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25) is registered in Firebase Console under com.rentora.app, Support Email is selected, and Google provider is enabled.';
      }
      Alert.alert('Google Auth Error', errorMsg);
    } finally {
      setGoogleLoading(false);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Logo Container */}
          <View style={styles.logoWrapper}>
            <View style={styles.logoCircle}>
              <Ionicons name="home-outline" size={42} color={colors.white} />
            </View>
            <Text style={styles.appName}>Rentora</Text>
            <Text style={styles.tagline}>Owner & Billing Manager</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Tab Swappers */}
            <View style={styles.tabWrapper}>
              <TouchableOpacity
                style={[styles.tabBtn, !isSignUp && styles.tabBtnActive]}
                onPress={() => {
                  setIsSignUp(false);
                  setErrors({});
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, !isSignUp && styles.tabBtnTextActive]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, isSignUp && styles.tabBtnActive]}
                onPress={() => {
                  setIsSignUp(true);
                  setErrors({});
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, isSignUp && styles.tabBtnTextActive]}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            {isSignUp && (
              <AppInput
                label="Full Name *"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Ramesh Kumar"
                error={errors.name}
                icon="person-outline"
              />
            )}

            <AppInput
              label="Email Address *"
              value={email}
              onChangeText={setEmail}
              placeholder="name@email.com"
              keyboardType="email-address"
              error={errors.email}
              icon="mail-outline"
            />

            <AppInput
              label="Password *"
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 6 characters"
              secureTextEntry
              error={errors.password}
              icon="lock-closed-outline"
            />

            {isSignUp && (
              <AppInput
                label="Phone Number (Optional)"
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                keyboardType="phone-pad"
                icon="call-outline"
              />
            )}

            <AppButton
              title={isSignUp ? 'Create Landlord Account' : 'Sign In'}
              onPress={handleAuthSubmit}
              loading={loading}
              style={styles.submitBtn}
              icon={isSignUp ? 'person-add-outline' : 'log-in-outline'}
            />
          </View>

          {/* Google Sign-in Alternative */}
          <View style={styles.alternativeWrapper}>
            <Text style={styles.orText}>OR</Text>
            <TouchableOpacity
              style={[styles.googleButton, (loading || googleLoading) && { opacity: 0.6 }]}
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-google" size={18} color={colors.text} style={styles.googleIcon} />
              <Text style={styles.googleText}>
                {googleLoading ? 'Signing in...' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer Links */}
          <View style={styles.footerContainer}>
            <TouchableOpacity onPress={() => router.push('/settings/privacy-policy')}>
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>•</Text>
            <TouchableOpacity onPress={() => router.push('/settings/terms')}>
              <Text style={styles.footerLink}>Terms & Conditions</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoWrapper: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: spacing.borderRadius.xl,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...spacing.shadows.medium,
  },
  appName: {
    fontSize: typography.sizes.xxl + 2,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.md,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...spacing.shadows.light,
  },
  tabWrapper: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  tabBtnText: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.primary,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  alternativeWrapper: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  orText: {
    fontSize: typography.sizes.xs + 1,
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.md,
  },
  googleButton: {
    width: '100%',
    height: 48,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...spacing.shadows.light,
  },
  googleIcon: {
    marginRight: spacing.sm,
  },
  googleText: {
    fontSize: typography.sizes.sm + 1,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerLink: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  footerDivider: {
    marginHorizontal: spacing.sm,
    color: colors.textSecondary,
  },
});
