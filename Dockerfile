# GymLog-Server (läuft auf Raspberry Pi 4/5 mit 64-Bit-OS und jedem Cloud-Server)
FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data TZ=Europe/Berlin
RUN apk add --no-cache tzdata
WORKDIR /app
COPY index.html manifest.webmanifest sw.js selfhost.html ./
COPY css ./css
COPY js ./js
COPY icons ./icons
COPY server ./server
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/info || exit 1
CMD ["node", "--no-warnings", "server/server.js"]
