# Website Health Monitoring & Auto-Recovery System

## Problem Statement
Modern web applications are expected to remain available continuously. Application failures can cause downtime and affect users. Manual detection and recovery can increase downtime. This project develops an automated monitoring and recovery system that continuously checks application health, detects failures, automatically restarts the failed application container, verifies recovery, and records incidents for analysis.

## Objective
To develop a DevOps-based system that continuously monitors the health of a web application and automatically recovers the application from common failures using containerization and automated monitoring.

## Features
- Demo web app (Node.js/Express) with `/health`, `/api/status`, `/api/metrics`, `/api/incidents`
- Safe failure simulation (a flag flips `/health` to 503; nothing is damaged)
- Monitor: checks every 10 s (configurable), records code, response time, error
- Failure threshold (default 3 consecutive failures), counter resets on success
- Auto-recovery: restarts the Docker container via the Docker Engine API, then verifies `/health`
- SQLite storage: health checks, incidents, recovery events
- Dashboard: status, response time, uptime %, totals, recoveries, alerts, history tables
- Jenkins pipeline, Docker Compose, AWS EC2 + optional Nginx

## Architecture
```
GitHub -> Jenkins (build/test/deploy) -> EC2 -> Docker Compose
                                                 |-- webapp  (:3000)  <-- /health every 10s --+
                                                 '-- monitor (:4000)  --------------------------'
monitor: check -> failure counter -> threshold(3) -> docker restart webapp -> verify -> log incident
```
Responsibilities are separate: **Jenkins** builds/tests/deploys; the **monitor** checks health and detects failure; the **recovery** step restarts, verifies and records.

The dashboard is served by the **monitor** (port 4000), not the web app, so it stays visible while the app is down.

## Technology Stack
HTML, CSS, JavaScript, Bootstrap (CDN) | Node.js, Express | SQLite (better-sqlite3) | Docker, Compose | GitHub, Jenkins | AWS EC2 Ubuntu, Nginx

## Project Structure
```
backend/    web app + /health          monitor/   checker, detection, recovery, dashboard API
frontend/   dashboard UI               database/  schema.sql
tests/      node:test tests            docker/    Dockerfiles, nginx.conf
Jenkinsfile docker-compose.yml .env.example .gitignore
```

## Installation and Running Locally
Requires Node.js 20+.
```bash
npm install
npm test
npm run start:app       # terminal 1 -> http://localhost:3000
npm run start:monitor   # terminal 2 -> http://localhost:4000
```
Locally (outside Docker) the monitor cannot restart a container, so recovery will be logged as FAILED. Use Docker Compose to see real recovery.

## Docker Commands
```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f monitor     # watch detection + recovery
docker compose down
```
Dashboard: http://localhost:4000, App: http://localhost:3000

Config (env vars): `CHECK_INTERVAL_MS` (10000), `FAILURE_THRESHOLD` (3), `CONTAINER_NAME` (webapp).

## Failure Simulation and Recovery Demo
1. Open the dashboard: HEALTHY, uptime 100%.
2. Click **SIMULATE FAILURE** (or the button on the app page).
3. Dashboard turns UNHEALTHY; consecutive failures count 1, 2, 3.
4. At 3, the monitor restarts the `webapp` container (the in-memory flag resets, so the app is healthy again).
5. Monitor verifies `/health` = 200, shows "APPLICATION RECOVERED", recovery count +1.
6. Incident table shows the downtime.

Expected monitor log:
```
[WARNING] Health check failed (HTTP 503). Consecutive failures: 3
[WARNING] Failure threshold reached. Recovery triggered
[INFO] Restarting Docker container
[INFO] Container restarted. Waiting for the app to come back
[INFO] Health check successful
[INFO] Recovery completed
```
You can also test a real crash: `docker stop webapp` (then the monitor sees "Connection refused"). Note `restart: unless-stopped` does not restart a container you stopped manually, but the monitor's restart call will start it.

## Testing
`npm test` covers: healthy app (200), simulated failure (503), unreachable app, 1 failure then success (no recovery), 3 failures trigger recovery, recovery success, recovery failure (incident stays open), Docker error handling, and dashboard metrics (counts, incidents, recoveries).

## Jenkins Setup
1. On the EC2 host install Java, Jenkins, Node.js 20, Docker. `sudo usermod -aG docker jenkins && sudo systemctl restart jenkins`
2. Open port 8080, finish the setup wizard, install the Git and Pipeline plugins.
3. New Item -> Pipeline -> "Pipeline script from SCM" -> your GitHub repo URL, branch `main`, script path `Jenkinsfile`.
4. (Optional) add a GitHub webhook to `http://<EC2-IP>:8080/github-webhook/` and enable "GitHub hook trigger".
5. Stages: Checkout, Install, Test, Build, Deploy, Verify (fails the build if `/health` is not 200).

## AWS EC2 Deployment
```bash
# 1. Launch Ubuntu 22.04/24.04 t2.micro/t3.micro. Security group inbound: 22 (your IP), 80, 3000, 4000, 8080 (Jenkins; restrict to your IP).
# 2. SSH in and install tools
sudo apt update && sudo apt install -y git docker.io docker-compose-v2 curl
sudo usermod -aG docker $USER && newgrp docker
# 3. Deploy
git clone https://github.com/<you>/website-health-monitoring-auto-recovery.git
cd website-health-monitoring-auto-recovery
cp .env.example .env
docker compose up -d --build
# 4. Verify
curl http://localhost:3000/health
```
Open `http://<EC2-PUBLIC-IP>:4000`. With Nginx (`sudo apt install nginx`, use `docker/nginx.conf`), the dashboard is at `http://<IP>/` and the app at `http://<IP>/app/`; then you can close ports 3000/4000.

## GitHub
```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/website-health-monitoring-auto-recovery.git
git push -u origin main
```
`.env` is git-ignored; only `.env.example` is committed. No secrets are hard-coded.

## Security Notes
- The monitor mounts `/var/run/docker.sock`, which gives it control of Docker on the host. That is acceptable for a demo, but in production use a restricted Docker socket proxy.
- Restrict ports 22/8080 to your IP. Don't expose the simulate-failure endpoint publicly in a real system.

## Screenshots
_[Dashboard healthy]_  _[Unhealthy + alert]_  _[Incident table]_  _[Jenkins pipeline]_  _[EC2 running containers]_

## Future Scope
Email/SMS/Slack alerts, Prometheus + Grafana, Kubernetes self-healing, multiple apps, load balancing, auto scaling, AI failure prediction, CloudWatch, multi-server recovery.
