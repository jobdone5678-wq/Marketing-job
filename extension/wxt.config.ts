import { defineConfig, type UserManifest } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

/**
 * Keep the existing ID when reloading an unpacked build. The store assigns its
 * own ID, so release artifacts omit the key.
 */
const RELEASE = process.env.WXT_RELEASE === '1';

/** Retain the existing Firefox add-on ID for upgrades. */
const GECKO_ID = 'extension@freehire.me';

const DEV_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2GECbcIeOfNjo0xv8Q4bMKgLHN5qKCOQSYfVr3aTTHlIk1VliYT/Kb+xZiCyR34tBHFYlTaJATBWLIqmoTqQghXPMvM2LmNPo6ttNKuRdiNJNFvMz5M8RE7Qfgawj8EJo2dCTzWbSdRet2HLTKTBDLsZ/9F4RpXnDQrWVaqQqDvNO9CXT99UqBuzpuTXq3WyWJYcnSjDETND62jkW2kUKj0YpybpxMYDjC1NwoXGgI2f6z3gy2FB/ld3yiaYwVu2NwZGTILgmKLQKGrutHQktnVc27qoeBVvO0s8VMnJkf3kFJPPNmJktGAbnvdiGlx4wBEGBqVEqFBhBaj0GlE1dwIDAQAB';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    // Keep hidden maps beside the private build, out of store artifacts.
    exclude: ['**/*.map'],
    sourcesRoot: '..',
    includeSources: ['extension/**', 'extension/.env.production'],
  },
  vite: () => ({ plugins: [tailwindcss()], build: { sourcemap: 'hidden' } }),
  manifest: ({ browser }) =>
    ({
      // Firefox ignores `key` and pins its id through `gecko.id` instead.
      ...(RELEASE || browser === 'firefox' ? {} : { key: DEV_KEY }),
      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
                id: GECKO_ID,
                // 140 is the first release that reads data_collection_permissions,
                // which addons.mozilla.org requires of every new listing.
                strict_min_version: '140.0',
                data_collection_permissions: {
                  required: ['websiteContent'],
                },
              },
            },
          }
        : {}),
      name: 'Extension',
      description: 'Review job application forms in your browser side panel.',
      permissions: [
        'storage',
        'tabs',
        'scripting',
        'activeTab',
        ...(browser === 'firefox' ? [] : ['sidePanel']),
      ],
      host_permissions: ['<all_urls>'],
      // `icons` is discovered from public/icon/*.png. The variants swap in the
      // inverted mark on a dark toolbar.
      //
      // Store artifact only. `icon_variants` is still Canary-gated, and stable
      // Chrome does NOT quietly ignore it — loading an unpacked build carrying the
      // key reports "'icon_variants' requires canary channel or newer", which is
      // noise on every local install and unclear enough to read as a real failure.
      // The store's own review runs on a channel that understands it, and every
      // Chrome without it falls back to `icons`.
      //
      // Both groups name their scheme: a group without `color_schemes` is a
      // wildcard, and the first match by array order wins — so a wildcard here
      // would shadow the dark one. Chrome's key only: Firefox warns on it.
      ...(RELEASE && browser !== 'firefox'
        ? {
            icon_variants: [
              {
                16: 'icon/16.png',
                32: 'icon/32.png',
                48: 'icon/48.png',
                128: 'icon/128.png',
                color_schemes: ['light'],
              },
              {
                16: 'icon/dark/16.png',
                32: 'icon/dark/32.png',
                48: 'icon/dark/48.png',
                128: 'icon/dark/128.png',
                color_schemes: ['dark'],
              },
            ],
          }
        : {}),
      side_panel: {
        default_path: 'sidepanel.html',
      },
      action: {},
    }) as UserManifest,
});
