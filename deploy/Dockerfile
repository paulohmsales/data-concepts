# Build context: a folder holding dist/ and this deploy/ folder (deploy.sh assembles it).
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY dist /srv
