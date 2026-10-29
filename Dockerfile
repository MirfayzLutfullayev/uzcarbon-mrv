# UZ-Carbon MRV — konteyner tasviri.
# Fly.io, Koyeb, Northflank, Hugging Face Spaces, o'z serveringiz yoki Kubernetes uchun.
#
# Tashqi kutubxonalar yo'q, shuning uchun "npm install" bosqichi ham kerak emas —
# tasvir kichik va tez quriladi.
#
#   docker build -t uzcarbon .
#   docker run -p 3000:3000 -v uzcarbon-data:/data -e DATA_DIR=/data uzcarbon

FROM node:24-alpine

WORKDIR /app
COPY . .

# Ma'lumotlar uchun papka (volume shu yerga ulanadi)
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000

# Root huquqisiz ishlash
RUN chown -R node:node /app /data
USER node

# Birinchi ishga tushishda baza bo'sh bo'lsa, demo ma'lumotlar yuklanadi
CMD ["npm", "start"]
