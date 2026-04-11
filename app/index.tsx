import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/hooks/useSession";
import { signInWithGoogle } from "@/utils/auth";

export default function Index() {
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

  if (session) {
    return <Redirect href="/welcome" />;
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "600" }}>MateSync</Text>
      <Pressable
        onPress={() => signInWithGoogle()}
        style={{
          backgroundColor: "#111",
          paddingVertical: 14,
          paddingHorizontal: 24,
          borderRadius: 10,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          Continue with Google
        </Text>
      </Pressable>
    </View>
  );
}
