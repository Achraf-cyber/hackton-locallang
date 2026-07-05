FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY . .

# L'image mcr.microsoft.com/playwright:*-jammy embarque deja Chromium/Firefox/
# WebKit + toutes leurs dependances systeme (pas besoin de `playwright install`
# ni d'installer manuellement les libs -- contrairement a model-service/
# Dockerfile.asr qui doit tout faire a la main pour fairseq2).

ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
