import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useAppTheme } from '../../theme/theme-provider';
<<<<<<< HEAD
import { useAppLanguage } from '../../utils/language';
import { useResponsiveLayout } from '../../utils/responsive';

export default function TabLayout() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const iconSize = layout.isCompactPhone ? 20 : 22;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outline,
          height: layout.tabBarHeight,
          paddingTop: 6,
          paddingBottom: layout.tabBarPaddingBottom,
          paddingLeft: layout.sideSafeLeft,
          paddingRight: layout.sideSafeRight,
        },
        tabBarItemStyle: {
          minHeight: 44,
        },
        tabBarLabelStyle: {
          fontSize: layout.isCompactPhone ? 10 : 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('Home'),
          tabBarIcon: ({ color }) => <Ionicons name="compass-outline" size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('Explore'),
          tabBarIcon: ({ color }) => <Ionicons name="layers-outline" size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('Map'),
          tabBarIcon: ({ color }) => <Ionicons name="map-outline" size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('GeoAI'),
          tabBarIcon: ({ color }) => <Ionicons name="sparkles-outline" size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sites"
        options={{
          href: null,
          title: t('Sites'),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('Community'),
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="investigation"
        options={{
          href: null,
          title: t('Community'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile'),
          tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" size={iconSize} color={color} />,
        }}
      />
    </Tabs>
  );
=======

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline', explore: 'compass-outline', map: 'map-outline', community: 'people-outline', profile: 'person-circle-outline',
};
export default function TabLayout() {
  const { colors } = useAppTheme();
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false, tabBarActiveTintColor: colors.forest, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { height: 64, paddingTop: 7, paddingBottom: 8, borderTopColor: colors.line, backgroundColor: colors.surface },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? 'ellipse-outline'} color={color as string} size={size} />,
  })}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home tab' }} />
    <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarAccessibilityLabel: 'Explore observations tab' }} />
    <Tabs.Screen name="map" options={{ title: 'Map', tabBarAccessibilityLabel: 'Geological map tab' }} />
    <Tabs.Screen name="community" options={{ title: 'Community', tabBarAccessibilityLabel: 'Community tab' }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarAccessibilityLabel: 'Profile and settings tab' }} />
  </Tabs>;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}
