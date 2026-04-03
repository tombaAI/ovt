# První deploy webu s databází bez e-mailu

- Datum: 2. 4. 2026
- Cíl: dostat první verzi webu na Vercel tak, aby běžela stránka a fungovalo server-side připojení do PostgreSQL v Supabase.
- Mimo rozsah tohoto kroku: Resend, vlastní doména, Google OAuth, cron, příchozí pošta.

## 1. Co je už připravené v repozitáři

V repozitáři už je připravené toto:

- Next.js aplikace s App Routerem
- základní UI stránka pro technické ověření
- health endpoint aplikace
- health endpoint databáze
- health endpoint e-mailu, který je pro první deploy volitelný
- první SQL migrace ve složce `supabase/migrations`

Pro první deploy tedy nepotřebuješ nic programovat. Potřebuješ jen správně nastavit GitHub, Vercel a Supabase.

## 2. Co musíš udělat ty na GitHubu

GitHub je v tomhle kroku nejjednodušší.

### 2.1 Co zkontrolovat

- repozitář existuje a je pushnutý na `origin`
- hlavní branch je `main`
- ve Vercelu budeš importovat právě tento repozitář

Aktuální remote je připravený na GitHub repozitář `tombaAI/ovt`.

### 2.2 Co nastavovat nemusíš

Pro první deploy nemusíš na GitHubu nastavovat:

- GitHub Secrets
- GitHub Actions
- branch protection kvůli Vercelu
- žádný OAuth provider

Pokud budeš nasazovat přes Vercel import z GitHubu, GitHub v této fázi slouží hlavně jako zdroj kódu.

## 3. Co musíš udělat ty na Supabase

Použij existující projekt:

- název: `OVT_administration`
- dashboard: `https://supabase.com/dashboard/project/keamjgyijegxmqnyvtys`

### 3.1 Nahraj první migraci

Otevři v Supabase:

- SQL Editor

Do SQL Editoru vlož obsah souboru:

- `supabase/migrations/20260402120000_bootstrap.sql`

Potom spusť SQL.

Výsledek má být:

- schema `app`
- tabulka `app.admin_users`
- tabulka `app.mail_events`

Poznámka:

`app.mail_events` tam zůstává i když e-mail teď nenasazuješ. Není to problém. Je to jen připravený základ pro další etapu.

### 3.2 Připrav connection string pro Vercel

V Supabase otevři:

- Connect

Zkopíruj connection string pro PostgreSQL.

Pro Vercel doporučuji vzít connection string, který Supabase nabízí pro pooler nebo transaction pooler, pokud je v dashboardu k dispozici. Pro serverless nasazení je to praktičtější než přímý DB host.

Do Vercelu pak půjde jako hodnota proměnné:

- `DATABASE_URL`

### 3.3 Co na Supabase teď nenastavovat

Teď zatím nenastavuj:

- Google provider v Authentication
- RLS policies
- Storage bucket kvůli importům
- cokoliv kolem e-mailu

Pro první deploy to není potřeba.

## 4. Co musíš udělat ty na Vercelu

Použij existující Vercel účet nebo tým:

- `https://vercel.com/tombaais-projects`

### 4.1 Založ projekt z GitHub repozitáře

Ve Vercelu:

1. klikni na Add New Project
2. vyber GitHub repozitář `tombaAI/ovt`
3. framework by měl Vercel rozpoznat jako Next.js automaticky
4. root directory nech prázdnou nebo repository root
5. build command nech výchozí
6. output directory nech výchozí

### 4.2 Nastav environment variables

Ve Vercelu nastav pro Production minimálně tyto proměnné:

1. `DATABASE_URL`
   Hodnota: connection string z Supabase dashboardu v kroku Connect.

2. `ADMIN_EMAILS`
   Hodnota: seznam admin e-mailů oddělený čárkou.
   Pro první krok klidně jen jeden e-mail.

3. `APP_BASE_URL`
   Volitelné.
   Pokud ji nastavíš, použij produkční URL aplikace na Vercelu. Pro první deploy ji ale klidně nech prázdnou.

### 4.3 Co na Vercelu teď nenastavovat

Zatím nenastavuj:

- vlastní doménu `sprava.ovtbohemians.cz`
- `RESEND_API_KEY`
- `MAIL_FROM`
- `MAIL_REPLY_TO`
- cron jobs

Tohle všechno přijde až po úspěšném prvním deployi.

## 5. Jak poznáš, že je první deploy správně

Po deployi otevři:

- hlavní stránku aplikace
- `/api/health`
- `/api/health/db`

Správný stav je:

- hlavní stránka se normálně načte
- `/api/health` vrátí `ok: true`
- `/api/health/db` vrátí, že je připojeno k databázi a první migrace je přítomná

Pokud `/api/health/db` hlásí, že migrace chybí, znamená to:

- connection string funguje
- ale ještě jsi nespustil SQL migraci v Supabase

Pokud `/api/health/db` hlásí chybu připojení, znamená to typicky:

- špatný `DATABASE_URL`
- špatné heslo nebo user
- nevhodný connection string pro serverless prostředí

## 6. Doporučené přesné pořadí

1. Na Supabase spusť první migraci.
2. Na Supabase zkopíruj connection string z Connect.
3. Ve Vercelu založ projekt z GitHub repozitáře.
4. Ve Vercelu nastav `DATABASE_URL`, `ADMIN_EMAILS` a `APP_BASE_URL`.
5. Spusť první deploy.
6. Otevři `/api/health/db` a ověř, že databáze i schema jsou připravené.

## 7. Co bych doporučil jako další krok hned po prvním deployi

Jakmile poběží první deploy bez e-mailu, další rozumný krok je:

1. přidat jednoduchý admin access gate
2. přidat vlastní doménu `sprava.ovtbohemians.cz`
3. teprve potom řešit Resend a mailovou subdoménu

## 8. Minimální technický test e-mailu bez vlastní domény

Pokud chceš jen technicky ověřit, že Vercel umí volat Resend, můžeš to udělat ještě před vlastní doménou.

### 8.1 Co nastavit na Vercelu

Přidej tyto proměnné:

1. `RESEND_API_KEY`
   Hodnota: API key z Resend.

2. `MAIL_TEST_TO`
   Hodnota: tvoje testovací e-mailová adresa.

`MAIL_FROM` teď nastavovat nemusíš. Pokud chybí, aplikace použije testovací sender `onboarding@resend.dev`.

### 8.2 Jak poznáš, že je to připravené

Otevři:

- `/api/health/email`

Správný stav je:

- `ok: true`
- detail říká, že konfigurace běží v test režimu přes `onboarding@resend.dev`

### 8.3 Jak poslat první testovací e-mail

Pošli POST na:

- `/api/email/test`

Buď:

- bez body, pokud máš nastavené `MAIL_TEST_TO`

nebo s JSON body:

```json
{
  "to": "tvuj-email@example.com"
}
```

Tím ověříš:

- Vercel environment variables
- komunikaci z aplikace do Resend API
- základní server-side email route

Teprve potom má smysl řešit vlastní doménu a adresu typu `sprava@mail.ovtbohemians.cz`.