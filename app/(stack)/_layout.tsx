/**
 * StackLayout — Sub-screen navigation for all profile hub destinations.
 *
 * 15 screens matching Goose On The Go v2 design.
 */

import { Stack } from 'expo-router';
import React from 'react';

import { Brand, Grey, AccentPurple } from '@/constants/colors';

export default function StackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Brand.white },
        headerTintColor: AccentPurple,
        headerTitleStyle: { color: Grey[900], fontFamily: 'Quicksand', fontWeight: '700' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="models" options={{ title: 'AI Models' }} />
      <Stack.Screen name="memories" options={{ title: 'Memories' }} />
      <Stack.Screen name="logs" options={{ title: 'Activity Logs' }} />
      <Stack.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Stack.Screen name="app-management" options={{ title: 'App Integrations' }} />
      <Stack.Screen name="mcp-servers" options={{ title: 'MCP Servers' }} />
      <Stack.Screen name="user-media" options={{ title: 'Photos & Videos' }} />
      <Stack.Screen name="photo-upload" options={{ title: 'Upload for Analysis' }} />
      <Stack.Screen name="add-users" options={{ title: 'Users' }} />
      <Stack.Screen name="biometrics" options={{ title: 'Biometrics' }} />
      <Stack.Screen name="backup" options={{ title: 'Backup' }} />
      <Stack.Screen name="restore" options={{ title: 'Restore to Pond' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy & Licenses' }} />
      <Stack.Screen name="home-management" options={{ title: 'Home Management' }} />
      <Stack.Screen name="pond-pairing" options={{ title: 'Pond Pairing' }} />
      <Stack.Screen name="developer" options={{ title: 'Developer' }} />
    </Stack>
  );
}
