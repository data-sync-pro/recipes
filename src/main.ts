import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

// Prevent prismjs (used only by setup/block) from running its automatic
// document-wide highlightAll() on load. With PreloadAllModules the setup
// chunk gets preloaded even when the user is on /transformation, and the
// auto-scan rewrites the innerHTML of every <code class*="language-…"> —
// including doc-viewer's hljs-highlighted blocks, stripping out the spans.
(window as any).Prism = (window as any).Prism || {};
(window as any).Prism.manual = true;

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
