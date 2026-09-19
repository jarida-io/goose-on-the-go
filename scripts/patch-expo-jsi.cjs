/** SDK 56 compatibility: preserve nullable setters while passing a direct C callback. */
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(path.dirname(require.resolve('expo-modules-jsi/package.json')),
  'apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift');
const source = fs.readFileSync(file, 'utf8');
const original = '    let callbacks = expo.HostObjectCallbacks(context, getter, set == nil ? nil : setter, propertyNamesGetter, deallocate)';
const replacement = `    let callbacks: expo.HostObjectCallbacks
    if set == nil {
      callbacks = expo.HostObjectCallbacks(context, getter, nil, propertyNamesGetter, deallocate)
    } else {
      callbacks = expo.HostObjectCallbacks(context, getter, setter, propertyNamesGetter, deallocate)
    }`;
if (source.includes(original)) {
  fs.writeFileSync(file, source.replace(original, replacement));
  console.info('[ios-build] Applied Expo JSI nullable C callback compatibility fix');
} else if (!source.includes(replacement)) {
  throw new Error('Expo JSI source changed; review and retire the nullable callback patch before building');
}
