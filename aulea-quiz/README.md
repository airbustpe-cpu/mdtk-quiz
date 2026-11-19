# Aulea Device Usage Record

Online case record (跟刀報告) for Aulea Veloxion demo and clinical evaluation use in SEA.
Runs as its own Netlify site, separate from ci747.com's main site.

- `public/index.html` – the form, record list and Excel export (single page).
- `src/auth.js` – sign-in wrapper around Netlify Identity, bundled to `public/auth.js` by `npm run build`.
- `netlify/functions/api.mts` – the only way to data. Every call needs a signed-in user;
  deleting records and editing the equipment register need the `admin` role.
- Data lives in the Netlify Blobs store `aulea-usage` (`reports/<report no>`, `config/equipment`).

## Access

First administrator (one time, Netlify dashboard → project → Identity):

1. Enable Identity and set Registration to **Invite only**.
2. Invite yourself by email and set a password from the invitation link.
3. Edit your user and add the role `admin`.

After that, administrators manage everyone from the **Users** tab in the site:
add a user (a temporary password is generated and shown once), create a new
password, make or remove administrators, and remove users. Users with a
temporary password must choose their own at their next sign-in, and anyone can
use **Change password** in the header. Every API call re-reads the account from
Identity, so removing a user or changing a role takes effect immediately.
