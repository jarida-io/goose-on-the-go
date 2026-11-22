// The push wake-up task must exist before anything else runs, including in a headless start
// that never mounts a screen. See services/background-notifications.ts.
// The OS may start the app only to run the wake task, so it is defined while the bundle loads.
import './services/background-notifications';
// The geofence task, for a to-do that waits on arriving at or leaving a place, is defined the same way.
import './services/geofence';
// So is the check that tells the household, with the app closed, that the Pond went offline and why.
import './services/pond-offline-watch';
import 'expo-router/entry';

import { AppRegistry } from 'react-native';

// The assist overlay's own root, rendered by AssistActivity (plugins/pond-assist/PondAssist.kt)
// when Goose is the phone's assistant. Required lazily, so a launch of the app or a headless
// wake-up never loads it. See docs/ASSISTANT.md.
// eslint-disable-next-line @typescript-eslint/no-require-imports
AppRegistry.registerComponent('assist', () => require('./components/assist/assist-root').AssistRoot);
