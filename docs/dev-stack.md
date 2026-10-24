# The local dev stack: `pnpm dev:stack`

One command starts the backend, the web app and the diner app's Metro server,
in that order, with every log line tagged by the service it came from:

```bash
pnpm dev:stack
```

1. **Pre-flight.** Each port is checked first, and a busy one is reported with
   the process holding it. The backend checkout, `dotnet` and `node_modules`
   are checked. The laptop's LAN address is picked (see below).
2. **Backend build**, only when needed: when the output folder has no build,
   when a source file (`src/**/*.cs`, `.csproj`, `appsettings*.json`,
   `Directory.Build.props`, …) is newer than the last build, or when the build
   came from another checkout. `--rebuild` forces one and `--no-build` skips it.
   The build goes to a folder outside both repos, so the backend's own `bin/`
   is never locked while you edit it there.
3. **Backend**: `dotnet Yalla.Api.dll` from that folder, in Development, on
   `http://0.0.0.0:<api port>`. The script waits until `GET /health` answers
   `Healthy`, which means the database is reachable and migrated, not only that
   the process is up.
4. **Web and phone**, together. When both answer, a summary block lists every
   URL, with a QR code for Expo Go.

Ctrl+C stops everything, including the processes Vite and Metro start
themselves. Nothing is left holding a port.

| Part    | What it runs                                                           | Default port |
| ------- | ---------------------------------------------------------------------- | ------------ |
| `api`   | the .NET backend (`$YALLA_BACKEND_DIR`)                                | 5199         |
| `web`   | Vite: the console, `/staff` (tablet and phone PWA) and the public page | 5192         |
| `phone` | Expo/Metro for the diner app in Expo Go, on the LAN                    | 8110         |

Ports **5086, 5173, 8081 and 8095 are refused**: they are the defaults of
things started by hand (`dotnet run`, `pnpm dev:web`, `pnpm dev:diner`, the old
`dev:real`), so landing on one means talking to the wrong server.

`pnpm dev:real` is an alias for `pnpm dev:stack` and accepts its old part names
(`console` means `web`, `diner` means `phone`, `--no-api` means `--skip api`).
Its ports and its diner part have changed. The diner part is now Expo Go on the
LAN, and the diner's web build is still at `http://localhost:<metro port>`.

## Common runs

```bash
pnpm dev:stack                          # everything, on real data
pnpm dev:stack --lan                    # everything, and /staff works from a real phone
pnpm dev:stack --mock                   # console + diner app on mock data, no backend
pnpm dev:stack --only api,web           # no Metro
pnpm dev:stack --only web,phone         # the apps, against a backend you started yourself
pnpm dev:stack --db Yalla_Scratch       # everything on a throwaway database
```

`node scripts/dev-stack.mjs <flags>` is the same thing without pnpm in front.
On Windows it also avoids cmd's "Terminate batch job (Y/N)?" prompt after Ctrl+C.

## Flags

| Flag                   | Default                                                 | Effect                                                                                                          |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--only <list>`        | `api,web,phone`                                         | Start only these. Comma list, or repeat the flag.                                                               |
| `--skip <list>`        |                                                         | Start everything except these.                                                                                  |
| `--mock`               |                                                         | `web` + `phone` on in-memory mock data (`VITE_DATA_SOURCE=mock`, `EXPO_PUBLIC_DATA_SOURCE=mock`). No backend.   |
| `--lan`                |                                                         | Serve web on `0.0.0.0` and point it at the API by LAN address, so `/staff` and the public page work on a phone. |
| `--lan-ip <ip>`        | detected                                                | Use this address for the phone and `--lan`. Env `YALLA_LAN_IP`.                                                 |
| `--api-port <n>`       | 5199                                                    | Env `YALLA_API_PORT`.                                                                                           |
| `--web-port <n>`       | 5192                                                    | Env `YALLA_WEB_PORT`.                                                                                           |
| `--metro-port <n>`     | 8110                                                    | Env `YALLA_METRO_PORT`.                                                                                         |
| `--backend <dir>`      | `../Yalla`, `../Yalla-browse`, `~/source/repos/Yalla`   | The backend checkout. Env `YALLA_BACKEND_DIR`.                                                                  |
| `--out <dir>`          | `<temp>/yalla-dev-stack/api-<checkout hash>-<api port>` | Build output. Env `YALLA_API_OUT`.                                                                              |
| `--rebuild`            |                                                         | Always build the backend.                                                                                       |
| `--no-build`           |                                                         | Never build. Run what is in the output folder.                                                                  |
| `--db <name>`          | backend's own config                                    | Use a **throwaway** database of this name. The backend's migrations create it. `Yalla` is refused.              |
| `--db-server <server>` | `localhost\SQLEXPRESS`                                  | The SQL Server for `--db`. Env `YALLA_DB_SERVER`.                                                               |
| `--sql-log`            | off                                                     | Keep EF Core's log of every SQL command. Off by default to keep the shared log readable.                        |
| `--no-telegram`        | on, but off with `--db`                                 | Switch the Telegram bot off for this backend (`Telegram__Enabled=false`). `--telegram` keeps it on with `--db`. |
| `--health-timeout <s>` | 240                                                     | How long to wait for `/health`. A first migration of a fresh database takes a while.                            |
| `--keep-going`         | off                                                     | When a service dies, report it and keep the rest running. By default everything stops.                          |
| `--no-qr`              |                                                         | No QR codes in the summary.                                                                                     |
| `--no-clear`           |                                                         | Start Metro without `--clear`. Faster, but it may serve a stale bundle.                                         |

### What the apps are pointed at

|                       | without `--lan`               | with `--lan`                 |
| --------------------- | ----------------------------- | ---------------------------- |
| web listens on        | localhost                     | `0.0.0.0` (the LAN too)      |
| `VITE_API_URL`        | `http://localhost:<api port>` | `http://<LAN IP>:<api port>` |
| `EXPO_PUBLIC_API_URL` | `http://<LAN IP>:<api port>`  | same                         |
| Expo Go URL           | `exp://<LAN IP>:<metro port>` | same                         |

The phone always gets the LAN address, because on a phone `localhost` is the
phone. With `--lan` the console on the laptop also calls the API by LAN
address. The backend's Development CORS rule admits private-network origins, so
that works there too.

### What the backend is given

- `ASPNETCORE_ENVIRONMENT=Development` and `ASPNETCORE_URLS=http://0.0.0.0:<api port>`.
- `PublicWeb__ManageBookingUrlTemplate` set to this stack's web app, so manage
  links in booking messages open here. A value already in your environment wins.
- EF Core's per-command SQL logging is turned down to Warning unless you pass
  `--sql-log`.
- With `--db` only: `ConnectionStrings__Yalla` points at that database on
  `--db-server` with Windows authentication, and `Telegram__Enabled=false`
  (see below) unless you pass `--telegram`.
- With `--no-telegram`: `Telegram__Enabled=false`.

**Why Telegram is switched off for a throwaway database.** Locally the bot runs
in long-polling mode, and Telegram hands each update to one poller only. A
second backend with the same bot token (from your user secrets) takes
verification messages away from the first, and Telegram answers 409 to one of
them. The stack prints a warning when it sees that 409.

Everything else comes from the backend's own `appsettings.Development.json` and
**your user secrets**, which the backend loads itself. The script never reads,
lists or prints them, and without `--db` it never touches the connection string.

To get rid of a throwaway database, stop the stack first, then:

```bash
sqlcmd -S 'localhost\SQLEXPRESS' -E -C -Q "ALTER DATABASE [Yalla_Scratch] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [Yalla_Scratch];"
```

(`sqlcmd` lives in `C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn`
if it is not on PATH.) Uploaded photos go to `%LOCALAPPDATA%\Yalla\photos`
whatever the database. See "Photos" in the root README.

## The LAN address

The phone needs the laptop's real Wi-Fi or Ethernet IPv4 address. The script
asks the routing table which adapter holds the default route, and it skips
virtual adapters: VirtualBox's host-only adapter (`192.168.56.x`, which Windows
names something plain like "Ethernet 2"), VMware, Hyper-V/WSL, Docker and VPNs.
It prints the address it picked and any others it saw. If the pick is wrong,
pass `--lan-ip`. Expo is given the same address via
`REACT_NATIVE_PACKAGER_HOSTNAME`, because left alone it can pick the VirtualBox
adapter.

## Logs

Every line is prefixed `api`, `web`, `phone`, `build` or `stack`, and coloured
when the terminal supports it (`NO_COLOR=1` turns colour off). When a service
dies, a red banner names it, gives its exit code and a hint where one is known
(missing user secrets, SQL Server not reachable, port taken), then stops the
others. With `--keep-going` the others keep running.

## Troubleshooting

**"port 5192 is already in use by: pid 1234 node.exe: …"**: something already
holds it. If the command line shows `apps\web`, `apps\diner`, `Yalla.Api.dll` or
`yalla-dev-stack`, it is a leftover dev server: `taskkill /PID 1234 /T /F`.
Otherwise move this stack with `--web-port` and the like. `EACCES` instead of
"in use" means Windows reserved the port for Hyper-V/WSL. Run
`netsh interface ipv4 show excludedportrange protocol=tcp` to see the ranges.

**The backend dies at startup**: the most common cause is missing user secrets
(`Jwt:SigningKey`, `PlatformAdmin:Email`, `PlatformAdmin:Password`). Set them
once from the backend repo, as in "Once per machine" in the root README. The
next is SQL Server: the service must be running, and with `--db` the
`--db-server` must be right.

**"/health never answered" or it stays Unhealthy**: the banner quotes what
`/health` said. `database: Unhealthy` means the connection string points at a
server that is not there.

**Windows Firewall prompt**: the first time, Windows asks whether `dotnet` and
`node` may accept connections. Allow **private** networks, or the phone cannot
reach the API (`dotnet`), Metro or the web app (`node`). If you declined, add
inbound rules for the three ports, or allow the two programs on private networks
under Windows Security, then Firewall, then "Allow an app".

**The phone cannot connect**:

- The phone and the laptop must be on the **same Wi-Fi**. Guest networks often
  isolate clients, and mobile data never works.
- The Wi-Fi must be a **Private** network in Windows. On a Public one the
  firewall drops the connection.
- Open `http://<LAN IP>:<api port>/health` in the phone's browser. If that
  fails, the problem is the network, not the app.
- On the phone, keep VPNs and Private Relay off. More in "When the phone cannot
  reach the backend" in the root README.

**Expo Go and push notifications**: Expo Go runs the diner app with no push
token of its own for this project (Expo Go has no remote push since SDK 53 on
Android). A push to the diner needs a development build with an EAS project id.
See step 6 of `apps/diner/docs/PHONE-QA.md`. The backend also only sends real
pushes with `Notifications__Channel=Expo` in its environment, for example
`Notifications__Channel=Expo pnpm dev:stack`.

**Web push on a phone (the staff PWA)** needs **HTTPS**. Browsers allow service
workers and push only on a secure origin, and `http://192.168.x.x` is not one
(only `localhost` is exempt). On **iOS**, web push also works only for a PWA
**added to the Home Screen** (iOS 16.4+), opened from that icon. So `--lan` over
plain http is enough to use `/staff` on a phone, but not to test its push. For
that, put an HTTPS tunnel in front of the web port, for example
`devtunnel host -p 5192 --allow-anonymous` (Microsoft Dev Tunnels),
`cloudflared tunnel --url http://localhost:5192`, or `ngrok http 5192`. Open
the tunnel's https URL on the phone and add it to the Home Screen. The page
calls the API from the browser, so the API needs a tunnel too, with
`VITE_API_URL` set to that tunnel's https URL and its origin admitted by the
backend's CORS (`Cors__AllowedOrigins__0`). The script does not start tunnels.

**Ctrl+C and the "Terminate batch job (Y/N)?" prompt**: that is cmd.exe
wrapping `pnpm`. The stack has already stopped by then, so answer either way, or
run `node scripts/dev-stack.mjs` directly. A second Ctrl+C skips the
few-second grace period and kills straight away.

**A stale diner bundle**: Metro starts with `--clear` by default. If you passed
`--no-clear`, drop it.

**The e2e runner uses port 5199 too**: `scripts/e2e-local.sh` puts its throwaway
API on 5199 as well. Run it with `E2E_API_PORT`, or this stack with
`--api-port`, when both are up at once.
