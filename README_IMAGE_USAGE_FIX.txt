V22 image usage fix

This patch updates next.config.js so Next.js does not use Vercel Image Optimization for external sports logos/headshots.

Why:
- Your Image Optimization usage was 4.2K / 5K.
- Function calls and bandwidth were fine.
- Setting images.unoptimized = true keeps the app working while avoiding the Vercel Image Optimization free-tier limit.

Updated file:
- next.config.js

After installing:
- Stop and restart npm run dev.
- Redeploy to Vercel if testing production.
- If the installed app icon is cached on your phone/computer, remove and reinstall the PWA shortcut.
