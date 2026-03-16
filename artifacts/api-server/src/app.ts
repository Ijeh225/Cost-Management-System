import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import router from "./routes/index.js";

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

// Serve the React frontend in production
if (process.env.NODE_ENV === "production") {
  const staticPath = path.resolve(process.cwd(), "artifacts/cost-analysis/dist/public");
  app.use(express.static(staticPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

export default app;
