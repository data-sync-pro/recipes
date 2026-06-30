// Shared highlight.js instance built from the CORE library with only the
// languages this app actually uses, so we don't bundle the full ~1MB
// highlight.js (all ~190 languages). Consumed by the setup code blocks
// (block.component) and the transformation doc viewer (doc-viewer.component).
//
// Languages in use:
//   - sql:  transformation examples and SOQL (setup 'soql' maps to sql)
//   - java: Apex code (setup 'apex' and transformation 'apex_class' map to java)
//   - json: REST API request/response bodies (setup 'json')
//
// Any other language class (e.g. 'language-plaintext') degrades gracefully to
// plain, unhighlighted text — highlight.js just skips unregistered languages.
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import json from 'highlight.js/lib/languages/json';

hljs.registerLanguage('sql', sql);
hljs.registerLanguage('java', java);
hljs.registerLanguage('json', json);

export { hljs };
