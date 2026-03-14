/**
 * Auto-increment version before each EAS build.
 * Pattern: 1.0.0 → 1.0.1 → ... → 1.0.9 → 1.1.0 → ... → 1.9.9 → 2.0.0
 * 
 * Every 10 builds: minor increments, patch resets
 * Every 100 builds: major increments, minor & patch reset
 */
const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '..', 'version.json');

let data;
try {
  data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
} catch {
  data = { buildNumber: 0 };
}

// Increment build number
data.buildNumber = (data.buildNumber || 0) + 1;

// Compute version from build number
const idx = data.buildNumber - 1;
const major = 1 + Math.floor(idx / 100);
const minor = Math.floor(idx / 10) % 10;
const patch = idx % 10;
const version = `${major}.${minor}.${patch}`;

data.version = version;

fs.writeFileSync(versionFile, JSON.stringify(data, null, 2) + '\n');

console.log(`Build #${data.buildNumber} → version ${version} (versionCode: ${data.buildNumber})`);
