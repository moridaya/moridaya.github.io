# Vendored libraries

Kept in the repo instead of loaded from a CDN, so no outside server can change
the code that runs on this site.

| file | source | sha256 |
| --- | --- | --- |
| `supabase-2.45.4.js` | npm `@supabase/supabase-js@2.45.4`, `dist/umd/supabase.js`, unmodified (MIT, see `supabase-LICENSE`) | `8596965fe918e656600a1b568d3a168f5c0d3d22a600886bb6f44a6555db01e7` |

To check it: `npm pack @supabase/supabase-js@2.45.4`, unpack, and compare
`sha256sum package/dist/umd/supabase.js` with the hash above.
