# Deployment Guide (Render)

## 1. Overview
This app is an Express + EJS server with MongoDB Atlas, sessions (connect-mongo), SSE (Server-Sent Events) for real-time updates, file uploads for menu images, and admin/customer role separation.

## 2. Required Environment Variables
Set these in the Render dashboard (Web Service > Environment):
- NODE_ENV=production
- PORT=3000
- SESSION_SECRET=YOUR_LONG_RANDOM_SECRET
- MONGO_URL=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority&appName=Old-Rao
- MONGO_TLS_INSECURE=false  # leave false in production
- (Optional) UPLOAD_DIR=public/uploads/menu

## 3. Image Upload Strategy
You have two choices:
### A. Local Disk (Persistent Volume)
Pros:
- Simpler; existing code already saves files locally.
Cons:
- Requires adding a Render Disk (paid) for persistence.
- Scaling to multiple instances requires shared storage or moving to object storage.
Setup:
1. In Render, add a Disk to the service (e.g., /app/public/uploads).  
2. Keep `UPLOAD_DIR` pointing to `public/uploads/menu`.  
3. Ensure backups manually if needed.

### B. Object Storage (e.g. S3/R2)
Pros:
- Durable, scalable, independent of deploys.
- Multiple instances can share assets.
Cons:
- Requires code changes (upload to S3 and store URL instead of local path).
Use when expecting multi-region scaling or heavy asset volumes.

## 4. Docker Deployment (Render)
Render can auto-detect the Dockerfile. Key points:
- Uses Node 20 Alpine.
- Runs `npm ci --only=production`.
- Starts with `node server.js`.
- Port 3000 exposed.

## 5. Build & Release Flow
On push to main (if connected to GitHub):
1. Render builds the Docker image.
2. Installs prod deps.
3. Launches container with env vars.
4. Health check: manually configure `/healthz` as health endpoint in settings for better status visibility.

## 6. Reverse Proxy / SSE Considerations
Render's proxy supports SSE. No special config necessary, but keep connections efficient:
- Ensure you do not compress SSE responses (helmet & compression applied globally—SSE in this app uses text/event-stream which most compression middleware skips by default).
- Avoid sending excessive events.

## 7. Security Middleware
Already integrated:
- helmet
- compression
- morgan logging
- basic rate limit for /login & /signup
Add more rate-limits for POST /contact, POST /reservation if needed.

## 8. Session Store
Uses connect-mongo with Atlas URI. Ensure:
- Atlas network access includes Render egress IP ranges.
- Strong SESSION_SECRET.

## 9. Monitoring & Logs
- Use /healthz for liveness.
- Render dashboard shows logs; morgan provides request logs.
- Consider adding application-level structured logs for order status changes.

## 10. Scaling Notes
- Horizontal scaling with local disk uploads will lead to inconsistency (each instance has its own files). Move to object storage before scaling beyond 1 instance.
- SSE clients connect to a single instance; with multiple instances you need a pub/sub (Redis) to broadcast across nodes.

## 11. Future Hardening
- Add request validation (express-validator) to all input forms.
- Add more granular rate limits.
- Implement Redis or similar for scalable SSE broadcasting.
- Integrate a metrics endpoint (/metrics) for Prometheus.

## 12. Quick Local Docker Test
```bash
docker build -t oldrao:latest .
docker run -p 3000:3000 --env-file .env oldrao:latest
```

## 13. Troubleshooting Atlas TLS
If TLS issues appear on Render:
- Confirm correct connection string & user permissions.
- Ensure not using debug insecure flags in production.
- Check Atlas cluster is in ACTIVE state.

## 14. Rollback Strategy
- Keep previous image tag (Render stores build history).
- Revert Git commit or redeploy last successful build.

---
For S3 migration guidance or multi-instance SSE design, open a new task.
