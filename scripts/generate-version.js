const fs = require('fs');
const path = require('path');

try {
  // Read version from package.json so it stays in sync
  const pkg = require('../package.json');
  const version = pkg.version || '0.0.0';

  const now = new Date();
  const build = now.toISOString().replace(/[-:T]/g, '').split('.')[0]; // YYYYMMDDHHMMSS
  const deployTime = now.toISOString();

  const versionInfo = {
    version,
    deployTime,
    build,
    description: 'Auto-generated version file for cache invalidation'
  };

  const versionPath = path.join(__dirname, '..', 'src', 'assets', 'data', 'version.json');
  const dir = path.dirname(versionPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2) + '\n');

  console.log('Version file generated:', versionInfo);
  console.log('Written to:', versionPath);
} catch (error) {
  console.error('Failed to generate version file:', error && error.message ? error.message : error);
  process.exit(1);
}
