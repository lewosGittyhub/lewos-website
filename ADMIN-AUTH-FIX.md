# Lewos admin-auth fix — 12 September 2026

## Aanleiding

Op `https://lewos.co/admin/` verscheen bij het aanvragen van een magic sign-in link:

> We could not reach the sign-in service.

De Supabase Auth-gebruikers bestonden nog niet. Daarom zijn eerst de twee beheerders uit `public.lewos_admins` als Supabase Auth-gebruikers uitgenodigd:

- `lewos.co@gmail.com` — rol `admin`
- `accomodation.fontecha@gmail.com` — rol `accommodation`

Beide uitnodigingen zijn in Supabase Dashboard → Authentication → Users verstuurd. Controlequery bevestigde voor beide gebruikers een `invited_at`-tijdstip. `email_confirmed_at` en `last_sign_in_at` blijven leeg totdat de uitnodigingslink wordt geopend.

## Oorzaak 1: Content Security Policy

De live `_headers` stond externe verbindingen alleen toe naar de eigen site:

```text
connect-src 'self'
```

De adminpagina doet de OTP-aanvraag rechtstreeks naar de Supabase Auth-host. De browser blokkeerde die aanvraag daarom als netwerkfout.

### Wijziging

In `_headers` is alleen de eigen Supabase-projecthost toegevoegd:

```text
connect-src 'self' https://obnkmuhcpkfwqazvqawq.supabase.co
```

De rest van de bestaande CSP is ongewijzigd gebleven.

## Oorzaak 2: tijdelijke Supabase-mailrate-limit

Na de uitnodigingen en testaanvragen gaf Supabase Auth tijdelijk terug:

```json
{
  "code": 429,
  "error_code": "over_email_send_rate_limit",
  "msg": "email rate limit exceeded"
}
```

De frontend behandelde iedere niet-succesvolle response als een algemene verzendfout. Dat is aangepast in `admin/admin.js`: HTTP 429 toont nu expliciet:

> The sign-in email service is temporarily rate-limited. Please use your latest invitation email or try again later.

De eerdere uitnodigingsmail is een geldige directe ingang. Zodra de tijdelijke limiet is opgeheven, kan de knop opnieuw worden gebruikt.

## Live codewijzigingen

Commits op branch `fix-admin-login`, naar `origin/main` gepusht:

- `6163a10` — `Herstel admin loginconfiguratie`
- `edcb576` — `Sta Supabase toe in admin CSP`
- `8ad96b5` — `Maak Auth mail rate limit duidelijk`

De eerste commit bevatte de publieke Supabase-configuratie-fallback in `netlify/functions/admin-config.mjs`. Er is geen service-role key of JWT-secret naar de browser gebracht.

## Verificatie

Live gecontroleerd:

- `https://lewos.co/admin/` geeft HTTP 200.
- De live CSP bevat `https://obnkmuhcpkfwqazvqawq.supabase.co` in `connect-src`.
- De live `admin.js` bevat de nieuwe 429-melding.
- De Supabase Auth-aanvraag bereikt Supabase en geeft nu aantoonbaar een rate-limit-response terug; de oorspronkelijke browserblokkade is weg.

## Wat Claude nog moet weten

1. Laat Robert en Nadine eerst de uitnodigingslink uit hun mailbox openen.
2. Daarna testen zij `https://lewos.co/admin/` met het juiste e-mailadres.
3. Als opnieuw een magic link wordt aangevraagd voordat de Supabase-mailrate-limit is verstreken, is de nieuwe tijdelijke-limitmelding verwacht gedrag.
4. Controleer na eerste login in Supabase Auth dat `email_confirmed_at` en `last_sign_in_at` zijn gevuld.

## Niet uitgevoerd

De aparte branch met de extra-nachten-boekingsflow is in deze hotfix niet opnieuw naar productie gemerged. Deze overdracht gaat uitsluitend over de admin-authenticatie, Supabase-gebruikers en de live CSP/frontend-fix.
