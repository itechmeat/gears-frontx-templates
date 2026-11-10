/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FrontXProvider, apiRegistry, createFrontX, presets, microfrontends, MfeHandlerMF, gtsPlugin, FRONTX_MFE_ENTRY_MF } from '@gears-frontx/react';
import { themeSchema, languageCodeSchema, languageSchema, screenLabelsSchema } from '@gears-frontx/frontx-template-shell';
import { Toaster } from '@/app/components/ui/sonner';
import { AccountsApiService } from '@/app/api';
import '@gears-frontx/ui-kit/theme.css'; // UI-kit design tokens (imported exactly once, at the app entry)
import './font.css'; // Registers Inter, the face the kit's --font-sans and --font-heading name first
import './globals.css'; // Global styles with CSS variables
import '@gears-frontx/ui-kit'; // side-effect: styles the host's own ui-kit components in the host document; screens get their kit CSS through their manifest. Must come after globals.css so component rules beat Tailwind's preflight resets on specificity ties.
import '@/app/events/bootstrapEvents'; // Register app-level events (type augmentation)
import { registerBootstrapEffects } from '@/app/effects/bootstrapEffects'; // Register app-level effects
import App from './App';

// Import all themes
import { DEFAULT_THEME_ID, defaultTheme } from '@/app/themes/default';
import { darkTheme } from '@/app/themes/dark';
import { lightTheme } from '@/app/themes/light';
import { draculaTheme } from '@/app/themes/dracula';
import { draculaLargeTheme } from '@/app/themes/dracula-large';
import { applyPersistedTheme } from '@/app/themes/themePersistence';
import { stampAppliedThemeId } from '@/app/themes/themeIdAttribute';

// Register application-specific GTS schemas before constructing the FrontX app.
// These derived schemas encode application-level constraints (valid theme names,
// supported languages) and are not part of the core type system in
// @gears-frontx/gts-plugin. The screen extension type belongs to the screen
// domain, and its implementation (`mfe/screenDomain.ts`) registers it.
gtsPlugin.registerSchema(themeSchema);
gtsPlugin.registerSchema(languageCodeSchema);
gtsPlugin.registerSchema(languageSchema);
gtsPlugin.registerSchema(screenLabelsSchema);

// Register accounts service (application-level service for user info)
apiRegistry.register(AccountsApiService);

// Initialize API services
apiRegistry.initialize({});

// Create FrontX app instance
// Register MfeHandlerMF to enable Module Federation MFE loading
const app = createFrontX()
  .useAll(presets.full())
  .use(microfrontends({
    typeSystem: gtsPlugin,
    mfeHandlers: [new MfeHandlerMF(FRONTX_MFE_ENTRY_MF)],
  }))
  .build();

// The root registry is built eagerly: the shell is the root runtime, so its
// registry is not tied to any mount window.
void app.mfeRegistry;

// Register app-level effects (pass store dispatch)
registerBootstrapEffects(app.store.dispatch);

// Register all themes (default theme has default:true, activates automatically)
app.themeRegistry.register(defaultTheme);
app.themeRegistry.register(lightTheme);
app.themeRegistry.register(darkTheme);
app.themeRegistry.register(draculaTheme);
app.themeRegistry.register(draculaLargeTheme);

// Apply the theme the user chose in an earlier session (the default, not
// stored, on a first visit), and remember every later choice
applyPersistedTheme(app.themeRegistry, DEFAULT_THEME_ID);
// Name the applied theme on <html> (data-theme-id), now and on every switch
stampAppliedThemeId(app.themeRegistry);

/**
 * Render application
 * Bootstrap happens automatically when Layout mounts
 *
 * Flow:
 * 1. App renders → Layout mounts → bootstrap dispatched
 * 2. Components show skeleton loaders (translationsReady = false)
 * 3. User fetched → language set → translations loaded
 * 4. Components re-render with actual text (translationsReady = true)
 * 5. MFE system loads and mounts extensions via MfeScreenContainer
 *
 * Note: Mock API is controlled via the FrontX Studio panel.
 * The mock plugin (included in full preset) handles mock plugin lifecycle automatically.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontXProvider app={app}>
      <App />
      <Toaster />
    </FrontXProvider>
  </StrictMode>
);

// Dev-only verification hooks. The shell defines only the convention: any
// installed verify package (src-app/verify_packages/*, delivered by
// templates) may ship src/dev-entry.ts — a side-effect module — and the
// shell loads every one it finds in dev. Which checks arrive, if any, is the
// installing template's business; the shell names no template and no
// package. import.meta.glob (not a bare import) because the packages are
// optional: the glob resolves to an empty map when the subtree is absent,
// and a bare specifier would never resolve anyway — native import() rejects
// bare specifiers even when the package is installed. Behind DEV so the
// entries and their dependencies are tree-shaken out of production builds.
// The two console lines keep "none installed" and "installed but broken"
// distinguishable for verification tooling that reads the console.
if (import.meta.env.DEV) {
  const devEntries = import.meta.glob('../verify_packages/*/src/dev-entry.ts');
  const entries = Object.entries(devEntries);
  if (entries.length === 0) {
    console.info('[verify-packages] none installed — no dev-time verification will run.');
  } else {
    for (const [entryPath, loadEntry] of entries) {
      loadEntry().catch((error: unknown) => {
        console.error(`[verify-packages] ${entryPath} is installed but failed to load:`, error);
      });
    }
  }
}
