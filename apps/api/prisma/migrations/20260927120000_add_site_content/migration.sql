-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "quote" VARCHAR(1000) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "context" VARCHAR(120) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'direct',
    "url" VARCHAR(500),
    "stars" INTEGER,
    "showOnHome" BOOLEAN NOT NULL DEFAULT false,
    "showOnHire" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentWork" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "detail" VARCHAR(500) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecentWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "alt" VARCHAR(300) NOT NULL,
    "caption" VARCHAR(300),
    "tags" TEXT[],
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "pageKey" VARCHAR(100) NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "answer" VARCHAR(1000) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalPromo" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "navLabel" VARCHAR(40) NOT NULL,
    "bannerText" VARCHAR(120) NOT NULL,
    "href" VARCHAR(200) NOT NULL,
    "homeHeading" VARCHAR(200) NOT NULL,
    "homeLines" JSONB NOT NULL,
    "homeCtaLabel" VARCHAR(80),
    "homeCtaHref" VARCHAR(200),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "navStartsAt" TIMESTAMP(3),
    "navEndsAt" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentChange" (
    "id" TEXT NOT NULL,
    "who" VARCHAR(200) NOT NULL,
    "what" VARCHAR(500) NOT NULL,
    "detail" JSONB,
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Testimonial_published_order_idx" ON "Testimonial"("published", "order");

-- CreateIndex
CREATE INDEX "RecentWork_published_order_idx" ON "RecentWork"("published", "order");

-- CreateIndex
CREATE INDEX "GalleryPhoto_published_order_idx" ON "GalleryPhoto"("published", "order");

-- CreateIndex
CREATE INDEX "Faq_pageKey_published_order_idx" ON "Faq"("pageKey", "published", "order");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonalPromo_key_key" ON "SeasonalPromo"("key");

-- CreateIndex
CREATE INDEX "ContentChange_when_idx" ON "ContentChange"("when");

