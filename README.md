# Clerkship Overlap App

A deployable MVP for medical school clerkship overlap tracking.

## What it does
- requires school email sign-in with Supabase magic links
- lets each student paste a schedule email and parse it
- ignores the useless trailing `Assigned .... 3/4/2026`
- lets students edit schedules later
- lets students add or update site locations later
- shows overlaps by block without a classmate search page
- mobile friendly static frontend

## Files
- `index.html` – main app UI
- `styles.css` – styling
- `src/config.js` – add your Supabase URL, anon key, and allowed school domain
- `src/app.js` – parser, auth, CRUD, overlap logic
- `supabase.sql` – database schema and row-level-security policies
- `vercel.json` – static hosting config

## Deploy to Vercel + Supabase

### 1. Create Supabase project
- create a new project in Supabase. 28M3Clerkship Pass: rztvEBq6NPfOFsom
- in the SQL editor, run `supabase.sql`
- in Authentication > Providers > Email, enable email auth / magic links
- in Authentication > URL Configuration, add your Vercel URL as the site URL and redirect URL

### 2. Update config
Edit `src/config.js`:
- `supabaseUrl`
- `supabaseAnonKey`
- `allowedEmailDomains` (for example `['wright.edu']`)

### 3. Deploy to Vercel
- create a GitHub repo
- upload these files
- import the repo into Vercel
- deploy

Because this is a static site, Vercel deployment is basically one click after the repo is connected.

## How editing works
When a user saves their schedule, the app replaces that user's prior schedule entries with the new edited set. This makes future schedule changes easy.

## Notes
- There is intentionally no classmate search page.
- The app allows all signed-in users to read overlap data from the class, but only edit their own profile and schedule.
- Site locations can be blank at first and filled in later.
