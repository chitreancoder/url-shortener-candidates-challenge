-- CreateTable
CREATE TABLE "urls" (
    "code" VARCHAR(7) NOT NULL,
    "original_url" VARCHAR(2048) NOT NULL,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "last_clicked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "urls_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "urls_click_count_idx" ON "urls"("click_count" DESC);
