# University Smart-Assets

<img src="public/brand/custody-bright.svg" alt="Custody mark" width="128">

An attendant scans a barcode or a QR tag, checks the equipment out to a student, and checks it back in. You download the reports as CSV and as PDF.

## Run the app

Install [Bun](https://bun.sh) 1.4.4. `mise.toml` pins that version.

```bash
bun install
cp .env.example .env.local
```

Set `BETTER_AUTH_SECRET` in `.env.local` to at least 16 characters. The server exits if the value is missing or shorter. `DATABASE_URL` is already `sqlite:./data/app.db`.

```bash
bun run dev
```

Open http://localhost:3000. The first start creates `data/app.db`, applies the migrations, and inserts Daystar, Strathmore, and the University of Nairobi.

Create the first administrator with:

```bash
bun run admin:create -- --email you@example.com --name "Your Name" --password "pick-your-own"
```

Sign-in rejects a password shorter than 8 characters. The command exits if an administrator already exists.

## Run the tests

```bash
bun test
bun run typecheck
```
