#!/usr/bin/env node

/**
 * Build script that bypasses fingerprinting issues
 */

const { execSync } = require('child_process');

console.log('🚀 Starting EAS build with fingerprint workaround...\n');

// Set environment variable to skip fingerprinting
process.env.EAS_SKIP_AUTO_FINGERPRINT = '1';
process.env.EXPO_NO_CAPABILITY_SYNC = '1';

try {
  // Run EAS build with environment variables set
  execSync('npx eas build --platform android --profile production --non-interactive', {
    stdio: 'inherit',
    env: {
      ...process.env,
      EAS_SKIP_AUTO_FINGERPRINT: '1',
      EXPO_NO_CAPABILITY_SYNC: '1',
    }
  });

  console.log('\n✅ Build submitted successfully!');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}

