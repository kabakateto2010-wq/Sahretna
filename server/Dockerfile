# ==============================================================
# 🍿 Sahretna Cinema - Production Dockerfile (Hugging Face / Cloud)
# ==============================================================
FROM node:20-slim

# تثبيت Chromium والمكتبات الأساسية لتشغيل المتصفح الافتراضي والخطوط
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libasound2 \
    procps \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# إنشاء مستخدم غير جذري (UID 1000) لتوافق تام مع أمان Hugging Face Spaces
RUN useradd -m -u 1000 user || true

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=7860 \
    HOME=/home/user

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# منح صلاحيات المجلد للمستخدم
RUN chown -R 1000:1000 /app

USER 1000

EXPOSE 7860

CMD ["node", "server.js"]
