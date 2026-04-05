## Terminal Down? Fix in 60 seconds.

1. ssh/open Mac terminal
2. cd ~/iam-pty
3. pm2 status          # check if iam-pty is online
4. pm2 start ecosystem.config.cjs   # if offline
5. pm2 save
6. curl http://localhost:3099/health   # should return: ok
7. curl https://terminal.inneranimalmedia.com/health   # should return: ok
8. cloudflared tunnel list   # confirm aa79ecd4 has connections

If tunnel shows 0 connections:
  cloudflared tunnel run inneranimalmedia   # in a separate terminal or restart cloudflared service

If PM2 dies on reboot:
  pm2 startup   # run printed command, then pm2 save

DO NOT:
- Rotate CLOUDFLARE_API_TOKEN unless it fails the /v4/user/tokens/verify check
- Restart the Cloudflare Worker for a PTY issue — they are independent
- Modify XTermShell.tsx — it was working before the PM2 process died
