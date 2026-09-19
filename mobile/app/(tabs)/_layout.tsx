import { Tabs } from 'expo-router';
import { colors, fonts } from '../../lib/theme';

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.onSurface,
                headerTitleStyle: { fontFamily: fonts.sans.semiBold },
                tabBarActiveTintColor: colors.ink,
                tabBarInactiveTintColor: `${colors.ink}80`,
                tabBarStyle: { backgroundColor: colors.bg },
                tabBarLabelStyle: { fontFamily: fonts.sans.medium, fontSize: 11 },
            }}
        >
            <Tabs.Screen name="index" options={{ title: 'Home' }} />
        </Tabs>
    );
}
