FROM node:22-alpine AS deps
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci


FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG AWS_S3_BUCKET_NAME
ARG AWS_REGION
ARG S3_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV AWS_S3_BUCKET_NAME=$AWS_S3_BUCKET_NAME
ENV AWS_REGION=$AWS_REGION
ENV S3_PUBLIC_BASE_URL=$S3_PUBLIC_BASE_URL
RUN npm run build


FROM node:22-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN adduser --system --uid 1001 --ingroup node nextjs
COPY --from=builder --chown=nextjs:node /usr/src/app/.next/standalone ./
COPY --from=builder --chown=nextjs:node /usr/src/app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:node /usr/src/app/public ./public
USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]