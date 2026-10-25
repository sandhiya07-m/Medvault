# MedVault: Offline-First Digital Health Record System

MERN + PWA implementation of the MedVault project (SRM Easwari Engineering College, Dept. of CSD):
an offline-first health record system for rural clinics with encrypted local storage and automatic sync.

```
medvault/
├── client/   React PWA (Vite) – IndexedDB (Dexie), AES-256-GCM, QR, sync queue, service worker
└── server/   Node + Express + MongoDB (Mongoose) – JWT/RBAC, sync + CRDT merge, audit log
```

## Quick start

Requirements: Node 18+ and a MongoDB (local, or a free MongoDB Atlas cluster).

```bash
cd medvault
npm run install:all                 # installs root, server and client dependencies

cp server/.env.example server/.env  # then edit MONGO_URI, JWT_SECRET, DATA_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # paste as DATA_KEY

npm run seed                        # sample rural-clinic data + demo accounts
npm run dev:server                  # API on http://localhost:5000
npm run dev:client                  # PWA on http://localhost:5173
```

Demo accounts (password `Password@123`): `admin@medvault.test`, `doctor@medvault.test`, `worker@medvault.test`.

**Production / single host:** `npm run build` then `npm start`. Express serves the built PWA from `client/dist`
together with the API, so one Render service is enough. (The service worker needs HTTPS or localhost.)

**Try the offline mode:** sign in once online, then in browser DevTools → Network select *Offline*.
Register a patient, add a visit, search, open the QR card; everything works. Go back online and watch the status bar
drain "pending" to 0 (or open **Sync Center**).

## How it maps to the review deck

| Slide topic | Where |
|---|---|
| Roles: health worker / doctor / admin, JWT, RBAC | `server/src/middleware/auth.js`, `routes/*`, role guards in `client/src/App.jsx` |
| Register patient, unique Health ID + QR | `client/src/lib/ids.js`, `store.createPatient`, `components/HealthIdCard.jsx` |
| Search by name / Health ID / QR scan | `pages/Patients.jsx`, `components/QrScanner.jsx` (camera + manual fallback) |
| Visits, prescriptions, lab results, scans | `components/VisitTimeline.jsx`, `pages/PatientRecord.jsx` (photos are resized and stored encrypted) |
| AES-256 at rest | device: `client/src/lib/crypto.js` (Web Crypto AES-GCM, PBKDF2 key from password, kept in memory only). Server: `server/src/utils/crypto.js` (AES-256-GCM on every clinical payload) |
| Offline login | A verifier encrypted with the password-derived key lets the user sign in with no network after one online sign-in |
| Delta sync, retry queue | `client/src/lib/sync.js` (dirty-flag queue, push then pull since cursor, exponential backoff) |
| Timestamp + CRDT conflict resolution | `server/src/utils/merge.js` and the identical `client/src/lib/merge.js`: every field is a Last-Writer-Wins register (timestamp, device-id tiebreak). Merge is commutative, associative and idempotent, so retries never duplicate or lose data. Deletes are tombstones |
| Audit logging | `server/src/utils/audit.js` → `synclogs` collection, viewable by admin |
| Admin: approve/deactivate users, audit logs, reports | `pages/Admin.jsx`, `server/src/routes/admin.js`, `audit.js` |
| API table (slide 13) | `/api/auth/register`, `/auth/login`, `/patients` (POST), `/patients/:healthId`, `/visits` (POST), `/sync/push`, `/sync/pull?since=`, `/audit` |
| Sample data seeded | `server/src/seed.js` |

Extra endpoints: `GET /api/patients`, `GET /api/visits?patientId=`, `GET/PATCH /api/admin/users`, `GET /api/admin/reports`.

## Design notes

* **Local-first:** screens read only from IndexedDB. The network is used only by the sync engine.
* **Per-user local databases:** each account on a shared phone gets its own encrypted database, so accounts cannot read each other's data.
* **Server stores clinical content encrypted;** only routing fields (`healthId`, `patientId`, timestamps) are plaintext for indexing. Admin reports use counts only.
* **Role rules on sync:** health workers and doctors write patients, visits and lab results; only doctors write prescriptions; admins have no access to clinical records.
* **Accounts:** staff can request an account (created `pending`, needs admin approval), or an admin can create users directly under Admin → Users → *Add user* (active immediately, any role) and reset passwords. Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `server/.env` to create the first admin on start; `ALLOW_SELF_REGISTER=false` turns off public sign-ups.
* The deployed layout from the deck also works: PWA on Vercel/Netlify (`client/vercel.json`, `client/public/_redirects` included),
  API on Render, database on Atlas. Set `VITE_API_URL` for the client build and `CORS_ORIGIN` on the server.

## Tests

```bash
npm test                      # server: merge (CRDT properties), AES-GCM, Health IDs
npm test --prefix client      # client: encrypted offline store, offline login check, two devices converging
```

## Known limitations / next steps

* Every device pulls all clinical records (fine for a district-scale pilot). Scope the pull by facility/region if data grows.
* Camera QR scanning needs HTTPS (or localhost) and a camera permission; manual Health ID entry is the fallback.
* Forgot-password / password-change flows are not implemented (a changed password prompts to reset the local copy on that device).
* Device clocks drive Last-Writer-Wins; the server rejects timestamps more than 24h in the future.
