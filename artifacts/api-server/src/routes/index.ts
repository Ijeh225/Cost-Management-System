import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import { authRouter } from "./auth.js";
import { usersRouter } from "./users.js";
import { containersRouter } from "./containers.js";
import { approvalsRouter } from "./approvals.js";
import { myTasksRouter } from "./my-tasks.js";
import { analyticsRouter } from "./analytics.js";
import { reportsRouter } from "./reports.js";
import { timelineRouter } from "./timeline.js";
import { tasksRouter } from "./tasks.js";
import { documentsRouter } from "./documents.js";
import { intelligenceRouter } from "./intelligence.js";
import { sectionsRouter } from "./sections.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(containersRouter);
router.use(approvalsRouter);
router.use(myTasksRouter);
router.use(analyticsRouter);
router.use(reportsRouter);
router.use(timelineRouter);
router.use(tasksRouter);
router.use(documentsRouter);
router.use(intelligenceRouter);
router.use(sectionsRouter);

export default router;
