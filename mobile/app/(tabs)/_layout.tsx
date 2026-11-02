import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useAppTheme } from '../../theme/theme-provider';
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
}
