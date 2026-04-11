import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/utils/supabase";

export default function WelcomeScreen() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Welcome</Text>
      {session.user.email ? (
        <Text style={{ fontSize: 16, opacity: 0.8 }}>{session.user.email}</Text>
      ) : null}
      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={{
          marginTop: 24,
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#ccc",
        }}
      >
        <Text style={{ fontSize: 15 }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
