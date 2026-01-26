FROM node:18-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /tmp/coachiq_uploads

EXPOSE 3001

CMD ["npm", "start"]
