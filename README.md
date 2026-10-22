# MyWatchlist

Een webapp om films, series en anime bij te houden die je hebt gekeken, ze een cijfer van 1 tot 10 te geven en per aflevering te zien waar je bent gebleven. Gegevens komen van TMDB (films en series) en Jikan (MyAnimeList).

Wat de app kan: zoeken en toevoegen, cijfers (ook per seizoen), afleveringen afvinken, *Verder kijken* en *Binnenkort* met uitzenddata, waar je iets kunt streamen in Nederland, labels en een Wil ik zien-lijst met prioriteit, kijkgeschiedenis en herkijken, aanbevelingen, statistieken. Je kunt de app installeren op je telefoon (Safari: Deel → Zet op beginscherm; Chrome: App installeren).

Gebouwd met React, Vite, Tailwind CSS en Supabase (inloggen en database). Bedoeld om te draaien op Netlify.

## Eenmalig instellen

### 1. Supabase (database en inloggen)

1. Maak een gratis account op [supabase.com](https://supabase.com) en klik op **New project**.
2. Open in je project **SQL Editor → New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**.
3. Ga naar **Authentication → URL Configuration** en vul bij **Site URL** het adres van je Netlify-site in (bijvoorbeeld `https://mijn-watchlist.netlify.app`, zonder `/` aan het eind) en voeg onder **Redirect URLs** hetzelfde adres met `/**` erachter toe (`https://mijn-watchlist.netlify.app/**`). Anders sturen de bevestigingsmails je naar `localhost`.
4. Kopieer onder **Project Settings → API** de **Project URL** en de **anon public** key. Die heb je nodig bij Netlify.

### 2. Netlify (online zetten)

1. Kies op [netlify.com](https://netlify.com) **Add new site → Import an existing project** en selecteer deze GitHub-repository. De build-instellingen staan al in `netlify.toml`.
2. Voeg onder **Site configuration → Environment variables** toe:
   - `VITE_SUPABASE_URL`: de Project URL van Supabase
   - `VITE_SUPABASE_ANON_KEY`: de anon public key van Supabase
3. Start een nieuwe deploy. Open de site, kies **Registreren** en bevestig je e-mailadres.

> Wil je dat alleen jij een account kunt maken? Zet in Supabase onder **Authentication → Sign In / Providers** de optie **Allow new users to sign up** uit nadat je je eigen account hebt aangemaakt.

### 3. TMDB (zoeken naar films en series)

1. Maak een gratis account op [themoviedb.org](https://www.themoviedb.org/signup) en vraag onder [Settings → API](https://www.themoviedb.org/settings/api) een API-sleutel aan (kies *Developer*, persoonlijk gebruik).
2. Kopieer het **API Read Access Token** (de lange sleutel) en zet het in Netlify onder **Environment variables** als `TMDB_API_TOKEN`.
3. Start een nieuwe deploy.

De sleutel blijft geheim: de browser praat met een Netlify Function (`netlify/functions/tmdb.mts`), die TMDB aanroept. Anime komt van [Jikan](https://jikan.moe) (MyAnimeList) en heeft geen sleutel nodig.

## Updates

Als `supabase/schema.sql` is veranderd, voer je het hele bestand opnieuw uit in de SQL Editor. Bestaande gegevens blijven gewoon staan.

## Lokaal ontwikkelen

```bash
cp .env.example .env   # en vul je eigen waarden in
npm install
npx netlify dev   # start de app inclusief de TMDB-function
```

Met `npm run dev` werkt alles behalve zoeken in TMDB, omdat de Netlify Function dan niet draait.
