# Apify's Node image; runs the TypeScript source with tsx (no build step).
FROM apify/actor-node:22

COPY --chown=myuser package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=myuser . ./

CMD ["npx", "tsx", "src/main.ts"]
