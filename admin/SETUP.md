# MNSW Studio content admin setup

The admin is published at `https://maneesawang-studio.github.io/MyGallery/admin/`. It edits `data/projects.json` and uploads raster images into `image/projects/`, then commits each change to the repository's `main` branch. Saving project data and the generated project URLs in `sitemap.xml` happens in a single Git commit.

## Security model

- Only GitHub App user access tokens are used; no GitHub token or client secret is included in the Pages site.
- The GitHub App must be installed on the `maneesawang-studio/MyGallery` repository with **Contents: read and write** permission.
- The Cloudflare Worker checks both the configured GitHub username allowlist and write permission to the configured repository for every admin API request.
- The admin keeps access and refresh tokens in memory only. Reloading the admin page requires signing in again.
- The Worker accepts browser API calls only from the configured GitHub Pages origin and limits uploads to PNG, JPEG, and WebP files up to 5 MB.

## Deploy the Cloudflare Worker

1. Install Wrangler and sign in to the Cloudflare account that will host the Worker.
2. From `cloudflare-worker/`, deploy `worker.js` with `wrangler.toml`:

   ```powershell
   npx wrangler deploy
   ```

3. In `wrangler.toml`, set `ALLOWED_GITHUB_USERS` to the GitHub login(s) allowed to edit content. Keep `ADMIN_ORIGIN` as `https://maneesawang-studio.github.io`. The repository owner, name, and branch are already set to `maneesawang-studio/MyGallery` and `main`.
4. Create a GitHub App in GitHub **Settings → Developer settings → GitHub Apps**:
   - Set the homepage URL to `https://maneesawang-studio.github.io/MyGallery/admin/`.
   - Set the user authorization callback URL to `https://<your-worker-name>.<your-account>.workers.dev/auth/callback`.
   - Set only the repository permission **Contents: Read and write**. Disable webhook delivery if the app does not need it.
   - Install the app on **Only select repositories** and select `MyGallery`.
5. Store the GitHub App credentials as Worker secrets (never add them to this repository):

   ```powershell
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

   Redeploy after changing Worker configuration.

## Connect the admin to the Worker

Set `apiUrl` in `admin/config.js` to the Worker origin, without a trailing slash:

```js
apiUrl: 'https://<your-worker-name>.<your-account>.workers.dev'
```

Commit and publish the site to GitHub Pages. Open the admin URL, sign in with an allowlisted GitHub account, and edit a project. **บันทึกขึ้น GitHub** commits project data; image uploads are committed as soon as the upload completes, so save the project after choosing the new image.

## Project content

Projects are stored in `data/projects.json`. Each entry has a title, subtitle/client, year, image path, Thai and English concept and description, and a `fields` array for additional bilingual label/value pairs. The project detail page displays the concept, description, and any additional fields that have values.
