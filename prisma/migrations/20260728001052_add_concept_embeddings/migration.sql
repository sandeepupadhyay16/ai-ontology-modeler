-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "embeddingDim" INTEGER,
ADD COLUMN     "embeddingModel" TEXT;
