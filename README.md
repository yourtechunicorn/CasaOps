# Casa Ops

A property management dashboard for short-term rental operators. Built to track income, expenses, bookings, and maintenance across multiple units — with a roadmap toward owner-facing reporting and cleaner task management.

**Status:** First iteration — core tracking features built, real data connected via Supabase.

---

## What It Does

- **Overview dashboard** — income, expenses, and occupancy across all units at a glance
- **Per-unit view** — drill into any unit's performance individually
- **Bookings** — log and manage bookings, with platform breakdown (Airbnb, Booking.com, direct, etc.)
- **Expenses** — track costs per unit with categorization
- **Guest origins** — visualize where guests are coming from by country
- **Maintenance tracker** — log and monitor unit maintenance tasks
- **CSV import** — bulk import bookings from exported platform reports

## Roadmap

- Owner portal — property owners can log in and see their unit's earnings
- Cleaner view — assigned units, task checklist, laundry tracking, task submission

---

## Tech Stack

- React + Vite
- Tailwind CSS
- Supabase (auth + database)
- Netlify (deployment)

---

## Setup

`\ash
git clone https://github.com/yourtechunicorn/casa-ops
cd casa-ops
npm install
cp .env.example .env.local
`\

Add your Supabase credentials to `.env.local`:

`\
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
`\

Then run:

`\ash
npm run dev
`\

---

*By Pam Baroro — [pambaroro.com](https://pambaroro.com)*
