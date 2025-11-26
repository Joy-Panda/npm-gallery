const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy codicon assets to dist folder
 */
function copyCodiconAssets() {
  const codiconSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist');
  const codiconDest = path.join(__dirname, 'dist', 'codicons');

  // Create dist/codicons directory if it doesn't exist
  if (!fs.existsSync(codiconDest)) {
    fs.mkdirSync(codiconDest, { recursive: true });
  }

  // Copy codicon.css and codicon.ttf
  const filesToCopy = ['codicon.css', 'codicon.ttf'];
  for (const file of filesToCopy) {
    const srcPath = path.join(codiconSrc, file);
    const destPath = path.join(codiconDest, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`[copy] ${file} -> dist/codicons/`);
    }
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

// Extension build configuration (Node.js)
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'silent',
  plugins: [esbuildProblemMatcherPlugin],
};

// Webview build configuration (Browser) - Search panel
const webviewConfig = {
  entryPoints: ['src/webview/index.tsx'],
  bundle: true,
  format: 'iife',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'browser',
  outfile: 'dist/webview.js',
  logLevel: 'silent',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
  },
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
  },
  plugins: [esbuildProblemMatcherPlugin],
};

// Package details webview configuration (Browser)
const packageDetailsConfig = {
  entryPoints: ['src/webview/package-details.tsx'],
  bundle: true,
  format: 'iife',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'browser',
  outfile: 'dist/package-details.js',
  logLevel: 'silent',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
  },
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
  },
  plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
  try {
    // Copy codicon assets first
    copyCodiconAssets();

    // Build extension
    const extensionCtx = await esbuild.context(extensionConfig);

    // Build webviews
    const webviewCtx = await esbuild.context(webviewConfig);
    const packageDetailsCtx = await esbuild.context(packageDetailsConfig);

    if (watch) {
      await Promise.all([
        extensionCtx.watch(),
        webviewCtx.watch(),
        packageDetailsCtx.watch(),
      ]);
      console.log('[watch] watching for changes...');
    } else {
      await Promise.all([
        extensionCtx.rebuild(),
        webviewCtx.rebuild(),
        packageDetailsCtx.rebuild(),
      ]);
      await extensionCtx.dispose();
      await webviewCtx.dispose();
      await packageDetailsCtx.dispose();
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
