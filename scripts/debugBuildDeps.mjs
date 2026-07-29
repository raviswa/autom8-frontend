import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const eslintConfig = fs.readFileSync(new URL('../eslint.config.js', import.meta.url), 'utf8');
const payload = {
  sessionId: '6134e5',
  runId: 'preinstall',
  hypothesisId: 'H1-H4',
  location: 'scripts/debugBuildDeps.mjs:1',
  message: 'frontend preinstall dependency snapshot',
  data: {
    nodeVersion: process.version,
    npmUserAgent: process.env.npm_config_user_agent || null,
    npmCommand: process.env.npm_command || null,
    scripts: {
      preinstall: pkg.scripts?.preinstall || null,
      build: pkg.scripts?.build || null,
    },
    devDependencies: {
      eslint: pkg.devDependencies?.eslint || null,
      eslintPluginReact: pkg.devDependencies?.['eslint-plugin-react'] || null,
      eslintPluginReactHooks: pkg.devDependencies?.['eslint-plugin-react-hooks'] || null,
      eslintPluginReactRefresh: pkg.devDependencies?.['eslint-plugin-react-refresh'] || null,
      eslintJs: pkg.devDependencies?.['@eslint/js'] || null,
    },
    eslintConfigUsesReactPlugin: eslintConfig.includes('eslint-plugin-react'),
    eslintConfigUsesHooksPlugin: eslintConfig.includes('eslint-plugin-react-hooks'),
    eslintConfigUsesRefreshPlugin: eslintConfig.includes('eslint-plugin-react-refresh'),
  },
  timestamp: Date.now(),
};

// #region agent log
fetch('http://127.0.0.1:7380/ingest/982e28a2-86ba-4a90-a485-a232585f9d4f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6134e5'},body:JSON.stringify(payload)}).catch(()=>{});
// #endregion
