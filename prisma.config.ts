// Prisma configuration for ClawSchool
import { defineConfig } from "prisma/config";

// Load dotenv only in development
if (process.env.NODE_ENV !== "production") {
  require("dotenv/config");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL || "",
  },
});
