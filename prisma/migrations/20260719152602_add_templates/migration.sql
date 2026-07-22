-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "businessFunction" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "description" TEXT,
    "causalCycles" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_industry_domain_businessFunction_key" ON "PromptTemplate"("industry", "domain", "businessFunction");
