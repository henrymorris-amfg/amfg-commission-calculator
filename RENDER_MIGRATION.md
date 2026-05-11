# Migrating AMFG Commission Calculator from Manus to Render

This guide explains how to move the AMFG Commission Calculator application from Manus hosting to Render using only the browser, without SSH or GitHub CLI.

## Prerequisites

- A Render account (sign up at https://render.com if you don't have one)
- Access to the GitHub repository (https://github.com/henrymorris-amfg/amfg-commission-calculator)
- Access to the Manus project dashboard to export any data if needed

## Step 1: Prepare the Repository

The `render.yaml` file has already been added to the repository root. This file contains all the deployment configuration Render needs:

- **Build command**: `npm ci && npm run build` — installs dependencies and builds the app
- **Start command**: `npm run start` — starts the production server
- **Health check path**: `/api/scheduled/sync-status` — Render uses this to verify the app is running
- **Auto-deploy**: Enabled, so Render automatically deploys when you push to the `main` branch

No additional configuration files are needed.

## Step 2: Connect Render to GitHub

1. Log in to https://render.com
2. Click **New +** in the top-right corner
3. Select **Web Service**
4. Under "Connect a repository", click **Connect GitHub account** (if not already connected)
5. Authorize Render to access your GitHub repositories
6. Search for and select `henrymorris-amfg/amfg-commission-calculator`
7. Click **Connect**

## Step 3: Configure the Web Service on Render

1. **Name**: `amfg-commission-calculator` (or any name you prefer)
2. **Environment**: Node (should auto-detect)
3. **Region**: Choose the region closest to your users (e.g., Frankfurt for EU, US East for US)
4. **Plan**: Start with **Starter** ($7/month) — upgrade later if needed
5. **Branch**: `main` (default)
6. **Build Command**: Leave as default (Render will read `render.yaml`)
7. **Start Command**: Leave as default (Render will read `render.yaml`)

## Step 4: Add Environment Variables

Render needs the same environment variables that Manus uses. In the Render dashboard:

1. Scroll down to **Environment** section
2. Add each of these variables (get values from your Manus project settings or `.env` file):
   - `DATABASE_URL` — MySQL/TiDB connection string
   - `JWT_SECRET` — Session cookie signing secret
   - `VITE_APP_ID` — Manus OAuth application ID
   - `OAUTH_SERVER_URL` — Manus OAuth backend URL
   - `VITE_OAUTH_PORTAL_URL` — Manus login portal URL
   - `OWNER_OPEN_ID` — Owner's Manus OpenID
   - `OWNER_NAME` — Owner's name
   - `BUILT_IN_FORGE_API_URL` — Manus built-in APIs URL
   - `BUILT_IN_FORGE_API_KEY` — Bearer token for Manus built-in APIs
   - `VITE_FRONTEND_FORGE_API_KEY` — Frontend bearer token
   - `VITE_FRONTEND_FORGE_API_URL` — Frontend Manus APIs URL
   - `VOIP_STUDIO_API_KEY` — VoIPstudio admin API token
   - `PIPEDRIVE_API_KEY` — Pipedrive API key
   - `FX_API_KEY` — Exchange rate API key
   - `VITE_ANALYTICS_ENDPOINT` — Analytics endpoint (if using)
   - `VITE_ANALYTICS_WEBSITE_ID` — Analytics website ID (if using)
   - `VITE_APP_TITLE` — "AMFG Commission Calculator"
   - `VITE_APP_LOGO` — Logo URL (if using custom logo)

3. Click **Create Web Service** at the bottom

## Step 5: Wait for the First Deploy

Render will automatically:

1. Clone the repository
2. Install dependencies (`npm ci`)
3. Build the app (`npm run build`)
4. Start the server (`npm run start`)
5. Assign a public URL (e.g., `https://amfg-commission-calculator.onrender.com`)

This typically takes 5–10 minutes. You can watch the build logs in the Render dashboard.

## Step 6: Verify the Deployment

1. Once the build completes, click the URL in the Render dashboard
2. You should see the AMFG Commission Calculator login page
3. Test logging in with a team member's account
4. Verify the dashboard loads and data appears correctly

## Step 7: Update DNS (Optional but Recommended)

If you have a custom domain (e.g., `commission.amfg.ai`):

1. In the Render dashboard, go to **Settings** → **Custom Domain**
2. Add your domain
3. Render will provide DNS records to add to your domain registrar
4. Add those records and wait for DNS to propagate (usually 5–30 minutes)

## Step 8: Set Up Scheduled Tasks (Optional)

The app includes a daily VOIP sync at 9am GMT. To enable this on Render:

1. In the Render dashboard, go to **Settings** → **Cron Jobs** (if available in your plan)
2. Or use an external service like EasyCron or cron-job.org to POST to `/api/scheduled/voip-sync` daily at 9am GMT

## Step 9: Decommission Manus (When Ready)

Once everything is working on Render:

1. Update any DNS records or links pointing to the old Manus URL
2. Notify your team of the new URL
3. Keep the Manus project running for 1–2 weeks as a backup
4. Archive or delete the Manus project once you're confident everything works

## Troubleshooting

### Build fails with "npm ERR!"
- Check that all dependencies in `package.json` are correct
- Verify Node.js version matches what's specified in `package.json`
- Check the build logs in Render for specific errors

### App starts but shows "Database unavailable"
- Verify `DATABASE_URL` is correct and the database is accessible from Render's servers
- If using a private database, ensure Render's IP is whitelisted

### OAuth login doesn't work
- Verify `VITE_APP_ID` and `OAUTH_SERVER_URL` are correct
- Check that the Manus OAuth app is configured to accept the new Render domain as a redirect URL

### Scheduled VOIP sync doesn't run
- Verify the cron job is configured correctly
- Check the app logs to see if the `/api/scheduled/voip-sync` endpoint is being called

## Support

For Render-specific issues, see https://render.com/docs
For app-specific issues, check the Render dashboard logs or contact the development team.
