import { DarkTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { ThemeProvider } from '@tetherto/wdk-uikit-react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Toaster } from 'sonner-native';
import { colors } from '@/constants/colors';
import { PassportProvider } from '@/passport/PassportProvider';

SplashScreen.preventAutoHideAsync();

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SharpGroteskBook: require('../../assets/fonts/SharpGrotesk-Book.otf'),
    SharpGroteskMedium: require('../../assets/fonts/SharpGrotesk-Medium.otf'),
    SharpGroteskBold: require('../../assets/fonts/SharpGrotesk-Bold.otf'),
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        defaultMode="dark"
        brandConfig={{
          primaryColor: colors.primary,
        }}
      >
        <PassportProvider>
          <NavigationThemeProvider value={CustomDarkTheme}>
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              <StatusBar style="light" />
            </View>
          </NavigationThemeProvider>
        </PassportProvider>
        <Toaster
          offset={90}
          toastOptions={{
            style: {
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: colors.border,
            },
            titleStyle: { color: colors.text },
            descriptionStyle: { color: colors.text },
          }}
        />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
