// Custom entry: the startup guard goes first, then the normal expo-router entry.
const guard = require('./src/bootstrap/startupGuard');
require('expo-router/entry');
// If something failed while the routes were loading, make sure the error screen is the one that runs.
guard.registerFallback();
