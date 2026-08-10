# Shangri-La

The story of the annual Shangri-La lake weekend — a site that collects every summer
the crew has spent on a lake, organized as a timeline of lake "eras", with each year
linking to its Google Photos album.

Threemile Lake (Paw Paw, MI) → Magician Lake (Dowagiac, MI) → Shavehead Lake
(Vandalia, MI) → Fish Lake (White Pigeon, MI) — and wherever it goes next.

## Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (via `better-sqlite3`)
- **Frontend**: Vanilla JS, HTML5, CSS3

## Setup

```bash
npm install
npm start        # production
npm run dev      # development (nodemon)
```

Server listens on `http://localhost:3000` by default.

## Environment Variables

| Variable       | Default         | Description                                                        |
|----------------|-----------------|--------------------------------------------------------------------|
| `PORT`         | `3000`          | HTTP server port                                                   |
| `DB_PATH`      | `./weekends.db` | SQLite database path (auto-created on first run)                   |
| `ADMIN_SECRET` | *(unset)*       | Secret required to add/edit/delete weekends; set before deploying. When unset, editing is open (dev mode). |

## How it works

- **Timeline** (`/`) — every summer on record, grouped into eras by lake. Consecutive
  years at the same lake share a section and an accent color. The current year's
  weekend is featured at the top as "This summer".
- **Admin** (`/admin`) — add or edit a summer: year, lake, location, dates, notes,
  Google Photos album link, and cover photo. Changes require the `ADMIN_SECRET`
  when one is set (the page remembers it in localStorage).

### Connecting Google Photos

Google no longer allows third-party sites to embed user-created albums via API,
so albums are connected by link:

- **Album link** — in Google Photos, open the album → Share → Create link, and paste
  it into the admin form. Each year card gets an "Open the album" button.
- **Cover photo** — open a photo in the album, right-click → "Copy image address"
  (an `lh3.googleusercontent.com` URL), and paste it as the cover URL. Years without
  a cover get a styled placeholder.

## API

| Method | Endpoint             | Description                                          |
|--------|----------------------|------------------------------------------------------|
| GET    | `/api/weekends`      | All weekends, ordered by year                        |
| POST   | `/api/weekends`      | Create or update a weekend (upsert by year; requires `ADMIN_SECRET` if set) |
| DELETE | `/api/weekends/:year`| Delete a weekend (requires `ADMIN_SECRET` if set)    |

## Database Schema

- `weekends` — year (PK), lake, location, dates, album_url, cover_url, notes

On first run with an empty database, the server seeds 2022–2026 (Magician,
Shavehead ×3, Fish Lake). Edit or extend the record — including the early
Threemile Lake years — from `/admin`.

---

## Previous project: Building Shangri-La (archived)

This repo previously hosted **Building Shangri-La**, a collaborative pixel-placement
web app where the same crew grew a shared island canvas over many weeks.

The complete project is preserved in git history:

- **Archived snapshot**: [`b2e9944`](https://github.com/mgriffioen/shangri-la/tree/b2e994497741c53964896aa01df4c7a192f16105)
- Restore locally: `git checkout b2e9944 -- .`
