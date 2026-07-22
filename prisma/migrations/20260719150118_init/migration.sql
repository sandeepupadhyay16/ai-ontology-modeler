-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ontology" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namespaceUri" TEXT NOT NULL,
    "layer" TEXT NOT NULL DEFAULT 'PROJECT',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ontology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "conceptType" TEXT NOT NULL DEFAULT 'Entity',
    "typeFields" JSONB,
    "ontologyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datatype" TEXT NOT NULL DEFAULT 'string',
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "conceptId" TEXT NOT NULL,

    CONSTRAINT "Attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cardinality" TEXT NOT NULL DEFAULT 'one-to-many',
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "ontologyId" TEXT NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Constraint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "params" JSONB,
    "description" TEXT,
    "ontologyId" TEXT NOT NULL,

    CONSTRAINT "Constraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "antecedent" JSONB,
    "consequent" JSONB,
    "description" TEXT,
    "ontologyId" TEXT NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "remediation" TEXT,
    "ontologyId" TEXT NOT NULL,

    CONSTRAINT "CompetencyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverTree" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ontologyId" TEXT NOT NULL,

    CONSTRAINT "DriverTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverEdge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,

    CONSTRAINT "DriverEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Ontology_namespaceUri_key" ON "Ontology"("namespaceUri");

-- AddForeignKey
ALTER TABLE "Ontology" ADD CONSTRAINT "Ontology_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribute" ADD CONSTRAINT "Attribute_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyQuestion" ADD CONSTRAINT "CompetencyQuestion_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverTree" ADD CONSTRAINT "DriverTree_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverEdge" ADD CONSTRAINT "DriverEdge_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "DriverTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;
