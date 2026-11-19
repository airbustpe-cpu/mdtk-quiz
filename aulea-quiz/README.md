# Aulea Device Usage Record

Online case record (跟刀報告) for Aulea Veloxion demo and clinical evaluation use in SEA.
Runs as its own Netlify site, separate from ci747.com's main site.

- `public/index.html` – the form, record list and Excel export (single page).
- `src/auth.js` – sign-in wrapper around Netlify Identity, bundled to `public/auth.js` by `npm run build`.
- `netlify/functions/api.mts` – the only way to data. Every call needs a signed-in user;
  deleting records and editing the equipment register need the `admin` role.
- Data lives in the Netlify Blobs store `aulea-usage` (`reports/<report no>`, `config/equipment`).

## Access

Netlify dashboard → project → Identity:

1. Enable Identity and set Registration to **Invite only**.
2. Invite users by email. They set their own password from the invitation link.
3. To make someone an administrator, edit the user and add the role `admin`.
   The role applies from that user's next sign-in.
