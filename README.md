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

The app reads `wines.json` directly.

1. Open the Editor tab.
2. Edit the JSON or import a replacement JSON file.
3. Use Download wines.json.
4. Replace the existing `wines.json` file with the downloaded file.
5. Redeploy.

Bottle count changes made in the app are saved locally on the iPad. Use the Editor download when those changes should become the published source of truth.

## Shared Cellar State

Bottle counts, open/decanted status, and guest notes are connected to Supabase:

```text
https://hjegymnxhxloddqwbdai.supabase.co
```

The public browser key is stored in `app.js`. Admin edits are protected by the database function `update_wine_state_with_pin`, which checks the PIN inside Supabase.

If the PIN needs changing, update the `admin_pin_hash` row in Supabase with:

```sql
update app_settings
set value = crypt('NEW_PIN_HERE', gen_salt('bf'))
where key = 'admin_pin_hash';
```
