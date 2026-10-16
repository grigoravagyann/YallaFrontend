# The production image for the web console and the public branch page.
#
# Two stages. The first builds `apps/web/dist` with pnpm, exactly as
# `pnpm build:web` does on a developer's machine, and turns the policy the
# build writes to `dist/content-security-policy.txt` into a Caddy snippet. The
# second is Caddy alone, serving those static files on :80 with the SPA
# fallback and the headers `deploy/Caddyfile` describes. TLS is not this
# container's job: the backend's compose puts its own Caddy in front of it and
# proxies `web:80`.
#
# Build from the repository ROOT, because the workspace packages are the
# context:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://yalla.am \
#     --build-arg VITE_PUBLIC_ORIGIN=https://yalla.am \
#     -t yalla-web .
#
# `VITE_API_URL` is baked into the bundle and into the CSP at build time, so
# the image is PER ENVIRONMENT: one for production, another for staging. In
# production the web and the API share one origin (the outer Caddy proxies
# `/api/*` to the backend), so both arguments are the site's own origin.

# ---------------------------------------------------------------------------
# Stage 1: build
# ---------------------------------------------------------------------------
# Node 24, the version .nvmrc pins. Keep in step with it.
FROM node:24-bookworm-slim AS build

WORKDIR /repo

# pnpm at the version `packageManager` in package.json pins, so the version
# lives in one place and not here. Installed with npm rather than corepack,
# which the Node images are dropping.
COPY package.json ./
RUN npm install --global --no-fund --no-audit "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

# Manifests first, so the install layer is cached until a dependency changes.
# Every workspace package's manifest is needed, not only the web's: the
# lockfile has an importer per workspace package and `--frozen-lockfile`
# refuses to run when one it lists is missing from the tree.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/diner/package.json apps/diner/
COPY apps/e2e/package.json apps/e2e/
COPY packages/api/package.json packages/api/
COPY packages/format/package.json packages/format/
COPY packages/i18n/package.json packages/i18n/
COPY packages/realtime/package.json packages/realtime/
COPY packages/tokens/package.json packages/tokens/
COPY packages/tsconfig/package.json packages/tsconfig/

# Only the web app and what it depends on (`...`). The diner's Expo and React
# Native tree is most of the lockfile and none of this image.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@yalla/web..."

# Sources: the shared packages (the web imports them from source, and the
# tokens package's prebuild script generates the CSS) and the app.
COPY packages ./packages
COPY apps/web ./apps/web

# The build-time configuration. `VITE_API_URL` is the API's origin (no path);
# it ends up in the bundle and in `connect-src`/`img-src` of the CSP.
# `VITE_PUBLIC_ORIGIN` is where the site is reached, for the absolute og:image
# URL on link previews. `VITE_APP_URL` is optional.
ARG VITE_API_URL
ARG VITE_PUBLIC_ORIGIN=
ARG VITE_APP_URL=
ARG VITE_DATA_SOURCE=real
ENV VITE_API_URL=$VITE_API_URL \
    VITE_PUBLIC_ORIGIN=$VITE_PUBLIC_ORIGIN \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_DATA_SOURCE=$VITE_DATA_SOURCE

# A blank API URL builds a bundle that talks to nothing. Refuse early.
RUN test -n "$VITE_API_URL" || { echo "VITE_API_URL build argument is required (the API origin, e.g. https://yalla.am)" >&2; exit 1; }

RUN pnpm build:web

# Caddy cannot read a file into a response header at runtime, so the policy the
# build emitted becomes a one-line Caddyfile snippet that deploy/Caddyfile
# imports. Generated here, after the build, so header and bundle always agree.
RUN node apps/web/deploy/write-csp-snippet.mjs apps/web/dist/content-security-policy.txt apps/web/dist/csp.caddy

# ---------------------------------------------------------------------------
# Stage 2: serve
# ---------------------------------------------------------------------------
FROM caddy:2

COPY apps/web/deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist/csp.caddy /etc/caddy/csp.caddy
COPY --from=build /repo/apps/web/dist /srv

# The snippet is imported by the Caddyfile; serving it would leak nothing, but
# there is no reason for it to sit in the web root.
RUN rm -f /srv/csp.caddy

EXPOSE 80

# Fail the build rather than the deploy on a bad Caddyfile.
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
