/**
 * Runs BEFORE the router entry. If a fatal JS error happens while the app is still starting
 * (for example a screen module throwing when it is loaded), the user used to be left on the
 * native splash screen forever. Now the splash is hidden and an error screen is registered.
 * Once the root layout has mounted (markStarted), errors go back to the normal handler.
 */
import React from 'react';
import { AppRegistry } from 'react-native';
import { StartupError } from '../components/StartupError';

let started = false;
let failure = null;

export function markStarted() {
  started = true;
}

export function startupFailure() {
  return failure;
}

function hideSplash() {
  try {
    require('expo-splash-screen').hideAsync().catch(() => {});
  } catch (e) {
    // nothing else to do
  }
}

export function registerFallback() {
  if (!failure) return;
  const err = failure;
  AppRegistry.registerComponent('main', () => function StartupFailed() {
    return React.createElement(StartupError, { error: err });
  });
  hideSplash();
}

const EU = globalThis.ErrorUtils;
if (EU && typeof EU.setGlobalHandler === 'function') {
  const previous = typeof EU.getGlobalHandler === 'function' ? EU.getGlobalHandler() : null;
  EU.setGlobalHandler((error, isFatal) => {
    if (!started && isFatal) {
      if (!failure) failure = error;
      registerFallback();
      return;
    }
    if (previous) previous(error, isFatal);
  });
}
