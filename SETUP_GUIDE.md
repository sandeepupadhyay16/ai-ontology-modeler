# AI Ontology Modeler - Comprehensive Setup & Cross-Platform Installation Guide

This guide provides step-by-step instructions on how to instantiate, configure, and run the **AI Ontology Modeler** application on **Windows** and **macOS** environments, as well as how to initialize and publish the codebase into its own dedicated Git repository.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Database Setup (PostgreSQL)](#2-database-setup-postgresql)
3. [Windows Setup Guide](#3-windows-setup-guide)
   - [Option A: Native Windows (PowerShell / Command Prompt)](#option-a-native-windows-powershell--command-prompt)
   - [Option B: Windows Subsystem for Linux (WSL2)](#option-b-windows-subsystem-for-linux-wsl2)
4. [macOS Setup Guide](#4-macos-setup-guide)
5. [Environment & Database Configuration](#5-environment--database-configuration)
6. [LLM Integration Setup (LM Studio / Ollama / Cloud APIs)](#6-llm-integration-setup)
7. [Running the Application](#7-running-the-application)
8. [Publishing to a Dedicated Git Repository](#8-publishing-to-a-dedicated-git-repository)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

---

## 1. Prerequisites

Before installing the application, ensure the following software is installed on your host machine:

| Software | Minimum Version | Recommended Version | Download / Link |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.17.0` | `v20.x LTS` or `v22.x LTS` | [nodejs.org](https://nodejs.org/) |
| **npm** | `v9.0.0` | `v10.x` | Included with Node.js |
| **PostgreSQL** | `v14.0` | `v15.x` or `v16.x` | [postgresql.org](https://www.postgresql.org/download/) or Docker |
| **Git** | `v2.30.0` | Latest | [git-scm.com](https://git-scm.com/) |
| **LM Studio** *(Optional for local AI)* | Latest | Latest | [lmstudio.ai](https://lmstudio.ai/) |
| **Ollama** *(Optional local AI alternative)* | Latest | Latest | [ollama.com](https://ollama.com/) |

---

## 2. Database Setup (PostgreSQL)

The application requires a PostgreSQL database instance named `ontology_modeler`. You can set this up either via **Docker Desktop** (easiest) or a **Native PostgreSQL** installation.

### Option A: Using Docker (Recommended for cross-platform consistency)

If Docker Desktop is installed, start a container:

```bash
docker run --name postgres-ontology -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ontology_modeler -p 5432:5432 -d postgres:16-alpine
```

### Option B: Native PostgreSQL Installation

If using a local PostgreSQL server:

1. Connect to PostgreSQL using `psql` or a graphical client (e.g. pgAdmin, DBeaver):
   ```bash
   psql -U postgres
   ```
2. Create the target database:
   ```sql
   CREATE DATABASE ontology_modeler;
   ```

---

## 3. Windows Setup Guide

### Option A: Native Windows (PowerShell / Command Prompt)

1. **Verify Prerequisites**:
   Open PowerShell as Administrator or regular user and check versions:
   ```powershell
   node -v
   npm -v
   git --version
   ```

2. **Navigate to the Project Directory**:
   ```powershell
   cd path\to\ai-ontology-modeler
   ```

3. **Install Dependencies**:
   ```powershell
   npm install
   ```

4. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
   Open `.env` in Notepad or VS Code and update `DATABASE_URL`:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ontology_modeler"
   LM_STUDIO_URL="http://localhost:1234/v1"
   ```

5. **Generate Prisma Client & Push Schema**:
   ```powershell
   npx prisma generate
   npx prisma db push
   ```

6. **Seed Database with Default Ontologies & Templates**:
   ```powershell
   npx tsx prisma/seed.ts
   ```

7. **Start Development Server**:
   ```powershell
   npm run dev
   ```
   Open your browser and navigate to: `http://localhost:3006`

---

### Option B: Windows Subsystem for Linux (WSL2)

1. Open your WSL2 terminal (Ubuntu / Debian).
2. Install Node.js & Git (if not already installed):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git postgresql-client
   ```
3. Follow the standard Linux / macOS setup steps below.

---

## 4. macOS Setup Guide

### 1. Install Dependencies via Homebrew (Apple Silicon M1/M2/M3 & Intel)

Open Terminal and execute:

```bash
# Install Node.js, PostgreSQL, and Git
brew install node postgresql@16 git

# Start local PostgreSQL service (if using native Postgres)
brew services start postgresql@16
```

### 2. Create the PostgreSQL Database

```bash
createdb -U postgres ontology_modeler || createdb ontology_modeler
```

### 3. Clone / Navigate to Project Directory

```bash
cd /path/to/ai-ontology-modeler
```

### 4. Install NPM Packages

```bash
npm install
```

### 5. Create `.env` Configuration

```bash
cp .env.example .env
```

If your local PostgreSQL user is your macOS username:
```env
DATABASE_URL="postgresql://YOUR_MAC_USERNAME@localhost:5432/ontology_modeler"
LM_STUDIO_URL="http://localhost:1234/v1"
```

### 6. Initialize Prisma Schema & Seed Initial Data

```bash
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

### 7. Run Application

```bash
npm run dev
```
Navigate to: `http://localhost:3006`

---

## 5. Environment & Database Configuration

Key parameters in `.env`:

| Key | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/ontology_modeler` | Connection URI for PostgreSQL database. |
| `LM_STUDIO_URL` | `http://localhost:1234/v1` | URL for local LLM inference server. |
| `PORT` | `3006` | Port for running Next.js application server. |

---

## 6. LLM Integration Setup

The AI Ontology Modeler features an interactive AI assistant that generates and refines 3D ontologies. It works out-of-the-box with **LM Studio**, **Ollama**, or cloud providers (**OpenAI**, **Anthropic**, **Google Gemini**).

### Using Local AI with LM Studio (Recommended for local offline use):

1. Download and open **LM Studio**.
2. Search and load a model (e.g., `qwen2.5-coder`, `llama-3.1-8b`, `gemma-2`).
3. Click the **Developer / Local Server** tab in LM Studio and start the server on port `1234`.
4. Ensure CORS is enabled and endpoint is set to `http://localhost:1234/v1`.

### Configurable UI Settings:
Once the app is running, navigate to the **Settings / LLM Config** section in the UI to toggle between providers or update API keys dynamically without restarting the server.

---

## 7. Running the Application

### Development Mode (Hot Reloading)

```bash
npm run dev
```

### Production Build & Launch

```bash
# Build production bundle
npm run build

# Start production server on port 3006
npm run start
```

---

## 8. Publishing to a Dedicated Git Repository

Follow these instructions to publish `ai-ontology-modeler` as an independent Git repository on GitHub, GitLab, or Bitbucket.

### Step 1: Initialize Git Local Repository

Navigate to `ai-ontology-modeler` directory:

```bash
cd /path/to/ai-ontology-modeler
```

Initialize git:
```bash
git init -b main
```

### Step 2: Stage and Commit All Files

```bash
# Verify .gitignore prevents committing node_modules, .next, and .env
git status

# Stage all project source files
git add .

# Create initial commit
git commit -m "feat: initial commit of AI Ontology Modeler system"
```

### Step 3: Create Remote Repository & Push

1. Create a new empty repository on **GitHub** (or your preferred platform) named `ai-ontology-modeler` (do not initialize with README or license).
2. Copy the remote URL (HTTPS or SSH):
   - HTTPS: `https://github.com/YOUR_ORGANIZATION/ai-ontology-modeler.git`
   - SSH: `git@github.com:YOUR_ORGANIZATION/ai-ontology-modeler.git`
3. Link remote and push:
   ```bash
   git remote add origin git@github.com:YOUR_ORGANIZATION/ai-ontology-modeler.git
   git push -u origin main
   ```

---

## 9. Troubleshooting & FAQ

### 1. `PrismaClientInitializationError: Can't reach database server`
- **Cause**: PostgreSQL service is stopped or credentials in `.env` are incorrect.
- **Fix**: Check `DATABASE_URL` in `.env`. Ensure Postgres is running (`docker ps` or `brew services list`).

### 2. `LM Studio returned an error` or AI Generation hangs
- **Cause**: LM Studio local server is inactive or timing out.
- **Fix**: Open LM Studio, ensure server is active at `http://localhost:1234/v1`. Alternatively, switch to OpenAI / Anthropic / Gemini provider in the app settings panel.

### 3. Port 3006 is already in use
- **Fix**: Change port in `package.json` (`"dev": "next dev -p 3007"`) or pass port flag: `npx next dev -p 3007`.

---
