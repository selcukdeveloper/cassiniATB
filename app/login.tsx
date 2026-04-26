import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { signInWithEmail } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";

const DEMO_HINT = "selcuk@dev.no  ·  ingrid@phd.no\nPassword: 1234";

export default function Login() {
  const [email, setEmail] = useState("selcuk@dev.no");
  const [password, setPassword] = useState("1234");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign in failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>CassiniATB</Text>
      <Text style={styles.subtitle}>Claim Norway&apos;s waters.</Text>

      {!isSupabaseConfigured && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Supabase not configured. Set EXPO_PUBLIC_SUPABASE_URL +
            EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then `expo start --clear`.
          </Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="email"
        placeholderTextColor="#4B5E7C"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!submitting}
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="password"
        placeholderTextColor="#4B5E7C"
        secureTextEntry
        editable={!submitting}
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={submitting || !isSupabaseConfigured}
      >
        {submitting ? (
          <ActivityIndicator color="#0F1A2C" />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </Pressable>

      <Text style={styles.hint}>Demo accounts:</Text>
      <Text style={styles.hintMono}>{DEMO_HINT}</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 32,
    justifyContent: "center",
    backgroundColor: "#0F1A2C",
  },
  title: {
    color: "#E6F1FF",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  subtitle: {
    color: "#8892B0",
    fontSize: 15,
    marginTop: 4,
    marginBottom: 32,
  },
  input: {
    backgroundColor: "#16243A",
    color: "#E6F1FF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#FDE047",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: "#0F1A2C",
    fontWeight: "700",
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: "#3a1a1a",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  errorText: { color: "#ff8a8a", fontSize: 13 },
  hint: {
    color: "#4B5E7C",
    fontSize: 12,
    marginTop: 32,
    fontWeight: "600",
  },
  hintMono: {
    color: "#4B5E7C",
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
