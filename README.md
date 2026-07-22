# AI Ontology Modeler

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8-2D3748?logo=prisma)](https://www.prisma.io/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?logo=three.js)](https://threejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An enterprise-grade, web-based semantic ontology modeling platform. **AI Ontology Modeler** empowers business architects, domain experts, and data engineering teams to interactively synthesize, visualize, audit, and refine complex business ontologies in immersive 3D.

---

## Key Features

- **Interactive 3D Graph Modeler**: Real-time WebGL rendering of spatial concept nodes (Entities, Processes, Metrics, Personas) and relationships powered by Three.js and React Three Fiber.
- **Guided 4-Phase Modeling Wizard**: Step-by-step assistant guiding teams through Processes & Entities, Process Metrics, Competency Questions (CQs), and Causal Driver Trees.
- **Multi-Pass AI Agent Pipeline**: Conversational copilot with interactive probing, incremental graph generation, automated domain auditing, and deterministic graph weaving (zero orphan nodes).
- **Enterprise Lineage Navigation**: Full hierarchy tracking from `Organization` ➔ `BusinessFunction` ➔ `BusinessProcess` ➔ `Project` ➔ `Ontology`.
- **Flexible LLM Provider Support**: Native integration with local offline models (LM Studio, Ollama) and cloud APIs (OpenAI, Anthropic Claude, Google Gemini).
- **Automated Quality Score Evaluation**: Real-time quality evaluation measuring CQ coverage, relationship density, attribute completeness, and causal tree metrics.

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js**: `v18.17+` or `v20+`
- **PostgreSQL**: `v14+` or Docker Desktop
- **Git**: Latest version

### 1. Clone & Install Dependencies

```bash
cd ai-ontology-modeler
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and set your PostgreSQL connection string:

```bash
cp .env.example .env
```

### 3. Initialize Database & Seed Data

```bash
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3006](http://localhost:3006) in your browser.

---

## Documentation & Guides

For complete architecture details, API documentation, and cross-platform installation instructions:

- 📖 **[Comprehensive System Documentation](DOCUMENTATION.md)**: Deep dive into system architecture, 3-pass AI pipeline, database ERD schema, API reference, and quality score calculations.
- ⚙️ **[Cross-Platform Setup & Git Guide](SETUP_GUIDE.md)**: Detailed step-by-step setup guide for **Windows (PowerShell/WSL2)** and **macOS**, along with Git repository initialization and deployment instructions.

---

## Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS, Lucide Icons
- **3D Engine**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Backend & Database**: Next.js Server Routes, PostgreSQL, Prisma ORM
- **AI Integration**: Custom multi-pass agent framework compatible with LM Studio, Ollama, OpenAI, Anthropic, and Google Gemini.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
