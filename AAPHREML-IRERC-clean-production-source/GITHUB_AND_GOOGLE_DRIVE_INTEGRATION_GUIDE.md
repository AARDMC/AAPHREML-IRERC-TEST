# GitHub Pages + Google Apps Script Deployment Guide

This project keeps application source in GitHub, publishes the frontend with GitHub Pages, and runs the backend in Google Apps Script. The deployment builds one Apps Script source file named Code.gs plus the required appsscript.json manifest. Do not edit the generated bundle directly.

## Before deployment

The IDs below are already set in server/Config.gs from the links supplied by the owner:

- CFG.DB_SS_ID: application database spreadsheet
- CFG.SHEET_ID: scanner spreadsheet
- CFG.FOLDER_ID: Drive folder for protocol documents

The Apps Script account that deploys the web app must be able to edit both spreadsheets and the Drive folder. Confirm ownership and policies with the institution. Do not commit credentials, signature images, or research records.

## Create the Apps Script project and first deployment

1. Clone this repository and install Node.js 22, npm, and Google clasp. Enable the Apps Script API for the Google account that will own/deploy the project.
2. Authenticate clasp as that institutional account with clasp login.
3. Build the Apps Script bundle: node scripts/build-gas.js. It creates .gas-build/Code.gs, .gas-build/appsscript.json, and an ignore file that excludes other source files.
4. Create the standalone Apps Script project from the generated folder:

       cd .gas-build
       clasp create --type standalone --title "AAPHREML-IRERC"
       clasp push

   The resulting .gas-build/.clasp.json contains the script ID. Keep this file private.
5. Open the new project in the Apps Script editor. Run initDatabase_() once and approve the requested Google services. Confirm the expected tabs are created in the database and scanner spreadsheets.
6. In Project Settings → Script Properties, set INITIAL_ADMIN_EMAIL and a unique INITIAL_ADMIN_PASSWORD (at least 12 characters). Run bootstrapAdministrator_() once from the editor. On success, both temporary properties are removed. Never place the password in GitHub.
7. Upload the official signature to restricted Drive storage and set SIGNATURE_FILE_ID as a Script Property if the workflow requires it.
8. Create the first web-app deployment in the Apps Script editor or with clasp deploy --description "Initial IRERC backend". Select Execute as: Me and the approved institutional access policy. Copy the deployment ID from the deployment details. The workflow updates this existing deployment on future commits.

## Configure GitHub Actions and publish

1. In GitHub, open Settings → Environments and create irerc-production.
2. Add environment variable IRERC_SCRIPT_ID using the Apps Script project ID, and IRERC_DEPLOYMENT_ID using the deployment ID from the previous step.
3. Add environment secret CLASPRC_JSON with the complete authorized account's clasp credential JSON. Obtain it from the account's local clasp credential file. Treat it as a password; do not paste it into chat, commits, or logs. Restrict who can change the environment.
4. Ensure the repository can use GitHub Pages with GitHub Actions as the build/deployment source. On merge, the Deploy AAPHREML-IRERC workflow builds and pushes the Apps Script bundle, updates its web-app deployment, builds the Pages frontend with the backend URL, then publishes Pages.
5. When the workflow succeeds, open [the portal](https://aardmc.github.io/AAPHREML-IRERC/) and verify sign-in. Check Actions logs if either deployment job fails.

The workflow is .github/workflows/deploy-irerc.yml. Pull requests run source/preview validation only; they do not deploy production. Production deployment occurs on a qualifying push to main or a manual workflow dispatch.

## What is deployed

- GitHub Pages serves the frontend; the Apps Script web app serves only the backend bridge (and a small link page at its root).
- The bridge accepts messages only from the configured https://aardmc.github.io origin and exposes the defined api* endpoints except database initialization.
- apiInitDatabase is not exposed to the public bridge. Initialization and first-administrator setup are performed only from the Apps Script editor by an authorized owner.
- The web app runs as the deploying account. Anonymous entry allows the bridge to load without a Google login; application APIs still require portal sessions and role checks.

Apps Script's ALLOWALL frame setting is required for the cross-origin bridge. This allows framing at the browser level, so the bridge also validates the configured Pages origin and only accepts a fixed list of API names. See Google's [HtmlService XFrameOptionsMode reference](https://developers.google.com/apps-script/reference/html/x-frame-options-mode) and [HTML service client-to-server communication guide](https://developers.google.com/apps-script/guides/html/communication).

## Updating the portal

Make changes in GitHub source files, review the pull request and CI checks, then merge to main. The workflow regenerates the Apps Script bundle; only Code.gs and appsscript.json are pushed to Apps Script. The UI and modular source remain in GitHub. Review the Actions run for both backend and Pages deployment completion.
