# RJC Performance Lab Wine List

Premium iPad-first static wine list for RJC Performance Lab.

## Run locally

Use any static file server from this folder:

```bash
npx serve .
```

Or:

```bash
python3 -m http.server 4173
```

## Deploy

### Vercel

1. Import this folder as a project.
2. Framework preset: Other.
3. Build command: leave empty.
4. Output directory: `.`.

### Netlify

1. Import this folder as a site.
2. Build command: leave empty.
3. Publish directory: `.`.

## Updating wines

The app now loads the wine catalogue from Supabase first. If Supabase is unavailable or empty, it falls back to `wines.json`.

1. Open the Editor tab.
2. Add a bottle by name/photo, edit the JSON, or import a replacement JSON file.
3. Use Save catalogue to Supabase.
4. Enter the admin PIN.
5. Use Download wines.json if you also want a backup copy.

Bottle count, open/decanted status, and shared notes are saved to Supabase separately from the catalogue.

## Shared Cellar State

Bottle counts, open/decanted status, and guest notes are connected to Supabase:

```text
https://hjegymnxhxloddqwbdai.supabase.co
```

The public browser key is stored in `app.js`. Admin edits are protected by the database function `update_wine_state_with_pin`, which checks the PIN inside Supabase.

The full wine catalogue is stored in the `wine_catalog` table and is updated through `replace_wine_catalog_with_pin`.

## AI Wine Enrichment

The Editor tab can call a Supabase Edge Function at:

```text
https://hjegymnxhxloddqwbdai.supabase.co/functions/v1/enrich-wine
```

Deploy the function in `outputs/supabase/functions/enrich-wine` and set `OPENAI_API_KEY` as a Supabase secret. Without the function, the app still adds a draft wine from the name so it can be completed manually.

If the PIN needs changing, update the `admin_pin_hash` row in Supabase with:

```sql
update app_settings
set value = crypt('NEW_PIN_HERE', gen_salt('bf'))
where key = 'admin_pin_hash';
```
