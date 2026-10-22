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

## Automatische database-updates

Stel dit één keer in; daarna wordt de database bij elke deploy vanzelf bijgewerkt.

1. Klik in Supabase bovenaan op **Connect** en kies bij **Connection String** het type **Session pooler**. Kopieer de URI (begint met `postgresql://postgres.…@…pooler.supabase.com:5432/postgres`).
2. Vervang `[YOUR-PASSWORD]` door het databasewachtwoord dat je bij het aanmaken van het project koos. Weet je het niet meer? Stel een nieuw in via **Project Settings → Database → Reset database password**.
3. Zet de URI in Netlify onder **Environment variables** als `SUPABASE_DB_URL`. Vink **Contains secret values** aan en zorg dat de scope **Builds** aanstaat.
4. Start een nieuwe deploy. In de deploy-log zie je `[database] Bijgewerkt naar versie …`.

Zonder deze variabele werkt alles ook, maar dan voer je na een update zelf `supabase/schema.sql` uit in de SQL Editor. De app laat een melding zien als dat nodig is. Lukt het bijwerken tijdens de deploy niet, dan stopt de deploy en blijft de vorige versie online.

## Pushmeldingen

Meldingen bij nieuwe afleveringen worden elk uur verstuurd door een Netlify-functie. Die heeft `SUPABASE_DB_URL` (zie hierboven) en `TMDB_API_TOKEN` nodig, met de scope **Functions** aan naast **Builds**. De sleutels voor meldingen maakt de app zelf aan en bewaart ze in de database. Zet daarna in de app onder **Instellingen → Meldingen** de meldingen aan. Op iPhone werkt dat alleen in de app op je beginscherm (iOS 16.4 of nieuwer).

## Lokaal ontwikkelen

```bash
cp .env.example .env   # en vul je eigen waarden in
npm install
npx netlify dev   # start de app inclusief de TMDB-function
```

Met `npm run dev` werkt alles behalve zoeken in TMDB, omdat de Netlify Function dan niet draait.
