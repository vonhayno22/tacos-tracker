Rocketise TACOS Tracker (live version for Netlify)

HOW IT WORKS
- You upload each month's reports in the admin page (after signing in). They are saved on Netlify's own storage.
- Each client has a private link: https://YOUR-SITE.netlify.app/client/<name>-<code>
- A client link always shows the latest saved data. You never re-deploy to update a client.
- You choose what each client can see ("Client link shows"). Hidden numbers are removed on the server before they are sent.

ONE-TIME SETUP (about 10 minutes)
1. GitHub: create a free account, then a new PRIVATE repository (e.g. tacos-tracker).
   Click "uploading an existing file", drag in everything from this folder (netlify folder, public folder,
   netlify.toml, package.json, package-lock.json, .gitignore) and click Commit.
2. Netlify: Add new site > Import an existing project > GitHub > choose the repository.
   Leave the build settings as they are (netlify.toml fills them in) and click Deploy.
   To keep the name tacostracker.netlify.app: Site configuration > Change site name.
   (If your current tacostracker site offers "Link repository" under Build & deploy, you can link the repository to it instead.)
3. Set your admin password: Site configuration > Environment variables > Add a variable
   Key: ADMIN_PASSWORD    Value: a long password only you know.
   Then go to Deploys > Trigger deploy > Deploy site, so the password takes effect.
4. Open your site, sign in with that password, add your clients and upload reports as usual.
   If this browser still holds data from the old version, a button "Move old browser data to the server" appears. Click it once.

EVERY MONTH
1. Sign in, pick the client, upload the Business Report and the advertised product report, Save week.
2. That's it. The client's link already shows the new data.

SENDING A CLIENT THEIR LINK
Pick the client and click "Copy client link". Send only that client their own link.
"New link" replaces it with a new code (the old link stops working).

NOTES
- Anyone with a client's link can open it. The code at the end makes it hard to guess.
- Use a long admin password. The site does not lock out repeated wrong guesses.
- Sponsored Brands spend with no product ID is left out of Total spend (the upload preview tells you the amount).
