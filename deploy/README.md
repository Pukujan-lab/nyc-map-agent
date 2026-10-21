# nyc-map-agent on gravebuster

## What runs

| Container | Role |
| --- | --- |
| `nyc-map-web` | the app (Vite build + Hono) on 8080 |
| `nyc-map-cd` | deploy API on 8081; mounts docker.sock and the checkout |
| `nyc-map-edge` | Caddy: `/deploy/api/*` → cd, `/deploy*` → dashboard, else → web |

Public hostname `nyc.design-bakery.com` is routed by the Cloudflare tunnel
(`study-os-cloudflared-1`) to `http://nyc-map-edge:80` over `study-os_edge`.

## Bootstrap (once)

```bash
sudo mkdir -p /srv/nyc-map-agent/state
sudo chown -R yoav:yoav /srv/nyc-map-agent
git clone https://github.com/Pukujan/nyc-map-agent /srv/nyc-map-agent/app
cp /srv/nyc-map-agent/app/deploy/.env.example /srv/nyc-map-agent/.env
# fill in the values, then:
chmod 600 /srv/nyc-map-agent/.env
# The compose client reads env_file on the host, where /work does not exist.
export CD_HOST_ENV_FILE=/srv/nyc-map-agent/.env
cd /srv/nyc-map-agent
docker compose -f app/deploy/docker-compose.yml -f app/deploy/docker-compose.edge.yml up -d --build
curl -s https://nyc.design-bakery.com/healthz
```

`CD_HOST_ENV_FILE` is only needed for commands run on the host; inside
`nyc-map-cd` the default `/work/.env` is correct and is what the deploy pipeline
uses. Export it in the shell profile or prefix every host-side `docker compose`
invocation with it.

Generate the secrets:

```bash
openssl rand -hex 32   # CD_SESSION_SECRET
openssl rand -hex 32   # CD_DEPLOY_TOKEN  (also the GitHub secret NYC_DEPLOY_TOKEN)
```

## CI runner

The repository's workflows run on a self-hosted runner on this host, because
the account's hosted-minutes budget rejects every `ubuntu-latest` job. It lives
at `~/actions-runner`, labels `self-hosted, linux, x64, gravebuster`, and is a
systemd unit so it survives reboots:

```bash
systemctl status actions.runner.Pukujan-nyc-map-agent.gravebuster.service
```

The runner's user needs the `docker` group and passwordless sudo (the e2e job
runs `playwright install --with-deps`). To re-register after a rebuild:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -fsSL -o runner.tar.gz https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-linux-x64-2.338.0.tar.gz
tar xzf runner.tar.gz && rm runner.tar.gz
./config.sh --unattended --replace --url https://github.com/Pukujan/nyc-map-agent \
  --token "$(gh api -X POST repos/Pukujan/nyc-map-agent/actions/runners/registration-token --jq .token)" \
  --name gravebuster --labels self-hosted,linux,x64,gravebuster --work _work
sudo ./svc.sh install yoav && sudo ./svc.sh start
```

## Manual operations

| Task | Command |
| --- | --- |
| Redeploy the CD container after changing it | `CD_HOST_ENV_FILE=/srv/nyc-map-agent/.env docker compose -f app/deploy/docker-compose.yml up -d --build cd edge` (run from `/srv/nyc-map-agent`) |
| Read deploy history | `tail -n 20 /srv/nyc-map-agent/state/deploys.jsonl` |
| Force a deploy | `curl -X POST -H "Authorization: Bearer $CD_DEPLOY_TOKEN" https://nyc.design-bakery.com/deploy/api/deploy` |
| Roll back | press **Roll back** in the dashboard |
| Clear a stuck lock | `rm -f /srv/nyc-map-agent/state/deploy.lock` (only when no deploy is running; the lock is a file, not a directory) |

## Failure modes

- **Build fails:** the old image keeps serving; the run is `failed` with the build log.
- **Health fails:** the previous image is swapped back automatically.
- **CD container restarts mid-run:** the run is marked `interrupted` on the next start.
- **Tunnel 502:** the `nyc-map-edge` container is down; check `docker logs nyc-map-edge`.
