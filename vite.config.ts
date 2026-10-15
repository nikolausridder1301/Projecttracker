import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Projekt-Pages-URL: https://nikolausridder1301.github.io/Projecttracker/
export default defineConfig({
  base: "/Projecttracker/",
  plugins: [react()],
});
